"""
Public, API-key-authenticated enforcement endpoint.

External systems (marketing, ad-targeting, an SDK) call this BEFORE processing a
person, to ask "is <purpose> allowed for this subject?" under DPDPA Section 9.
Authenticated with an integration API key in the `X-Api-Key` header (not a user
login), so machine-to-machine callers can use it.
"""

from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Form, Header, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password
from app.models.integration_api_key import IntegrationApiKey
from app.schemas.child_data import (
    ApiConsentRequest,
    ApiConsentResult,
    EnforcementDecision,
    EnforcementRequest,
    ParentConsentSubmission,
)
from app.services.child_data_service import ChildDataService

router = APIRouter(prefix="/public/v1/childrens-data", tags=["childrens-data-public"])


def org_from_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> UUID:
    """Resolve an organization from an X-Api-Key header (any active key for the org)."""
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing API Key")
    prefix = x_api_key[:13]
    api_key_obj = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.key_prefix == prefix, IntegrationApiKey.status == "active")
        .first()
    )
    valid_full = bool(api_key_obj and verify_password(x_api_key, api_key_obj.key_hash))
    valid_dev = bool(
        api_key_obj
        and settings.ENVIRONMENT == "development"
        and x_api_key == api_key_obj.key_prefix
    )
    if not api_key_obj or not (valid_full or valid_dev):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")
    api_key_obj.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return api_key_obj.organization_id


@router.post("/enforce", response_model=EnforcementDecision)
def public_enforce(
    body: EnforcementRequest,
    org_id: Annotated[UUID, Depends(org_from_api_key)],
    db: Session = Depends(get_db),
) -> EnforcementDecision:
    return ChildDataService(db).check_enforcement_for_org(org_id, body.subject_ref, body.purpose)


@router.post("/consent", response_model=ApiConsentResult)
def public_record_consent(
    body: ApiConsentRequest,
    request: Request,
    org_id: Annotated[UUID, Depends(org_from_api_key)],
    db: Session = Depends(get_db),
) -> ApiConsentResult:
    """Org's backend records a parental-consent decision it collected on its side
    (e.g. via DigiLocker or its own form). Authenticated with X-Api-Key."""
    ip = request.client.host if request.client else None
    return ChildDataService(db).record_consent_via_api(org_id, body, ip=ip)


# --------------------------------------------------------------------------- #
# Parent-facing consent page (no login — the link token is the credential)
# --------------------------------------------------------------------------- #

def _page(
    title: str,
    body_html: str,
    *,
    brand_name: str | None = None,
    logo_url: str | None = None,
    support_email: str | None = None,
) -> HTMLResponse:
    if logo_url:
        header = f'<img src="{html.escape(logo_url)}" alt="{html.escape(brand_name or "")}" class="logo">'
    elif brand_name:
        header = f'<div class="wordmark">{html.escape(brand_name)}</div>'
    else:
        header = ""
    if support_email:
        footer = f'<p class="foot">Questions? <a href="mailto:{html.escape(support_email)}">{html.escape(support_email)}</a></p>'
    elif brand_name:
        footer = f'<p class="foot">Sent by {html.escape(brand_name)} to obtain verifiable parental consent under the DPDPA, 2023.</p>'
    else:
        footer = ""
    return HTMLResponse(
        f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
  body{{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f3f4f6;margin:0;color:#1f2937}}
  .card{{max-width:520px;margin:6vh auto;background:#fff;border-radius:14px;padding:32px;
        box-shadow:0 4px 24px rgba(0,0,0,.08)}}
  .logo{{max-height:44px;margin-bottom:18px}} .wordmark{{font-size:18px;font-weight:700;margin-bottom:18px}}
  h2{{margin:0 0 4px}} .muted{{color:#6b7280;font-size:14px}}
  label{{display:block;font-size:13px;font-weight:600;margin:14px 0 4px}}
  input[type=text]{{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box}}
  .check{{display:flex;gap:8px;align-items:flex-start;margin:16px 0;font-size:14px;font-weight:400}}
  .btns{{display:flex;gap:10px;margin-top:20px}}
  button{{flex:1;padding:12px;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}}
  .grant{{background:#4f46e5;color:#fff}} .deny{{background:#fff;color:#374151;border:1px solid #d1d5db}}
  .box{{background:#eef2ff;border-radius:8px;padding:12px;font-size:14px;margin:16px 0}}
  .foot{{color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:14px;margin-top:22px}}
</style></head><body><div class="card">{header}{body_html}{footer}</div></body></html>"""
    )


@router.get("/consent/{token}", response_class=HTMLResponse)
def consent_page(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    try:
        info = ChildDataService(db).get_consent_request(token)
    except HTTPException as exc:
        return _page("Consent link", f"<h2>Link unavailable</h2><p class='muted'>{html.escape(str(exc.detail))}</p>")

    brand = {"brand_name": info.org_name, "logo_url": info.org_logo_url, "support_email": info.support_email}
    if info.status == "expired":
        return _page(
            "Consent link expired",
            "<h2>Link expired</h2><p class='muted'>This consent request has expired. "
            "Please contact us for a new link.</p>",
            **brand,
        )

    org = html.escape(info.org_name)
    parent = html.escape(info.parent_name or "")
    purpose = (
        f"<div class='box'><strong>Purpose:</strong> {html.escape(info.purpose_note)}</div>"
        if info.purpose_note
        else ""
    )
    body = f"""
      <h2>Parental consent</h2>
      <p class="muted">{org} processes data belonging to a child in your care. Under India's
      DPDPA 2023, this needs your consent as a parent or guardian.</p>
      {purpose}
      <form method="post" action="">
        <label>Your full name</label>
        <input type="text" name="parent_name" value="{parent}" required>
        <label>Relationship to the child</label>
        <input type="text" name="parent_relationship" placeholder="e.g. Mother, Father, Guardian">
        <label class="check"><input type="checkbox" name="confirmed_guardian" value="yes">
          I confirm I am the parent or lawful guardian of this child and I consent to the
          processing of their personal data as described.</label>
        <div class="btns">
          <button class="grant" type="submit" name="decision" value="grant">Grant consent</button>
          <button class="deny" type="submit" name="decision" value="deny">Decline</button>
        </div>
      </form>
      <p class="muted" style="margin-top:16px;font-size:12px">Profiling and targeted advertising
      remain blocked regardless of this choice.</p>
    """
    return _page("Parental consent", body, **brand)


@router.post("/consent/{token}", response_class=HTMLResponse)
def consent_submit(
    token: str,
    request: Request,
    decision: Annotated[str, Form()],
    parent_name: Annotated[str, Form()],
    parent_relationship: Annotated[str | None, Form()] = None,
    confirmed_guardian: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
) -> HTMLResponse:
    submission = ParentConsentSubmission(
        decision="grant" if decision == "grant" else "deny",
        parent_name=parent_name,
        parent_relationship=parent_relationship or None,
        confirmed_guardian=bool(confirmed_guardian),
    )
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    svc = ChildDataService(db)
    # Capture branding while the token is still valid (submit clears it).
    name, logo, support = svc.branding_for_token(token) or (None, None, None)
    brand = {"brand_name": name, "logo_url": logo, "support_email": support}
    try:
        result = svc.submit_consent(token, submission, ip=ip, user_agent=user_agent)
    except HTTPException as exc:
        return _page("Consent", f"<h2>Could not record</h2><p class='muted'>{html.escape(str(exc.detail))}</p>", **brand)

    icon = "✅" if result.status == "verified" else "↩️"
    return _page(
        "Consent recorded",
        f"<h2>{icon} {'Consent recorded' if result.status == 'verified' else 'Declined'}</h2>"
        f"<p class='muted'>{html.escape(result.message)}</p>"
        "<p class='muted' style='font-size:12px'>You can close this window.</p>",
        **brand,
    )
