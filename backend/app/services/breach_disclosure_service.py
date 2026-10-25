"""Breach disclosure wizard — 72h DPDPA Section 8(6) workflow."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rbac import Permission, default_assignee_for_role, has_permission
from app.models.compliance import (
    AuditEventType,
    AuditLogEntry,
    AuditSeverity,
    BreachIncident,
    BreachIncidentStatus,
    BreachNotification,
    BreachNotificationChannel,
)
from app.models.organization_settings import OrganizationSettings
from app.models.notice_delivery import NoticeDeliveryProvider
from app.models.user import User, UserRole
from app.schemas.compliance import (
    BreachAffectedVerifyRequest,
    BreachAffectedVerifyResult,
    BreachAssignRequest,
    BreachEscalateRequest,
    BreachIncidentCreate,
    BreachIncidentRead,
    BreachIncidentUpdate,
)
from app.services.audit_log_service import AuditLogService
from app.services.breach_email import send_breach_email
from app.services.compliance_base import ComplianceBaseService

BREACH_DEADLINE_HOURS = 72
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_SYSTEM_ACTORS = frozenset({"system", "noreply", "no-reply"})
_DATA_TYPE_SIGNALS: dict[str, tuple[str, ...]] = {
    "Name": ("name", "full name", "first name", "last name"),
    "Email": ("email", "e-mail"),
    "Phone": ("phone", "mobile", "telephone"),
    "Address": ("address", "postal", "zip code"),
    "Health records": ("health record", "medical record", "diagnosis", "health data"),
    "Prescriptions": ("prescription", "medication"),
    "Payment info": ("payment", "credit card", "bank account", "financial data"),
}
_SPECIAL_CATEGORY_SIGNALS: dict[str, tuple[str, ...]] = {
    "Children": ("child", "minor", "under 18"),
    "Health": ("health", "medical", "diagnosis", "prescription"),
    "Financial": ("financial", "payment", "bank", "credit card"),
    "Biometric": ("biometric", "fingerprint", "facial"),
    "Religious": ("religious", "religion", "caste"),
}


class BreachDisclosureService(ComplianceBaseService):
    def _generate_ref(self, org_id: UUID) -> str:
        year = datetime.now(timezone.utc).year
        count = (
            self.db.query(BreachIncident)
            .filter(BreachIncident.organization_id == org_id)
            .count()
        )
        return f"INC-{year}-{count + 1:04d}"

    def _to_read(self, incident: BreachIncident) -> BreachIncidentRead:
        now = datetime.now(timezone.utc)
        remaining = max(0, int((incident.deadline_at - now).total_seconds()))
        return BreachIncidentRead(
            id=incident.id,
            incident_ref=incident.incident_ref,
            status=incident.status.value,
            discovered_at=incident.discovered_at,
            deadline_at=incident.deadline_at,
            deadline_remaining_seconds=remaining,
            current_step=incident.current_step,
            severity=incident.severity,
            wizard_data=incident.wizard_data or {},
            submitted_at=incident.submitted_at,
            assigned_to_user_id=incident.assigned_to_user_id,
            escalated_to_user_id=incident.escalated_to_user_id,
            escalated_at=incident.escalated_at,
        )

    def list_incidents(
        self, user: User, *, org_id: UUID | None = None, business_unit_id: UUID | None = None
    ) -> list[BreachIncidentRead]:
        resolved = self._resolve_org_id(user, org_id)
        q = self.db.query(BreachIncident).filter(BreachIncident.organization_id == resolved)
        if business_unit_id:
            q = q.filter(BreachIncident.business_unit_id == business_unit_id)
        rows = q.order_by(BreachIncident.discovered_at.desc()).all()
        return [self._to_read(r) for r in rows]

    def get_incident(
        self, user: User, incident_id: UUID, *, org_id: UUID | None = None
    ) -> BreachIncidentRead:
        resolved = self._resolve_org_id(user, org_id)
        incident = (
            self.db.query(BreachIncident)
            .filter(BreachIncident.organization_id == resolved, BreachIncident.id == incident_id)
            .first()
        )
        if incident is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Breach incident not found")
        return self._to_read(incident)

    def get_active_draft(self, user: User, *, org_id: UUID | None = None) -> BreachIncidentRead | None:
        resolved = self._resolve_org_id(user, org_id)
        incident = (
            self.db.query(BreachIncident)
            .filter(
                BreachIncident.organization_id == resolved,
                BreachIncident.status == BreachIncidentStatus.draft,
            )
            .order_by(BreachIncident.created_at.desc())
            .first()
        )
        return self._to_read(incident) if incident else None

    def create_incident(
        self, user: User, body: BreachIncidentCreate | None = None, *, org_id: UUID | None = None
    ) -> BreachIncidentRead:
        if not has_permission(user, Permission.BREACH_LOG) and not has_permission(
            user, Permission.BREACH_TRIAGE
        ):
            self._require_admin(user)
        resolved = self._resolve_org_id(user, org_id)
        now = datetime.now(timezone.utc)
        wizard_data = body.wizard_data if body and body.wizard_data else {}

        source_dsar_id = wizard_data.get("source_dsar_request_id")
        if source_dsar_id:
            existing = (
                self.db.query(BreachIncident)
                .filter(BreachIncident.organization_id == resolved)
                .all()
            )
            for incident in existing:
                if (incident.wizard_data or {}).get("source_dsar_request_id") == source_dsar_id:
                    return self._to_read(incident)

        discovered = now
        if body and body.discovered_at is not None:
            discovered = body.discovered_at
            if discovered.tzinfo is None:
                discovered = discovered.replace(tzinfo=timezone.utc)

        incident = BreachIncident(
            organization_id=resolved,
            business_unit_id=body.business_unit_id if body else None,
            incident_ref=self._generate_ref(resolved),
            status=BreachIncidentStatus.draft,
            discovered_at=discovered,
            deadline_at=discovered + timedelta(hours=BREACH_DEADLINE_HOURS),
            current_step=1,
            severity=body.severity if body and body.severity else "medium",
            wizard_data=wizard_data,
            created_by_user_id=user.id,
        )
        security_assignee = default_assignee_for_role(
            self.db, resolved, UserRole.security_analyst
        )
        if security_assignee:
            incident.assigned_to_user_id = security_assignee
        self.db.add(incident)
        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action=f"Breach incident created: {incident.incident_ref}",
            details="72-hour DPDPA Section 8(6) notification clock started.",
            event_type=AuditEventType.breach,
            severity=AuditSeverity.critical,
            resource_type="breach_incident",
            resource_id=incident.incident_ref,
        )
        self.db.commit()
        self.db.refresh(incident)
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_user_by_id,
            notify_users_with_permission,
        )

        action_url = f"/breach/{incident.id}"
        title = f"Breach incident logged: {incident.incident_ref}"
        message = "A new breach incident has been created. The 72-hour notification clock is running."
        notify_users_with_permission(
            self.db,
            resolved,
            Permission.BREACH_TRIAGE,
            title=title,
            message=message,
            category=NotificationCategory.breach,
            action_url=action_url,
            severity=NotificationSeverity.critical,
            exclude_user_id=user.id,
        )
        if incident.assigned_to_user_id:
            notify_user_by_id(
                self.db,
                resolved,
                incident.assigned_to_user_id,
                title="Breach assigned to you",
                message=f"Incident {incident.incident_ref} has been assigned to you for triage.",
                category=NotificationCategory.breach,
                action_url=action_url,
                severity=NotificationSeverity.critical,
                exclude_user_id=user.id,
            )
        return self._to_read(incident)

    def update_incident(
        self,
        user: User,
        incident_id: UUID,
        body: BreachIncidentUpdate,
        *,
        org_id: UUID | None = None,
    ) -> BreachIncidentRead:
        if not has_permission(user, Permission.BREACH_TRIAGE):
            self._require_admin(user)
        resolved = self._resolve_org_id(user, org_id)
        incident = (
            self.db.query(BreachIncident)
            .filter(BreachIncident.organization_id == resolved, BreachIncident.id == incident_id)
            .first()
        )
        if incident is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Breach incident not found")
        if incident.status != BreachIncidentStatus.draft:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only draft incidents can be updated")
        if body.current_step is not None:
            incident.current_step = body.current_step
        if body.severity is not None:
            incident.severity = body.severity
        if body.wizard_data is not None:
            merged = dict(incident.wizard_data or {})
            merged.update(body.wizard_data)
            incident.wizard_data = merged
        self.db.commit()
        self.db.refresh(incident)
        return self._to_read(incident)

    def submit_incident(
        self, user: User, incident_id: UUID, *, org_id: UUID | None = None
    ) -> BreachIncidentRead:
        self._require_admin(user)
        resolved = self._resolve_org_id(user, org_id)
        incident = (
            self.db.query(BreachIncident)
            .filter(BreachIncident.organization_id == resolved, BreachIncident.id == incident_id)
            .first()
        )
        if incident is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Breach incident not found")
        now = datetime.now(timezone.utc)
        incident.status = BreachIncidentStatus.submitted
        incident.submitted_at = now
        incident.current_step = 5
        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action=f"Breach disclosure submitted: {incident.incident_ref}",
            details="DPB notification and data principal communications recorded.",
            event_type=AuditEventType.breach,
            severity=AuditSeverity.critical,
            resource_type="breach_incident",
            resource_id=incident.incident_ref,
        )
        self.db.commit()
        self.db.refresh(incident)
        return self._to_read(incident)

    def notify_dpb(
        self, user: User, incident_id: UUID, *, org_id: UUID | None = None
    ) -> dict[str, str]:
        self._require_admin(user)
        resolved = self._resolve_org_id(user, org_id)
        incident = self._get_incident_row(resolved, incident_id)
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == resolved)
            .first()
        )
        recipient = settings.dpo_email if settings and settings.dpo_email else "dpo@organization.local"
        data = incident.wizard_data or {}
        subject = f"[DPB Notification] Personal Data Breach — {incident.incident_ref}"
        body = data.get("incident_summary") or f"Breach incident {incident.incident_ref} requires DPB notification under Section 8(6)."
        
        # Wire with notice delivery infrastructure
        from app.services.notice_delivery_service import ProviderRegistry
        sent = False
        try:
            adapter = ProviderRegistry.get_adapter("email", self.db, resolved)
            res = adapter.send_notice({"email": recipient}, subject, body)
            sent = res["success"]
        except Exception:
            sent = send_breach_email(recipient, subject, body)

        now = datetime.now(timezone.utc)
        self.db.add(
            BreachNotification(
                incident_id=incident.id,
                channel=BreachNotificationChannel.dpb_email,
                recipient=recipient,
                subject=subject,
                body_snapshot=body,
                sent_at=now,
                email_sent=sent,
            )
        )
        self.db.commit()
        return {"message": "DPB notification sent" if sent else "DPB notification recorded (SMTP not configured)"}

    def notify_principals(
        self, user: User, incident_id: UUID, *, org_id: UUID | None = None
    ) -> dict[str, str]:
        self._require_admin(user)
        resolved = self._resolve_org_id(user, org_id)
        incident = self._get_incident_row(resolved, incident_id)
        data = incident.wizard_data or {}
        org_providers = (
            self.db.query(NoticeDeliveryProvider)
            .filter(NoticeDeliveryProvider.organization_id == resolved)
            .all()
        )
        org_settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == resolved)
            .first()
        )
        from app.services.notice_delivery_serializers import build_dp_notification_auto_config

        auto_config = build_dp_notification_auto_config(org_providers, org_settings)
        channels: list[str] = data.get("dp_channels") or auto_config.default_dp_channels
        subject = data.get("dp_email_subject") or f"Important notice — {incident.incident_ref}"
        body = data.get("dp_message_body") or (
            "We are writing to inform you of a personal data breach affecting your information."
        )
        contact = (data.get("dp_contact") or "").strip()
        if not contact and org_settings and org_settings.dpo_email:
            contact = org_settings.dpo_email.strip()
        phone = (data.get("dp_recipient_phone") or contact).strip()
        address = (data.get("dp_recipient_address") or contact).strip()

        from app.services.notice_delivery_service import ProviderRegistry
        from app.services.notice_provider_validation import configured_provider_for_channel

        sent_channels: list[str] = []
        failed_channels: list[str] = []
        simulated_channels: list[str] = []
        now = datetime.now(timezone.utc)

        for channel in channels:
            if channel != "in-app" and not configured_provider_for_channel(org_providers, channel):
                simulated_channels.append(channel)
                continue

            recipient_payload: dict[str, str] = {}
            fallback_recipient = contact or "affected@example.com"
            if channel == "email":
                recipient_payload = {
                    "email": contact if "@" in contact else fallback_recipient,
                }
            elif channel == "sms":
                recipient_payload = {"phone": phone}
            elif channel == "physical":
                recipient_payload = {"address": address}
            elif channel == "in-app":
                recipient_payload = {"email": contact if "@" in contact else fallback_recipient}
            else:
                failed_channels.append(channel)
                continue

            sent = False
            try:
                adapter = ProviderRegistry.get_adapter(channel, self.db, resolved)
                res = adapter.send_notice(recipient_payload, subject, body)
                sent = bool(res.get("success"))
            except HTTPException:
                if channel == "email" and configured_provider_for_channel(org_providers, "email"):
                    sent = False
                elif channel == "email":
                    sent = send_breach_email(recipient_payload.get("email", fallback_recipient), subject, body)
                else:
                    sent = False
            except Exception:
                if channel == "email" and not configured_provider_for_channel(org_providers, "email"):
                    sent = send_breach_email(recipient_payload.get("email", fallback_recipient), subject, body)
                else:
                    sent = False

            if sent:
                sent_channels.append(channel)
            elif channel == "email" and not contact:
                simulated_channels.append(channel)
            else:
                failed_channels.append(channel)

            if channel == "email":
                self.db.add(
                    BreachNotification(
                        incident_id=incident.id,
                        channel=BreachNotificationChannel.dp_email,
                        recipient=recipient_payload.get("email", fallback_recipient),
                        subject=subject,
                        body_snapshot=body,
                        sent_at=now,
                        email_sent=sent,
                    )
                )

        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action=f"Data principal breach notifications dispatched: {incident.incident_ref}",
            details=(
                f"Channels attempted: {', '.join(channels)}. "
                f"Sent: {', '.join(sent_channels) or 'none'}. "
                f"Failed: {', '.join(failed_channels) or 'none'}."
            ),
            event_type=AuditEventType.breach,
            severity=AuditSeverity.critical,
            resource_type="breach_incident",
            resource_id=incident.incident_ref,
        )
        self.db.commit()

        if sent_channels:
            return {
                "message": (
                    f"Data principal notification sent via {', '.join(sent_channels)}"
                    + (f"; failed: {', '.join(failed_channels)}" if failed_channels else "")
                )
            }
        if simulated_channels:
            return {"message": "Notification recorded (notice delivery provider not configured)"}
        return {
            "message": (
                "Notification dispatch failed — configure providers in Notice Delivery Channels"
                + (f" ({', '.join(failed_channels)})" if failed_channels else "")
            )
        }

    def _get_incident_row(self, org_id: UUID, incident_id: UUID) -> BreachIncident:
        incident = (
            self.db.query(BreachIncident)
            .filter(BreachIncident.organization_id == org_id, BreachIncident.id == incident_id)
            .first()
        )
        if incident is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Breach incident not found")
        return incident

    def _collect_principal_emails(self, entries: list[AuditLogEntry]) -> set[str]:
        principals: set[str] = set()
        for entry in entries:
            texts = (entry.action, entry.details, entry.actor_email)
            for text in texts:
                if not text:
                    continue
                for email in _EMAIL_RE.findall(text):
                    local = email.split("@", 1)[0].lower()
                    if local in _SYSTEM_ACTORS:
                        continue
                    principals.add(email.lower())
            if entry.event_type in (AuditEventType.breach, AuditEventType.access, AuditEventType.deletion):
                actor = (entry.actor_email or "").strip().lower()
                if actor and actor != "system" and "@" in actor:
                    local = actor.split("@", 1)[0]
                    if local not in _SYSTEM_ACTORS:
                        principals.add(actor)
        return principals

    def _infer_from_log_text(self, text: str, signals: dict[str, tuple[str, ...]]) -> list[str]:
        lower = text.lower()
        found: list[str] = []
        for label, keywords in signals.items():
            if label == "Email" and "@" in lower:
                found.append(label)
                continue
            if any(keyword in lower for keyword in keywords):
                found.append(label)
        return list(dict.fromkeys(found))

    def _infer_data_types_from_entries(self, entries: list[AuditLogEntry]) -> list[str]:
        blob = " ".join(f"{e.action} {e.details}" for e in entries)
        return self._infer_from_log_text(blob, _DATA_TYPE_SIGNALS)

    def _infer_special_categories_from_entries(self, entries: list[AuditLogEntry]) -> list[str]:
        blob = " ".join(f"{e.action} {e.details}" for e in entries)
        return self._infer_from_log_text(blob, _SPECIAL_CATEGORY_SIGNALS)

    def verify_affected_principals_from_logs(
        self,
        user: User,
        body: BreachAffectedVerifyRequest | None = None,
        *,
        org_id: UUID | None = None,
    ) -> BreachAffectedVerifyResult:
        resolved = self._resolve_org_id(user, org_id)
        audit = AuditLogService(self.db)
        audit.ensure_initialized(resolved)

        since = datetime.now(timezone.utc) - timedelta(days=90)
        severity = body.severity if body and body.severity else None
        incident_summary = body.incident_summary if body and body.incident_summary else None
        if body and body.incident_id:
            incident = self._get_incident_row(resolved, body.incident_id)
            since = incident.discovered_at - timedelta(days=7)
            severity = severity or incident.severity
            data = incident.wizard_data or {}
            incident_summary = incident_summary or data.get("incident_summary")

        entries = (
            self.db.query(AuditLogEntry)
            .filter(
                AuditLogEntry.organization_id == resolved,
                AuditLogEntry.occurred_at >= since,
            )
            .filter(
                or_(
                    AuditLogEntry.event_type.in_(
                        [AuditEventType.breach, AuditEventType.access, AuditEventType.deletion]
                    ),
                    AuditLogEntry.action.ilike("%breach%"),
                    AuditLogEntry.details.ilike("%breach%"),
                    AuditLogEntry.details.ilike("%unauthorized%"),
                    AuditLogEntry.details.ilike("%data principal%"),
                )
            )
            .order_by(AuditLogEntry.occurred_at.desc())
            .limit(500)
            .all()
        )

        principals = self._collect_principal_emails(entries)
        affected_count = len(principals)
        data_types = self._infer_data_types_from_entries(entries)
        special_categories = self._infer_special_categories_from_entries(entries)
        vajra_ai_used = False
        summary = (
            f"Found {affected_count} unique data principal(s) across {len(entries)} "
            "breach-related audit log entries."
        )

        if len(entries) == 0:
            summary = (
                "No breach-related audit log entries found for this organization "
                "in the analysis window."
            )
        elif settings.ai_configured:
            from app.services import vajra_ai_service

            log_text = "\n".join(
                f"- [{e.occurred_at.isoformat()}] {e.event_type.value}: {e.action} — {e.details[:240]}"
                for e in entries[:40]
            )
            allowed_types = ", ".join(_DATA_TYPE_SIGNALS.keys())
            allowed_categories = ", ".join(_SPECIAL_CATEGORY_SIGNALS.keys())
            task = (
                "Analyze these audit log excerpts for a personal data breach impact assessment.\n"
                f"Deterministic email scan found {affected_count} unique data principal(s).\n"
                f"Breach severity: {severity or 'unknown'}\n"
                f"Incident summary: {incident_summary or 'not provided'}\n\n"
                f"Audit log excerpts:\n{log_text}\n\n"
                "Estimate breach impact. Respond with ONLY a JSON object:\n"
                '{"affected_count": <integer>, "summary": "<one sentence>", '
                f'"data_types": [<subset of: {allowed_types}>], '
                f'"special_categories": [<subset of: {allowed_categories}>]}}'
            )
            try:
                raw = vajra_ai_service.generate(task=task, max_tokens=384)
                parsed = vajra_ai_service._parse_json_object(raw)
                ai_count = int(parsed.get("affected_count", affected_count))
                ai_summary = str(parsed.get("summary", "")).strip()
                if ai_count > 0:
                    affected_count = max(affected_count, ai_count)
                if ai_summary:
                    summary = ai_summary
                ai_types = parsed.get("data_types")
                if isinstance(ai_types, list):
                    merged = [*data_types]
                    for item in ai_types:
                        label = str(item).strip()
                        if label in _DATA_TYPE_SIGNALS and label not in merged:
                            merged.append(label)
                    data_types = merged
                ai_categories = parsed.get("special_categories")
                if isinstance(ai_categories, list):
                    merged = [*special_categories]
                    for item in ai_categories:
                        label = str(item).strip()
                        if label in _SPECIAL_CATEGORY_SIGNALS and label not in merged:
                            merged.append(label)
                    special_categories = merged
                vajra_ai_used = True
            except Exception:
                pass

        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action="Vajra AI breach impact verification",
            details=summary,
            event_type=AuditEventType.access,
            severity=AuditSeverity.info,
            resource_type="breach_incident",
            resource_id=str(body.incident_id) if body and body.incident_id else None,
        )
        self.db.commit()

        return BreachAffectedVerifyResult(
            affected_count=affected_count,
            log_entries_analyzed=len(entries),
            unique_principals_found=len(principals),
            summary=summary,
            vajra_ai_used=vajra_ai_used,
            data_types=data_types,
            special_categories=special_categories,
        )

    def assign_incident(
        self,
        user: User,
        incident_id: UUID,
        body: BreachAssignRequest,
        *,
        org_id: UUID | None = None,
    ) -> BreachIncidentRead:
        if not has_permission(user, Permission.BREACH_TRIAGE):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Breach triage access required")
        resolved = self._resolve_org_id(user, org_id)
        incident = self._get_incident_row(resolved, incident_id)
        assignee = self.db.get(User, body.assigned_to_user_id)
        if assignee is None or assignee.organization_id != resolved:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid assignee")
        incident.assigned_to_user_id = body.assigned_to_user_id
        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action=f"Breach assigned: {incident.incident_ref}",
            details=f"Assigned to {assignee.full_name}",
            event_type=AuditEventType.breach,
            severity=AuditSeverity.info,
            resource_type="breach_incident",
            resource_id=incident.incident_ref,
        )
        self.db.commit()
        self.db.refresh(incident)
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_user_by_id,
        )

        notify_user_by_id(
            self.db,
            resolved,
            body.assigned_to_user_id,
            title="Breach assigned to you",
            message=f"Incident {incident.incident_ref} has been assigned to you.",
            category=NotificationCategory.breach,
            action_url=f"/breach/{incident.id}",
            severity=NotificationSeverity.warning,
            exclude_user_id=user.id,
        )
        return self._to_read(incident)

    def escalate_incident(
        self,
        user: User,
        incident_id: UUID,
        body: BreachEscalateRequest,
        *,
        org_id: UUID | None = None,
    ) -> BreachIncidentRead:
        if not has_permission(user, Permission.BREACH_TRIAGE):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Breach triage access required")
        resolved = self._resolve_org_id(user, org_id)
        incident = self._get_incident_row(resolved, incident_id)
        ciso_id = body.escalated_to_user_id or default_assignee_for_role(
            self.db, resolved, UserRole.ciso
        )
        if ciso_id is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="No CISO user available for escalation",
            )
        ciso = self.db.get(User, ciso_id)
        if ciso is None or ciso.organization_id != resolved:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid CISO assignee")
        incident.escalated_to_user_id = ciso_id
        incident.escalated_at = datetime.now(timezone.utc)
        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action=f"Breach escalated to CISO: {incident.incident_ref}",
            details=f"Escalated to {ciso.full_name}",
            event_type=AuditEventType.breach,
            severity=AuditSeverity.critical,
            resource_type="breach_incident",
            resource_id=incident.incident_ref,
        )
        self.db.commit()
        self.db.refresh(incident)
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_user_by_id,
        )

        notify_user_by_id(
            self.db,
            resolved,
            ciso_id,
            title=f"Breach escalated: {incident.incident_ref}",
            message=f"A breach incident has been escalated to you for executive review.",
            category=NotificationCategory.breach,
            action_url=f"/breach/{incident.id}",
            severity=NotificationSeverity.critical,
            exclude_user_id=user.id,
        )
        return self._to_read(incident)

    def close_incident(
        self,
        user: User,
        incident_id: UUID,
        *,
        org_id: UUID | None = None,
    ) -> BreachIncidentRead:
        if not has_permission(user, Permission.BREACH_CLOSE):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="CISO approval required to close")
        resolved = self._resolve_org_id(user, org_id)
        incident = self._get_incident_row(resolved, incident_id)
        incident.status = BreachIncidentStatus.closed
        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action=f"Breach incident closed: {incident.incident_ref}",
            details="Incident closed by authorized approver",
            event_type=AuditEventType.breach,
            severity=AuditSeverity.info,
            resource_type="breach_incident",
            resource_id=incident.incident_ref,
        )
        self.db.commit()
        self.db.refresh(incident)
        return self._to_read(incident)
