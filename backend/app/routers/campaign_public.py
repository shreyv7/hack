"""Public routes for email consent campaign capture (token-authenticated, no login)."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import rate_limiter
from app.schemas.notice_delivery import EmailCampaignDecisionRequest, EmailCampaignOtpVerifyRequest
from app.services.email_campaign_capture_service import EmailCampaignCaptureService

router = APIRouter(prefix="/public/v1/consent-campaign", tags=["consent_campaign_public"])


def _ip_hash(request: Request) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()


@router.get("/{token}")
def get_consent_campaign_page(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
    lang: str = Query(default="en"),
) -> dict:
    rate_limiter.check_rate_limit(request, "consent_campaign_get", max_requests=60, window_seconds=60)
    return EmailCampaignCaptureService(db).get_campaign_page(token, lang=lang)


@router.post("/{token}/decision")
def submit_consent_decision(
    token: str,
    body: EmailCampaignDecisionRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    rate_limiter.check_rate_limit(request, "consent_campaign_decision", max_requests=20, window_seconds=60)
    if body.decision_type not in ("accept", "reject", "customize", "accepted", "rejected", "customized"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid decision_type")
    return EmailCampaignCaptureService(db).submit_decision(
        token,
        decision_type=body.decision_type,
        consented_purposes=body.consented_purposes,
        language=body.language,
        ip_hash=_ip_hash(request),
        user_agent=request.headers.get("user-agent", "")[:1024],
    )


@router.post("/{token}/otp/verify")
def verify_consent_otp(
    token: str,
    body: EmailCampaignOtpVerifyRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    rate_limiter.check_rate_limit(request, "consent_campaign_otp", max_requests=15, window_seconds=60)
    return EmailCampaignCaptureService(db).verify_otp_and_finalize(
        token,
        otp_code=body.otp_code,
        ip_hash=_ip_hash(request),
        user_agent=request.headers.get("user-agent", "")[:1024],
        background_tasks=background_tasks,
    )


@router.post("/{token}/otp/resend")
def resend_consent_otp(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    rate_limiter.check_rate_limit(request, "consent_campaign_resend", max_requests=5, window_seconds=60)
    return EmailCampaignCaptureService(db).resend_otp(
        token,
        ip_hash=_ip_hash(request),
        user_agent=request.headers.get("user-agent", "")[:1024],
    )
