from __future__ import annotations

import csv
import hashlib
import logging
import math
import random
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.anonymisation import (
    AnonymisationJob,
    AnonymisationTechnique,
    FieldRole,
    FieldTreatment,
    JobStatus,
    ScheduleKind,
)
from app.models.data_inventory import DataInventoryAsset, FieldClassification
from app.models.data_source import DataSource
from app.models.organization import Organization, OrganizationStatus
from app.models.masking import MaskingStrategy
from app.models.user import User, UserRole
from app.schemas.anonymisation import (
    AnonymisationJobCreate,
    AnonymisationJobRead,
    AnonymisationSummary,
    DatasetOption,
    DatasetPreview,
    FieldRule,
    RiskPreviewRequest,
    RiskPreviewResult,
)
from app.services import db_connector, file_scanner
from app.services.masking_service import _generalize, transform_value
from app.utils.anonymisation_taxonomy import technique_class, technique_class_label

logger = logging.getLogger(__name__)

# Phase 1 reads a bounded slice of the dataset (streaming millions is Phase 3).
MAX_ROWS = 50_000
# Smaller sample for the pre-run live risk preview.
PREVIEW_ROWS = 5_000

# Direct identifiers detected by the PII scanner → removed by default.
_IDENTIFIER_CATEGORIES = {
    "email", "phone", "aadhaar", "pan", "ifsc", "upi", "financial", "ip_address", "person",
}
_QI_NAME = re.compile(
    r"\b(dob|birth|age|gender|sex|pincode|pin code|zip|postal|city|state|country|"
    r"location|nationality|region|district)\b",
    re.I,
)
_IDENT_NAME = re.compile(
    r"\b(name|email|e-mail|phone|mobile|contact|aadhaar|pan|passport|ssn|"
    r"account|user_?id|customer_?id|username)\b",
    re.I,
)
_DATE_NAME = re.compile(
    r"(date|dob|birth|_at|_on|timestamp|joined|created|updated|expiry|expire)",
    re.I,
)


class AnonymisationService:
    def __init__(self, db: Session):
        self.db = db

    # --- tenant scoping (mirrors other services) ---

    def _ensure_org_accessible(self, org_id: UUID) -> Organization:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")
        return org

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Anonymisation requires an organization context")
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Anonymisation requires an organization context")
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    # --- datasets (Data Inventory assets with a readable source) ---

    @staticmethod
    def _readable_source(source: DataSource | None) -> bool:
        if source is None:
            return False
        return source.category == "upload" or db_connector.supports_introspection(source)

    def list_datasets(self, user: User, org_id: UUID | None = None) -> list[DatasetOption]:
        resolved = self._resolve_org_id(user, org_id)
        assets = (
            self.db.execute(
                select(DataInventoryAsset)
                .where(DataInventoryAsset.organization_id == resolved)
                .options(selectinload(DataInventoryAsset.fields))
                .order_by(DataInventoryAsset.name)
            )
            .scalars()
            .all()
        )
        out: list[DatasetOption] = []
        for asset in assets:
            source = self.db.get(DataSource, asset.data_source_id) if asset.data_source_id else None
            if not self._readable_source(source):
                continue
            out.append(
                DatasetOption(
                    asset_id=asset.id,
                    name=asset.name,
                    source_label=source.name if source else None,
                    source_type=source.source_type if source else None,
                    field_count=len(asset.fields),
                )
            )
        return out

    def _get_asset(self, org_id: UUID, asset_id: UUID) -> DataInventoryAsset:
        asset = self.db.get(DataInventoryAsset, asset_id)
        if asset is None or asset.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        return asset

    def preview_dataset(self, user: User, asset_id: UUID, org_id: UUID | None = None) -> DatasetPreview:
        resolved = self._resolve_org_id(user, org_id)
        asset = self._get_asset(resolved, asset_id)
        source = self.db.get(DataSource, asset.data_source_id) if asset.data_source_id else None
        try:
            columns, _ = self._load_dataset(asset, max_rows=1)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        rules = self._derive_rules(asset, columns)
        return DatasetPreview(
            asset_id=asset.id,
            dataset_name=asset.name,
            source_label=source.name if source else None,
            columns=columns,
            suggested_rules=rules,
        )

    def preview_risk(self, user: User, body: RiskPreviewRequest, org_id: UUID | None = None) -> RiskPreviewResult:
        """Simulate the job on a sample to show predicted k / risk / suppression
        before committing — powers the live risk preview."""
        resolved = self._resolve_org_id(user, org_id)
        asset = self._get_asset(resolved, body.asset_id)
        try:
            columns, rows = self._load_dataset(asset, PREVIEW_ROWS)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        if body.field_rules:
            # Editing an existing plan — score it as-is.
            rules = self._align_rules(body.field_rules, columns)
        else:
            # No plan yet → derive the technique's default plan (so the UI can show it).
            rules = self._apply_technique_defaults(
                self._align_rules(self._derive_rules(asset, columns), columns), body.technique
            )
        transformed = self._transform_rows(columns, rows, rules, "preview", 0, body.epsilon)
        kept, suppressed, k = self._enforce(
            columns, transformed, rules, body.technique, body.k_threshold, body.l_threshold
        )
        risk_percent, risk_level = self._risk(k, body.k_threshold)
        return RiskPreviewResult(
            sample_rows=len(rows),
            predicted_k=k,
            risk_percent=risk_percent,
            risk_level=risk_level,
            estimated_suppressed=suppressed,
            estimated_suppression_rate=round(100.0 * suppressed / len(rows), 1) if rows else 0.0,
            quasi_identifiers=[r.field for r in rules if r.role == FieldRole.quasi_identifier],
            sensitive_fields=[r.field for r in rules if r.role == FieldRole.sensitive],
            rules=rules,
            note="Estimated on a sample of the dataset." if len(rows) >= PREVIEW_ROWS else None,
        )

    # --- field classification → role + treatment ---

    def _classify_field(self, column: str, classification, pii_category) -> tuple[FieldRole, FieldTreatment]:
        if pii_category in _IDENTIFIER_CATEGORIES:
            return FieldRole.identifier, FieldTreatment.suppress
        if classification == FieldClassification.sensitive:
            return FieldRole.sensitive, FieldTreatment.keep
        if classification == FieldClassification.personal:
            return FieldRole.quasi_identifier, FieldTreatment.generalize
        norm = column.lower().replace("_", " ")
        if _IDENT_NAME.search(norm):
            return FieldRole.identifier, FieldTreatment.suppress
        if _QI_NAME.search(norm):
            return FieldRole.quasi_identifier, FieldTreatment.generalize
        return FieldRole.insensitive, FieldTreatment.keep

    def _align_rules(self, rules_in: list[FieldRule], columns: list[str]) -> list[FieldRule]:
        """Order rules to match the dataset columns; fill any gaps with keep."""
        by_field = {r.field: r for r in rules_in}
        return [
            by_field.get(c, FieldRule(field=c, role=FieldRole.insensitive, treatment=FieldTreatment.keep))
            for c in columns
        ]

    def _derive_rules(self, asset: DataInventoryAsset, columns: list[str]) -> list[FieldRule]:
        by_name = {f.name: f for f in asset.fields}
        rules: list[FieldRule] = []
        for col in columns:
            field = by_name.get(col)
            role, treatment = self._classify_field(
                col,
                field.classification if field else None,
                field.pii_category if field else None,
            )
            rules.append(FieldRule(field=col, role=role, treatment=treatment))
        return rules

    # --- dataset loading ---

    def _load_dataset(self, asset: DataInventoryAsset, max_rows: int) -> tuple[list[str], list[list]]:
        if asset.data_source_id is None:
            raise ValueError("This dataset has no linked source to read.")
        source = self.db.get(DataSource, asset.data_source_id)
        if source is None:
            raise ValueError("The dataset's source no longer exists.")
        if source.category == "upload":
            cfg = source.extra_config or {}
            path = cfg.get("stored_path")
            if not path:
                raise ValueError("The uploaded file is missing.")
            parsed = file_scanner.parse_file(path, cfg.get("original_filename") or asset.name, max_rows=max_rows)
            if not parsed.tables:
                raise ValueError("This file has no tabular data to anonymise.")
            t = parsed.tables[0]
            return list(t.columns), [list(r) for r in t.rows]
        if db_connector.supports_introspection(source):
            cols, rows = db_connector.sample_table(source, asset.name, max_rows)
            return list(cols), [list(r) for r in rows]
        raise ValueError("Anonymisation supports database tables and uploaded files in this phase.")

    # --- transforms ---

    @staticmethod
    def _pseudonymize(value, salt: str) -> str:
        if value is None or value == "":
            return ""
        digest = hashlib.sha256(f"{salt}:{value}".encode()).hexdigest()[:12]
        return f"TKN_{digest}"

    @staticmethod
    def _date_shift(value, offset_days: int):
        d: date | None = None
        if isinstance(value, datetime):
            d = value.date()
        elif isinstance(value, date):
            d = value
        else:
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
                try:
                    d = datetime.strptime(str(value).strip()[:10], fmt).date()
                    break
                except (ValueError, TypeError):
                    continue
        if d is None:
            return value  # not a date — leave unchanged
        return (d + timedelta(days=offset_days)).isoformat()

    def _apply(self, value, treatment: FieldTreatment, salt: str, offset_days: int, epsilon: float = 1.0):
        if value is None:
            return ""
        if treatment == FieldTreatment.keep:
            return value
        if treatment == FieldTreatment.suppress:
            return ""
        if treatment == FieldTreatment.pseudonymize:
            return self._pseudonymize(value, salt)
        if treatment == FieldTreatment.generalize:
            return _generalize(str(value))
        if treatment == FieldTreatment.mask:
            return transform_value(str(value), MaskingStrategy.mask)
        if treatment == FieldTreatment.date_shift:
            return self._date_shift(value, offset_days)
        if treatment == FieldTreatment.dp_noise:
            return self._dp_noise(value, epsilon)
        return value

    @staticmethod
    def _laplace(scale: float) -> float:
        u = random.random() - 0.5
        return -scale * math.copysign(1, u) * math.log(1 - 2 * abs(u))

    @classmethod
    def _dp_noise(cls, value, epsilon: float):
        """Differential-privacy Laplace noise on a numeric value. Non-numeric
        values fall back to generalisation (can't add noise to text)."""
        try:
            x = float(value)
        except (ValueError, TypeError):
            return _generalize(str(value)) if value not in (None, "") else ""
        scale = 1.0 / max(epsilon, 1e-6)
        noisy = x + cls._laplace(scale)
        is_int = isinstance(value, int) or (isinstance(value, str) and value.strip().lstrip("-").isdigit())
        return str(int(round(noisy))) if is_int else str(round(noisy, 2))

    @staticmethod
    def _default_treatment(
        role: FieldRole, technique: AnonymisationTechnique, field: str
    ) -> FieldTreatment:
        """The treatment each preset applies to a column, by its role. This is what
        makes the technique dropdown meaningful — each preset shapes the field plan
        differently (the user can still override per-field)."""
        T, R, A = FieldTreatment, FieldRole, AnonymisationTechnique

        if technique == A.differential_privacy:
            if role == R.identifier:
                return T.suppress
            if role in (R.quasi_identifier, R.sensitive):
                return T.dp_noise
            return T.keep
        if technique == A.pseudonymization:
            # Tokenise direct identifiers, keep the rest (preserves analytic joins).
            return T.pseudonymize if role == R.identifier else T.keep
        if technique == A.suppression:
            # Aggressively remove anything identifying.
            return T.suppress if role in (R.identifier, R.quasi_identifier) else T.keep
        if technique == A.date_shifting:
            if role != R.identifier and _DATE_NAME.search(field):
                return T.date_shift
            if role == R.identifier:
                return T.suppress
            if role == R.quasi_identifier:
                return T.generalize
            return T.keep
        # k_anonymity / l_diversity / generalization → blur QIs, drop identifiers.
        if role == R.identifier:
            return T.suppress
        if role == R.quasi_identifier:
            return T.generalize
        return T.keep

    @classmethod
    def _apply_technique_defaults(
        cls, rules: list[FieldRule], technique: AnonymisationTechnique
    ) -> list[FieldRule]:
        """Set each field's treatment from the chosen technique + its role.
        Applied only to server-derived plans, so a user's manual edits are kept."""
        return [
            FieldRule(field=r.field, role=r.role, treatment=cls._default_treatment(r.role, technique, r.field))
            for r in rules
        ]

    def _transform_rows(
        self,
        columns: list[str],
        rows: list[list],
        rules: list[FieldRule],
        salt: str,
        offset_days: int,
        epsilon: float = 1.0,
    ) -> list[list]:
        treatments = [r.treatment for r in rules]
        return [
            [self._apply(row[i], treatments[i], salt, offset_days, epsilon) for i in range(len(columns))]
            for row in rows
        ]

    # --- enforcement (record suppression to satisfy k / l-diversity) ---

    def _enforce(
        self,
        columns: list[str],
        rows: list[list],
        rules: list[FieldRule],
        technique: AnonymisationTechnique,
        k_threshold: int,
        l_threshold: int,
    ) -> tuple[list[list], int, int]:
        """Drop equivalence classes that don't meet k (and, for l-diversity, l)
        so the remaining output provably satisfies the guarantee.
        Returns (kept_rows, suppressed_count, final_k)."""
        if not rows:
            return [], 0, 0
        qi_idx = [columns.index(r.field) for r in rules
                  if r.role == FieldRole.quasi_identifier and r.field in columns]
        enforce = technique in (AnonymisationTechnique.k_anonymity, AnonymisationTechnique.l_diversity)
        if not enforce or not qi_idx:
            return rows, 0, self._compute_k(columns, rows, rules)

        sens_idx = [columns.index(r.field) for r in rules
                    if r.role == FieldRole.sensitive and r.field in columns]
        check_l = technique == AnonymisationTechnique.l_diversity and bool(sens_idx)

        from collections import defaultdict

        groups: dict[tuple, list[list]] = defaultdict(list)
        for row in rows:
            groups[tuple(str(row[i]) for i in qi_idx)].append(row)

        kept: list[list] = []
        for grp in groups.values():
            if len(grp) < k_threshold:
                continue
            if check_l and not all(
                len({str(r[i]) for r in grp}) >= l_threshold for i in sens_idx
            ):
                continue
            kept.extend(grp)

        suppressed = len(rows) - len(kept)
        final_k = self._compute_k(columns, kept, rules) if kept else 0
        return kept, suppressed, final_k

    # --- k-anonymity / risk ---

    @staticmethod
    def _compute_k(columns: list[str], rows: list[list], rules: list[FieldRule]) -> int:
        if not rows:
            return 0
        qi_cols = [r.field for r in rules if r.role == FieldRole.quasi_identifier]
        qi_idx = [columns.index(c) for c in qi_cols if c in columns]
        if not qi_idx:
            # No quasi-identifiers left → every row shares the (empty) signature.
            return len(rows)
        from collections import Counter

        groups: Counter[tuple] = Counter()
        for row in rows:
            groups[tuple(str(row[i]) for i in qi_idx)] += 1
        return min(groups.values())

    @staticmethod
    def _risk(k: int, k_threshold: int) -> tuple[float | None, str | None]:
        if k <= 0:
            return None, None
        risk_percent = round(100.0 / k, 2)
        if k >= k_threshold:
            level = "low"
        elif k >= max(2, k_threshold // 5):
            level = "medium"
        else:
            level = "high"
        return risk_percent, level

    # --- create a job (execution runs in the background) ---

    @staticmethod
    def _next_run(now: datetime, schedule: ScheduleKind) -> datetime | None:
        if schedule == ScheduleKind.daily:
            return now + timedelta(days=1)
        if schedule == ScheduleKind.weekly:
            return now + timedelta(days=7)
        if schedule == ScheduleKind.monthly:
            return now + timedelta(days=30)
        return None

    def create_job(
        self, user: User, body: AnonymisationJobCreate, org_id: UUID | None = None
    ) -> AnonymisationJobRead:
        """Create the job (status=running); the heavy work runs in a background
        task via execute_anon_job()."""
        resolved = self._resolve_org_id(user, org_id)
        asset = self._get_asset(resolved, asset_id=body.asset_id)
        source = self.db.get(DataSource, asset.data_source_id) if asset.data_source_id else None

        output_source_id = None
        if body.output_destination == "s3":
            if body.output_source_id is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Select an S3 destination source.")
            dest = self.db.get(DataSource, body.output_source_id)
            if dest is None or dest.organization_id != resolved or dest.source_type != "s3":
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid S3 destination source.")
            output_source_id = dest.id

        job = AnonymisationJob(
            organization_id=resolved,
            name=body.name,
            asset_id=asset.id,
            dataset_name=asset.name,
            source_label=source.name if source else None,
            technique=body.technique,
            k_threshold=body.k_threshold,
            l_threshold=body.l_threshold,
            epsilon=body.epsilon,
            schedule=body.schedule,
            output_destination=body.output_destination,
            output_source_id=output_source_id,
            business_purpose=body.business_purpose.strip(),
            requested_by_user_id=user.id,
            requested_by_email=user.email,
            output_recipient=body.output_recipient.strip(),
            external_sharing=body.external_sharing,
            cross_border_expected=body.cross_border_expected,
            # Store the user's chosen field plan up front so re-runs are deterministic.
            field_rules=[r.model_dump(mode="json") for r in body.field_rules] if body.field_rules else [],
            status=JobStatus.running,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        from app.models.compliance import AuditEventType
        from app.services.audit_events import record_audit_event

        record_audit_event(
            self.db,
            resolved,
            user=user,
            action=f"Anonymisation job created: {job.name}",
            details=(
                f"Purpose: {body.business_purpose.strip()} | "
                f"Recipient: {body.output_recipient.strip()} | "
                f"Technique: {body.technique.value} ({technique_class(body.technique)})"
            ),
            event_type=AuditEventType.configuration,
            resource_type="anonymisation_job",
            resource_id=str(job.id),
            commit=True,
        )
        return self._serialize(job)

    def execute_job_by_id(self, job_id: UUID) -> None:
        job = self.db.get(AnonymisationJob, job_id)
        if job is not None:
            self._execute_job(job)

    def _execute_job(self, job: AnonymisationJob) -> None:
        """(Re)run a job's anonymisation: read → transform → enforce → output.
        Idempotent so the scheduler can re-run recurring jobs."""
        now = datetime.now(timezone.utc)
        job.status = JobStatus.running
        job.started_at = now
        self.db.commit()
        try:
            asset = self.db.get(DataInventoryAsset, job.asset_id) if job.asset_id else None
            if asset is None:
                raise ValueError("The dataset no longer exists.")
            columns, rows = self._load_dataset(asset, MAX_ROWS)
            if job.field_rules:
                # Explicit plan (from the UI or a prior run) — respect it as-is.
                rules = self._align_rules([FieldRule(**r) for r in job.field_rules], columns)
            else:
                rules = self._apply_technique_defaults(
                    self._align_rules(self._derive_rules(asset, columns), columns), job.technique
                )

            salt = job.id.hex
            offset_days = (job.id.int % 61) - 30  # deterministic per job, range [-30, 30]
            eps = job.epsilon or 1.0
            transformed = self._transform_rows(columns, rows, rules, salt, offset_days, eps)
            kept, suppressed, k = self._enforce(
                columns, transformed, rules, job.technique, job.k_threshold, job.l_threshold
            )
            risk_percent, risk_level = self._risk(k, job.k_threshold)
            output_path, output_filename = self._write_output(job.organization_id, job, columns, kept)
            if job.output_destination == "s3" and job.output_source_id:
                self._write_to_s3(job, output_path, output_filename)

            now = datetime.now(timezone.utc)
            job.field_rules = [r.model_dump(mode="json") for r in rules]
            job.records_processed = len(rows)
            job.records_suppressed = suppressed
            job.k_value = k
            job.risk_percent = risk_percent
            job.risk_level = risk_level
            job.output_path = output_path
            job.output_filename = output_filename
            job.run_count = (job.run_count or 0) + 1
            job.status = JobStatus.completed
            job.finished_at = now
            job.error = None
            if job.schedule != ScheduleKind.one_time:
                job.next_run_at = self._next_run(now, job.schedule)
            # A fresh run resets the drift monitor.
            job.last_monitored_at = now
            job.monitor_k = k
            job.monitor_risk_percent = risk_percent
            job.monitor_status = "ok" if k >= job.k_threshold else "drift"
            self._seal_job_completion(job)
            self.db.commit()
        except Exception as exc:  # noqa: BLE001 — record failure on the job
            logger.exception("Anonymisation job %s failed", job.id)
            self.db.rollback()
            job = self.db.get(AnonymisationJob, job.id)
            if job is not None:
                job.status = JobStatus.failed
                job.error = str(exc)
                job.finished_at = datetime.now(timezone.utc)
                self.db.commit()

    def _seal_job_completion(self, job: AnonymisationJob) -> None:
        """Seal completed anonymisation job to Proof Vault for §6(10) accountability."""
        if job.proof_vault_record_id is not None:
            return
        try:
            from app.services.proof_vault_service import ProofVaultService

            tclass = technique_class(job.technique)
            rec = ProofVaultService.seal_event(
                self.db,
                job.organization_id,
                None,
                event_type="anonymisation_job_completed",
                action="ANONYMISE",
                purposes=job.business_purpose or job.name,
                channel="data_anonymisation",
                source=(
                    f"job={job.id};technique={job.technique.value};class={tclass};"
                    f"k={job.k_value};risk={job.risk_percent};records={job.records_processed};"
                    f"destination={job.output_destination}"
                ),
            )
            job.proof_vault_record_id = rec.id
        except Exception:  # noqa: BLE001
            logger.exception("Proof Vault seal failed for anonymisation job %s", job.id)

    def _write_to_s3(self, job: AnonymisationJob, local_path: str, filename: str) -> None:
        source = self.db.get(DataSource, job.output_source_id)
        if source is None or source.source_type != "s3":
            raise ValueError("Output S3 destination is unavailable.")
        import boto3
        from botocore.config import Config

        from app.core.crypto import decrypt_secret

        cfg = source.extra_config or {}
        host = (source.host or "").strip("/")
        bucket, _, prefix = host.partition("/")
        if not bucket:
            raise ValueError("The S3 destination has no bucket configured.")
        client = boto3.client(
            "s3",
            aws_access_key_id=source.username or None,
            aws_secret_access_key=decrypt_secret(source.password) if source.password else None,
            aws_session_token=cfg.get("session_token") or None,
            region_name=source.region or None,
            endpoint_url=cfg.get("endpoint_url") or None,
            config=Config(connect_timeout=15, read_timeout=30, retries={"max_attempts": 2}),
        )
        key = f"{prefix + '/' if prefix else ''}anonymised/{filename}"
        client.upload_file(local_path, bucket, key)

    def _write_output(
        self, org_id: UUID, job: AnonymisationJob, columns: list[str], rows: list[list]
    ) -> tuple[str, str]:
        out_dir = Path(settings.UPLOAD_DIR) / "anonymised" / str(org_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", job.name)[:60] or "dataset"
        filename = f"{safe}_anonymised.csv"
        path = out_dir / f"{job.id.hex}_{filename}"
        with path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(columns)
            for row in rows:
                writer.writerow(["" if v is None else v for v in row])
        return str(path), filename

    # --- continuous re-identification risk monitor + scheduler ---

    def _monitor_job(self, job: AnonymisationJob) -> None:
        """Re-check a completed job's k against the CURRENT source data; flag drift."""
        now = datetime.now(timezone.utc)
        try:
            asset = self.db.get(DataInventoryAsset, job.asset_id) if job.asset_id else None
            if asset is None:
                job.monitor_status = "unknown"
            else:
                columns, rows = self._load_dataset(asset, PREVIEW_ROWS)
                if job.field_rules:
                    rules = self._align_rules([FieldRule(**r) for r in job.field_rules], columns)
                else:
                    rules = self._apply_technique_defaults(
                        self._align_rules(self._derive_rules(asset, columns), columns), job.technique
                    )
                transformed = self._transform_rows(columns, rows, rules, "monitor", 0, job.epsilon or 1.0)
                _, _, k = self._enforce(columns, transformed, rules, job.technique, job.k_threshold, job.l_threshold)
                risk_percent, _ = self._risk(k, job.k_threshold)
                job.monitor_k = k
                job.monitor_risk_percent = risk_percent
                job.monitor_status = "ok" if k >= job.k_threshold else "drift"
        except Exception:  # noqa: BLE001
            logger.exception("Monitor failed for anonymisation job %s", job.id)
            job.monitor_status = "unknown"
        job.last_monitored_at = now
        self.db.commit()

    def _run_maintenance(self, org_id: UUID | None, force_monitor: bool = False) -> dict[str, int]:
        now = datetime.now(timezone.utc)
        reran = monitored = 0

        due = select(AnonymisationJob).where(
            AnonymisationJob.schedule != ScheduleKind.one_time,
            AnonymisationJob.next_run_at.is_not(None),
            AnonymisationJob.next_run_at <= now,
            AnonymisationJob.status != JobStatus.running,
        )
        if org_id is not None:
            due = due.where(AnonymisationJob.organization_id == org_id)
        for job in self.db.execute(due).scalars().all():
            self._execute_job(job)
            reran += 1

        cutoff = now - timedelta(hours=12)
        mon = select(AnonymisationJob).where(AnonymisationJob.status == JobStatus.completed)
        if not force_monitor:
            mon = mon.where(
                or_(
                    AnonymisationJob.last_monitored_at.is_(None),
                    AnonymisationJob.last_monitored_at < cutoff,
                )
            )
        if org_id is not None:
            mon = mon.where(AnonymisationJob.organization_id == org_id)
        for job in self.db.execute(mon.limit(50)).scalars().all():
            self._monitor_job(job)
            monitored += 1
        return {"reran": reran, "monitored": monitored}

    def run_scheduler_all(self) -> dict[str, int]:
        """Background entry point — across all organizations."""
        return self._run_maintenance(None)

    def run_maintenance_for_org(self, user: User, org_id: UUID | None = None) -> dict[str, int]:
        """Admin on-demand: run due recurring jobs + force a drift re-check."""
        resolved = self._resolve_org_id(user, org_id)
        return self._run_maintenance(resolved, force_monitor=True)

    # --- reads ---

    @staticmethod
    def _serialize(job: AnonymisationJob) -> AnonymisationJobRead:
        data = AnonymisationJobRead.model_validate(job)
        return data.model_copy(
            update={"technique_class": technique_class(job.technique)},
        )

    def list_jobs(self, user: User, org_id: UUID | None = None) -> list[AnonymisationJobRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.execute(
                select(AnonymisationJob)
                .where(AnonymisationJob.organization_id == resolved)
                .order_by(AnonymisationJob.created_at.desc())
            )
            .scalars()
            .all()
        )
        return [self._serialize(j) for j in rows]

    def get_job(self, user: User, job_id: UUID, org_id: UUID | None = None) -> AnonymisationJobRead:
        resolved = self._resolve_org_id(user, org_id)
        job = self.db.get(AnonymisationJob, job_id)
        if job is None or job.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Job not found")
        return self._serialize(job)

    def get_output(self, user: User, job_id: UUID, org_id: UUID | None = None) -> tuple[str, str]:
        resolved = self._resolve_org_id(user, org_id)
        job = self.db.get(AnonymisationJob, job_id)
        if job is None or job.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Job not found")
        if not job.output_path or not Path(job.output_path).exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Output file is not available")
        return job.output_path, job.output_filename or "anonymised.csv"

    def record_download(
        self,
        user: User,
        job_id: UUID,
        justification: "DownloadJustification",
        *,
        ip: str | None = None,
        org_id: UUID | None = None,
    ) -> tuple[str, str]:
        """Log the download (dedicated audit row + central audit trail), then
        return the file path. Requires the mandatory justification."""
        from app.models.anonymisation_download_log import AnonymisationDownloadLog
        from app.models.compliance import AuditEventType
        from app.services.audit_events import record_audit_event

        if not justification.acknowledge:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Please confirm responsible handling before downloading.",
            )
        resolved = self._resolve_org_id(user, org_id)
        path, filename = self.get_output(user, job_id, org_id=org_id)

        self.db.add(
            AnonymisationDownloadLog(
                organization_id=resolved,
                job_id=job_id,
                downloaded_by_user_id=user.id,
                downloaded_by_email=user.email,
                file_name=filename,
                purpose=justification.purpose.strip(),
                shared_with=justification.shared_with.strip(),
                recipient_type=justification.recipient_type,
                notes=justification.notes,
                ip_address=ip,
            )
        )
        record_audit_event(
            self.db,
            resolved,
            user=user,
            action=f"Anonymised dataset downloaded: {filename}",
            details=(
                f"Purpose: {justification.purpose.strip()} | "
                f"Shared with: {justification.shared_with.strip()}"
                + (f" ({justification.recipient_type})" if justification.recipient_type else "")
            ),
            event_type=AuditEventType.access,
            resource_type="anonymisation_job",
            resource_id=str(job_id),
            commit=False,
        )
        self.db.commit()
        return path, filename

    def list_downloads(
        self, user: User, job_id: UUID, org_id: UUID | None = None
    ) -> list["DownloadLogRead"]:
        from app.models.anonymisation_download_log import AnonymisationDownloadLog
        from app.schemas.anonymisation import DownloadLogRead

        resolved = self._resolve_org_id(user, org_id)
        job = self.db.get(AnonymisationJob, job_id)
        if job is None or job.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Job not found")
        rows = (
            self.db.query(AnonymisationDownloadLog)
            .filter(
                AnonymisationDownloadLog.organization_id == resolved,
                AnonymisationDownloadLog.job_id == job_id,
            )
            .order_by(AnonymisationDownloadLog.created_at.desc())
            .all()
        )
        return [DownloadLogRead.model_validate(r) for r in rows]

    def build_evidence_pdf(self, user: User, job_id: UUID, org_id: UUID | None = None) -> tuple[bytes, str]:
        """Generate a DPDPA-evidence PDF for a completed anonymisation job."""
        resolved = self._resolve_org_id(user, org_id)
        job = self.db.get(AnonymisationJob, job_id)
        if job is None or job.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Job not found")

        from io import BytesIO

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )

        styles = getSampleStyleSheet()
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, title="Anonymisation Evidence Pack")
        story: list = []

        story.append(Paragraph("Data Anonymisation — Evidence Pack", styles["Title"]))
        story.append(Paragraph("DPDPA, 2023 — Section 8 (Data Minimisation &amp; Anonymisation)", styles["Normal"]))
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph(
            "<b>Module scope:</b> Analytics/export anonymisation — produces a de-identified copy "
            "for downstream use. Withdrawal, DSAR, and retention in-place actions use the "
            "Data Masking / Retention modules separately.",
            styles["Normal"],
        ))
        story.append(Spacer(1, 8 * mm))

        tclass = technique_class(job.technique)
        risk = f"{job.risk_percent}% ({job.risk_level})" if job.risk_percent is not None else "—"
        summary = [
            ["Job name", job.name],
            ["Dataset", job.dataset_name or "—"],
            ["Source", job.source_label or "—"],
            ["Technique", job.technique.value],
            ["Technique class", technique_class_label(job.technique)],
            ["Business purpose", job.business_purpose or "—"],
            ["Requested by", job.requested_by_email or "—"],
            ["Output recipient", job.output_recipient or "—"],
            ["External sharing", "Yes" if job.external_sharing else "No"],
            ["Cross-border expected", "Yes" if job.cross_border_expected else "No"],
            ["k threshold (target)", str(job.k_threshold)],
            ["k achieved (measured)", str(job.k_value) if job.k_value is not None else "—"],
            ["Re-identification risk", risk],
            ["Records processed", str(job.records_processed)],
            ["Records suppressed", str(job.records_suppressed)],
            ["Status", job.status.value],
            ["Completed at", job.finished_at.isoformat() if job.finished_at else "—"],
            ["Proof Vault record", str(job.proof_vault_record_id) if job.proof_vault_record_id else "—"],
        ]
        if job.technique.value == "l_diversity":
            summary.insert(5, ["l threshold", str(job.l_threshold)])

        t = Table(summary, colWidths=[55 * mm, 110 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2ff")),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
        story.append(Spacer(1, 8 * mm))

        story.append(Paragraph("Field treatments", styles["Heading2"]))
        rule_rows = [["Field", "Role", "Treatment"]]
        for r in (job.field_rules or []):
            rule_rows.append([r.get("field", ""), r.get("role", ""), r.get("treatment", "")])
        rt = Table(rule_rows, colWidths=[70 * mm, 50 * mm, 45 * mm])
        rt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
        ]))
        story.append(rt)
        story.append(Spacer(1, 8 * mm))
        story.append(Paragraph(
            "This dataset was processed per the field treatments above. "
            + (
                "Where the technique guarantees k-anonymity, equivalence classes smaller than the "
                "target k were suppressed from the output, so each retained record is indistinguishable "
                "from at least k-1 others on the quasi-identifiers. "
                if tclass == "true_anonymisation"
                else "This job used a de-identification technique — output may still constitute "
                "personal data under DPDPA and requires legal review before external sharing. "
            )
            + "Once the link to the data principal is irreversibly removed, the output may fall "
            "outside DPDPA personal-data scope.",
            styles["Normal"],
        ))

        doc.build(story)
        filename = f"{re.sub(r'[^A-Za-z0-9_.-]+', '_', job.name)[:60] or 'job'}_evidence.pdf"
        return buf.getvalue(), filename

    def get_summary(self, user: User, org_id: UUID | None = None) -> AnonymisationSummary:
        resolved = self._resolve_org_id(user, org_id)
        completed = (
            self.db.execute(
                select(AnonymisationJob).where(
                    AnonymisationJob.organization_id == resolved,
                    AnonymisationJob.status == JobStatus.completed,
                )
            )
            .scalars()
            .all()
        )
        total_records = sum(j.records_processed for j in completed)
        risks = [j.risk_percent for j in completed if j.risk_percent is not None]
        ks = [j.k_value for j in completed if j.k_value is not None]
        total_jobs = self.db.scalar(
            select(func.count(AnonymisationJob.id)).where(AnonymisationJob.organization_id == resolved)
        ) or 0
        running_jobs = self.db.scalar(
            select(func.count(AnonymisationJob.id)).where(
                AnonymisationJob.organization_id == resolved,
                AnonymisationJob.status == JobStatus.running,
            )
        ) or 0
        drift_jobs = self.db.scalar(
            select(func.count(AnonymisationJob.id)).where(
                AnonymisationJob.organization_id == resolved,
                AnonymisationJob.monitor_status == "drift",
            )
        ) or 0
        return AnonymisationSummary(
            datasets_anonymised=len(completed),
            total_records=total_records,
            total_jobs=total_jobs,
            running_jobs=running_jobs,
            drift_jobs=drift_jobs,
            avg_risk_percent=round(sum(risks) / len(risks), 3) if risks else None,
            lowest_k=min(ks) if ks else None,
            active_jobs=total_jobs,
        )


def execute_anon_job(job_id: UUID) -> None:
    """Background-task entry point: run an anonymisation job with its own session."""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        AnonymisationService(db).execute_job_by_id(job_id)
    finally:
        db.close()
