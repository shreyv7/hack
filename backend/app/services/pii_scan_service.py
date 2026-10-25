from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.data_inventory import (
    AssetStatus,
    AssetType,
    ClassificationSource,
    DataInventoryAsset,
    DataInventoryField,
    FieldClassification,
)
from app.models.data_source import DataSource
from app.models.enforcement import PurposeDataMapping
from app.models.organization import Organization, OrganizationStatus
from app.models.pii_scan import (
    FindingStatus,
    PiiFinding,
    PiiScanJob,
    PiiScanSchedule,
    ScanFrequency,
    ScanStatus,
)
from app.models.retention import PolicyStatus, RetentionPolicy
from app.models.user import User, UserRole
from app.schemas.pii_scan import (
    BulkDismissRequest,
    BulkDismissResult,
    CategoryCount,
    FindingRead,
    PiiScanSummary,
    ScanJobDetail,
    ScanJobRead,
    ScheduleCreate,
    ScheduleRead,
    ScheduleUpdate,
)
from app.services import (
    api_source_reader,
    db_connector,
    file_scanner,
    file_source_reader,
    log_source_reader,
)
from app.services.pii_detectors import CATEGORY_LABELS, detect_value, mask_value

logger = logging.getLogger(__name__)

# A column is flagged when at least this fraction of its non-null sampled values
# match a single PII category.
MATCH_THRESHOLD = 0.30

# Presidio NER entity → (our pii_category, classification). Noisy entities
# (DATE_TIME, URL, generic NRP variations) are intentionally dropped.
_PRESIDIO_MAP: dict[str, tuple[str, str]] = {
    "PERSON": ("person", "personal"),
    "EMAIL_ADDRESS": ("email", "personal"),
    "PHONE_NUMBER": ("phone", "personal"),
    "AADHAAR": ("aadhaar", "sensitive"),
    "PAN": ("pan", "sensitive"),
    "LOCATION": ("location", "personal"),
    "CREDIT_CARD": ("financial", "sensitive"),
    "IBAN_CODE": ("financial", "sensitive"),
    "IP_ADDRESS": ("ip_address", "personal"),
    "NRP": ("demographic", "sensitive"),
}
# Minimum NER confidence to keep a free-text hit.
_NER_MIN_SCORE = 0.4
# Tokens are stripped of surrounding punctuation before the regex detectors run.
_STRIP_CHARS = " \t\r\n.,;:!?()[]{}\"'<>|"


class PiiScanService:
    def __init__(self, db: Session):
        self.db = db

    # --- tenant scoping ---

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
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, detail="PII scanning requires an organization context"
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, detail="PII scanning requires an organization context"
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    # --- inventory upsert (so a scan also populates the catalogue) ---

    def _upsert_field(
        self, org_id: UUID, source: DataSource, table: str, column: str,
        classification: FieldClassification, category: str,
    ) -> tuple[DataInventoryAsset, DataInventoryField]:
        asset = self.db.execute(
            select(DataInventoryAsset)
            .where(
                DataInventoryAsset.organization_id == org_id,
                DataInventoryAsset.data_source_id == source.id,
                DataInventoryAsset.name == table,
            )
            .options(selectinload(DataInventoryAsset.fields))
        ).scalar_one_or_none()
        if asset is None:
            asset = DataInventoryAsset(
                organization_id=org_id,
                data_source_id=source.id,
                name=table,
                asset_type=AssetType.table,
                location=source.name,
                status=AssetStatus.active,
                data_categories=[],
            )
            self.db.add(asset)
            self.db.flush()
        field = next((f for f in asset.fields if f.name == column), None)
        if field is None:
            field = DataInventoryField(asset_id=asset.id, name=column)
            self.db.add(field)
            self.db.flush()
        # Data-verified classification overrides the name-based guess.
        field.classification = classification
        field.pii_category = category
        field.classification_source = ClassificationSource.pii_scanner
        return asset, field

    # --- run a scan (async: start → background job) ---

    def start_scan(
        self, user: User, data_source_id: UUID, sample_size: int = 100, org_id: UUID | None = None
    ) -> ScanJobRead:
        """Validate and create a 'running' scan job; the heavy work happens in a
        background task (see execute_pii_scan)."""
        resolved = self._resolve_org_id(user, org_id)
        source = self.db.get(DataSource, data_source_id)
        if source is None or source.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")
        if source.category == "upload":
            filename = (source.extra_config or {}).get("original_filename", "")
            if not file_scanner.is_supported(filename):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="This file type can't be scanned. Supported: "
                    + ", ".join(sorted(file_scanner.SUPPORTED_EXTENSIONS)),
                )
        elif source.category in ("files", "logs"):
            # File stores (S3/GCS/Azure Blob/Drive/SFTP) and log sources
            # (CloudWatch/Azure Monitor/GCP Logging/Splunk) are scanned by
            # fetching their contents at run time; validated there.
            pass
        elif source.category == "api":
            if source.source_type not in ("rest", "other_api"):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="PII scanning supports REST APIs. For GraphQL/SOAP, use a REST "
                    "connector pointed at a data endpoint.",
                )
        elif not db_connector.supports_introspection(source):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"PII scanning is not supported for '{source.source_type}' sources yet.",
            )
        job = PiiScanJob(
            organization_id=resolved,
            data_source_id=source.id,
            status=ScanStatus.running,
            sample_size=sample_size,
            started_at=datetime.now(timezone.utc),
            triggered_by=user.email,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return self._serialize_job(job)

    def retry_scan(self, user: User, job_id: UUID, org_id: UUID | None = None) -> ScanJobRead:
        """Re-run a failed (or completed) scan with the same source/sample size."""
        resolved = self._resolve_org_id(user, org_id)
        job = self.db.get(PiiScanJob, job_id)
        if job is None or job.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Scan job not found")
        if job.status == ScanStatus.running:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Scan is already running")
        if job.data_source_id is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Original data source no longer exists"
            )
        return self.start_scan(user, job.data_source_id, sample_size=job.sample_size, org_id=org_id)

    def run_job(self, job_id: UUID) -> None:
        """Execute a previously-created scan job. Runs in a background task with
        its own DB session; records success/failure on the job (never raises)."""
        job = self.db.get(PiiScanJob, job_id)
        if job is None or job.status != ScanStatus.running:
            return
        source = self.db.get(DataSource, job.data_source_id) if job.data_source_id else None
        if source is None:
            job.status = ScanStatus.failed
            job.error = "Data source no longer exists."
            job.finished_at = datetime.now(timezone.utc)
            self.db.commit()
            return

        resolved = job.organization_id
        try:
            if source.category == "upload":
                tables_scanned, columns_scanned, fields_flagged = self._run_file_job(
                    job, source, resolved
                )
            elif source.category == "files":
                tables_scanned, columns_scanned, fields_flagged = self._run_file_store_job(
                    job, source, resolved
                )
            elif source.category == "logs":
                tables_scanned, columns_scanned, fields_flagged = self._run_logs_job(
                    job, source, resolved
                )
            elif source.category == "api":
                tables_scanned, columns_scanned, fields_flagged = self._run_api_job(
                    job, source, resolved
                )
            else:
                tables_scanned, columns_scanned, fields_flagged = self._run_db_job(
                    job, source, resolved
                )
            job.tables_scanned = tables_scanned
            job.columns_scanned = columns_scanned
            job.fields_flagged = fields_flagged
            job.status = ScanStatus.completed
            job.finished_at = datetime.now(timezone.utc)
            self.db.commit()
        except Exception as exc:  # noqa: BLE001 — record failure on the job
            logger.exception("PII scan failed for source %s", source.id)
            self.db.rollback()
            job = self.db.get(PiiScanJob, job_id)
            if job is not None:
                job.status = ScanStatus.failed
                job.error = str(exc)
                job.finished_at = datetime.now(timezone.utc)
                self.db.commit()

    # --- scan engines (DB tables, structured files, free text) ---

    def _record_finding(
        self, job: PiiScanJob, resolved: UUID, source: DataSource, table_name: str,
        column: str, category: str, classification: FieldClassification,
        match_count: int, sample_count: int, confidence: int, example: str | None,
    ) -> None:
        asset, field = self._upsert_field(resolved, source, table_name, column, classification, category)
        self.db.add(
            PiiFinding(
                organization_id=resolved,
                scan_job_id=job.id,
                asset_id=asset.id,
                field_id=field.id,
                table_name=table_name,
                column_name=column,
                pii_category=category,
                classification=classification,
                match_count=match_count,
                sample_count=sample_count,
                confidence=confidence,
                example_masked=example,
                status=FindingStatus.detected,
            )
        )

    def _scan_table_columns(
        self, job: PiiScanJob, resolved: UUID, source: DataSource,
        table_name: str, col_names: list[str], rows: list[tuple],
    ) -> tuple[int, int]:
        """Scan each column's sampled values; flag a column when ≥ MATCH_THRESHOLD
        of its non-null values match a single category. Returns (cols, flagged)."""
        columns_scanned = fields_flagged = 0
        for idx, col in enumerate(col_names):
            columns_scanned += 1
            values = [r[idx] for r in rows if idx < len(r) and r[idx] is not None]
            if not values:
                continue
            cats: Counter[str] = Counter()
            cls_by_cat: dict[str, FieldClassification] = {}
            example: dict[str, str] = {}
            for v in values:
                hit = detect_value(v)
                if hit:
                    classification, category = hit
                    cats[category] += 1
                    cls_by_cat[category] = FieldClassification(classification)
                    example.setdefault(category, mask_value(v, category))
            if not cats:
                continue
            category, match_count = cats.most_common(1)[0]
            sample_count = len(values)
            ratio = match_count / sample_count
            if ratio < MATCH_THRESHOLD:
                continue
            self._record_finding(
                job, resolved, source, table_name, col, category, cls_by_cat[category],
                match_count, sample_count, round(ratio * 100), example.get(category),
            )
            fields_flagged += 1
        return columns_scanned, fields_flagged

    def _run_db_job(self, job: PiiScanJob, source: DataSource, resolved: UUID) -> tuple[int, int, int]:
        tables_scanned = columns_scanned = fields_flagged = 0
        for tbl in db_connector.read_schema(source):
            table_name = tbl.table if tbl.schema in ("", "public") else f"{tbl.schema}.{tbl.table}"
            col_names, rows = db_connector.sample_table(source, table_name, job.sample_size)
            tables_scanned += 1
            cols, flagged = self._scan_table_columns(job, resolved, source, table_name, col_names, rows)
            columns_scanned += cols
            fields_flagged += flagged
        return tables_scanned, columns_scanned, fields_flagged

    def _scan_parsed_file(
        self, job: PiiScanJob, resolved: UUID, source: DataSource, asset_name: str, parsed
    ) -> tuple[int, int, int]:
        """Scan one parsed file (structured tables + free text). Returns
        (assets_touched, columns_scanned, fields_flagged)."""
        tables = cols = flagged = 0
        for table in parsed.tables:
            tables += 1
            c, f = self._scan_table_columns(job, resolved, source, table.name, table.columns, table.rows)
            cols += c
            flagged += f
        if parsed.text and parsed.text.strip():
            tables += 1
            flagged += self._scan_free_text(job, resolved, source, asset_name, parsed.text)
        return tables, cols, flagged

    def _run_file_job(self, job: PiiScanJob, source: DataSource, resolved: UUID) -> tuple[int, int, int]:
        cfg = source.extra_config or {}
        path = cfg.get("stored_path")
        if not path:
            raise ValueError("No file is associated with this source.")
        filename = cfg.get("original_filename") or Path(path).name
        parsed = file_scanner.parse_file(path, filename, max_rows=max(job.sample_size, 100))
        return self._scan_parsed_file(job, resolved, source, filename, parsed)

    def _scan_byte_pairs(self, job: PiiScanJob, source: DataSource, resolved: UUID, pairs) -> tuple[int, int, int, int]:
        """Parse + scan a stream of (name, bytes). Returns (assets, cols, flagged, seen)."""
        tables = cols = flagged = seen = 0
        for name, data in pairs:
            seen += 1
            try:
                parsed = file_scanner.parse_bytes(data, name, max_rows=max(job.sample_size, 100))
            except ValueError:
                continue  # unsupported content — skip it
            t, c, f = self._scan_parsed_file(job, resolved, source, name, parsed)
            tables += t
            cols += c
            flagged += f
        return tables, cols, flagged, seen

    def _run_file_store_job(
        self, job: PiiScanJob, source: DataSource, resolved: UUID
    ) -> tuple[int, int, int]:
        """Scan a cloud file store: list + download each supported file, then run
        the same parser + detectors used for uploads."""
        tables, cols, flagged, seen = self._scan_byte_pairs(
            job, source, resolved, file_source_reader.iter_files(source)
        )
        if seen == 0:
            raise ValueError(
                "No supported files found in this source "
                "(CSV/TSV/XLSX/JSON/PDF/DOCX/TXT/LOG)."
            )
        return tables, cols, flagged

    def _run_api_job(
        self, job: PiiScanJob, source: DataSource, resolved: UUID
    ) -> tuple[int, int, int]:
        """Scan a REST API: GET the base URL + configured paths and run the
        parser + detectors over each response (JSON arrays → columns, else text)."""
        tables, cols, flagged, seen = self._scan_byte_pairs(
            job, source, resolved, api_source_reader.fetch_api(source)
        )
        if seen == 0:
            raise ValueError(
                "No scannable responses from this API. Check the base URL/auth, "
                "or set extra_config.scan_paths to JSON data endpoints."
            )
        return tables, cols, flagged

    def _run_logs_job(
        self, job: PiiScanJob, source: DataSource, resolved: UUID
    ) -> tuple[int, int, int]:
        """Scan a log source: fetch recent events and run the free-text detector
        over each group/workspace's messages."""
        chunks = log_source_reader.fetch_logs(source)
        if not chunks:
            raise ValueError("No log events found to scan in this source.")
        tables = flagged = 0
        for label, text in chunks:
            if not text.strip():
                continue
            tables += 1
            flagged += self._scan_free_text(job, resolved, source, label, text)
        return tables, 0, flagged

    def _scan_free_text(
        self, job: PiiScanJob, resolved: UUID, source: DataSource, asset_name: str, text: str,
    ) -> int:
        """Scan free text: regex token detectors (structured IDs) + Presidio NER
        (names, locations, …). One finding per detected category. Returns flagged."""
        counts: Counter[str] = Counter()
        cls_by_cat: dict[str, FieldClassification] = {}
        conf_by_cat: dict[str, int] = {}
        example: dict[str, str] = {}

        # 1. Regex token pass — reliable for emails, phones, Aadhaar, PAN, etc.
        for token in re.split(r"\s+", text):
            tok = token.strip(_STRIP_CHARS)
            if not tok:
                continue
            hit = detect_value(tok)
            if hit:
                classification, category = hit
                counts[category] += 1
                cls_by_cat[category] = FieldClassification(classification)
                conf_by_cat[category] = max(conf_by_cat.get(category, 0), 95)
                example.setdefault(category, mask_value(tok, category))

        # 2. Presidio NER pass — names, addresses, demographics in prose.
        try:
            from app.services.masking_service import _get_analyzer

            analyzer = _get_analyzer()
        except Exception:  # noqa: BLE001
            analyzer = None
        if analyzer is not None:
            try:
                results = analyzer.analyze(text=text[: file_scanner.MAX_TEXT_CHARS], language="en")
            except Exception:  # noqa: BLE001
                logger.exception("Presidio analyze failed during free-text scan")
                results = []
            for r in results:
                mapping = _PRESIDIO_MAP.get(r.entity_type)
                if not mapping or r.score < _NER_MIN_SCORE:
                    continue
                category, classification = mapping
                counts[category] += 1
                cls_by_cat[category] = FieldClassification(classification)
                conf_by_cat[category] = max(conf_by_cat.get(category, 0), round(r.score * 100))
                example.setdefault(category, mask_value(text[r.start : r.end], category))

        flagged = 0
        for category, count in counts.items():
            self._record_finding(
                job, resolved, source, asset_name, category, category, cls_by_cat[category],
                match_count=count, sample_count=count,
                confidence=conf_by_cat.get(category, 80), example=example.get(category),
            )
            flagged += 1
        return flagged

    # --- DPDPA compliance linkage (purpose / retention / children / cross-border) ---

    def _compliance_context(
        self, resolved: UUID, findings: list[PiiFinding], job_sources: dict[UUID, tuple[UUID | None, str | None]]
    ):
        """Build the lookup sets needed to answer, per finding: is this field tied
        to a declared purpose (Sec 4/5), covered by a retention policy (Sec 8(7)),
        does it belong to a minor (Sec 9), and does it leave India (Sec 16)?"""
        field_ids = {f.field_id for f in findings if f.field_id is not None}
        asset_ids = {f.asset_id for f in findings if f.asset_id is not None}
        source_ids = {sid for sid, _ in job_sources.values() if sid is not None}

        purpose_mapped: set[UUID] = set()
        if field_ids:
            purpose_mapped = set(
                self.db.execute(
                    select(PurposeDataMapping.inventory_field_id).where(
                        PurposeDataMapping.organization_id == resolved,
                        PurposeDataMapping.inventory_field_id.in_(field_ids),
                    )
                )
                .scalars()
                .all()
            )

        retention_assets: set[UUID] = set()
        retention_sources: set[UUID] = set()
        if asset_ids or source_ids:
            rows = self.db.execute(
                select(RetentionPolicy.asset_id, RetentionPolicy.data_source_id).where(
                    RetentionPolicy.organization_id == resolved,
                    RetentionPolicy.status == PolicyStatus.active,
                )
            ).all()
            for asset_id, source_id in rows:
                if asset_id is not None:
                    retention_assets.add(asset_id)
                if source_id is not None:
                    retention_sources.add(source_id)

        child_fields: set[UUID] = set()
        if field_ids:
            child_fields = set(
                self.db.execute(
                    select(DataInventoryField.id).where(
                        DataInventoryField.id.in_(field_ids),
                        DataInventoryField.is_child_data.is_(True),
                    )
                )
                .scalars()
                .all()
            )

        child_assets: set[UUID] = set()
        cross_border_assets: set[UUID] = set()
        if asset_ids:
            for asset_id, contains_child, cross_border in self.db.execute(
                select(
                    DataInventoryAsset.id,
                    DataInventoryAsset.contains_child_data,
                    DataInventoryAsset.cross_border_transfer,
                ).where(DataInventoryAsset.id.in_(asset_ids))
            ).all():
                if contains_child:
                    child_assets.add(asset_id)
                if cross_border:
                    cross_border_assets.add(asset_id)

        source_regions: dict[UUID, str | None] = {}
        if source_ids:
            source_regions = dict(
                self.db.execute(
                    select(DataSource.id, DataSource.region).where(DataSource.id.in_(source_ids))
                ).all()
            )

        def flags(f: PiiFinding) -> dict:
            source_id = job_sources.get(f.scan_job_id, (None, None))[0]
            region = source_regions.get(source_id) if source_id else None
            outside_india = bool(region) and "india" not in region.lower() and region.strip().upper() not in ("IN",)
            return {
                "has_purpose_mapping": f.field_id in purpose_mapped,
                "has_retention_policy": (f.asset_id in retention_assets) or (source_id in retention_sources),
                "is_child_data": (f.field_id in child_fields) or (f.asset_id in child_assets),
                "cross_border_transfer": (f.asset_id in cross_border_assets) or outside_india,
                "data_source_region": region,
            }

        return flags

    # --- serialization ---

    @staticmethod
    def _serialize_job(job: PiiScanJob) -> ScanJobRead:
        return ScanJobRead.model_validate(job)

    def _serialize_detail(self, job: PiiScanJob) -> ScanJobDetail:
        job_sources = {job.id: (job.data_source_id, None)}
        flags = self._compliance_context(job.organization_id, list(job.findings), job_sources)
        findings = []
        for f in job.findings:
            read = FindingRead.model_validate(f)
            for k, v in flags(f).items():
                setattr(read, k, v)
            findings.append(read)
        base = ScanJobRead.model_validate(job)
        return ScanJobDetail(**base.model_dump(), findings=findings)

    # --- reads ---

    def list_jobs(self, user: User, org_id: UUID | None = None) -> list[ScanJobRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.execute(
                select(PiiScanJob)
                .where(PiiScanJob.organization_id == resolved)
                .order_by(PiiScanJob.created_at.desc())
            )
            .scalars()
            .all()
        )
        return [self._serialize_job(j) for j in rows]

    def get_job(self, user: User, job_id: UUID, org_id: UUID | None = None) -> ScanJobDetail:
        resolved = self._resolve_org_id(user, org_id)
        job = self.db.get(PiiScanJob, job_id)
        if job is None or job.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Scan job not found")
        return self._serialize_detail(job)

    def _job_sources(self, resolved_org: UUID) -> dict[UUID, tuple[UUID | None, str | None]]:
        """job_id → (data_source_id, source name), for labelling findings by source."""
        rows = self.db.execute(
            select(PiiScanJob.id, PiiScanJob.data_source_id, DataSource.name)
            .join(DataSource, DataSource.id == PiiScanJob.data_source_id, isouter=True)
            .where(PiiScanJob.organization_id == resolved_org)
        ).all()
        return {job_id: (source_id, name) for job_id, source_id, name in rows}

    def _serialize_finding(
        self,
        finding: PiiFinding,
        job_sources: dict[UUID, tuple[UUID | None, str | None]],
        flags: Callable[[PiiFinding], dict] | None = None,
    ) -> FindingRead:
        read = FindingRead.model_validate(finding)
        source_id, source_name = job_sources.get(finding.scan_job_id, (None, None))
        read.data_source_id = source_id
        read.data_source_name = source_name
        if flags is not None:
            for k, v in flags(finding).items():
                setattr(read, k, v)
        return read

    def list_findings(
        self,
        user: User,
        org_id: UUID | None = None,
        status_filter: FindingStatus | None = None,
        data_source_id: UUID | None = None,
    ) -> list[FindingRead]:
        resolved = self._resolve_org_id(user, org_id)
        stmt = (
            select(PiiFinding)
            .where(PiiFinding.organization_id == resolved)
            .order_by(PiiFinding.confidence.desc(), PiiFinding.created_at.desc())
        )
        if status_filter is not None:
            stmt = stmt.where(PiiFinding.status == status_filter)
        if data_source_id is not None:
            stmt = stmt.where(
                PiiFinding.scan_job_id.in_(
                    select(PiiScanJob.id).where(PiiScanJob.data_source_id == data_source_id)
                )
            )
        rows = self.db.execute(stmt).scalars().all()
        job_sources = self._job_sources(resolved)
        flags = self._compliance_context(resolved, rows, job_sources)
        return [self._serialize_finding(f, job_sources, flags) for f in rows]

    def _revert_finding(self, finding: PiiFinding) -> None:
        """Mark a finding dismissed and revert the inventory field it classified."""
        finding.status = FindingStatus.dismissed
        if finding.field_id is not None:
            field = self.db.get(DataInventoryField, finding.field_id)
            if field is not None:
                field.classification = FieldClassification.unclassified
                field.pii_category = None

    def dismiss_finding(self, user: User, finding_id: UUID, org_id: UUID | None = None) -> FindingRead:
        resolved = self._resolve_org_id(user, org_id)
        finding = self.db.get(PiiFinding, finding_id)
        if finding is None or finding.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Finding not found")
        self._revert_finding(finding)
        self.db.commit()
        self.db.refresh(finding)
        job_sources = self._job_sources(resolved)
        return self._serialize_finding(finding, job_sources)

    def bulk_dismiss(
        self, user: User, body: BulkDismissRequest, org_id: UUID | None = None
    ) -> BulkDismissResult:
        """Dismiss many detected findings at once — by explicit ids and/or filters."""
        resolved = self._resolve_org_id(user, org_id)
        stmt = select(PiiFinding).where(
            PiiFinding.organization_id == resolved,
            PiiFinding.status == FindingStatus.detected,
        )
        if body.finding_ids:
            stmt = stmt.where(PiiFinding.id.in_(body.finding_ids))
        if body.data_source_id is not None:
            stmt = stmt.where(
                PiiFinding.scan_job_id.in_(
                    select(PiiScanJob.id).where(PiiScanJob.data_source_id == body.data_source_id)
                )
            )
        if body.pii_category is not None:
            stmt = stmt.where(PiiFinding.pii_category == body.pii_category)
        if body.min_confidence is not None:
            stmt = stmt.where(PiiFinding.confidence >= body.min_confidence)

        rows = self.db.execute(stmt).scalars().all()
        for finding in rows:
            self._revert_finding(finding)
        self.db.commit()
        count = len(rows)
        return BulkDismissResult(
            dismissed=count,
            message=(
                f"Dismissed {count} finding(s)." if count else "No matching findings to dismiss."
            ),
        )

    # --- summary ---

    def get_summary(self, user: User, org_id: UUID | None = None) -> PiiScanSummary:
        resolved = self._resolve_org_id(user, org_id)
        total_scans = self.db.scalar(
            select(func.count(PiiScanJob.id)).where(PiiScanJob.organization_id == resolved)
        ) or 0
        running_scans = self.db.scalar(
            select(func.count(PiiScanJob.id)).where(
                PiiScanJob.organization_id == resolved, PiiScanJob.status == ScanStatus.running
            )
        ) or 0
        active_findings = select(PiiFinding).where(
            PiiFinding.organization_id == resolved,
            PiiFinding.status == FindingStatus.detected,
        )
        findings = self.db.execute(active_findings).scalars().all()
        total_findings = len(findings)
        sensitive = sum(1 for f in findings if f.classification == FieldClassification.sensitive)
        fields_flagged = len({f.field_id for f in findings if f.field_id is not None})
        last_scan = self.db.scalar(
            select(func.max(PiiScanJob.started_at)).where(PiiScanJob.organization_id == resolved)
        )
        cat_counter: Counter[str] = Counter(f.pii_category for f in findings)
        by_category = [
            CategoryCount(category=c, label=CATEGORY_LABELS.get(c, c), count=n)
            for c, n in cat_counter.most_common()
        ]

        # --- coverage: how many registered sources have ever been scanned? ---
        sources_scannable = self.db.scalar(
            select(func.count(DataSource.id)).where(DataSource.organization_id == resolved)
        ) or 0
        sources_scanned = self.db.scalar(
            select(func.count(func.distinct(PiiScanJob.data_source_id))).where(
                PiiScanJob.organization_id == resolved,
                PiiScanJob.data_source_id.isnot(None),
                PiiScanJob.status == ScanStatus.completed,
            )
        ) or 0

        # --- DPDPA gap indicators over currently-active findings ---
        job_sources = self._job_sources(resolved)
        flags = self._compliance_context(resolved, findings, job_sources)
        without_purpose = without_retention = children = cross_border = 0
        for f in findings:
            flag = flags(f)
            if not flag["has_purpose_mapping"]:
                without_purpose += 1
            if not flag["has_retention_policy"]:
                without_retention += 1
            if flag["is_child_data"]:
                children += 1
            if flag["cross_border_transfer"]:
                cross_border += 1

        return PiiScanSummary(
            total_scans=total_scans,
            total_findings=total_findings,
            sensitive_findings=sensitive,
            fields_flagged=fields_flagged,
            last_scan_at=last_scan,
            by_category=by_category,
            running_scans=running_scans,
            sources_scannable=sources_scannable,
            sources_scanned=sources_scanned,
            findings_without_purpose=without_purpose,
            findings_without_retention=without_retention,
            children_data_findings=children,
            cross_border_findings=cross_border,
        )

    # --- recurring schedules (Sec 10: continuous monitoring) ---

    def _resolve_source_names(self, source_ids: set[UUID]) -> dict[UUID, str]:
        if not source_ids:
            return {}
        rows = self.db.execute(
            select(DataSource.id, DataSource.name).where(DataSource.id.in_(source_ids))
        ).all()
        return dict(rows)

    def _serialize_schedule(self, schedule: PiiScanSchedule, names: dict[UUID, str] | None = None) -> ScheduleRead:
        read = ScheduleRead.model_validate(schedule)
        names = names or self._resolve_source_names({schedule.data_source_id})
        read.data_source_name = names.get(schedule.data_source_id)
        return read

    @staticmethod
    def _next_run(frequency: ScanFrequency, now: datetime | None = None) -> datetime:
        now = now or datetime.now(timezone.utc)
        deltas = {
            ScanFrequency.daily: timedelta(days=1),
            ScanFrequency.weekly: timedelta(weeks=1),
            ScanFrequency.monthly: timedelta(days=30),
        }
        return now + deltas[frequency]

    def list_schedules(self, user: User, org_id: UUID | None = None) -> list[ScheduleRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.execute(
                select(PiiScanSchedule)
                .where(PiiScanSchedule.organization_id == resolved)
                .order_by(PiiScanSchedule.created_at.desc())
            )
            .scalars()
            .all()
        )
        names = self._resolve_source_names({r.data_source_id for r in rows})
        return [self._serialize_schedule(r, names) for r in rows]

    def create_schedule(self, user: User, body: ScheduleCreate, org_id: UUID | None = None) -> ScheduleRead:
        resolved = self._resolve_org_id(user, org_id)
        source = self.db.get(DataSource, body.data_source_id)
        if source is None or source.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")
        schedule = PiiScanSchedule(
            organization_id=resolved,
            data_source_id=body.data_source_id,
            frequency=body.frequency,
            sample_size=body.sample_size,
            is_active=body.is_active,
            created_by_user_id=user.id,
            next_run_at=self._next_run(body.frequency) if body.is_active else None,
        )
        self.db.add(schedule)
        self.db.commit()
        self.db.refresh(schedule)
        return self._serialize_schedule(schedule)

    def update_schedule(
        self, user: User, schedule_id: UUID, body: ScheduleUpdate, org_id: UUID | None = None
    ) -> ScheduleRead:
        resolved = self._resolve_org_id(user, org_id)
        schedule = self.db.get(PiiScanSchedule, schedule_id)
        if schedule is None or schedule.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        if body.frequency is not None:
            schedule.frequency = body.frequency
            schedule.next_run_at = self._next_run(body.frequency)
        if body.sample_size is not None:
            schedule.sample_size = body.sample_size
        if body.is_active is not None:
            schedule.is_active = body.is_active
            if body.is_active and schedule.next_run_at is None:
                schedule.next_run_at = self._next_run(schedule.frequency)
        self.db.commit()
        self.db.refresh(schedule)
        return self._serialize_schedule(schedule)

    def delete_schedule(self, user: User, schedule_id: UUID, org_id: UUID | None = None) -> None:
        resolved = self._resolve_org_id(user, org_id)
        schedule = self.db.get(PiiScanSchedule, schedule_id)
        if schedule is None or schedule.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        self.db.delete(schedule)
        self.db.commit()

    def run_due_schedules(self) -> dict[str, int]:
        """Start a scan for every active schedule whose next_run_at has passed.
        Meant to be invoked by an external cron/ops trigger (no in-process
        daemon), or via POST /pii-scanner/schedules/run-due."""
        now = datetime.now(timezone.utc)
        due = (
            self.db.execute(
                select(PiiScanSchedule).where(
                    PiiScanSchedule.is_active.is_(True),
                    PiiScanSchedule.next_run_at.isnot(None),
                    PiiScanSchedule.next_run_at <= now,
                )
            )
            .scalars()
            .all()
        )
        started = failed = 0
        for schedule in due:
            source = self.db.get(DataSource, schedule.data_source_id)
            actor = self.db.get(User, schedule.created_by_user_id) if schedule.created_by_user_id else None
            if source is None or actor is None:
                schedule.is_active = False
                failed += 1
                continue
            try:
                job = PiiScanJob(
                    organization_id=schedule.organization_id,
                    data_source_id=source.id,
                    status=ScanStatus.running,
                    sample_size=schedule.sample_size,
                    started_at=now,
                    triggered_by=f"schedule:{actor.email}",
                )
                self.db.add(job)
                self.db.flush()
                self.run_job(job.id)
                started += 1
            except Exception:  # noqa: BLE001 — one bad schedule shouldn't block the rest
                logger.exception("Failed to start scheduled scan %s", schedule.id)
                failed += 1
            schedule.last_run_at = now
            schedule.next_run_at = self._next_run(schedule.frequency, now)
        if due:
            self.db.commit()
        return {"due": len(due), "started": started, "failed": failed}


def execute_pii_scan(job_id: UUID) -> None:
    """Background-task entry point: run a scan job with its own DB session."""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        PiiScanService(db).run_job(job_id)
    finally:
        db.close()
