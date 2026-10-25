"""Organization-scoped, FHIR-aligned healthcare records and consent decisions."""
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


def now():
    return datetime.now(timezone.utc)


def identifier():
    return str(uuid4())


class HealthcarePatient(Base):
    __tablename__ = "healthcare_patients"
    __table_args__ = (UniqueConstraint("organization_id", "mrn", name="uq_healthcare_patient_org_mrn"),)

    id = Column(String(64), primary_key=True, default=identifier)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    mrn = Column(String(64), nullable=False)
    full_name = Column(String(255), nullable=False)
    date_of_birth = Column(Date, nullable=False)
    gender = Column(String(32), nullable=False)
    phone_hash = Column(String(64), nullable=True)
    consent_principal_id = Column(UUID(as_uuid=True), ForeignKey("consent_principals.id"), nullable=False)


class EHRClinicalRecord(Base):
    __tablename__ = "ehr_clinical_records"

    id = Column(String(64), primary_key=True, default=identifier)
    patient_id = Column(String(64), ForeignKey("healthcare_patients.id"), nullable=False, index=True)
    category = Column(String(64), nullable=False)
    sensitivity_level = Column(String(32), nullable=False)
    clinical_data = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=now)


class HealthcareConsent(Base):
    __tablename__ = "healthcare_consents"

    id = Column(String(64), primary_key=True, default=identifier)
    patient_id = Column(String(64), ForeignKey("healthcare_patients.id"), nullable=False, index=True)
    purpose = Column(String(32), nullable=False, index=True)
    allowed_categories = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=list)
    denied_categories = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=list)
    status = Column(String(16), nullable=False, default="active")
    granted_at = Column(DateTime(timezone=True), nullable=False, default=now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    proof_record_id = Column(UUID(as_uuid=True), ForeignKey("proof_vault_records.id"), nullable=False)


class AccessDecisionAudit(Base):
    __tablename__ = "access_decision_audits"

    id = Column(String(64), primary_key=True, default=identifier)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    clinician_id = Column(String(64), nullable=False)
    patient_id = Column(String(64), ForeignKey("healthcare_patients.id"), nullable=False, index=True)
    purpose = Column(String(32), nullable=False)
    department = Column(String(128), nullable=False)
    allowed_categories = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    redacted_categories = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    emergency_override = Column(Boolean, nullable=False, default=False)
    proof_hash = Column(String(64), nullable=False)
    decision_timestamp = Column(DateTime(timezone=True), nullable=False, default=now)


class EmergencyOverrideLog(Base):
    __tablename__ = "emergency_override_logs"

    id = Column(String(64), primary_key=True, default=identifier)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    clinician_id = Column(String(64), nullable=False)
    patient_id = Column(String(64), ForeignKey("healthcare_patients.id"), nullable=False, index=True)
    department = Column(String(128), nullable=False)
    emergency_reason = Column(Text, nullable=False)
    proof_hash = Column(String(64), nullable=False)
    triggered_at = Column(DateTime(timezone=True), nullable=False, default=now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    dpo_reviewed = Column(Boolean, nullable=False, default=False)
    reviewed_by = Column(String(64), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
