"""Vajra AI policy generation from RoPA processing activities."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.policy import PolicyDocument, PolicyType
from app.models.user import User
from app.schemas.policy import PolicyCreate, PolicyDetailRead, PolicyVersionCreate
from app.services import vajra_ai_service
from app.services.policy_ropa_context import PolicyRopaContext, build_policy_ropa_context
from app.services.policy_service import PolicyService
from app.services.vajra_ai_service import VajraAIError

logger = logging.getLogger(__name__)

_POLICY_TYPE_DEFAULT_TITLES: dict[PolicyType, str] = {
    PolicyType.privacy: "Privacy Policy",
    PolicyType.cookie: "Cookie Policy",
    PolicyType.children: "Children's Privacy Notice",
    PolicyType.employee: "Employee Data Protection Policy",
    PolicyType.retention: "Data Retention & Erasure Schedule",
    PolicyType.incident: "Incident Response Plan",
    PolicyType.vendor: "Vendor Data Processing Agreement",
    PolicyType.aup: "Acceptable Use Policy",
    PolicyType.custom: "Governance Policy",
}


class PolicyAiService:
    def __init__(self, db: Session):
        self.db = db
        self._policy_service = PolicyService(db)

    def generate_from_ropa(
        self,
        user: User,
        *,
        org_id: UUID | None = None,
        policy_type: PolicyType = PolicyType.privacy,
    ) -> tuple[PolicyDetailRead, dict]:
        org_uuid = self._policy_service._resolve_org_id(user, org_id)
        self._policy_service._require_admin(user)

        context = build_policy_ropa_context(self.db, org_uuid)
        if not context.has_activities:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "No processing activities found in RoPA. Document processing "
                    "activities before generating a policy."
                ),
            )

        draft, meta = self._generate_draft(context, policy_type)
        detail, is_new, version_label = self._persist_draft(user, org_uuid, policy_type, draft)

        action = "Vajra AI generated new policy" if is_new else "Vajra AI generated new draft version"
        self._policy_service._log_activity(
            org_id=org_uuid,
            policy_id=detail.id,
            action=action,
            title=detail.title,
            version=version_label,
            user_name=user.full_name or "Vajra AI",
        )
        self.db.commit()

        meta["is_new_policy"] = is_new
        meta["policy_id"] = str(detail.id)
        if detail.versions:
            meta["version_id"] = str(detail.versions[0].id)
        return detail, meta

    def _generate_draft(
        self, context: PolicyRopaContext, policy_type: PolicyType
    ) -> tuple[dict[str, str], dict]:
        meta: dict = {"source": "rule_based", "model_id": None}

        if settings.ai_configured:
            try:
                draft = vajra_ai_service.generate_policy_from_ropa(
                    context=context.to_json(),
                    org_name=context.organization_name,
                    policy_type=policy_type.value,
                )
                meta["source"] = settings.ai_provider
                meta["model_id"] = settings.ai_model_id or None
                return draft, meta
            except VajraAIError as exc:
                logger.warning("Policy generation AI call failed, using fallback: %s", exc)

        return self._fallback_draft(context, policy_type), meta

    def _fallback_draft(
        self, context: PolicyRopaContext, policy_type: PolicyType
    ) -> dict[str, str]:
        label = _POLICY_TYPE_DEFAULT_TITLES.get(policy_type, "Privacy Policy")
        org = context.organization_name
        lines = [
            f"# {label}",
            "",
            f"*Draft generated from RoPA for {org}. Review with qualified counsel before publishing.*",
            "",
            "## 1. Introduction",
            "",
            f"This {label} describes how **{org}** collects, uses, stores, and protects "
            "personal data in accordance with the Digital Personal Data Protection Act, "
            "2023 (DPDPA) and applicable Rules.",
            "",
            "## 2. Processing Activities",
            "",
        ]

        for act in context.activities:
            lines.append(f"### {act.get('title', 'Processing Activity')}")
            if act.get("description"):
                lines.append(act["description"])
                lines.append("")
            if act.get("data_categories"):
                lines.append(
                    f"- **Data categories:** {', '.join(act['data_categories'])}"
                )
            if act.get("data_principals"):
                principals = ", ".join(
                    p["category"] for p in act["data_principals"] if p.get("category")
                )
                if principals:
                    lines.append(f"- **Data principals:** {principals}")
            if act.get("lawful_bases"):
                bases = ", ".join(
                    f"{b['basis']}" + (f" ({b['dpdpa_section']})" if b.get("dpdpa_section") else "")
                    for b in act["lawful_bases"]
                    if b.get("basis")
                )
                if bases:
                    lines.append(f"- **Lawful basis:** {bases}")
            if act.get("recipients"):
                names = ", ".join(r["name"] for r in act["recipients"] if r.get("name"))
                if names:
                    lines.append(f"- **Recipients:** {names}")
            if act.get("cross_border_transfers"):
                countries = ", ".join(
                    t["destination_country"]
                    for t in act["cross_border_transfers"]
                    if t.get("destination_country")
                )
                if countries:
                    lines.append(f"- **Cross-border transfers:** {countries}")
            if act.get("retention"):
                periods = ", ".join(
                    r["period"] for r in act["retention"] if r.get("period")
                )
                if periods:
                    lines.append(f"- **Retention:** {periods}")
            lines.append("")

        lines.extend(
            [
                "## 3. Data Principal Rights",
                "",
                "Under DPDPA, data principals may request access, correction, erasure, and "
                "grievance redressal. Contact the Data Protection Officer using the details "
                "published by your organisation.",
                "",
                "## 4. Security Safeguards",
                "",
                "We implement reasonable technical and organisational measures to protect "
                "personal data, including access controls, encryption, and monitoring, "
                "consistent with DPDPA Section 8(5).",
                "",
                "---",
                "",
                "*This document was auto-drafted from your RoPA register. Configure Vajra AI "
                "for AI-enhanced policy generation. Confirm all legal language with your DPO "
                "or qualified counsel before publishing.*",
            ]
        )

        return {
            "title": label,
            "summary": f"Rule-based draft generated from {len(context.activities)} RoPA activities.",
            "content": "\n".join(lines),
        }

    def _persist_draft(
        self,
        user: User,
        org_uuid: UUID,
        policy_type: PolicyType,
        draft: dict[str, str],
    ) -> tuple[PolicyDetailRead, bool, str]:
        existing = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.organization_id == org_uuid,
                PolicyDocument.policy_type == policy_type,
                PolicyDocument.archived_at.is_(None),
            )
            .order_by(PolicyDocument.updated_at.desc())
            .first()
        )

        title = draft.get("title") or _POLICY_TYPE_DEFAULT_TITLES.get(policy_type, "Policy")
        content = draft.get("content") or ""
        summary = draft.get("summary") or "Vajra AI generated draft from RoPA."

        if existing:
            version = self._policy_service.create_new_version(
                user,
                existing.id,
                PolicyVersionCreate(content=content, summary=summary),
                org_id=org_uuid,
            )
            detail = self._policy_service.get_policy(user, existing.id, org_uuid)
            return detail, False, f"v{version.version_number}.0"

        detail = self._policy_service.create_policy(
            user,
            PolicyCreate(
                title=title,
                policy_type=policy_type,
                content=content,
                summary=summary,
            ),
            org_id=org_uuid,
        )
        return detail, True, "v1.0"
