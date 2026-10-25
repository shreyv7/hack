"""AI-assisted governance dashboard insights.

Primary path: Shield AI via shield_ai_service.generate() / chat().
Fallback: rule-based summaries when the AI provider is unconfigured or unavailable.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.core.config import settings
from app.models.user import User
from app.schemas.governance_dashboard import (
    AiDashboardRequest,
    AiDashboardResponse,
    GovernanceAiAssistRequest,
    GovernanceAiAssistResponse,
)
from app.services.compliance_base import ComplianceBaseService
from app.services.compliance_map_service import ComplianceMapService
from app.services.dashboard_service import DashboardService
from app.services.governance_ai_context import GovernanceAiContextBuilder
from app.services.governance_dashboard_service import GovernanceDashboardService

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Bedrock-powered assist (new primary path)
# --------------------------------------------------------------------------- #

_GOVERNANCE_PERSONA = (
    "You are Shield AI, a compliance expert assistant embedded in the "
    "Governance → Compliance Dashboards module of DPDPA Shield. "
    "The user has just opened the AI Assistant panel on their dashboard. "
    "Be concise, insightful, and specific — reference the live metrics "
    "in the context snapshot below. Never mention backend APIs, database "
    "tables, or internal architecture. When citing DPDPA sections, be accurate. "
    "Respond in plain English with light markdown (bold, bullets)."
)


class GovernanceAiService(ComplianceBaseService):
    # ------------------------------------------------------------------ #
    #  NEW: Bedrock-powered assist endpoint
    # ------------------------------------------------------------------ #

    def assist(
        self,
        user: User,
        body: GovernanceAiAssistRequest,
        *,
        org_id: UUID | None = None,
    ) -> GovernanceAiAssistResponse:
        """Return an AI-generated governance summary.

        Falls back to rule-based text if the active provider is unconfigured.
        """
        resolved_org = self._resolve_org_id(user, org_id)
        configured = settings.ai_configured
        model_id = settings.ai_model_id or None

        # Build compact context (safe — degrades gracefully)
        context_snapshot = GovernanceAiContextBuilder(self.db).build(
            user,
            org_id=resolved_org,
            dashboard_id=body.dashboard_id,
        )

        if configured:
            try:
                import app.services.shield_ai_service as _shield_ai
                from app.services.shield_ai_service import ShieldAIError

                if body.action == "welcome":
                    task = (
                        "Below is a live compliance dashboard snapshot. "
                        "Write a 2-3 sentence executive summary followed by "
                        "exactly 3 concise priority action bullets. "
                        "Format: summary paragraph, then a JSON array of 3 bullet strings. "
                        "Example response format:\n"
                        "Your organisation's compliance posture is...\n\n"
                        '["Close open DSAR requests within 24h.", '
                        '"Upload evidence for Security Safeguards.", '
                        '"Complete RoPA entries missing DPIA linkages."]\n\n'
                        f"Dashboard context:\n{context_snapshot}"
                    )
                    raw = _shield_ai.generate(
                        task=task,
                        context=None,
                        max_tokens=450,
                    )
                    summary, bullets = _parse_welcome_response(raw)
                    return GovernanceAiAssistResponse(
                        configured=True,
                        summary=summary,
                        bullets=bullets,
                        model_id=model_id,
                        used_fallback=False,
                        copilot_context=context_snapshot,
                    )

                if body.action == "quick_ask" and body.question:
                    reply = _shield_ai.chat(
                        [{"role": "user", "content": body.question}],
                        context=context_snapshot,
                    )
                    return GovernanceAiAssistResponse(
                        configured=True,
                        summary=reply,
                        bullets=[],
                        model_id=model_id,
                        used_fallback=False,
                        copilot_context=context_snapshot,
                    )

            except Exception as exc:
                logger.warning("GovernanceAiService.assist: AI call failed, using fallback: %s", exc)
                # Fall through to rule-based fallback below

        # ---- Rule-based fallback ----------------------------------------
        summary, bullets = self._fallback_welcome(user, resolved_org)
        return GovernanceAiAssistResponse(
            configured=configured,
            summary=summary,
            bullets=bullets,
            model_id=None,
            used_fallback=True,
            copilot_context=context_snapshot,
        )

    # ------------------------------------------------------------------ #
    #  Fallback helpers (previously primary — now only called on error)
    # ------------------------------------------------------------------ #

    def _fallback_welcome(self, user: User, org_id: UUID) -> tuple[str, list[str]]:
        try:
            summary_data = DashboardService(self.db).get_summary(user, org_id=org_id)
            breakdown = ComplianceMapService(self.db).get_score_breakdown(user, org_id=org_id)
            gaps = [s.title for s in breakdown.sections if s.status != "complete"][:3]

            summary = (
                f"Your organisation's compliance posture is **{summary_data.compliance_status}** "
                f"at **{summary_data.compliance_score}%**. "
                f"Penalty exposure is mitigated to ₹{summary_data.penalty_mitigated_crores} Cr "
                f"(worst-case ₹{summary_data.penalty_worst_crores} Cr). "
                f"Weekly score change: {'+' if (summary_data.score_delta_week or 0) >= 0 else ''}"
                f"{summary_data.score_delta_week or 0} points."
            )
            bullets = gaps if gaps else [
                "Upload evidence for incomplete security safeguard controls.",
                "Review and close overdue DSAR requests.",
                "Link RoPA processing activities to DPIA assessments.",
            ]
        except Exception:
            summary = "Your compliance dashboard is active. Configure Shield AI to unlock AI-powered insights."
            bullets = [
                "Set AI_PROVIDER=vertex with GOOGLE_CLOUD_PROJECT, or AI_PROVIDER=bedrock with BEDROCK_MODEL_ID.",
                "Restart the backend server after updating environment variables.",
            ]
        return summary, bullets

    # ------------------------------------------------------------------ #
    #  Legacy analyze endpoint (kept for backward compatibility)
    # ------------------------------------------------------------------ #

    def analyze(self, user: User, body: AiDashboardRequest, *, org_id: UUID | None = None) -> AiDashboardResponse:
        resolved_org = self._resolve_org_id(user, org_id)
        summary = DashboardService(self.db).get_summary(user, org_id=resolved_org)
        breakdown = ComplianceMapService(self.db).get_score_breakdown(user, org_id=resolved_org)
        gaps = [s.title for s in breakdown.sections if s.status != "complete"][:5]

        if body.action == "explain":
            return AiDashboardResponse(
                action=body.action,
                summary=(
                    f"Your organization compliance score is {summary.compliance_score}% "
                    f"({summary.compliance_status}). Penalty exposure is mitigated to "
                    f"₹{summary.penalty_mitigated_crores} Cr with worst-case ₹{summary.penalty_worst_crores} Cr."
                ),
                details=[
                    f"Weekly score change: {summary.score_delta_week or 0} points",
                    f"Active modules tracked: {len(summary.metric_cards)}",
                ],
            )
        if body.action == "executive_summary":
            return AiDashboardResponse(
                action=body.action,
                summary=(
                    f"Executive posture: {summary.compliance_status} at {summary.compliance_score}%. "
                    "Focus areas require attention across security safeguards and breach readiness."
                ),
                details=gaps or ["No critical gaps detected in top sections."],
            )
        if body.action == "compliance_gaps":
            return AiDashboardResponse(
                action=body.action,
                summary=f"Identified {len(gaps)} priority compliance gaps.",
                details=gaps or ["All monitored sections are currently complete."],
            )
        if body.action == "recommendations":
            recs = [
                "Close open DSAR requests within SLA windows.",
                "Refresh RoPA entries missing DPIA linkages.",
                "Upload evidence for security safeguard controls below 80%.",
            ]
            return AiDashboardResponse(action=body.action, summary="Recommended next actions", details=recs)
        if body.action == "predict_score":
            delta = summary.score_delta_week or 0
            predicted = max(0, min(100, summary.compliance_score + delta))
            return AiDashboardResponse(
                action=body.action,
                summary="Projected score in 30 days based on current trajectory.",
                score_prediction=predicted,
            )
        if body.action == "risk_trend":
            return AiDashboardResponse(
                action=body.action,
                summary="Risk trend is stabilizing with improved consent and DSAR throughput.",
                details=[
                    f"Score delta (7d): {summary.score_delta_week or 0}",
                    f"Penalty mitigated: ₹{summary.penalty_mitigated_crores} Cr",
                ],
            )
        # search
        dashboards = GovernanceDashboardService(self.db).list_dashboards(
            user, org_id=resolved_org, search=body.query or "", page_size=10
        )
        names = [d.name for d in dashboards.items]
        return AiDashboardResponse(
            action=body.action,
            summary=f"Found {len(names)} dashboards matching your query.",
            matched_dashboards=names,
        )


# --------------------------------------------------------------------------- #
#  Response parsing helpers
# --------------------------------------------------------------------------- #

def _parse_welcome_response(raw: str) -> tuple[str, list[str]]:
    """Split the model's response into a summary paragraph and bullet list.

    Expected format (model is prompted for this):
        <prose paragraph>

        ["bullet 1", "bullet 2", "bullet 3"]
    """
    import json
    import re

    # Try to extract a JSON array from anywhere in the response
    array_match = re.search(r"\[.*?\]", raw, re.DOTALL)
    bullets: list[str] = []
    if array_match:
        try:
            parsed = json.loads(array_match.group(0))
            if isinstance(parsed, list):
                bullets = [str(b).strip() for b in parsed if str(b).strip()][:3]
        except json.JSONDecodeError:
            pass

    # The summary is everything before the JSON array (or the full response if no array)
    if array_match:
        summary = raw[: array_match.start()].strip()
    else:
        # Fall back: split by double newline, first chunk = summary, remaining = bullets
        parts = [p.strip() for p in raw.split("\n\n") if p.strip()]
        summary = parts[0] if parts else raw.strip()
        if not bullets and len(parts) > 1:
            for line in "\n".join(parts[1:]).splitlines():
                cleaned = line.lstrip("-•*123456789. ").strip()
                if cleaned:
                    bullets.append(cleaned)
            bullets = bullets[:3]

    if not summary:
        summary = raw.strip()

    # Ensure we always have at least one bullet
    if not bullets:
        bullets = [
            "Review open DSAR requests approaching SLA deadlines.",
            "Upload pending evidence for security safeguard controls.",
            "Complete RoPA entries missing DPIA or vendor linkages.",
        ]

    return summary, bullets[:3]
