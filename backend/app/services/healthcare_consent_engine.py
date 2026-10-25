"""Deterministic, default-deny access. AI never participates in enforcement."""
import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.healthcare import (
    AccessDecisionAudit, EHRClinicalRecord, EmergencyOverrideLog, HealthcareConsent, HealthcarePatient,
)
from app.schemas.healthcare import ConsentCreate, ConsentRead
from app.services.proof_vault_payload import compute_proof_hash
from app.services.proof_vault_service import ProofVaultService


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class HealthcareConsentEngine:
    def __init__(self, db: Session, organization_id):
        self.db = db
        self.organization_id = organization_id

    def patient(self, patient_id: str):
        patient = self.db.query(HealthcarePatient).filter_by(
            id=patient_id, organization_id=self.organization_id,
        ).with_for_update().first()
        if patient is None:
            raise HTTPException(404, "Patient not found")
        return patient

    def seal(self, event_type: str, payload: dict):
        return ProofVaultService._create_record(
            self.db, org_id=self.organization_id, consent_receipt_id=None,
            event_type=event_type, action=payload.get("action", "EVALUATE"),
            purposes=payload.get("purpose", ""), channel="healthcare", source="healthcare_consent_engine",
            created_at=datetime.now(timezone.utc), payload_version=2,
            proof_hash=compute_proof_hash(payload), proof_payload_json=payload,
        )

    def consents(self, patient_id: str):
        self.patient(patient_id)
        now = datetime.now(timezone.utc)
        result = []
        for consent in self.db.query(HealthcareConsent).filter_by(patient_id=patient_id).order_by(HealthcareConsent.granted_at.desc()).all():
            item = ConsentRead.model_validate(consent)
            item.granted_at, item.expires_at = utc(item.granted_at), utc(item.expires_at)
            if item.status == "active" and item.expires_at <= now:
                item.status = "expired"
            result.append(item)
        return result

    def grant_consent(self, patient_id: str, request: ConsentCreate):
        self.patient(patient_id)
        now = datetime.now(timezone.utc)
        self.db.query(HealthcareConsent).filter_by(patient_id=patient_id, purpose=request.purpose, status="active").update({"status": "revoked"})
        consent_id = str(uuid4())
        expires_at = now + timedelta(days=request.expires_days)
        proof = self.seal("HEALTHCARE_CONSENT_GRANT", dict(
            action="GRANT", patient_id=patient_id, consent_id=consent_id, purpose=request.purpose,
            allowed_categories=request.allowed_categories, denied_categories=request.denied_categories,
            granted_at=now.isoformat(), expires_at=expires_at.isoformat(),
        ))
        consent = HealthcareConsent(id=consent_id, patient_id=patient_id, purpose=request.purpose,
            allowed_categories=request.allowed_categories, denied_categories=request.denied_categories,
            status="active", granted_at=now, expires_at=expires_at, proof_record_id=proof.id)
        self.db.add(consent)
        self.db.flush()
        return consent

    def revoke_consent(self, patient_id: str, consent_id: str):
        self.patient(patient_id)
        consent = self.db.query(HealthcareConsent).filter_by(patient_id=patient_id, id=consent_id).first()
        if consent is None:
            raise HTTPException(404, "Consent not found")
        if consent.status != "revoked":
            consent.status = "revoked"
            self.seal("HEALTHCARE_CONSENT_WITHDRAWAL", dict(action="REVOKE", patient_id=patient_id,
                consent_id=consent.id, purpose=consent.purpose))
        self.db.flush()
        return consent

    def active_consents(self, patient_id: str):
        return [item.model_dump(mode="json") for item in self.consents(patient_id)
                if item.status == "active" and item.granted_at <= datetime.now(timezone.utc)]

    def evaluate_access(self, patient_id: str, clinician_id: str, purpose: str, department: str) -> dict:
        self.patient(patient_id)
        now = datetime.now(timezone.utc)
        consent = self.db.query(HealthcareConsent).filter(
            HealthcareConsent.patient_id == patient_id, HealthcareConsent.purpose == purpose,
            HealthcareConsent.status == "active", HealthcareConsent.granted_at <= now,
            HealthcareConsent.expires_at > now,
        ).order_by(HealthcareConsent.granted_at.desc(), HealthcareConsent.id.desc()).first()
        allowed = set(consent.allowed_categories or []) - set(consent.denied_categories or []) if consent else set()
        override = None
        if purpose == "emergency":
            override = self.db.query(EmergencyOverrideLog).filter(
                EmergencyOverrideLog.organization_id == self.organization_id,
                EmergencyOverrideLog.patient_id == patient_id, EmergencyOverrideLog.clinician_id == clinician_id,
                EmergencyOverrideLog.department == department, EmergencyOverrideLog.expires_at > now,
                EmergencyOverrideLog.triggered_at <= now,
            ).order_by(EmergencyOverrideLog.triggered_at.desc()).first()
        return self._decision(patient_id, clinician_id, purpose, department, allowed, override, now)

    def _decision(self, patient_id, clinician_id, purpose, department, allowed, override, now, *, reason_hash=None):
        records = self.db.query(EHRClinicalRecord).filter_by(patient_id=patient_id).order_by(EHRClinicalRecord.category, EHRClinicalRecord.id).all()
        categories = {r.category for r in records}
        permitted = categories if override else categories & allowed
        denied = categories - permitted
        evaluation_id = str(uuid4())
        payload = dict(evaluation_id=evaluation_id, timestamp=now.isoformat(), patient_id=patient_id,
            clinician_id=clinician_id, purpose=purpose, department=department,
            allowed_categories=sorted(permitted), redacted_categories=sorted(denied),
            emergency_override=bool(override), priority="HIGH" if override else "NORMAL")
        if override:
            payload.update(override_id=override.id, override_expires_at=utc(override.expires_at).isoformat(),
                           statutory_citation="DPDPA 2023, Section 7(f)")
        if reason_hash:
            payload["reason_hash"] = reason_hash
        proof = self.seal("BREAK_THE_GLASS_OVERRIDE" if reason_hash else "HEALTHCARE_ACCESS_EVALUATION", payload)
        self.db.add(AccessDecisionAudit(id=evaluation_id, organization_id=self.organization_id,
            clinician_id=clinician_id, patient_id=patient_id, purpose=purpose, department=department,
            allowed_categories=sorted(permitted), redacted_categories=sorted(denied),
            emergency_override=bool(override), proof_hash=proof.current_hash, decision_timestamp=now))
        result_records = []
        for record in records:
            granted = record.category in permitted
            result_records.append(dict(category=record.category, sensitivity=record.sensitivity_level,
                status="allowed" if granted else "redacted", data=record.clinical_data if granted else None,
                redaction_notice=None if granted else f"[REDACTED — no consent for {record.category} under purpose '{purpose}']"))
        self.db.flush()
        return dict(evaluation_id=evaluation_id, timestamp=now, patient_id=patient_id, purpose=purpose,
            department=department, emergency_override=bool(override), allowed_categories=sorted(permitted),
            redacted_categories=sorted(denied), records=result_records, proof_hash=proof.current_hash,
            block_number=proof.block_number, override_expires_at=utc(override.expires_at) if override else None)

    def break_the_glass(self, patient_id: str, clinician_id: str, department: str, reason: str) -> dict:
        self.patient(patient_id)
        if len(reason.strip()) < 20:
            raise HTTPException(422, "A clinical emergency justification of at least 20 characters is required")
        now = datetime.now(timezone.utc)
        log = EmergencyOverrideLog(id=str(uuid4()), organization_id=self.organization_id,
            patient_id=patient_id, clinician_id=clinician_id, department=department,
            emergency_reason=reason.strip(), triggered_at=now, expires_at=now + timedelta(minutes=30),
            dpo_reviewed=False)
        result = self._decision(patient_id, clinician_id, "emergency", department, set(), log, now,
                                reason_hash=hashlib.sha256(reason.strip().encode()).hexdigest())
        log.proof_hash = result["proof_hash"]
        self.db.add(log)
        self.db.flush()
        return result
