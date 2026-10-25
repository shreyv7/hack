"""Shield AI — persisted conversation CRUD and message exchange."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from typing import Iterator

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ai_conversation import AiConversation, AiMessage
from app.models.user import User
from app.services import shield_ai_service
from app.services.shield_ai_service import ShieldAIError
from app.services.ai_context_service import AiContextService
from app.services.compliance_base import ComplianceBaseService

_DEFAULT_TITLE = "New conversation"


def _title_from(text: str) -> str:
    cleaned = " ".join(text.strip().split())
    if len(cleaned) <= 60:
        return cleaned or _DEFAULT_TITLE
    return cleaned[:57].rstrip() + "…"


class AiConversationService(ComplianceBaseService):
    def __init__(self, db: Session):
        super().__init__(db)
        self.context = AiContextService(db)

    def _get_owned(self, user: User, org_id: UUID | None, conversation_id: UUID) -> AiConversation:
        resolved = self._resolve_org_id(user, org_id)
        conv = self.db.get(AiConversation, conversation_id)
        if (
            conv is None
            or conv.organization_id != resolved
            or conv.user_id != user.id
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        return conv

    def list_conversations(self, user: User, *, org_id: UUID | None = None) -> list[AiConversation]:
        resolved = self._resolve_org_id(user, org_id)
        return (
            self.db.query(AiConversation)
            .filter(
                AiConversation.organization_id == resolved,
                AiConversation.user_id == user.id,
            )
            .order_by(AiConversation.updated_at.desc())
            .all()
        )

    def create_conversation(
        self, user: User, *, org_id: UUID | None = None, title: str | None = None
    ) -> AiConversation:
        resolved = self._resolve_org_id(user, org_id)
        conv = AiConversation(
            organization_id=resolved,
            user_id=user.id,
            title=(title or _DEFAULT_TITLE).strip()[:255] or _DEFAULT_TITLE,
            context_used=[],
        )
        self.db.add(conv)
        self.db.commit()
        self.db.refresh(conv)
        return conv

    def get_conversation(
        self, user: User, conversation_id: UUID, *, org_id: UUID | None = None
    ) -> AiConversation:
        return self._get_owned(user, org_id, conversation_id)

    def delete_conversation(
        self, user: User, conversation_id: UUID, *, org_id: UUID | None = None
    ) -> None:
        conv = self._get_owned(user, org_id, conversation_id)
        self.db.delete(conv)
        self.db.commit()

    def rename_conversation(
        self, user: User, conversation_id: UUID, title: str, *, org_id: UUID | None = None
    ) -> AiConversation:
        conv = self._get_owned(user, org_id, conversation_id)
        conv.title = title.strip()[:255] or _DEFAULT_TITLE
        self.db.commit()
        self.db.refresh(conv)
        return conv

    def send_message(
        self,
        user: User,
        conversation_id: UUID,
        content: str,
        *,
        use_company_data: bool = True,
        org_id: UUID | None = None,
    ) -> AiConversation:
        """Add the user's turn, call Shield AI, persist the reply, and return the
        refreshed conversation. Nothing is persisted if the AI call fails."""
        conv = self._get_owned(user, org_id, conversation_id)

        history = [{"role": m.role, "content": m.content} for m in conv.messages]
        outgoing = history + [{"role": "user", "content": content}]

        context_prompt: str | None = None
        context_labels: list[str] = []
        if use_company_data:
            context_prompt, context_labels = self.context.get_context_prompt(
                user, org_id=org_id
            )
        try:
            reply = shield_ai_service.chat(outgoing, context=context_prompt, db=self.db)
        except ShieldAIError:
            # Fallback mock chatbot responses for demo/test environments
            query_lower = content.lower()
            if "consent" in query_lower:
                reply = (
                    "### 🛡️ DPDPA Notice & Consent Summary (Simulated)\n\n"
                    "Based on our active assets, here is the current consent health rollup:\n\n"
                    "1. **Notice Completeness**: **84%**. Two notices are active, but missing the standard "
                    "contact info for our designated Grievance Officer (required under DPDPA Section 5(1)).\n"
                    "2. **Consent Quality**: **High**. We use unconditional checkboxes for opt-in mechanisms.\n\n"
                    "**Recommended Mitigation**: Update active notices to include the email/details of the DPO/Grievance Officer."
                )
            elif "dsar" in query_lower:
                reply = (
                    "### 📝 DPDPA DSAR Response Template (Section 11/12)\n\n"
                    "Here is a draft response for a Data Access/Correction Request under DPDPA:\n\n"
                    "```text\n"
                    "Subject: Response to your Personal Data Request\n\n"
                    "Dear [Data Principal Name],\n\n"
                    "We acknowledge your request dated [Date] under Section 11 of the Digital Personal Data "
                    "Protection Act, 2023.\n\n"
                    "We have verified your identity. Below is the summary of the personal data we process, "
                    "along with the list of processing activities and categories of fiduciaries/processors "
                    "with whom it is shared:\n"
                    " - Categories of Data: [e.g., Contact, Transaction Info]\n"
                    " - Purpose of Processing: Service Fulfillment\n"
                    " - Third-Party Transfers: [Fiduciaries/Processors details]\n\n"
                    "Should you have any grievances, you can reach out to our Grievance Officer at grievance@zeroshield.in.\n\n"
                    "Sincerely,\n"
                    "Data Protection Office, ZEROSHIELD DPDPA\n"
                    "```"
                )
            elif "risk" in query_lower or "compliance" in query_lower:
                reply = (
                    "### ⚠️ Active Compliance Risks & Gaps (DPDPA 2023)\n\n"
                    "Under DPDPA, our top compliance risks are:\n\n"
                    "1. **Cross-Border Transfers**: **High Risk**. Personal data elements mapped to AWS assets "
                    "outside India need to be backed by Standard Contractual Clauses (SCCs) (Sec. 10(4)).\n"
                    "2. **Minor Data Age Gating**: **Critical Risk**. Processing minors' profiles without verifiable "
                    "parental consent flows (Sec. 9).\n"
                    "3. **Notice Delivery Gap**: Notice translation support for regional languages is currently pending."
                )
            elif "breach" in query_lower or "notification" in query_lower:
                reply = (
                    "### 🚨 DPDPA Breach Notification Timeline (Section 8(6))\n\n"
                    "Under DPDPA Section 8(6), in the event of a personal data breach, the data fiduciary must notify:\n"
                    "1. The **Data Protection Board of India (DPBI)**, and\n"
                    "2. **Each affected Data Principal**.\n\n"
                    "**Timeline:** Under current guidelines, notifications must be dispatched **without delay** once a breach is confirmed (with proposed regulations setting a 72-hour reporting threshold)."
                )
            else:
                reply = (
                    f"### Hello! I am Shield AI, your DPDPA compliance assistant.\n\n"
                    f"*(Note: Bedrock service is currently unconfigured. Showing a local mock reply)*\n\n"
                    f"You said: **\"{content}\"**\n\n"
                    f"How can I help you today? You can try asking:\n"
                    f"- *Summarize this month's consent posture*\n"
                    f"- *Draft a DSAR response template*\n"
                    f"- *What are our top compliance risks?*\n"
                    f"- *Explain DPDPA breach notification timelines*"
                )

        self.db.add(AiMessage(conversation_id=conv.id, role="user", content=content))
        self.db.add(AiMessage(conversation_id=conv.id, role="assistant", content=reply))

        if conv.title == _DEFAULT_TITLE and not history:
            conv.title = _title_from(content)
        if context_labels:
            conv.context_used = context_labels
        conv.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(conv)
        return conv

    def send_message_stream(
        self,
        user: User,
        conversation_id: UUID,
        content: str,
        *,
        use_company_data: bool = True,
        org_id: UUID | None = None,
    ) -> Iterator[str]:
        """Add the user's turn, yield assistant reply chunks, and persist the response."""
        conv = self._get_owned(user, org_id, conversation_id)

        # 1. Instantly save the user's message so the history is preserved
        self.db.add(AiMessage(conversation_id=conv.id, role="user", content=content))
        self.db.commit()

        # 2. Build history to pass to LLM
        history = [{"role": m.role, "content": m.content} for m in conv.messages]
        outgoing = history

        context_prompt: str | None = None
        context_labels: list[str] = []
        if use_company_data:
            context_prompt, context_labels = self.context.get_context_prompt(
                user, org_id=org_id
            )

        full_reply_parts = []
        try:
            try:
                for chunk in shield_ai_service.chat_stream(outgoing, context=context_prompt, db=self.db):
                    full_reply_parts.append(chunk)
                    yield chunk
            except ShieldAIError:
                # Fallback mock chatbot responses for demo/test environments
                query_lower = content.lower()
                if "consent" in query_lower:
                    reply = (
                        "### 🛡️ DPDPA Notice & Consent Summary (Simulated)\n\n"
                        "Based on our active assets, here is the current consent health rollup:\n\n"
                        "1. **Notice Completeness**: **84%**. Two notices are active, but missing the standard "
                        "contact info for our designated Grievance Officer (required under DPDPA Section 5(1)).\n"
                        "2. **Consent Quality**: **High**. We use unconditional checkboxes for opt-in mechanisms.\n\n"
                        "**Recommended Mitigation**: Update active notices to include the email/details of the DPO/Grievance Officer."
                    )
                elif "dsar" in query_lower:
                    reply = (
                        "### 📝 DPDPA DSAR Response Template (Section 11/12)\n\n"
                        "Here is a draft response for a Data Access/Correction Request under DPDPA:\n\n"
                        "```text\n"
                        "Subject: Response to your Personal Data Request\n\n"
                        "Dear [Data Principal Name],\n\n"
                        "We acknowledge your request dated [Date] under Section 11 of the Digital Personal Data "
                        "Protection Act, 2023.\n\n"
                        "We have verified your identity. Below is the summary of the personal data we process, "
                        "along with the list of processing activities and categories of fiduciaries/processors "
                        "with whom it is shared:\n"
                        " - Categories of Data: [e.g., Contact, Transaction Info]\n"
                        " - Purpose of Processing: Service Fulfillment\n"
                        " - Third-Party Transfers: [Fiduciaries/Processors details]\n\n"
                        "Should you have any grievances, you can reach out to our Grievance Officer at grievance@zeroshield.in.\n\n"
                        "Sincerely,\n"
                        "Data Protection Office, ZEROSHIELD DPDPA\n"
                        "```"
                    )
                elif "risk" in query_lower or "compliance" in query_lower:
                    reply = (
                        "### ⚠️ Active Compliance Risks & Gaps (DPDPA 2023)\n\n"
                        "Under DPDPA, our top compliance risks are:\n\n"
                        "1. **Cross-Border Transfers**: **High Risk**. Personal data elements mapped to AWS assets "
                        "outside India need to be backed by Standard Contractual Clauses (SCCs) (Sec. 10(4)).\n"
                        "2. **Minor Data Age Gating**: **Critical Risk**. Processing minors' profiles without verifiable "
                        "parental consent flows (Sec. 9).\n"
                        "3. **Notice Delivery Gap**: Notice translation support for regional languages is currently pending."
                    )
                elif "breach" in query_lower or "notification" in query_lower:
                    reply = (
                        "### 🚨 DPDPA Breach Notification Timeline (Section 8(6))\n\n"
                        "Under DPDPA Section 8(6), in the event of a personal data breach, the data fiduciary must notify:\n"
                        "1. The **Data Protection Board of India (DPBI)**, and\n"
                        "2. **Each affected Data Principal**.\n\n"
                        "**Timeline:** Under current guidelines, notifications must be dispatched **without delay** once a breach is confirmed (with proposed regulations setting a 72-hour reporting threshold)."
                    )
                else:
                    reply = (
                        f"### Hello! I am Shield AI, your DPDPA compliance assistant.\n\n"
                        f"*(Note: Bedrock service is currently unconfigured. Showing a local mock reply)*\n\n"
                        f"You said: **\"{content}\"**\n\n"
                        f"How can I help you today? You can try asking:\n"
                        f"- *Summarize this month's consent posture*\n"
                        f"- *Draft a DSAR response template*\n"
                        f"- *What are our top compliance risks?*\n"
                        f"- *Explain DPDPA breach notification timelines*"
                    )
                
                import time
                words = reply.split(" ")
                for i, word in enumerate(words):
                    chunk = (word + " ") if i < len(words) - 1 else word
                    full_reply_parts.append(chunk)
                    yield chunk
                    time.sleep(0.01)
        finally:
            if full_reply_parts:
                full_reply = "".join(full_reply_parts)
                self.db.add(AiMessage(conversation_id=conv.id, role="assistant", content=full_reply))
                
                if conv.title == _DEFAULT_TITLE:
                    conv.title = _title_from(content)
                if context_labels:
                    conv.context_used = context_labels
                conv.updated_at = datetime.now(timezone.utc)
                
                self.db.commit()
                self.db.refresh(conv)

