from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.child_data import ChildConsentStatus, RestrictedPurpose


class ChildRecordBase(BaseModel):
    child_ref: str | None = Field(default=None, max_length=64)
    external_ref: str | None = Field(default=None, max_length=255)
    date_of_birth: date | None = None
    age: int | None = Field(default=None, ge=0, le=25)
    detection_method: str | None = Field(default=None, max_length=64)
    consent_status: ChildConsentStatus = ChildConsentStatus.missing
    parent_name: str | None = Field(default=None, max_length=255)
    parent_email: EmailStr | None = None
    parent_relationship: str | None = Field(default=None, max_length=64)
    consent_verification_method: str | None = Field(default=None, max_length=64)
    consent_expires_at: datetime | None = None
    profiling_blocked: bool = True
    ad_targeting_blocked: bool = True
    notes: str | None = None
    last_activity_at: datetime | None = None


class ChildRecordCreate(ChildRecordBase):
    pass


class ChildRecordUpdate(BaseModel):
    child_ref: str | None = Field(default=None, max_length=64)
    external_ref: str | None = Field(default=None, max_length=255)
    date_of_birth: date | None = None
    age: int | None = Field(default=None, ge=0, le=25)
    detection_method: str | None = Field(default=None, max_length=64)
    consent_status: ChildConsentStatus | None = None
    parent_name: str | None = Field(default=None, max_length=255)
    parent_email: EmailStr | None = None
    parent_relationship: str | None = Field(default=None, max_length=64)
    consent_verification_method: str | None = Field(default=None, max_length=64)
    consent_expires_at: datetime | None = None
    profiling_blocked: bool | None = None
    ad_targeting_blocked: bool | None = None
    notes: str | None = None
    last_activity_at: datetime | None = None


class RecordParentalConsent(BaseModel):
    """Capture verifiable parental consent and mark the record verified."""

    parent_name: str = Field(min_length=1, max_length=255)
    parent_email: EmailStr | None = None
    parent_relationship: str | None = Field(default=None, max_length=64)
    verification_method: str = Field(min_length=1, max_length=64)
    expires_at: datetime | None = None


class RequestParentalConsent(BaseModel):
    """Admin asks a parent for consent by email (self-service link)."""

    parent_email: EmailStr
    parent_name: str | None = Field(default=None, max_length=255)
    parent_relationship: str | None = Field(default=None, max_length=64)
    purpose_note: str | None = Field(default=None, max_length=500)
    # How long the granted consent stays valid (renewal cadence).
    consent_validity_days: int = Field(default=365, ge=1, le=3650)
    # How long the emailed link stays usable.
    link_expiry_days: int = Field(default=14, ge=1, le=90)


class ConsentRequestResult(BaseModel):
    record: "ChildRecordRead"
    email_sent: bool
    message: str


class BulkRequestParentalConsent(BaseModel):
    """Email consent-request links to many records at once.

    If `record_ids` is given (e.g. rows the user checked in the table), exactly
    those are targeted. Otherwise every record in the chosen `statuses` is."""

    record_ids: list[UUID] | None = None
    # Which records to target when record_ids is not given. Default: those that
    # still need consent.
    statuses: list[ChildConsentStatus] = Field(
        default_factory=lambda: [ChildConsentStatus.missing, ChildConsentStatus.expired]
    )
    purpose_note: str | None = Field(default=None, max_length=500)
    consent_validity_days: int = Field(default=365, ge=1, le=3650)
    link_expiry_days: int = Field(default=14, ge=1, le=90)


class BulkConsentPreview(BaseModel):
    """Dry-run counts shown before confirming a bulk send."""

    total_matched: int          # records in the chosen statuses (aged-out excluded)
    eligible: int               # have a parent email → will be emailed
    skipped_no_email: int       # no parent email → cannot be emailed
    by_status: dict[str, int]   # matched count per consent status


class BulkConsentResult(BaseModel):
    queued: int                 # consent emails scheduled to send
    skipped_no_email: int
    message: str


class ConsentEvidenceRead(BaseModel):
    """Full parental-consent audit trail for one record (admin-only).

    `evidence` is the raw stored payload — its shape depends on how consent was
    collected (email link → request/response; API push → source=api; manual →
    source=manual). The frontend renders the keys it recognises."""

    child_ref: str
    consent_status: ChildConsentStatus
    parent_name: str | None = None
    parent_email: str | None = None
    parent_relationship: str | None = None
    consent_verification_method: str | None = None
    consent_verified_at: datetime | None = None
    consent_expires_at: datetime | None = None
    consent_requested_at: datetime | None = None
    consent_request_expires_at: datetime | None = None
    aged_out_at: datetime | None = None
    evidence: dict | None = None


# --- public (parent-facing) consent page ---

class ConsentPageInfo(BaseModel):
    """Minimal, privacy-preserving info shown on the parent's consent page."""

    org_name: str
    org_logo_url: str | None = None
    support_email: str | None = None
    child_ref: str
    parent_name: str | None = None
    purpose_note: str | None = None
    status: Literal["open", "expired", "completed"]
    requested_at: datetime | None = None
    expires_at: datetime | None = None


class ParentConsentSubmission(BaseModel):
    decision: Literal["grant", "deny"]
    parent_name: str = Field(min_length=1, max_length=255)
    parent_relationship: str | None = Field(default=None, max_length=64)
    # The parent affirms they are the lawful guardian (required to grant).
    confirmed_guardian: bool = False


class ConsentSubmitResult(BaseModel):
    status: Literal["verified", "declined"]
    message: str


# --- public, API-key-authenticated consent recording (org's app → us) ---

class ApiConsentRequest(BaseModel):
    """An org's app records a parental-consent decision it collected on its side
    (e.g. via DigiLocker, its own form). Upserts the child record by subject_ref."""

    subject_ref: str = Field(min_length=1, max_length=255)
    decision: Literal["grant", "deny"] = "grant"
    parent_name: str | None = Field(default=None, max_length=255)
    parent_email: EmailStr | None = None
    parent_relationship: str | None = Field(default=None, max_length=64)
    verification_method: str = Field(default="API", max_length=64)
    date_of_birth: date | None = None
    age: int | None = Field(default=None, ge=0, le=25)
    consent_validity_days: int = Field(default=365, ge=1, le=3650)


class ApiConsentResult(BaseModel):
    subject_ref: str
    child_ref: str
    consent_status: ChildConsentStatus
    is_minor: bool
    created: bool   # True if a new child record was created by this call
    message: str


class ChildApiInfo(BaseModel):
    """Endpoints + key info for the Children's Data developer integration page."""

    enforce_url: str
    record_consent_url: str
    has_api_key: bool
    api_key_prefix: str | None = None


class ChildRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    child_ref: str
    external_ref: str | None = None
    date_of_birth: date | None
    age: int | None
    effective_age: int | None = None
    is_minor: bool = True
    detection_method: str | None
    consent_status: ChildConsentStatus
    parent_name: str | None
    parent_email: str | None
    parent_relationship: str | None
    consent_verification_method: str | None
    consent_verified_at: datetime | None
    consent_expires_at: datetime | None
    consent_requested_at: datetime | None = None
    consent_request_expires_at: datetime | None = None
    profiling_blocked: bool
    ad_targeting_blocked: bool
    notes: str | None
    last_activity_at: datetime | None
    aged_out_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AutoDetectRequest(BaseModel):
    data_source_id: UUID
    table: str | None = Field(default=None, max_length=255)
    dob_column: str | None = Field(default=None, max_length=128)
    id_column: str | None = Field(default=None, max_length=128)
    # Guardian-email column to capture (enables later bulk consent requests).
    # Auto-discovered from the table when left blank.
    parent_email_column: str | None = Field(default=None, max_length=128)


class AutoDetectResult(BaseModel):
    minors_found: int
    records_created: int
    records_updated: int
    columns_used: list[str]
    message: str


class EnforcementRequest(BaseModel):
    # Identifier the external system knows (matches external_ref or child_ref).
    subject_ref: str = Field(min_length=1, max_length=255)
    purpose: RestrictedPurpose


class EnforcementDecision(BaseModel):
    allowed: bool
    purpose: RestrictedPurpose
    matched: bool          # did we find a child record for this subject?
    is_minor: bool
    consent_status: ChildConsentStatus | None = None
    profiling_blocked: bool | None = None
    ad_targeting_blocked: bool | None = None
    child_ref: str | None = None
    reason: str


class MaintenanceResult(BaseModel):
    """Outcome of the lifecycle maintenance pass (re-detection + age-out + expiry)."""

    orgs_processed: int = 0
    sources_scanned: int = 0
    minors_found: int = 0
    records_created: int = 0
    records_updated: int = 0
    aged_out: int = 0
    consents_expired: int = 0
    message: str = ""


class ChildDataSummary(BaseModel):
    total_records: int
    verified_consent: int
    without_consent: int
    pending_consent: int
    expired_consent: int
    restrictions_active: int
    consent_rate: int  # percent 0-100


# ConsentRequestResult references ChildRecordRead (defined above) by name.
ConsentRequestResult.model_rebuild()
