"""Advisory AI endpoints; extracted forms never directly grant consent."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.routers.healthcare import DB, UserDep, clinician, commit, organization
from app.schemas.healthcare import AdvisorRequest, ClassifyRequest, ComplianceRequest, ExplainRequest, PolicyRequest
from app.services.gemma_client import GemmaClient
from app.services.healthcare_consent_engine import HealthcareConsentEngine

router = APIRouter(prefix="/healthcare/ai", tags=["healthcare_ai"])
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.post("/digitize-consent")
async def digitize_consent(user: UserDep, db: DB, image: UploadFile = File(...)):
    org_id = organization(user)
    try:
        if image.content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise HTTPException(415, "Only PNG, JPEG and WebP images are supported")
        content = await image.read(MAX_IMAGE_BYTES + 1)
        if not content:
            raise HTTPException(422, "Image is empty")
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Image exceeds 5 MB")
        try:
            detected_mime = GemmaClient.image_mime(content)
        except ValueError:
            raise HTTPException(415, "File content is not a supported image")
        if detected_mime != image.content_type:
            raise HTTPException(415, "Image content does not match its media type")
        def action():
            result = GemmaClient().digitize_paper_consent(content)
            HealthcareConsentEngine(db, org_id).seal("EHR_CONSENT_DIGITIZATION", dict(action="EXTRACT_DRAFT",
                actor_id=str(user.id), source=result["source"], confidence_score=result["confidence_score"], requires_review=True))
            return result
        return await run_in_threadpool(commit, db, action)
    finally:
        await image.close()


@router.post("/explain-consent")
def explain_consent(body: ExplainRequest, user: UserDep):
    organization(user)
    return GemmaClient().explain_consent_notice(body.purpose, body.categories, body.language)


@router.post("/advise-access")
def advise_access(body: AdvisorRequest, user: UserDep, db: DB):
    clinician(user, body.clinician_id)
    consents = HealthcareConsentEngine(db, organization(user)).active_consents(body.patient_id)
    return GemmaClient().advise_clinician_access(body.patient_id, body.clinician_id, body.query, consents)


@router.post("/analyze-compliance-gaps")
def analyze_compliance(user: UserDep, body: ComplianceRequest | None = None):
    organization(user)
    return GemmaClient().analyze_compliance_gaps(body.policies if body else [])


@router.post("/classify-ehr-sensitivity")
@router.post("/classify-ehr")
def classify_ehr(body: ClassifyRequest, user: UserDep):
    organization(user)
    return GemmaClient().classify_ehr_sensitivity(body.clinical_text)


@router.post("/generate-consent-policy")
@router.post("/generate-policy")
def generate_policy(body: PolicyRequest, user: UserDep):
    organization(user)
    return GemmaClient().generate_consent_policy(body.department)
