"""Shared API payloads. Inputs reject unknown purposes/categories and overlap."""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Purpose = Literal["treatment", "diagnostics", "research", "insurance", "emergency", "public_health"]
Category = Literal["demographics", "vitals", "clinical_notes", "medications", "allergies", "surgical_history", "dental", "mental_health", "reproductive", "hiv_std_status", "lab_results"]
Sensitivity = Literal["standard", "sensitive", "highly_sensitive"]
Language = Literal["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali"]


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class PatientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    mrn: str
    full_name: str
    date_of_birth: date
    gender: str
    phone: str | None = None  # Raw phone numbers are not persisted.


class ConsentCreate(Input):
    purpose: Purpose
    allowed_categories: list[Category] = Field(max_length=32)
    denied_categories: list[Category] = Field(default_factory=list, max_length=32)
    expires_days: int = Field(default=365, ge=1, le=3650)

    @model_validator(mode="after")
    def disjoint(self):
        if set(self.allowed_categories) & set(self.denied_categories):
            raise ValueError("Allowed and denied categories must be disjoint")
        self.allowed_categories = sorted(set(self.allowed_categories))
        self.denied_categories = sorted(set(self.denied_categories))
        return self


class ConsentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    purpose: Purpose
    status: Literal["active", "revoked", "expired"]
    allowed_categories: list[str]
    denied_categories: list[str]
    granted_at: datetime
    expires_at: datetime


class AccessRequest(Input):
    patient_id: str = Field(min_length=1, max_length=64)
    clinician_id: str = Field(min_length=1, max_length=64)
    department: str = Field(min_length=1, max_length=128)
    purpose: Purpose


class EmergencyRequest(Input):
    patient_id: str = Field(min_length=1, max_length=64)
    clinician_id: str = Field(min_length=1, max_length=64)
    department: str = Field(min_length=1, max_length=128)
    emergency_reason: str = Field(min_length=20, max_length=4000)


class ClinicalRecordRead(BaseModel):
    category: str
    sensitivity: Sensitivity
    status: Literal["allowed", "redacted"]
    data: dict[str, Any] | None
    redaction_notice: str | None = None


class AccessRead(BaseModel):
    evaluation_id: str
    timestamp: datetime
    patient_id: str
    purpose: Purpose
    department: str
    emergency_override: bool
    allowed_categories: list[str]
    redacted_categories: list[str]
    records: list[ClinicalRecordRead]
    proof_hash: str
    block_number: int
    override_expires_at: datetime | None = None


class ExplainRequest(Input):
    purpose: Purpose
    categories: list[Category] = Field(max_length=32)
    language: Language = "English"


class AdvisorRequest(Input):
    patient_id: str = Field(min_length=1, max_length=64)
    clinician_id: str = Field(min_length=1, max_length=64)
    query: str = Field(min_length=1, max_length=4000)


class ComplianceRequest(Input):
    policies: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def bound_policy_size(self):
        if sum(map(len, self.policies)) > 50000:
            raise ValueError("Policy text exceeds 50000 characters")
        return self


class ClassifyRequest(Input):
    clinical_text: str = Field(min_length=1, max_length=20000)


class PolicyRequest(Input):
    department: str = Field(min_length=1, max_length=128)
