"""Explicit, idempotent synthetic demo data. Never overwrites patient preferences."""
import hashlib
from datetime import date
from uuid import uuid4

from app.models.consent_principal import ConsentPrincipal
from app.models.healthcare import EHRClinicalRecord, HealthcarePatient
from app.models.organization import Organization
from app.schemas.healthcare import ConsentCreate
from app.services.healthcare_consent_engine import HealthcareConsentEngine


def seed_demo(db, organization_id):
    db.query(Organization).filter_by(id=organization_id).with_for_update().one()
    existing = db.query(HealthcarePatient).filter_by(organization_id=organization_id, mrn="MRN-2024-8842").first()
    if existing:
        return existing
    principal = ConsentPrincipal(organization_id=organization_id, canonical_ref="healthcare-demo-priya")
    db.add(principal)
    db.flush()
    patient_id = "p-101" if db.get(HealthcarePatient, "p-101") is None else str(uuid4())
    patient = HealthcarePatient(id=patient_id, organization_id=organization_id, mrn="MRN-2024-8842",
        full_name="Priya Sharma", date_of_birth=date(1992, 6, 14), gender="Female",
        phone_hash=hashlib.sha256(b"synthetic-demo-phone").hexdigest(), consent_principal_id=principal.id)
    db.add(patient)
    db.flush()
    records = [
        ("vitals", "standard", {"resourceType": "Observation", "bp": "120/80", "pulse": 72, "spo2": 99}),
        ("medications", "sensitive", {"resourceType": "MedicationStatement", "current": ["Metformin 500mg", "Atorvastatin 10mg"]}),
        ("allergies", "sensitive", {"resourceType": "Observation", "allergies": ["Penicillin"]}),
        ("surgical_history", "sensitive", {"resourceType": "Condition", "history": ["Appendectomy, 2015"]}),
        ("dental", "standard", {"resourceType": "Observation", "notes": "Routine dental examination; no acute findings"}),
        ("clinical_notes", "sensitive", {"resourceType": "Encounter", "notes": "General medicine follow-up for diabetes management"}),
        ("mental_health", "highly_sensitive", {"resourceType": "Condition", "notes": "Anxiety and depression therapy follow-up (synthetic demo)"}),
        ("hiv_std_status", "highly_sensitive", {"resourceType": "Observation", "screening": "Negative (synthetic demo)"}),
    ]
    for category, sensitivity, data in records:
        db.add(EHRClinicalRecord(patient_id=patient.id, category=category, sensitivity_level=sensitivity, clinical_data=data))
    engine = HealthcareConsentEngine(db, organization_id)
    for purpose, categories in [("treatment", ["demographics", "vitals", "clinical_notes", "medications", "allergies", "surgical_history", "dental"]),
                                ("diagnostics", ["demographics", "vitals", "lab_results", "allergies"])]:
        engine.grant_consent(patient.id, ConsentCreate(purpose=purpose, allowed_categories=categories,
            denied_categories=["mental_health", "reproductive", "hiv_std_status"], expires_days=365))
    db.flush()
    return patient
