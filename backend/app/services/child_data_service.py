from __future__ import annotations

import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import UUID



from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.child_data import ChildConsentStatus, ChildDataRecord, RestrictedPurpose
from app.models.data_inventory import DataInventoryAsset, DataInventoryField
from app.models.data_source import DataSource
from app.models.organization_settings import OrganizationSettings
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole
from app.schemas.child_data import (
    ApiConsentRequest,
    ApiConsentResult,
    AutoDetectResult,
    BulkConsentPreview,
    BulkRequestParentalConsent,
    ChildApiInfo,
    ConsentEvidenceRead,
    ChildDataSummary,
    ConsentPageInfo,
    ConsentRequestResult,
    ConsentSubmitResult,
    ChildRecordCreate,
    ChildRecordRead,
    ChildRecordUpdate,
    EnforcementDecision,
    MaintenanceResult,
    ParentConsentSubmission,
    RecordParentalConsent,
    RequestParentalConsent,
)
from app.services import db_connector
from app.services.child_consent_email import send_consent_request_email

MINOR_AGE_LIMIT = 18


class ChildDataService:
    def __init__(self, db: Session):
        self.db = db

    # --- tenant scoping (mirrors DataInventoryService) ---

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
                    status.HTTP_403_FORBIDDEN,
                    detail="Children's data requires an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Children's data requires an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _get_record(self, user: User, record_id: UUID, org_id: UUID | None) -> ChildDataRecord:
        resolved = self._resolve_org_id(user, org_id)
        record = self.db.get(ChildDataRecord, record_id)
        if record is None or record.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Child record not found")
        return record

    # --- serialization ---

    @staticmethod
    def _effective_age(record: ChildDataRecord) -> int | None:
        if record.date_of_birth is not None:
            today = date.today()
            dob = record.date_of_birth
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return record.age

    def _serialize(self, record: ChildDataRecord) -> ChildRecordRead:
        eff = self._effective_age(record)
        return ChildRecordRead(
            id=record.id,
            organization_id=record.organization_id,
            child_ref=record.child_ref,
            external_ref=record.external_ref,
            date_of_birth=record.date_of_birth,
            age=record.age,
            effective_age=eff,
            is_minor=(eff < MINOR_AGE_LIMIT) if eff is not None else True,
            detection_method=record.detection_method,
            consent_status=record.consent_status,
            parent_name=record.parent_name,
            parent_email=record.parent_email,
            parent_relationship=record.parent_relationship,
            consent_verification_method=record.consent_verification_method,
            consent_verified_at=record.consent_verified_at,
            consent_expires_at=record.consent_expires_at,
            profiling_blocked=record.profiling_blocked,
            ad_targeting_blocked=record.ad_targeting_blocked,
            notes=record.notes,
            last_activity_at=record.last_activity_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @staticmethod
    def _generate_ref() -> str:
        return f"CH_{secrets.token_hex(3)}"

    # --- CRUD ---

    def list_records(
        self,
        user: User,
        org_id: UUID | None = None,
        status_filter: ChildConsentStatus | None = None,
    ) -> list[ChildRecordRead]:
        resolved = self._resolve_org_id(user, org_id)
        stmt = (
            select(ChildDataRecord)
            .where(ChildDataRecord.organization_id == resolved)
            .order_by(ChildDataRecord.created_at.desc())
        )
        if status_filter is not None:
            stmt = stmt.where(ChildDataRecord.consent_status == status_filter)
        rows = self.db.execute(stmt).scalars().all()
        return [self._serialize(r) for r in rows]

    def get_record(self, user: User, record_id: UUID, org_id: UUID | None = None) -> ChildRecordRead:
        return self._serialize(self._get_record(user, record_id, org_id))

    def create_record(
        self, user: User, body: ChildRecordCreate, org_id: UUID | None = None
    ) -> ChildRecordRead:
        resolved = self._resolve_org_id(user, org_id)
        if body.date_of_birth is None and body.age is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Provide either date_of_birth or age.",
            )
        record = ChildDataRecord(
            organization_id=resolved,
            child_ref=(body.child_ref or self._generate_ref()),
            external_ref=body.external_ref,
            date_of_birth=body.date_of_birth,
            age=body.age,
            detection_method=body.detection_method,
            consent_status=body.consent_status,
            parent_name=body.parent_name,
            parent_email=body.parent_email,
            parent_relationship=body.parent_relationship,
            consent_verification_method=body.consent_verification_method,
            consent_expires_at=body.consent_expires_at,
            profiling_blocked=body.profiling_blocked,
            ad_targeting_blocked=body.ad_targeting_blocked,
            notes=body.notes,
            last_activity_at=body.last_activity_at,
        )
        # If created already verified, stamp the verification time.
        if record.consent_status == ChildConsentStatus.verified and record.consent_verified_at is None:
            record.consent_verified_at = datetime.now(timezone.utc)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return self._serialize(record)

    def update_record(
        self, user: User, record_id: UUID, body: ChildRecordUpdate, org_id: UUID | None = None
    ) -> ChildRecordRead:
        record = self._get_record(user, record_id, org_id)
        data = body.model_dump(exclude_unset=True)
        for attr, value in data.items():
            setattr(record, attr, value)
        # Keep verified_at consistent with status transitions.
        if "consent_status" in data:
            if data["consent_status"] == ChildConsentStatus.verified and record.consent_verified_at is None:
                record.consent_verified_at = datetime.now(timezone.utc)
            elif data["consent_status"] != ChildConsentStatus.verified:
                record.consent_verified_at = None
        self.db.commit()
        self.db.refresh(record)
        return self._serialize(record)

    def delete_record(self, user: User, record_id: UUID, org_id: UUID | None = None) -> None:
        record = self._get_record(user, record_id, org_id)
        self.db.delete(record)
        self.db.commit()

    def record_consent(
        self, user: User, record_id: UUID, body: RecordParentalConsent, org_id: UUID | None = None
    ) -> ChildRecordRead:
        record = self._get_record(user, record_id, org_id)
        now = datetime.now(timezone.utc)
        record.parent_name = body.parent_name
        record.parent_email = body.parent_email
        record.parent_relationship = body.parent_relationship
        record.consent_verification_method = body.verification_method
        record.consent_expires_at = body.expires_at
        record.consent_status = ChildConsentStatus.verified
        record.consent_verified_at = now
        # Audit trail for a manually-recorded consent (who logged it, when).
        record.consent_evidence = {
            "source": "manual",
            "decision": "grant",
            "verification_method": body.verification_method,
            "parent_name": body.parent_name,
            "parent_relationship": body.parent_relationship,
            "recorded_by": user.email,
            "responded_at": now.isoformat(),
        }
        self.db.commit()
        self.db.refresh(record)
        return self._serialize(record)

    def get_consent_evidence(
        self, user: User, record_id: UUID, org_id: UUID | None = None
    ) -> ConsentEvidenceRead:
        """Full audit trail for one record (admin-only — includes IP/user-agent)."""
        record = self._get_record(user, record_id, org_id)
        return ConsentEvidenceRead(
            child_ref=record.child_ref,
            consent_status=record.consent_status,
            parent_name=record.parent_name,
            parent_email=record.parent_email,
            parent_relationship=record.parent_relationship,
            consent_verification_method=record.consent_verification_method,
            consent_verified_at=record.consent_verified_at,
            consent_expires_at=record.consent_expires_at,
            consent_requested_at=record.consent_requested_at,
            consent_request_expires_at=record.consent_request_expires_at,
            aged_out_at=record.aged_out_at,
            evidence=record.consent_evidence,
        )

    # --- parental consent collection (emailed self-service link) ---

    def _org_name(self, org_id: UUID) -> str:
        return self._org_branding(org_id)[0]

    def _org_branding(self, org_id: UUID) -> tuple[str, str | None, str | None]:
        """White-label inputs for parent-facing email/page: (name, logo_url,
        support_email). Falls back gracefully when settings aren't filled in."""
        org = self.db.get(Organization, org_id)
        name = getattr(org, "name", None) or "the organization"
        row = self.db.execute(
            select(OrganizationSettings).where(OrganizationSettings.organization_id == org_id)
        ).scalars().first()
        logo = row.logo_url if row else None
        support = row.dpo_email if row else None
        return name, logo, support

    def branding_for_token(self, token: str) -> tuple[str, str | None, str | None] | None:
        """Org branding for a consent token (used by the public result page)."""
        record = self._record_by_token(token)
        if record is None:
            return None
        return self._org_branding(record.organization_id)

    def _consent_link(self, token: str) -> str:
        # Public routers mount without the /api prefix (see main.py), matching
        # snippet_service — so the parent-facing link must NOT include it.
        base = settings.BACKEND_PUBLIC_URL.rstrip("/")
        return f"{base}/public/v1/childrens-data/consent/{token}"

    def request_consent(
        self, user: User, record_id: UUID, body: RequestParentalConsent, org_id: UUID | None = None
    ) -> ConsentRequestResult:
        """Generate a one-time link, email it to the parent, and mark the record
        pending. The granted consent's validity is captured now and applied when
        the parent responds."""
        record = self._get_record(user, record_id, org_id)
        now = datetime.now(timezone.utc)
        token = secrets.token_urlsafe(32)
        record.consent_token = token
        record.consent_requested_at = now
        record.consent_request_expires_at = now + timedelta(days=body.link_expiry_days)
        record.parent_email = body.parent_email
        if body.parent_name:
            record.parent_name = body.parent_name
        if body.parent_relationship:
            record.parent_relationship = body.parent_relationship
        record.consent_status = ChildConsentStatus.pending
        # Stash the request parameters used at grant time.
        record.consent_evidence = {
            "request": {
                "validity_days": body.consent_validity_days,
                "purpose_note": body.purpose_note,
                "requested_by": user.email,
                "requested_at": now.isoformat(),
            }
        }
        self.db.commit()
        self.db.refresh(record)

        org_name, logo_url, support_email = self._org_branding(record.organization_id)
        link = self._consent_link(token)
        sent = send_consent_request_email(
            body.parent_email,
            parent_name=record.parent_name,
            org_name=org_name,
            logo_url=logo_url,
            support_email=support_email,
            link=link,
            purpose_note=body.purpose_note,
            link_expiry_days=body.link_expiry_days,
        )
        message = (
            "Consent request emailed to the parent."
            if sent
            else "Request created, but email could not be sent (SMTP not configured). "
            f"Share this link with the parent manually: {link}"
        )
        return ConsentRequestResult(record=self._serialize(record), email_sent=sent, message=message)

    # --- bulk parental consent (preview + fan-out) ---

    _BULK_DEFAULT_STATUSES = (ChildConsentStatus.missing, ChildConsentStatus.expired)

    def _bulk_targets(
        self,
        org_id: UUID,
        statuses: list[ChildConsentStatus],
        record_ids: list[UUID] | None = None,
    ) -> list[ChildDataRecord]:
        """Active (not aged-out) minor records to target for a bulk request.

        When `record_ids` is given (checkbox selection) those exact records are
        used; otherwise records in the requested consent statuses."""
        stmt = select(ChildDataRecord).where(
            ChildDataRecord.organization_id == org_id,
            ChildDataRecord.aged_out_at.is_(None),
        )
        if record_ids:
            stmt = stmt.where(ChildDataRecord.id.in_(record_ids))
        else:
            stmt = stmt.where(ChildDataRecord.consent_status.in_(statuses))
        return self.db.execute(stmt).scalars().all()

    def preview_bulk_consent(
        self, user: User, body: BulkRequestParentalConsent, org_id: UUID | None = None
    ) -> BulkConsentPreview:
        """Dry run: how many records would be emailed vs skipped for no email."""
        resolved = self._resolve_org_id(user, org_id)
        statuses = list(body.statuses) or list(self._BULK_DEFAULT_STATUSES)
        rows = self._bulk_targets(resolved, statuses, record_ids=body.record_ids)
        by_status: dict[str, int] = {}
        eligible = 0
        for record in rows:
            by_status[record.consent_status.value] = (
                by_status.get(record.consent_status.value, 0) + 1
            )
            if self._clean_email(record.parent_email):
                eligible += 1
        return BulkConsentPreview(
            total_matched=len(rows),
            eligible=eligible,
            skipped_no_email=len(rows) - eligible,
            by_status=by_status,
        )

    def prepare_bulk_consent(
        self, user: User, body: BulkRequestParentalConsent, org_id: UUID | None = None
    ) -> tuple[list[dict], int, dict]:
        """Mark every eligible record 'pending' with a fresh one-time token now
        (fast, single commit), and return (email_payloads, skipped, email_meta)
        for the caller to hand to a background sender."""
        resolved = self._resolve_org_id(user, org_id)
        statuses = list(body.statuses) or list(self._BULK_DEFAULT_STATUSES)
        rows = self._bulk_targets(resolved, statuses, record_ids=body.record_ids)
        now = datetime.now(timezone.utc)
        org_name, logo_url, support_email = self._org_branding(resolved)

        payloads: list[dict] = []
        skipped = 0
        for record in rows:
            email = self._clean_email(record.parent_email)
            if not email:
                skipped += 1
                continue
            token = secrets.token_urlsafe(32)
            record.consent_token = token
            record.consent_requested_at = now
            record.consent_request_expires_at = now + timedelta(days=body.link_expiry_days)
            record.consent_status = ChildConsentStatus.pending
            record.consent_evidence = {
                "request": {
                    "validity_days": body.consent_validity_days,
                    "purpose_note": body.purpose_note,
                    "requested_by": user.email,
                    "requested_at": now.isoformat(),
                    "bulk": True,
                }
            }
            payloads.append(
                {
                    "to_email": email,
                    "parent_name": record.parent_name,
                    "link": self._consent_link(token),
                }
            )
        self.db.commit()
        meta = {
            "org_name": org_name,
            "logo_url": logo_url,
            "support_email": support_email,
            "purpose_note": body.purpose_note,
            "link_expiry_days": body.link_expiry_days,
        }
        return payloads, skipped, meta

    def _record_by_token(self, token: str) -> ChildDataRecord | None:
        if not token:
            return None
        return self.db.execute(
            select(ChildDataRecord).where(ChildDataRecord.consent_token == token)
        ).scalar_one_or_none()

    def get_consent_request(self, token: str) -> ConsentPageInfo:
        """Public: info for the parent's consent page (no auth — token is the key)."""
        record = self._record_by_token(token)
        if record is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="This consent link is invalid or has already been used.",
            )
        req = (record.consent_evidence or {}).get("request", {})
        now = datetime.now(timezone.utc)
        page_status = "open"
        if record.consent_request_expires_at and now > record.consent_request_expires_at:
            page_status = "expired"
        name, logo, support = self._org_branding(record.organization_id)
        return ConsentPageInfo(
            org_name=name,
            org_logo_url=logo,
            support_email=support,
            child_ref=record.child_ref,
            parent_name=record.parent_name,
            purpose_note=req.get("purpose_note"),
            status=page_status,
            requested_at=record.consent_requested_at,
            expires_at=record.consent_request_expires_at,
        )

    def submit_consent(
        self,
        token: str,
        submission: ParentConsentSubmission,
        *,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> ConsentSubmitResult:
        """Public: the parent grants or declines. One-time — the token is cleared."""
        record = self._record_by_token(token)
        if record is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="This consent link is invalid or has already been used.",
            )
        now = datetime.now(timezone.utc)
        if record.consent_request_expires_at and now > record.consent_request_expires_at:
            raise HTTPException(
                status.HTTP_410_GONE,
                detail="This consent link has expired. Please ask the organization for a new one.",
            )
        req = (record.consent_evidence or {}).get("request", {})
        record.parent_name = submission.parent_name
        if submission.parent_relationship:
            record.parent_relationship = submission.parent_relationship

        if submission.decision == "grant":
            if not submission.confirmed_guardian:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="Please confirm you are the parent/guardian to grant consent.",
                )
            validity = int(req.get("validity_days", 365))
            record.consent_status = ChildConsentStatus.verified
            record.consent_verified_at = now
            record.consent_expires_at = now + timedelta(days=validity)
            record.consent_verification_method = "Parent e-consent (email link)"
            record.last_activity_at = now
            result = ConsentSubmitResult(
                status="verified", message="Thank you — your consent has been recorded."
            )
        else:
            record.consent_status = ChildConsentStatus.missing
            record.consent_verified_at = None
            record.consent_expires_at = None
            note = f"Parent declined consent on {now.date().isoformat()}."
            record.notes = f"{record.notes}\n{note}" if record.notes else note
            result = ConsentSubmitResult(
                status="declined",
                message="You have declined. The child's data will remain restricted.",
            )

        record.consent_evidence = {
            "request": req,
            "response": {
                "decision": submission.decision,
                "parent_name": submission.parent_name,
                "parent_relationship": submission.parent_relationship,
                "confirmed_guardian": submission.confirmed_guardian,
                "responded_at": now.isoformat(),
                "ip": ip,
                "user_agent": user_agent,
            },
        }
        record.consent_token = None  # one-time use
        self.db.commit()
        return result

    # --- auto-detection from a data source ---

    @staticmethod
    def _minor_cutoff() -> date:
        today = date.today()
        try:
            return today.replace(year=today.year - MINOR_AGE_LIMIT)
        except ValueError:  # Feb 29
            return today.replace(year=today.year - MINOR_AGE_LIMIT, day=28)

    @staticmethod
    def _to_date(value: object) -> date | None:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return None

    @staticmethod
    def _age_from_dob(dob: date | None) -> int | None:
        if dob is None:
            return None
        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    @staticmethod
    def _auto_ref(source_id: UUID, table: str, id_value: object, dob: object) -> str:
        seed = f"{source_id}:{table}:{id_value if id_value is not None else dob}"
        return f"CH_{hashlib.sha1(seed.encode()).hexdigest()[:8]}"

    def _find_id_column(self, source: DataSource, table: str) -> str | None:
        try:
            cols, _ = db_connector.sample_table(source, table, 1)
        except Exception:  # noqa: BLE001
            return None
        lower = {c.lower(): c for c in cols}
        for candidate in ("id", "uuid", "user_id", "customer_id"):
            if candidate in lower:
                return lower[candidate]
        return None

    # Only auto-pick columns that clearly hold a *guardian's* address — never a
    # plain "email" column, which is the child's own (not who we should contact).
    _GUARDIAN_HINTS = ("parent", "guardian", "mother", "father")

    def _find_email_column(self, source: DataSource, table: str) -> str | None:
        try:
            cols, _ = db_connector.sample_table(source, table, 1)
        except Exception:  # noqa: BLE001
            return None
        for col in cols:
            lc = col.lower()
            if ("email" in lc or "mail" in lc) and any(h in lc for h in self._GUARDIAN_HINTS):
                return col
        return None

    @staticmethod
    def _clean_email(value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text if ("@" in text and len(text) <= 320) else None

    def _discover_dob_targets(self, org_id: UUID, source: DataSource) -> list[tuple[str, str]]:
        """Find (table, dob_column) pairs from the inventory for this source."""
        rows = self.db.execute(
            select(DataInventoryAsset.name, DataInventoryField.name)
            .join(DataInventoryField, DataInventoryField.asset_id == DataInventoryAsset.id)
            .where(
                DataInventoryAsset.organization_id == org_id,
                DataInventoryAsset.data_source_id == source.id,
                or_(
                    DataInventoryField.pii_category == "date_of_birth",
                    DataInventoryField.name.ilike("%dob%"),
                    DataInventoryField.name.ilike("%birth%"),
                ),
            )
        ).all()
        return [(r[0], r[1]) for r in rows]

    def auto_detect(
        self,
        user: User,
        data_source_id: UUID,
        table: str | None = None,
        dob_column: str | None = None,
        id_column: str | None = None,
        parent_email_column: str | None = None,
        org_id: UUID | None = None,
    ) -> AutoDetectResult:
        resolved = self._resolve_org_id(user, org_id)
        source = self.db.get(DataSource, data_source_id)
        if source is None or source.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")
        if not db_connector.supports_introspection(source):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Auto-detection is not supported for '{source.source_type}' sources yet.",
            )

        if table and dob_column:
            targets = [(table, dob_column)]
        else:
            targets = self._discover_dob_targets(resolved, source)
        if not targets:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="No date-of-birth columns found. Run a schema scan first, or specify the column.",
            )

        try:
            found, created, updated, columns_used = self._detect_into_records(
                resolved, source, targets, id_column, email_column=parent_email_column
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        self.db.commit()
        return AutoDetectResult(
            minors_found=found,
            records_created=created,
            records_updated=updated,
            columns_used=columns_used,
            message=(
                f"Found {found} minor(s) across {len(columns_used)} column(s): "
                f"{created} new, {updated} updated."
            ),
        )

    def _detect_into_records(
        self,
        org_id: UUID,
        source: DataSource,
        targets: list[tuple[str, str]],
        id_column: str | None = None,
        email_column: str | None = None,
    ) -> tuple[int, int, int, list[str]]:
        """Query minors for each (table, dob_column) and upsert records. No commit.
        A guardian-email column (explicit, or auto-discovered) is captured so the
        parent can later be emailed a consent link. Raises ValueError on query
        failure."""
        cutoff = self._minor_cutoff()
        now = datetime.now(timezone.utc)
        found = created = updated = 0
        columns_used: list[str] = []

        for tbl, dob_col in targets:
            id_col = id_column or self._find_id_column(source, tbl)
            email_col = email_column or self._find_email_column(source, tbl)
            try:
                minors = db_connector.query_minors(
                    source, tbl, dob_col, id_col, cutoff, email_column=email_col
                )
            except Exception as exc:  # noqa: BLE001
                raise ValueError(f"Detection query failed on {tbl}: {exc}") from exc
            columns_used.append(f"{tbl}.{dob_col}")
            for id_value, dob_value, email_value in minors:
                found += 1
                ref = self._auto_ref(source.id, tbl, id_value, dob_value)
                dob = self._to_date(dob_value)
                age = self._age_from_dob(dob)
                email = self._clean_email(email_value)
                existing = self.db.execute(
                    select(ChildDataRecord).where(
                        ChildDataRecord.organization_id == org_id,
                        ChildDataRecord.child_ref == ref,
                    )
                ).scalar_one_or_none()
                ext = str(id_value) if id_value is not None else None
                if existing is not None:
                    existing.age = age
                    if dob is not None:
                        existing.date_of_birth = dob
                    if ext is not None:
                        existing.external_ref = ext
                    # Don't clobber a parent email already recorded (e.g. one a
                    # parent used to grant consent); only fill a blank.
                    if email and not existing.parent_email:
                        existing.parent_email = email
                    existing.detection_method = "auto-scan"
                    existing.last_activity_at = now
                    updated += 1
                else:
                    self.db.add(
                        ChildDataRecord(
                            organization_id=org_id,
                            child_ref=ref,
                            external_ref=ext,
                            date_of_birth=dob,
                            age=age,
                            parent_email=email,
                            detection_method="auto-scan",
                            consent_status=ChildConsentStatus.missing,
                            profiling_blocked=True,
                            ad_targeting_blocked=True,
                            last_activity_at=now,
                        )
                    )
                    created += 1
        return found, created, updated, columns_used

    # --- scheduled lifecycle maintenance (re-detect + age-out + expiry) ---

    def run_auto_detect_for_org(self, org_id: UUID) -> tuple[int, int, int, int]:
        """Re-scan every introspectable source the org has for new minors.
        Returns (sources_scanned, found, created, updated)."""
        sources = (
            self.db.execute(select(DataSource).where(DataSource.organization_id == org_id))
            .scalars()
            .all()
        )
        scanned = found = created = updated = 0
        for source in sources:
            if not db_connector.supports_introspection(source):
                continue
            targets = self._discover_dob_targets(org_id, source)
            if not targets:
                continue
            scanned += 1
            try:
                f, c, u, _ = self._detect_into_records(org_id, source, targets)
                found += f
                created += c
                updated += u
            except ValueError:
                continue  # one bad source shouldn't abort the whole sweep
        return scanned, found, created, updated

    def run_age_out_for_org(self, org_id: UUID) -> int:
        """Subjects who have turned 18: lift restrictions and mark aged-out."""
        cutoff = self._minor_cutoff()  # born on/before this date ⇒ now 18+
        now = datetime.now(timezone.utc)
        rows = (
            self.db.execute(
                select(ChildDataRecord).where(
                    ChildDataRecord.organization_id == org_id,
                    ChildDataRecord.aged_out_at.is_(None),
                    or_(
                        ChildDataRecord.date_of_birth <= cutoff,
                        (ChildDataRecord.date_of_birth.is_(None))
                        & (ChildDataRecord.age >= MINOR_AGE_LIMIT),
                    ),
                )
            )
            .scalars()
            .all()
        )
        for record in rows:
            record.aged_out_at = now
            record.profiling_blocked = False
            record.ad_targeting_blocked = False
            note = f"Aged out (turned {MINOR_AGE_LIMIT}) on {now.date().isoformat()}; restrictions lifted."
            record.notes = f"{record.notes}\n{note}" if record.notes else note
        return len(rows)

    def run_expire_consents_for_org(self, org_id: UUID) -> int:
        """Verified consents past their expiry → status 'expired' (needs renewal)."""
        now = datetime.now(timezone.utc)
        rows = (
            self.db.execute(
                select(ChildDataRecord).where(
                    ChildDataRecord.organization_id == org_id,
                    ChildDataRecord.consent_status == ChildConsentStatus.verified,
                    ChildDataRecord.consent_expires_at.is_not(None),
                    ChildDataRecord.consent_expires_at < now,
                )
            )
            .scalars()
            .all()
        )
        for record in rows:
            record.consent_status = ChildConsentStatus.expired
        return len(rows)

    def run_maintenance_all_orgs(self) -> "MaintenanceResult":
        """Scheduler entry point: lifecycle pass across all active organizations."""
        orgs = (
            self.db.execute(
                select(Organization.id).where(
                    Organization.status.in_(
                        [OrganizationStatus.active, OrganizationStatus.pending]
                    )
                )
            )
            .scalars()
            .all()
        )
        result = MaintenanceResult()
        for org_id in orgs:
            result.orgs_processed += 1
            # Age-out + expiry are safe local-DB ops; re-detection hits external
            # sources, so isolate its failures per-org.
            result.aged_out += self.run_age_out_for_org(org_id)
            result.consents_expired += self.run_expire_consents_for_org(org_id)
            try:
                scanned, found, created, updated = self.run_auto_detect_for_org(org_id)
                result.sources_scanned += scanned
                result.minors_found += found
                result.records_created += created
                result.records_updated += updated
            except Exception:  # noqa: BLE001
                pass
        self.db.commit()
        result.message = (
            f"{result.orgs_processed} org(s): {result.records_created} new minor(s), "
            f"{result.records_updated} updated, {result.aged_out} aged out, "
            f"{result.consents_expired} consent(s) expired."
        )
        return result

    def run_maintenance_for_org(self, user: User, org_id: UUID | None = None) -> "MaintenanceResult":
        """Admin-triggered maintenance for a single organization."""
        resolved = self._resolve_org_id(user, org_id)
        result = MaintenanceResult(orgs_processed=1)
        result.aged_out = self.run_age_out_for_org(resolved)
        result.consents_expired = self.run_expire_consents_for_org(resolved)
        scanned, found, created, updated = self.run_auto_detect_for_org(resolved)
        result.sources_scanned = scanned
        result.minors_found = found
        result.records_created = created
        result.records_updated = updated
        self.db.commit()
        result.message = (
            f"{result.records_created} new minor(s), {result.records_updated} updated, "
            f"{result.aged_out} aged out, {result.consents_expired} consent(s) expired."
        )
        return result

    # --- enforcement decision (called by external systems before processing) ---

    def check_enforcement(
        self, user: User, subject_ref: str, purpose: RestrictedPurpose, org_id: UUID | None = None
    ) -> EnforcementDecision:
        resolved = self._resolve_org_id(user, org_id)
        return self.check_enforcement_for_org(resolved, subject_ref, purpose)

    def check_enforcement_for_org(
        self, org_id: UUID, subject_ref: str, purpose: RestrictedPurpose
    ) -> EnforcementDecision:
        """Org-scoped decision (no user). Used by the public, API-key-authenticated
        enforcement endpoint that external systems call."""
        resolved = org_id
        record = self.db.execute(
            select(ChildDataRecord).where(
                ChildDataRecord.organization_id == resolved,
                or_(
                    ChildDataRecord.external_ref == subject_ref,
                    ChildDataRecord.child_ref == subject_ref,
                ),
            )
        ).scalars().first()

        if record is None:
            return EnforcementDecision(
                allowed=True,
                purpose=purpose,
                matched=False,
                is_minor=False,
                reason="No matching child record — subject is not a known minor.",
            )

        eff = self._effective_age(record)
        is_minor = (eff < MINOR_AGE_LIMIT) if eff is not None else True
        consent_verified = record.consent_status == ChildConsentStatus.verified

        if not is_minor:
            allowed, reason = True, "Subject is not a minor; child restrictions do not apply."
        elif purpose == RestrictedPurpose.ad_targeting:
            allowed = not record.ad_targeting_blocked
            reason = (
                "Allowed." if allowed
                else "Blocked: targeted advertising directed at children is prohibited (DPDPA s.9(3))."
            )
        elif purpose == RestrictedPurpose.profiling:
            allowed = not record.profiling_blocked
            reason = (
                "Allowed." if allowed
                else "Blocked: tracking/behavioural profiling of children is prohibited (DPDPA s.9(3))."
            )
        else:  # processing
            allowed = consent_verified
            reason = (
                "Allowed: verifiable parental consent is on record."
                if allowed
                else "Blocked: processing a child's data requires verifiable parental consent (DPDPA s.9(1))."
            )

        return EnforcementDecision(
            allowed=allowed,
            purpose=purpose,
            matched=True,
            is_minor=is_minor,
            consent_status=record.consent_status,
            profiling_blocked=record.profiling_blocked,
            ad_targeting_blocked=record.ad_targeting_blocked,
            child_ref=record.child_ref,
            reason=reason,
        )

    # --- public API: record consent from the org's own flow ---

    def record_consent_via_api(
        self, org_id: UUID, body: ApiConsentRequest, ip: str | None = None
    ) -> ApiConsentResult:
        """Org's app pushes a consent decision it collected (e.g. via DigiLocker).
        Upserts the child record by the caller's subject_ref."""
        now = datetime.now(timezone.utc)
        record = self.db.execute(
            select(ChildDataRecord).where(
                ChildDataRecord.organization_id == org_id,
                or_(
                    ChildDataRecord.external_ref == body.subject_ref,
                    ChildDataRecord.child_ref == body.subject_ref,
                ),
            )
        ).scalars().first()

        created = False
        if record is None:
            record = ChildDataRecord(
                organization_id=org_id,
                child_ref=self._generate_ref(),
                external_ref=body.subject_ref,
                date_of_birth=body.date_of_birth,
                age=body.age,
                detection_method="api",
                consent_status=ChildConsentStatus.missing,
                profiling_blocked=True,
                ad_targeting_blocked=True,
                last_activity_at=now,
            )
            self.db.add(record)
            created = True
        else:
            if body.date_of_birth is not None:
                record.date_of_birth = body.date_of_birth
            if body.age is not None:
                record.age = body.age
            record.last_activity_at = now

        if body.parent_name:
            record.parent_name = body.parent_name
        if body.parent_email:
            record.parent_email = body.parent_email
        if body.parent_relationship:
            record.parent_relationship = body.parent_relationship

        if body.decision == "grant":
            record.consent_status = ChildConsentStatus.verified
            record.consent_verified_at = now
            record.consent_verification_method = body.verification_method
            record.consent_expires_at = now + timedelta(days=body.consent_validity_days)
            record.consent_evidence = {
                "source": "api",
                "verification_method": body.verification_method,
                "parent_name": body.parent_name,
                "responded_at": now.isoformat(),
                "ip": ip,
            }
            message = "Parental consent recorded."
        else:
            record.consent_status = ChildConsentStatus.missing
            record.consent_verified_at = None
            record.consent_expires_at = None
            note = f"Consent declined via API on {now.date().isoformat()}."
            record.notes = f"{record.notes}\n{note}" if record.notes else note
            message = "Decline recorded; the child's data remains restricted."

        self.db.commit()
        self.db.refresh(record)
        eff = self._effective_age(record)
        is_minor = (eff < MINOR_AGE_LIMIT) if eff is not None else True
        return ApiConsentResult(
            subject_ref=body.subject_ref,
            child_ref=record.child_ref,
            consent_status=record.consent_status,
            is_minor=is_minor,
            created=created,
            message=message,
        )

    def api_info(self, user: User, org_id: UUID | None = None) -> ChildApiInfo:
        """Endpoint URLs + the org's active API key prefix for the developer page."""
        from app.core.config import settings
        from app.models.integration_api_key import IntegrationApiKey

        resolved = self._resolve_org_id(user, org_id)
        # Public router has no /api prefix (see main.py); don't add API_V1_PREFIX.
        base = settings.BACKEND_PUBLIC_URL.rstrip("/")
        key = self.db.execute(
            select(IntegrationApiKey)
            .where(
                IntegrationApiKey.organization_id == resolved,
                IntegrationApiKey.status == "active",
            )
            .order_by(IntegrationApiKey.created_at.desc())
        ).scalars().first()
        return ChildApiInfo(
            enforce_url=f"{base}/public/v1/childrens-data/enforce",
            record_consent_url=f"{base}/public/v1/childrens-data/consent",
            has_api_key=key is not None,
            api_key_prefix=key.key_prefix if key else None,
        )

    # --- summary ---

    def get_summary(self, user: User, org_id: UUID | None = None) -> ChildDataSummary:
        resolved = self._resolve_org_id(user, org_id)

        def count(status_value: ChildConsentStatus | None = None) -> int:
            stmt = select(func.count(ChildDataRecord.id)).where(
                ChildDataRecord.organization_id == resolved
            )
            if status_value is not None:
                stmt = stmt.where(ChildDataRecord.consent_status == status_value)
            return self.db.scalar(stmt) or 0

        total = count()
        verified = count(ChildConsentStatus.verified)
        pending = count(ChildConsentStatus.pending)
        expired = count(ChildConsentStatus.expired)
        restrictions_active = self.db.scalar(
            select(func.count(ChildDataRecord.id)).where(
                ChildDataRecord.organization_id == resolved,
                (ChildDataRecord.profiling_blocked.is_(True))
                | (ChildDataRecord.ad_targeting_blocked.is_(True)),
            )
        ) or 0

        return ChildDataSummary(
            total_records=total,
            verified_consent=verified,
            without_consent=total - verified,
            pending_consent=pending,
            expired_consent=expired,
            restrictions_active=restrictions_active,
            consent_rate=round((verified / total) * 100) if total else 0,
        )
