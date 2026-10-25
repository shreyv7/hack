"""Authenticated healthcare API. Transactions seal proof before returning records."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.healthcare import AccessDecisionAudit, EmergencyOverrideLog
from app.models.user import User
from app.schemas.healthcare import AccessRead, AccessRequest, ConsentCreate, ConsentRead, EmergencyRequest, PatientRead
from app.services.healthcare_consent_engine import HealthcareConsentEngine
from app.services.healthcare_seed import seed_demo
from app.services.proof_vault_service import ProofVaultService

router = APIRouter(prefix="/healthcare", tags=["healthcare"])
UserDep = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


def organization(user):
    if user.organization_id is None:
        raise HTTPException(403, "An organization-scoped account is required")
    return user.organization_id


def authorize_manager(user):
    role = getattr(user.role, "value", user.role)
    if role not in {"admin", "superadmin", "dpo"}:
        raise HTTPException(403, "Consent management requires hospital admin or DPO authority")


def authorize_auditor(user):
    role = getattr(user.role, "value", user.role)
    if role not in {"admin", "superadmin", "dpo", "auditor", "ciso", "compliance_officer"}:
        raise HTTPException(403, "Audit access requires compliance authority")


def clinician(user, clinician_id):
    if clinician_id != str(user.id):
        raise HTTPException(403, "clinician_id must match the authenticated user")


def commit(db, action):
    try:
        result = action()
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.get("/patients/{patient_id}", response_model=PatientRead)
def get_patient(patient_id: str, user: UserDep, db: DB):
    return HealthcareConsentEngine(db, organization(user)).patient(patient_id)


@router.get("/patients/{patient_id}/consents", response_model=list[ConsentRead])
def list_consents(patient_id: str, user: UserDep, db: DB):
    return HealthcareConsentEngine(db, organization(user)).consents(patient_id)


@router.post("/patients/{patient_id}/consents", status_code=201, response_model=ConsentRead)
def grant_consent(patient_id: str, body: ConsentCreate, user: UserDep, db: DB):
    authorize_manager(user)
    engine = HealthcareConsentEngine(db, organization(user))
    return commit(db, lambda: engine.grant_consent(patient_id, body))


@router.delete("/patients/{patient_id}/consents/{consent_id}", response_model=ConsentRead)
@router.post("/patients/{patient_id}/consents/{consent_id}/revoke", response_model=ConsentRead)
def revoke_consent(patient_id: str, consent_id: str, user: UserDep, db: DB):
    authorize_manager(user)
    engine = HealthcareConsentEngine(db, organization(user))
    return commit(db, lambda: engine.revoke_consent(patient_id, consent_id))


@router.post("/access/evaluate", response_model=AccessRead)
def evaluate_access(body: AccessRequest, user: UserDep, db: DB):
    clinician(user, body.clinician_id)
    engine = HealthcareConsentEngine(db, organization(user))
    return commit(db, lambda: engine.evaluate_access(**body.model_dump()))


@router.post("/access/break-the-glass", response_model=AccessRead)
def break_the_glass(body: EmergencyRequest, user: UserDep, db: DB):
    clinician(user, body.clinician_id)
    engine = HealthcareConsentEngine(db, organization(user))
    return commit(db, lambda: engine.break_the_glass(body.patient_id, body.clinician_id, body.department, body.emergency_reason))


@router.post("/seed-demo")
def initialize_demo(user: UserDep, db: DB):
    authorize_manager(user)
    if settings.ENVIRONMENT in {"production", "staging"}:
        raise HTTPException(403, "Demo seeding is disabled in production and staging")
    patient = commit(db, lambda: seed_demo(db, organization(user)))
    return {"message": "Demo patient Priya Sharma and 8 clinical records successfully initialized", "patient_id": patient.id}


@router.get("/audit/decisions")
def audit_decisions(user: UserDep, db: DB, limit: int = Query(default=100, ge=1, le=500)):
    authorize_auditor(user)
    rows = db.query(AccessDecisionAudit).filter_by(organization_id=organization(user)).order_by(AccessDecisionAudit.decision_timestamp.desc()).limit(limit).all()
    return [dict(id=r.id, clinician_id=r.clinician_id, patient_id=r.patient_id, purpose=r.purpose, department=r.department,
                 allowed_categories=r.allowed_categories, redacted_categories=r.redacted_categories,
                 emergency_override=r.emergency_override, proof_hash=r.proof_hash, decision_timestamp=r.decision_timestamp) for r in rows]


@router.get("/audit/emergency-overrides")
def emergency_overrides(user: UserDep, db: DB, limit: int = Query(default=100, ge=1, le=500)):
    authorize_auditor(user)
    rows = db.query(EmergencyOverrideLog).filter_by(organization_id=organization(user)).order_by(EmergencyOverrideLog.triggered_at.desc()).limit(limit).all()
    return [dict(id=r.id, clinician_id=r.clinician_id, patient_id=r.patient_id, department=r.department,
                 emergency_reason=r.emergency_reason, proof_hash=r.proof_hash, triggered_at=r.triggered_at,
                 expires_at=r.expires_at, dpo_reviewed=r.dpo_reviewed, reviewed_by=r.reviewed_by, reviewed_at=r.reviewed_at) for r in rows]


@router.post("/audit/emergency-overrides/{override_id}/review")
def review_override(override_id: str, user: UserDep, db: DB):
    authorize_manager(user)
    org_id = organization(user)
    def action():
        row = db.query(EmergencyOverrideLog).filter_by(id=override_id, organization_id=org_id).with_for_update().first()
        if row is None:
            raise HTTPException(404, "Override not found")
        if not row.dpo_reviewed:
            row.dpo_reviewed, row.reviewed_by, row.reviewed_at = True, str(user.id), datetime.now(timezone.utc)
            HealthcareConsentEngine(db, org_id).seal("HEALTHCARE_EMERGENCY_REVIEW", dict(action="REVIEW", override_id=row.id, reviewer_id=str(user.id)))
        return {"id": row.id, "dpo_reviewed": row.dpo_reviewed}
    return commit(db, action)


@router.post("/audit/verify")
def verify_audit(user: UserDep, db: DB):
    authorize_auditor(user)
    return ProofVaultService().verify_entire_chain(db, organization(user), user.id)


@router.get("/audit/verify")
def inspect_audit(user: UserDep, db: DB):
    authorize_auditor(user)
    return ProofVaultService().verify_entire_chain(
        db, organization(user), user.id, persist_verification=False,
    )
