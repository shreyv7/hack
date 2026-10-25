from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rbac import Permission, default_assignee_for_role, has_permission
from app.models.dsar import (
    DataRightType,
    DataRightsActivityAction,
    DataRightsActivityEvent,
    DataRightsReminderEvent,
    DataRightsRequest,
    DataRightsRequestStatus,
    ReminderType,
    VerificationStatus,
)
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import OrganizationSettings
from app.models.user import User, UserRole
from app.models.compliance import AuditEventType
from app.schemas.dsar import (
    DataRightsRequestBatchResult,
    DataRightsRequestBatchUpdate,
    DataRightsRequestRead,
    DataRightsRequestUpdate,
    DsarActivityEventRead,
    DsarActivityLogRead,
    DsarDashboardRead,
    PortalBrandingRead,
    PortalFormSchema,
    PortalFormUpdate,
    PortalFormsRead,
    PortalRequestCreate,
    PortalRequestCreated,
    SlaEngineRunResult,
    SlaMatrixRow,
    SlaMetricsRead,
    StatusCheckResponse,
)
from app.services.dsar_activity_service import (
    lookup_user_name,
    record_dsar_activity,
    status_label,
    user_display_name,
)
from app.services.dsar_email import (
    send_closure_email,
    send_otp_email,
    send_request_accepted_email,
    send_sla_reminder_email,
    send_status_update_email,
)
from app.services.dsar_portal_forms import (
    merge_stored_form,
    resolve_verification_method,
    validate_portal_form_schema,
)
from app.utils.industry_packs import is_banking_industry
from app.services.dsar_sms import (
    normalize_phone,
    send_closure_sms,
    send_otp_sms,
    send_request_accepted_sms,
    send_status_update_sms,
)
from app.utils.simple_pdf import text_to_pdf_bytes
from app.services.dsar_sla_config import DsarSlaConfig, load_dsar_sla_config
from app.utils.india_phone import PHONE_ERROR, try_normalize_india_phone

logger = logging.getLogger(__name__)

OTP_EXPIRY_MINUTES = 15
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_SENDS = 10

# SLA applies only after identity verification (formal receipt under DPDPA)
SLA_ACTIVE_STATUSES = {
    DataRightsRequestStatus.received,
    DataRightsRequestStatus.in_review,
    DataRightsRequestStatus.response_ready,
}

QUEUE_STATUSES = SLA_ACTIVE_STATUSES | {DataRightsRequestStatus.pending_verification}

RIGHT_TYPE_LABELS = {
    DataRightType.access: "Right to Access",
    DataRightType.correction: "Right to Correction",
    DataRightType.erasure: "Right to Erasure",
    DataRightType.nomination: "Nomination of Representative",
    DataRightType.grievance: "Grievance Redressal",
    DataRightType.withdraw_consent: "Consent Withdrawal",
    DataRightType.masking: "Data Masking Request",
    DataRightType.anonymization: "Data Anonymization Request",
}

STATUS_NOTIFY_MESSAGES = {
    DataRightsRequestStatus.in_review: "Your request is now being reviewed by our team.",
    DataRightsRequestStatus.response_ready: (
        "A response to your request is ready. We will contact you shortly with the outcome."
    ),
}


class DsarService:
    def __init__(self, db: Session):
        self.db = db

    def _compliance_audit(
        self,
        org_id: UUID,
        user: User | None,
        *,
        action: str,
        details: str = "",
        event_type: AuditEventType = AuditEventType.rights,
        resource_type: str | None = None,
        resource_id: str | None = None,
    ) -> None:
        from app.services.audit_events import record_audit_event

        record_audit_event(
            self.db,
            org_id,
            user=user,
            action=action,
            details=details,
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            commit=False,
        )

    def _ensure_org_accessible(self, org_id: UUID) -> Organization:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")
        return org

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="DSAR management requires an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="DSAR management requires an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _require_admin(self, user: User) -> None:
        if not has_permission(user, Permission.DSAR_ASSIGN) and user.role not in (
            UserRole.admin,
            UserRole.superadmin,
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")

    def _is_admin(self, user: User) -> bool:
        return user.role in (UserRole.admin, UserRole.superadmin) or has_permission(
            user, Permission.DSAR_ASSIGN
        )

    def _is_superadmin(self, user: User) -> bool:
        return user.role == UserRole.superadmin

    def _is_org_admin(self, user: User) -> bool:
        return user.role == UserRole.admin

    def _org_admin_can_access_request(self, user: User, req: DataRightsRequest) -> bool:
        return req.assigned_to_user_id is None or req.assigned_to_user_id == user.id

    def _can_access_dashboard(self, user: User) -> bool:
        return has_permission(user, Permission.DSAR_READ)

    def _can_assign_handler(self, user: User) -> bool:
        return has_permission(user, Permission.DSAR_ASSIGN)

    def _can_acknowledge_grievance(self, user: User) -> bool:
        return has_permission(user, Permission.GRIEVANCE_MANAGE)

    def _can_handle_request(self, user: User, req: DataRightsRequest) -> bool:
        if self._is_superadmin(user):
            return True
        if self._is_org_admin(user):
            return self._org_admin_can_access_request(user, req)
        if user.role == UserRole.grievance_officer and req.right_type == DataRightType.grievance:
            return True
        if has_permission(user, Permission.DSAR_LEGAL_DRAFT) and req.requires_legal_signoff:
            return True
        if user.role == UserRole.user:
            return (
                req.assigned_to_user_id == user.id
                and req.status
                in (
                    DataRightsRequestStatus.in_review,
                    DataRightsRequestStatus.response_ready,
                )
            )
        if has_permission(user, Permission.DSAR_WRITE) and user.role == UserRole.compliance_officer:
            return True
        return False

    def _right_type_label(self, right_type: DataRightType) -> str:
        return RIGHT_TYPE_LABELS.get(right_type, right_type.value)

    def _notify_request_accepted(self, req: DataRightsRequest) -> None:
        label = self._right_type_label(req.right_type)
        if req.verification_method == "sms" and req.requester_phone:
            send_request_accepted_sms(req.requester_phone, req.tracking_id)
        elif req.requester_email:
            send_request_accepted_email(req.requester_email, req.tracking_id, label)

    def _notify_status_change(self, req: DataRightsRequest, new_status: DataRightsRequestStatus) -> None:
        message = STATUS_NOTIFY_MESSAGES.get(new_status)
        if not message:
            return
        label = self._right_type_label(req.right_type)
        if req.verification_method == "sms" and req.requester_phone:
            send_status_update_sms(req.requester_phone, req.tracking_id, message)
        elif req.requester_email:
            send_status_update_email(req.requester_email, req.tracking_id, label, message)
        self._notify_internal_status_change(req, new_status)

    def _dsar_action_url(self, req: DataRightsRequest) -> str:
        if req.right_type == DataRightType.grievance:
            return "/rights/grievances"
        return "/rights/tracker"

    def _notify_internal_new_request(self, req: DataRightsRequest) -> None:
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_user_by_id,
            notify_users_by_roles,
            notify_users_with_permission,
        )

        label = self._right_type_label(req.right_type)
        action_url = self._dsar_action_url(req)
        title = f"New {label} request"
        message = f"Request {req.tracking_id} has been verified and is awaiting action."
        if req.right_type == DataRightType.grievance:
            notify_users_by_roles(
                self.db,
                req.organization_id,
                [UserRole.grievance_officer],
                title=title,
                message=message,
                category=NotificationCategory.dsar,
                action_url=action_url,
                severity=NotificationSeverity.warning,
            )
        else:
            notify_users_with_permission(
                self.db,
                req.organization_id,
                Permission.DSAR_ASSIGN,
                title=title,
                message=message,
                category=NotificationCategory.dsar,
                action_url=action_url,
            )
        if req.assigned_to_user_id:
            notify_user_by_id(
                self.db,
                req.organization_id,
                req.assigned_to_user_id,
                title="DSAR assigned to you",
                message=f"Request {req.tracking_id} has been assigned to you.",
                category=NotificationCategory.dsar,
                action_url=action_url,
                severity=NotificationSeverity.warning,
            )

    def _notify_internal_assignment(
        self,
        req: DataRightsRequest,
        *,
        assignee_id: UUID,
        actor_id: UUID | None = None,
    ) -> None:
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_user_by_id,
        )

        notify_user_by_id(
            self.db,
            req.organization_id,
            assignee_id,
            title="DSAR assigned to you",
            message=f"Request {req.tracking_id} has been assigned to you.",
            category=NotificationCategory.dsar,
            action_url=self._dsar_action_url(req),
            severity=NotificationSeverity.warning,
            exclude_user_id=actor_id,
        )

    def _notify_internal_status_change(
        self, req: DataRightsRequest, new_status: DataRightsRequestStatus
    ) -> None:
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_users_with_permission,
        )

        action_url = self._dsar_action_url(req)
        if new_status == DataRightsRequestStatus.response_ready:
            notify_users_with_permission(
                self.db,
                req.organization_id,
                Permission.DSAR_LEGAL_SIGNOFF,
                title="Legal sign-off required",
                message=f"Request {req.tracking_id} is ready for legal sign-off.",
                category=NotificationCategory.approval,
                action_url=action_url,
                severity=NotificationSeverity.warning,
            )
        elif new_status == DataRightsRequestStatus.in_review:
            notify_users_with_permission(
                self.db,
                req.organization_id,
                Permission.DSAR_LEGAL_DRAFT,
                title="Legal review needed",
                message=f"Request {req.tracking_id} is in review and may need a legal draft.",
                category=NotificationCategory.dsar,
                action_url=action_url,
            )

    def _notify_internal_sla_reminder(
        self, req: DataRightsRequest, rtype: ReminderType
    ) -> None:
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_user_by_id,
            notify_users_by_roles,
        )

        action_url = self._dsar_action_url(req)
        labels = {
            ReminderType.due_7d: "due in 7 days",
            ReminderType.due_3d: "due in 3 days",
            ReminderType.due_1d: "due tomorrow",
            ReminderType.overdue: "overdue",
            ReminderType.ack_due: "acknowledgement due soon",
            ReminderType.ack_overdue: "acknowledgement overdue",
        }
        label = labels.get(rtype, "approaching deadline")
        severity = (
            NotificationSeverity.critical
            if rtype in (ReminderType.overdue, ReminderType.ack_overdue)
            else NotificationSeverity.warning
        )
        title = f"SLA {label}: {req.tracking_id}"
        message = f"Data rights request {req.tracking_id} is {label}."
        if req.assigned_to_user_id:
            notify_user_by_id(
                self.db,
                req.organization_id,
                req.assigned_to_user_id,
                title=title,
                message=message,
                category=NotificationCategory.dsar,
                action_url=action_url,
                severity=severity,
            )
        if req.right_type == DataRightType.grievance:
            notify_users_by_roles(
                self.db,
                req.organization_id,
                [UserRole.grievance_officer],
                title=title,
                message=message,
                category=NotificationCategory.dsar,
                action_url=action_url,
                severity=severity,
                exclude_user_id=req.assigned_to_user_id,
            )

    def _notify_closure(self, req: DataRightsRequest, org_name: str, closure_text: str) -> None:
        pdf_bytes = text_to_pdf_bytes("Vajra — Closure Letter", closure_text)
        if req.requester_email:
            send_closure_email(req.requester_email, req.tracking_id, closure_text, pdf_bytes)
        if req.verification_method == "sms" and req.requester_phone:
            send_closure_sms(req.requester_phone, req.tracking_id)

    def _require_portal_form_editor(self, user: User) -> None:
        if not has_permission(user, Permission.DSAR_WRITE) and user.role not in (
            UserRole.admin,
            UserRole.user,
        ):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Only authorized roles can customize portal forms",
            )

    def _get_settings(self, org_id: UUID) -> OrganizationSettings | None:
        return (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )

    def _ensure_settings(self, org_id: UUID) -> OrganizationSettings:
        row = self._get_settings(org_id)
        if row is not None:
            return row
        row = OrganizationSettings(organization_id=org_id)
        self.db.add(row)
        self.db.flush()
        return row

    def _check_legitimate_use_conflict(self, org_id: UUID) -> str | None:
        """Return a warning note if the org processes data under legitimate use."""
        from app.models.consent import Purpose, PurposeVersion, LegalBasis
        legit_count = (
            self.db.query(PurposeVersion)
            .join(Purpose, Purpose.current_live_version_id == PurposeVersion.id)
            .filter(
                Purpose.organization_id == org_id,
                PurposeVersion.legal_basis == LegalBasis.legitimate_use,
                Purpose.archived_at.is_(None),
            )
            .count()
        )
        if legit_count > 0:
            return (
                f"⚠️ This organisation processes data under Legitimate Use for {legit_count} purpose(s). "
                "Erasure may be refused where the controller's legitimate interest overrides the data "
                "principal's rights — conduct a balancing test before completing this request (DPDPA §7)."
            )
        return None

    def _stored_portal_forms(self, org_id: UUID) -> dict:
        row = self._get_settings(org_id)
        if not row or not row.dsar_portal_forms:
            return {}
        stored = row.dsar_portal_forms
        return stored if isinstance(stored, dict) else {}

    def _form_to_schema(self, right_type: DataRightType, data: dict) -> PortalFormSchema:
        return PortalFormSchema(
            right_type=right_type,
            help_text=data.get("help_text", ""),
            fields=data.get("fields", []),
        )

    def _is_banking_org(self, org_id: UUID) -> bool:
        row = self._get_settings(org_id)
        return bool(row and is_banking_industry(row.primary_industry))

    def get_portal_form_public(self, org_slug: str, right_type: DataRightType) -> PortalFormSchema:
        org = self._get_org_by_slug(org_slug)
        stored = self._stored_portal_forms(org.id).get(right_type.value)
        merged = merge_stored_form(
            right_type, stored, banking=self._is_banking_org(org.id)
        )
        return self._form_to_schema(right_type, merged)

    def list_portal_forms(self, user: User, org_id: UUID | None = None) -> PortalFormsRead:
        resolved = self._resolve_org_id(user, org_id)
        stored_all = self._stored_portal_forms(resolved)
        banking = self._is_banking_org(resolved)
        forms = [
            self._form_to_schema(
                rt,
                merge_stored_form(rt, stored_all.get(rt.value), banking=banking),
            )
            for rt in DataRightType
            if rt != DataRightType.objection
        ]
        return PortalFormsRead(forms=forms)

    def update_portal_form(
        self,
        user: User,
        right_type: DataRightType,
        body: PortalFormUpdate,
        org_id: UUID | None = None,
    ) -> PortalFormSchema:
        self._require_portal_form_editor(user)
        resolved = self._resolve_org_id(user, org_id)
        normalized = validate_portal_form_schema(
            {
                "right_type": right_type.value,
                "help_text": body.help_text,
                "fields": [f.model_dump() for f in body.fields],
            }
        )
        settings_row = self._ensure_settings(resolved)
        all_forms = dict(settings_row.dsar_portal_forms or {})
        all_forms[right_type.value] = {
            "help_text": normalized["help_text"],
            "fields": normalized["fields"],
        }
        settings_row.dsar_portal_forms = all_forms
        self._compliance_audit(
            resolved,
            user,
            action=f"DSAR portal form updated: {right_type.value}",
            details="Public data-rights portal form schema changed",
            event_type=AuditEventType.configuration,
            resource_type="dsar_portal_form",
            resource_id=right_type.value,
        )
        self.db.commit()
        return self._form_to_schema(right_type, merge_stored_form(right_type, all_forms[right_type.value]))

    def _get_org_by_slug(self, org_slug: str) -> Organization:
        normalized_slug = org_slug.strip().lower()
        org = (
            self.db.query(Organization)
            .filter(Organization.slug == normalized_slug)
            .first()
        )
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")
        return org

    def _hash_otp(self, otp: str, tracking_id: str) -> str:
        payload = f"{otp}:{tracking_id}:{settings.SECRET_KEY}"
        return hashlib.sha256(payload.encode()).hexdigest()

    def _generate_otp(self) -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    def _generate_tracking_id(self) -> str:
        year = datetime.now(timezone.utc).year
        suffix = secrets.token_hex(3).upper()
        return f"REQ-{year}-{suffix}"

    def _org_settings(self, org_id: UUID) -> OrganizationSettings | None:
        return (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )

    def _sla_config(self, org_id: UUID) -> DsarSlaConfig:
        return load_dsar_sla_config(self._org_settings(org_id))

    def _sla_days(self, org_id: UUID, right_type: DataRightType) -> int:
        cfg = self._sla_config(org_id)
        if right_type == DataRightType.withdraw_consent:
            return max(1, (cfg.withdraw_consent_hours + 23) // 24)
        return cfg.resolve_days(right_type)

    def _sla_label(self, org_id: UUID, right_type: DataRightType) -> str:
        cfg = self._sla_config(org_id)
        if right_type == DataRightType.grievance:
            return f"{cfg.grievance_ack_hours}h ack · {cfg.grievance_resolve_days}d resolve"
        if right_type == DataRightType.withdraw_consent:
            return f"{cfg.withdraw_consent_hours}h"
        days = cfg.resolve_days(right_type)
        return f"{days} days"

    def _start_sla_clock(self, req: DataRightsRequest, received_at: datetime) -> None:
        cfg = self._sla_config(req.organization_id)
        req.received_at = received_at
        req.due_at = cfg.response_due_at(req.right_type, received_at)
        req.breached_at = None
        req.ack_due_at = None
        req.acknowledged_at = None
        req.ack_breached_at = None
        if req.right_type == DataRightType.grievance:
            req.ack_due_at = cfg.grievance_ack_due_at(received_at)

    def _acknowledge_grievance(self, req: DataRightsRequest, now: datetime) -> None:
        if req.right_type != DataRightType.grievance:
            return
        if req.acknowledged_at is None:
            req.acknowledged_at = now

    def _days_remaining(self, due_at: datetime | None, now: datetime | None = None) -> int | None:
        if due_at is None:
            return None
        now = now or datetime.now(timezone.utc)
        delta = due_at - now
        return max(0, int(delta.total_seconds() // 86400))

    def _hours_remaining(self, due_at: datetime | None, now: datetime | None = None) -> int | None:
        if due_at is None:
            return None
        now = now or datetime.now(timezone.utc)
        delta = due_at - now
        return max(0, int(delta.total_seconds() // 3600))

    def _is_ack_overdue(self, req: DataRightsRequest, now: datetime) -> bool:
        if req.right_type != DataRightType.grievance:
            return False
        if req.acknowledged_at is not None:
            return False
        return req.ack_due_at is not None and now > req.ack_due_at

    def _is_response_overdue(self, req: DataRightsRequest, now: datetime) -> bool:
        if req.status not in SLA_ACTIVE_STATUSES:
            return False
        if req.due_at is None:
            return False
        return req.breached_at is not None or now > req.due_at

    def _sla_bucket(self, req: DataRightsRequest, now: datetime | None = None) -> str:
        if req.status == DataRightsRequestStatus.completed:
            return "completed"
        if req.status == DataRightsRequestStatus.pending_verification:
            return "pending_verification"
        now = now or datetime.now(timezone.utc)
        if self._is_ack_overdue(req, now) or req.ack_breached_at is not None:
            return "ack_breached"
        if self._is_response_overdue(req, now):
            return "breached"
        if req.due_at is None:
            return "on_track"
        remaining = (req.due_at - now).total_seconds()
        days = remaining / 86400
        if days <= 1:
            return "due_24h"
        if days <= 7:
            return "due_7d"
        return "on_track"

    def _to_read(self, req: DataRightsRequest) -> DataRightsRequestRead:
        now = datetime.now(timezone.utc)
        in_sla = req.status in SLA_ACTIVE_STATUSES
        days = self._days_remaining(req.due_at, now) if in_sla else None
        ack_hours = None
        if (
            in_sla
            and req.right_type == DataRightType.grievance
            and req.acknowledged_at is None
        ):
            ack_hours = self._hours_remaining(req.ack_due_at, now)
        if self._is_response_overdue(req, now) or self._is_ack_overdue(req, now):
            days = None
        return DataRightsRequestRead(
            id=req.id,
            tracking_id=req.tracking_id,
            right_type=req.right_type,
            requester_name=req.requester_name,
            requester_email=req.requester_email,
            requester_phone=req.requester_phone,
            request_details=req.request_details,
            extra_data=req.extra_data or {},
            verification_status=req.verification_status,
            status=req.status,
            received_at=req.received_at,
            due_at=req.due_at,
            breached_at=req.breached_at,
            ack_due_at=req.ack_due_at,
            acknowledged_at=req.acknowledged_at,
            ack_breached_at=req.ack_breached_at,
            assigned_to_user_id=req.assigned_to_user_id,
            requires_legal_signoff=bool(req.requires_legal_signoff),
            legal_signed_off_by_user_id=req.legal_signed_off_by_user_id,
            closure_text=req.closure_text,
            resolved_at=req.resolved_at,
            created_at=req.created_at,
            updated_at=req.updated_at,
            days_remaining=days,
            ack_hours_remaining=ack_hours,
            sla_bucket=self._sla_bucket(req, now),
            sla_days=self._sla_days(req.organization_id, req.right_type),
        )

    def _get_request_by_tracking(
        self, org_id: UUID, tracking_id: str
    ) -> DataRightsRequest:
        req = (
            self.db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == org_id,
                DataRightsRequest.tracking_id == tracking_id,
            )
            .first()
        )
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Request not found")
        return req

    def _mask_contact(self, req: DataRightsRequest) -> str:
        if req.verification_method == "sms" and req.requester_phone:
            phone = req.requester_phone
            if len(phone) > 4:
                return f"{'*' * (len(phone) - 4)}{phone[-4:]}"
            return phone
        if req.requester_email:
            email = req.requester_email
            local, _, domain = email.partition("@")
            if len(local) <= 2:
                masked_local = local[0] + "*" if local else "*"
            else:
                masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
            return f"{masked_local}@{domain}"
        return "your contact"

    def _contact_matches(
        self, req: DataRightsRequest, *, email: str | None, phone: str | None
    ) -> bool:
        if req.verification_method == "sms":
            if not phone or not req.requester_phone:
                return False
            return normalize_phone(req.requester_phone) == normalize_phone(phone)
        if not email or not req.requester_email:
            return False
        return req.requester_email.lower() == email.lower().strip()

    def _assert_contact_matches(
        self, req: DataRightsRequest, *, email: str | None, phone: str | None
    ) -> None:
        if not self._contact_matches(req, email=email, phone=phone):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Contact details do not match this request",
            )

    def _issue_otp(self, req: DataRightsRequest) -> None:
        now = datetime.now(timezone.utc)
        if req.last_otp_sent_at and req.otp_sent_count > 0:
            elapsed = (now - req.last_otp_sent_at).total_seconds()
            if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Please wait before requesting another code",
                )
        if req.otp_sent_count >= OTP_MAX_SENDS:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Maximum verification attempts exceeded. Contact the DPO.",
            )

        otp = self._generate_otp()
        req.otp_code_hash = self._hash_otp(otp, req.tracking_id)
        req.otp_expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
        req.otp_sent_count += 1
        req.last_otp_sent_at = now
        if req.verification_method == "sms":
            if not req.requester_phone:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="Phone number required for SMS verification",
                )
            send_otp_sms(req.requester_phone, otp)
        else:
            if not req.requester_email:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="Email required for email verification",
                )
            send_otp_email(req.requester_email, otp)

    def get_portal_branding(self, org_slug: str) -> PortalBrandingRead:
        org = self._get_org_by_slug(org_slug)
        settings_row = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org.id)
            .first()
        )
        dpo_email = settings_row.dpo_email if settings_row else None
        return PortalBrandingRead(
            organization_name=org.name,
            organization_slug=org.slug,
            dpo_name=settings_row.dpo_name if settings_row else None,
            dpo_email=dpo_email,
            contact_email=dpo_email,
        )

    def create_portal_request(
        self, org_slug: str, body: PortalRequestCreate
    ) -> PortalRequestCreated:
        org = self._get_org_by_slug(org_slug)
        form = merge_stored_form(
            body.right_type,
            self._stored_portal_forms(org.id).get(body.right_type.value),
            banking=self._is_banking_org(org.id),
        )
        email = body.requester_email.lower().strip() if body.requester_email else None
        phone = body.requester_phone
        extra_data = dict(body.extra_data)
        for field in form.get("fields", []):
            if field.get("type") != "tel":
                continue
            key = field.get("key")
            if not key or key in {
                "requester_name",
                "requester_email",
                "requester_phone",
                "request_details",
            }:
                continue
            if key in extra_data and extra_data[key]:
                try:
                    extra_data[key] = try_normalize_india_phone(str(extra_data[key]))
                except ValueError as exc:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail=f"{field.get('label', key)}: {PHONE_ERROR}",
                    ) from exc
        verification_method = resolve_verification_method(
            form,
            requested=body.verification_method,
            has_email=bool(email),
            has_phone=bool(phone),
        )

        tracking_id = self._generate_tracking_id()
        while (
            self.db.query(DataRightsRequest)
            .filter(DataRightsRequest.tracking_id == tracking_id)
            .first()
        ):
            tracking_id = self._generate_tracking_id()

        req = DataRightsRequest(
            organization_id=org.id,
            tracking_id=tracking_id,
            right_type=body.right_type,
            requester_name=body.requester_name.strip(),
            requester_email=email,
            requester_phone=phone,
            request_details=body.request_details.strip(),
            extra_data=extra_data,
            verification_method=verification_method,
            verification_status=VerificationStatus.unverified,
            status=DataRightsRequestStatus.pending_verification,
            due_at=None,
        )
        if not email:
            req.requester_email = None
        self.db.add(req)
        self.db.flush()
        record_dsar_activity(
            self.db,
            req,
            DataRightsActivityAction.request_created,
            actor_name=req.requester_name,
            message=(
                f"Request submitted via public portal "
                f"({req.verification_method} verification)"
            ),
            metadata={"verification_method": req.verification_method},
        )
        # Check legitimate use conflict and add system note
        if body.right_type == DataRightType.erasure:
            conflict_note = self._check_legitimate_use_conflict(org.id)
            if conflict_note:
                record_dsar_activity(
                    self.db,
                    req,
                    DataRightsActivityAction.status_changed,
                    actor_name="System",
                    message=conflict_note,
                )
        self._compliance_audit(
            org.id,
            None,
            action=f"DSAR request created: {req.tracking_id}",
            details=f"Right type: {req.right_type.value}, submitted via public portal",
            resource_type="dsar_request",
            resource_id=req.tracking_id,
        )
        self._issue_otp(req)
        self.db.commit()
        self.db.refresh(req)
        self._dispatch_data_rights_webhook(req, org.id, "data-rights.request_created")

        channel = "phone" if verification_method == "sms" else "email"
        return PortalRequestCreated(
            tracking_id=req.tracking_id,
            status=req.status,
            verification_required=True,
            verification_method=verification_method,
            contact_hint=self._mask_contact(req),
            message=f"Request created. Check your {channel} for a verification code.",
        )

    def verify_otp(
        self,
        org_slug: str,
        tracking_id: str,
        otp_code: str,
        *,
        email: str | None = None,
        phone: str | None = None,
    ) -> tuple[bool, str]:
        org = self._get_org_by_slug(org_slug)
        req = self._get_request_by_tracking(org.id, tracking_id)
        self._assert_contact_matches(req, email=email, phone=phone)

        now = datetime.now(timezone.utc)
        if req.otp_attempts >= OTP_MAX_ATTEMPTS:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Too many failed attempts. Request a new code via status check.",
            )
        if not req.otp_code_hash or not req.otp_expires_at or now > req.otp_expires_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Verification code expired")

        if self._hash_otp(otp_code.strip(), tracking_id) != req.otp_code_hash:
            req.otp_attempts += 1
            self.db.commit()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")

        req.verification_status = VerificationStatus.verified
        req.otp_code_hash = None
        req.otp_expires_at = None
        if req.status == DataRightsRequestStatus.pending_verification:
            req.status = DataRightsRequestStatus.received
            self._start_sla_clock(req, now)
            if req.right_type == DataRightType.grievance:
                assignee_id = default_assignee_for_role(
                    self.db, org.id, UserRole.grievance_officer
                )
                if assignee_id:
                    req.assigned_to_user_id = assignee_id
        record_dsar_activity(
            self.db,
            req,
            DataRightsActivityAction.identity_verified,
            actor_name=req.requester_name,
            message="Identity verified; request received and SLA clock started",
            metadata={"status": DataRightsRequestStatus.received.value},
        )
        self._compliance_audit(
            org.id,
            None,
            action=f"DSAR identity verified: {req.tracking_id}",
            details="Public portal OTP verification succeeded",
            event_type=AuditEventType.access,
            resource_type="dsar_request",
            resource_id=req.tracking_id,
        )
        self.db.commit()
        self.db.refresh(req)
        self._dispatch_data_rights_webhook(req, org.id, "data-rights.request_received")
        self._notify_request_accepted(req)
        self._notify_internal_new_request(req)
        return True, "Identity verified. Your request has been accepted."

    def resend_otp(
        self,
        org_slug: str,
        tracking_id: str,
        *,
        email: str | None = None,
        phone: str | None = None,
    ) -> str:
        org = self._get_org_by_slug(org_slug)
        req = self._get_request_by_tracking(org.id, tracking_id)
        self._assert_contact_matches(req, email=email, phone=phone)
        self._issue_otp(req)
        self.db.commit()
        return "Verification code sent."

    def status_check(
        self,
        org_slug: str,
        tracking_id: str,
        *,
        email: str | None = None,
        phone: str | None = None,
    ) -> StatusCheckResponse:
        org = self._get_org_by_slug(org_slug)
        req = self._get_request_by_tracking(org.id, tracking_id)
        self._assert_contact_matches(req, email=email, phone=phone)

        if req.verification_status != VerificationStatus.verified:
            now = datetime.now(timezone.utc)
            otp_still_valid = (
                req.otp_code_hash is not None
                and req.otp_expires_at is not None
                and now <= req.otp_expires_at
            )
            if not otp_still_valid:
                self._issue_otp(req)
                self.db.commit()
            channel = "phone" if req.verification_method == "sms" else "email"
            return StatusCheckResponse(
                tracking_id=req.tracking_id,
                right_type=req.right_type,
                status=req.status,
                verification_status=req.verification_status,
                verification_required=True,
                verification_method=req.verification_method,
                message=f"Enter the verification code sent to your {channel}.",
            )

        now = datetime.now(timezone.utc)
        breached = self._is_response_overdue(req, now) or self._is_ack_overdue(req, now)
        days = self._days_remaining(req.due_at, now) if req.status in SLA_ACTIVE_STATUSES else None

        return StatusCheckResponse(
            tracking_id=req.tracking_id,
            right_type=req.right_type,
            status=req.status,
            verification_status=req.verification_status,
            verification_required=False,
            verification_method=req.verification_method,
            due_at=req.due_at,
            breached=breached,
            days_remaining=days,
            ack_due_at=req.ack_due_at,
            acknowledged=req.acknowledged_at is not None,
            closure_available=req.status == DataRightsRequestStatus.completed and bool(req.closure_text),
            message=self._status_message(req),
        )

    def _status_message(self, req: DataRightsRequest) -> str:
        labels = {
            DataRightsRequestStatus.pending_verification: (
                "Awaiting SMS verification"
                if req.verification_method == "sms"
                else "Awaiting email verification"
            ),
            DataRightsRequestStatus.received: "Request received and queued for review",
            DataRightsRequestStatus.in_review: "Your request is being reviewed",
            DataRightsRequestStatus.response_ready: "Response is ready — you will be contacted shortly",
            DataRightsRequestStatus.completed: "Request completed",
            DataRightsRequestStatus.rejected: "Request could not be fulfilled — see closure letter",
        }
        return labels.get(req.status, "Unknown status")

    def get_request(
        self,
        user: User,
        request_id: UUID,
        *,
        org_id: UUID | None = None,
    ) -> DataRightsRequestRead:
        org_id = self._resolve_org_id(user, org_id)
        if not self._can_access_dashboard(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        req = self.db.get(DataRightsRequest, request_id)
        if req is None or req.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Request not found")
        if self._is_org_admin(user) and not self._org_admin_can_access_request(user, req):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        if user.role == UserRole.user and req.assigned_to_user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        return self._to_read(req)

    def get_dashboard(
        self,
        user: User,
        *,
        org_id: UUID | None = None,
        status_filter: DataRightsRequestStatus | None = None,
        right_type: DataRightType | None = None,
        business_unit_id: UUID | None = None,
        since: datetime | None = None,
    ) -> DsarDashboardRead:
        org_id = self._resolve_org_id(user, org_id)
        if not self._can_access_dashboard(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")

        q = self.db.query(DataRightsRequest).filter(
            DataRightsRequest.organization_id == org_id,
            DataRightsRequest.status != DataRightsRequestStatus.pending_verification,
        )
        if self._is_org_admin(user):
            q = q.filter(
                or_(
                    DataRightsRequest.assigned_to_user_id.is_(None),
                    DataRightsRequest.assigned_to_user_id == user.id,
                )
            )
        elif user.role == UserRole.user:
            q = q.filter(DataRightsRequest.assigned_to_user_id == user.id)
        if status_filter:
            q = q.filter(DataRightsRequest.status == status_filter)
        if right_type:
            q = q.filter(DataRightsRequest.right_type == right_type)
        if business_unit_id:
            q = q.filter(DataRightsRequest.business_unit_id == business_unit_id)
        if since is not None:
            q = q.filter(DataRightsRequest.received_at >= since)
        requests = q.order_by(DataRightsRequest.due_at.asc()).all()

        now = datetime.now(timezone.utc)
        metrics = SlaMetricsRead()
        active = [r for r in requests if r.status in SLA_ACTIVE_STATUSES]
        metrics.total_active = len(active)
        for r in active:
            bucket = self._sla_bucket(r, now)
            if bucket == "ack_breached":
                metrics.ack_overdue += 1
            elif bucket == "breached":
                metrics.breached += 1
            elif bucket == "due_24h":
                metrics.due_24h += 1
            elif bucket == "due_7d":
                metrics.due_7d += 1
            else:
                metrics.on_track += 1

        matrix = self._build_matrix(org_id) if self._is_admin(user) else []
        breached = [
            self._to_read(r)
            for r in requests
            if self._sla_bucket(r, now) in ("breached", "ack_breached")
        ]

        return DsarDashboardRead(
            metrics=metrics,
            matrix=matrix,
            requests=[self._to_read(r) for r in requests],
            breached_requests=breached,
        )

    def _build_matrix(self, org_id: UUID) -> list[SlaMatrixRow]:
        breach_cond = or_(
            DataRightsRequest.breached_at.isnot(None),
            DataRightsRequest.ack_breached_at.isnot(None),
        )
        agg_rows = (
            self.db.query(
                DataRightsRequest.right_type,
                func.count(DataRightsRequest.id).label("total"),
                func.sum(case((breach_cond, 1), else_=0)).label("breaches"),
            )
            .filter(DataRightsRequest.organization_id == org_id)
            .group_by(DataRightsRequest.right_type)
            .all()
        )
        agg_by_type = {row.right_type: row for row in agg_rows}

        completed_rows = (
            self.db.query(
                DataRightsRequest.right_type,
                DataRightsRequest.received_at,
                DataRightsRequest.resolved_at,
            )
            .filter(
                DataRightsRequest.organization_id == org_id,
                DataRightsRequest.status == DataRightsRequestStatus.completed,
                DataRightsRequest.resolved_at.isnot(None),
                DataRightsRequest.received_at.isnot(None),
            )
            .all()
        )
        avg_by_type: dict[DataRightType, list[float]] = {}
        for rt, received_at, resolved_at in completed_rows:
            avg_by_type.setdefault(rt, []).append(
                (resolved_at - received_at).total_seconds() / 86400
            )

        rows: list[SlaMatrixRow] = []
        for rt in DataRightType:
            stat = agg_by_type.get(rt)
            total = int(stat.total) if stat else 0
            breaches = int(stat.breaches or 0) if stat else 0
            deltas = avg_by_type.get(rt, [])
            avg_days = round(sum(deltas) / len(deltas), 1) if deltas else None
            success = round((total - breaches) / total * 100, 1) if total > 0 else None
            rows.append(
                SlaMatrixRow(
                    right_type=rt,
                    sla_days=self._sla_days(org_id, rt),
                    sla_label=self._sla_label(org_id, rt),
                    avg_response_days=avg_days,
                    success_rate=success,
                    breaches=breaches,
                    total=total,
                )
            )
        return rows

    def update_request(
        self,
        user: User,
        request_id: UUID,
        body: DataRightsRequestUpdate,
        org_id: UUID | None = None,
        *,
        commit: bool = True,
    ) -> DataRightsRequestRead:
        org_id = self._resolve_org_id(user, org_id)
        req = self.db.get(DataRightsRequest, request_id)
        if req is None or req.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Request not found")
        if self._is_org_admin(user):
            if not self._org_admin_can_access_request(user, req):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        elif self._is_superadmin(user):
            pass
        elif self._can_handle_request(user, req):
            if body.assigned_to_user_id is not None or body.acknowledge_grievance:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Only admins can assign handlers or acknowledge grievances",
                )
            if body.status is None:
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        else:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        if body.assigned_to_user_id is not None and not self._can_assign_handler(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only admins can assign handlers")
        if body.status is not None and body.status == DataRightsRequestStatus.received:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot move request back to received")

        now = datetime.now(timezone.utc)
        previous_status = req.status
        previous_assignee_id = req.assigned_to_user_id
        previously_acknowledged = req.acknowledged_at is not None
        if body.status is not None:
            req.status = body.status
            if body.status == DataRightsRequestStatus.in_review:
                self._acknowledge_grievance(req, now)
        if body.assigned_to_user_id is not None:
            req.assigned_to_user_id = body.assigned_to_user_id or None
        if body.acknowledge_grievance:
            if not self._can_acknowledge_grievance(user) and not self._is_admin(user):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Grievance officer access required")
            self._acknowledge_grievance(req, now)
        if body.requires_legal_signoff is not None:
            if not has_permission(user, Permission.DSAR_LEGAL_DRAFT) and not self._is_admin(user):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Legal review access required")
            req.requires_legal_signoff = body.requires_legal_signoff

        if body.assigned_to_user_id is not None and req.assigned_to_user_id != previous_assignee_id:
            if req.assigned_to_user_id is None:
                record_dsar_activity(
                    self.db,
                    req,
                    DataRightsActivityAction.unassigned,
                    actor=user,
                    message=f"Handler unassigned by {user_display_name(user)}",
                    metadata={"previous_assignee_id": str(previous_assignee_id)},
                )
            else:
                assignee = self.db.get(User, req.assigned_to_user_id)
                record_dsar_activity(
                    self.db,
                    req,
                    DataRightsActivityAction.assigned,
                    actor=user,
                    assignee=assignee,
                    assignee_name=lookup_user_name(self.db, req.assigned_to_user_id),
                    message=(
                        f"Assigned to {lookup_user_name(self.db, req.assigned_to_user_id)} "
                        f"by {user_display_name(user)}"
                    ),
                    metadata={
                        "previous_assignee_id": (
                            str(previous_assignee_id) if previous_assignee_id else None
                        ),
                    },
                )
                if req.assigned_to_user_id:
                    self._notify_internal_assignment(
                        req,
                        assignee_id=req.assigned_to_user_id,
                        actor_id=user.id,
                    )

        if req.status != previous_status:
            record_dsar_activity(
                self.db,
                req,
                DataRightsActivityAction.status_changed,
                actor=user,
                message=(
                    f"Status changed from {status_label(previous_status)} to "
                    f"{status_label(req.status)} by {user_display_name(user)}"
                ),
                metadata={
                    "from_status": previous_status.value,
                    "to_status": req.status.value,
                },
            )

        if (
            not previously_acknowledged
            and req.acknowledged_at is not None
            and req.right_type == DataRightType.grievance
        ):
            record_dsar_activity(
                self.db,
                req,
                DataRightsActivityAction.grievance_acknowledged,
                actor=user,
                message=f"Grievance acknowledged by {user_display_name(user)}",
            )

        if req.status != previous_status or req.assigned_to_user_id != previous_assignee_id:
            self._compliance_audit(
                org_id,
                user,
                action=f"DSAR request updated: {req.tracking_id}",
                details=(
                    f"Status: {previous_status.value} → {req.status.value}"
                    if req.status != previous_status
                    else f"Assignee updated"
                ),
                resource_type="dsar_request",
                resource_id=req.tracking_id,
            )

        if commit:
            self.db.commit()
            self.db.refresh(req)
        if req.status != previous_status:
            self._notify_status_change(req, req.status)
            self._dispatch_data_rights_webhook(
                req,
                org_id,
                "data-rights.status_changed",
            )
            if (
                req.status == DataRightsRequestStatus.completed
                and previous_status != DataRightsRequestStatus.completed
            ):
                self._raise_retention_obligation(req, org_id)
        return self._to_read(req)

    def _next_queue_status(
        self, status: DataRightsRequestStatus
    ) -> DataRightsRequestStatus | None:
        if status == DataRightsRequestStatus.received:
            return DataRightsRequestStatus.in_review
        if status == DataRightsRequestStatus.in_review:
            return DataRightsRequestStatus.response_ready
        return None

    def batch_update_requests(
        self,
        user: User,
        body: DataRightsRequestBatchUpdate,
        org_id: UUID | None = None,
    ) -> DataRightsRequestBatchResult:
        """Fast path for bulk assign/advance — one fetch, one commit, no per-row email."""
        org_id = self._resolve_org_id(user, org_id)
        if body.assigned_to_user_id is not None and not self._can_assign_handler(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only admins can assign handlers")
        if body.status is not None or body.advance_status:
            if not self._is_admin(user):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")

        if not body.request_ids:
            return DataRightsRequestBatchResult(updated=0, skipped=0)

        assignee_id = body.assigned_to_user_id
        assignee_name = lookup_user_name(self.db, assignee_id) if assignee_id else None
        now = datetime.now(timezone.utc)

        rows = (
            self.db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == org_id,
                DataRightsRequest.id.in_(body.request_ids),
            )
            .all()
        )
        by_id = {row.id: row for row in rows}

        updated = 0
        skipped = 0
        for request_id in body.request_ids:
            req = by_id.get(request_id)
            if req is None:
                skipped += 1
                continue
            if req.status == DataRightsRequestStatus.completed:
                skipped += 1
                continue
            if self._is_org_admin(user) and not self._org_admin_can_access_request(user, req):
                skipped += 1
                continue

            new_status = body.status
            if body.advance_status:
                new_status = self._next_queue_status(req.status)
                if new_status is None:
                    skipped += 1
                    continue

            if assignee_id is None and new_status is None:
                skipped += 1
                continue

            if assignee_id is not None:
                req.assigned_to_user_id = assignee_id
            if new_status is not None:
                req.status = new_status
                if new_status == DataRightsRequestStatus.in_review:
                    self._acknowledge_grievance(req, now)
            updated += 1

        if updated > 0:
            detail_parts = []
            if assignee_name:
                detail_parts.append(f"assigned to {assignee_name}")
            if body.advance_status:
                detail_parts.append("advanced to next stage")
            elif body.status is not None:
                detail_parts.append(f"status set to {body.status.value}")
            self._compliance_audit(
                org_id,
                user,
                action=f"DSAR batch update ({updated} requests)",
                details=", ".join(detail_parts) or "batch update",
                resource_type="dsar_request",
                resource_id="batch",
            )
            self.db.commit()
        else:
            self.db.rollback()

        return DataRightsRequestBatchResult(updated=updated, skipped=skipped)

    def legal_signoff_request(
        self,
        user: User,
        request_id: UUID,
        org_id: UUID | None = None,
    ) -> DataRightsRequestRead:
        if not has_permission(user, Permission.DSAR_LEGAL_SIGNOFF):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Legal Head sign-off required")
        org_id = self._resolve_org_id(user, org_id)
        req = self.db.get(DataRightsRequest, request_id)
        if req is None or req.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Request not found")
        if not req.requires_legal_signoff:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="This request does not require legal sign-off",
            )
        req.legal_signed_off_by_user_id = user.id
        record_dsar_activity(
            self.db,
            req,
            DataRightsActivityAction.status_changed,
            actor=user,
            message=f"Legal sign-off completed by {user_display_name(user)}",
            metadata={"legal_signoff": True},
        )
        self.db.commit()
        self.db.refresh(req)
        return self._to_read(req)

    def resolve_request(
        self,
        user: User,
        request_id: UUID,
        closure_notes: str | None = None,
        org_id: UUID | None = None,
    ) -> DataRightsRequestRead:
        org_id = self._resolve_org_id(user, org_id)
        req = self.db.get(DataRightsRequest, request_id)
        if req is None or req.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Request not found")
        if self._is_org_admin(user):
            if not self._org_admin_can_access_request(user, req):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        elif self._is_superadmin(user):
            pass
        elif not self._can_handle_request(user, req):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        if req.status == DataRightsRequestStatus.completed:
            return self._to_read(req)

        if req.requires_legal_signoff and req.legal_signed_off_by_user_id is None:
            if not has_permission(user, Permission.DSAR_LEGAL_SIGNOFF):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="Legal Head sign-off required before resolving this request",
                )
            req.legal_signed_off_by_user_id = user.id

        now = datetime.now(timezone.utc)
        org = self.db.get(Organization, org_id)
        org_name = org.name if org else "Organization"
        closure = self._build_closure_text(req, org_name, closure_notes)
        req.closure_text = closure
        req.status = DataRightsRequestStatus.completed
        req.resolved_at = now
        req.resolved_by_user_id = user.id
        from app.models.compliance import AuditEventType
        from app.services.audit_events import record_audit_event

        record_audit_event(
            self.db,
            org_id,
            user=user,
            action=f"DSAR request resolved: {req.tracking_id}",
            details=f"Right type: {req.right_type.value}",
            event_type=AuditEventType.rights,
            resource_type="dsar_request",
            resource_id=req.tracking_id,
            commit=False,
        )
        record_dsar_activity(
            self.db,
            req,
            DataRightsActivityAction.resolved,
            actor=user,
            assignee_name=lookup_user_name(self.db, req.assigned_to_user_id),
            message=f"Request resolved and closed by {user_display_name(user)}",
            metadata={"closure_notes": closure_notes or ""},
        )
        from app.services.dsar_fulfillment_service import DsarFulfillmentService

        DsarFulfillmentService(self.db).fulfill_on_resolve(req, org_id)
        self.db.commit()
        self.db.refresh(req)
        self._raise_retention_obligation(req, org_id)
        from app.services.dsar_webhook_service import resolve_data_rights_event_type

        event_type = resolve_data_rights_event_type(req)
        self._dispatch_data_rights_webhook(req, org_id, event_type)
        if req.right_type == DataRightType.withdraw_consent:
            from app.services.dsar_consent_webhook_bridge import dispatch_withdrawal_consent_webhooks

            dispatch_withdrawal_consent_webhooks(self.db, org_id=org_id, req=req)
        self._notify_closure(req, org_name, closure)
        return self._to_read(req)

    def _raise_retention_obligation(self, req: DataRightsRequest, org_id: UUID) -> None:
        """Create retention obligations — never blocks DSAR closure; legal holds apply separately."""
        fulfillment_types = {
            DataRightType.erasure,
            DataRightType.withdraw_consent,
            DataRightType.masking,
            DataRightType.anonymization,
        }
        if req.right_type not in fulfillment_types:
            return
        try:
            from app.models.retention import RetentionAction, TriggerEvent
            from app.schemas.retention import ObligationCreate
            from app.services.retention_obligation_service import RetentionObligationService
            from app.services.dsar_fulfillment_service import DsarFulfillmentService

            subject = DsarFulfillmentService._subject_ref(req)
            action_override = None
            days_override = None
            if req.right_type == DataRightType.erasure:
                days_override = 0
                action_override = RetentionAction.delete
            elif req.right_type == DataRightType.masking:
                action_override = RetentionAction.mask
            elif req.right_type == DataRightType.anonymization:
                action_override = RetentionAction.pseudonymize
            elif req.right_type == DataRightType.withdraw_consent:
                days_override = None

            RetentionObligationService(self.db).create_from_event(
                org_id,
                ObligationCreate(
                    subject_ref=subject,
                    trigger_event=TriggerEvent.consent_withdrawal
                    if req.right_type == DataRightType.withdraw_consent
                    else TriggerEvent.custom,
                    retention_days=days_override,
                    action=action_override,
                    notes=(
                        f"Auto-created from DSAR {req.tracking_id} ({req.right_type.value}). "
                        "DPDPA: deletion deferred if RBI/AML/legal hold applies."
                    ),
                ),
                source="dsar",
            )
            self.db.commit()
        except Exception:  # noqa: BLE001
            logger.exception("Failed to raise retention obligation for DSAR %s", req.tracking_id)

    def _dispatch_data_rights_webhook(
        self, req: DataRightsRequest, org_id: UUID, event_type: str
    ) -> None:
        try:
            settings = (
                self.db.query(OrganizationSettings)
                .filter(OrganizationSettings.organization_id == org_id)
                .first()
            )
            cfg = (settings.dsar_sla_config or {}) if settings else {}
            webhook_url = cfg.get("data_rights_webhook_url")
            if not webhook_url:
                return
            from app.services.dsar_webhook_service import (
                build_data_rights_webhook_payload,
                deliver_data_rights_webhook,
            )

            payload = build_data_rights_webhook_payload(
                event_type=event_type,
                organization_id=str(org_id),
                request=req,
            )
            deliver_data_rights_webhook(
                self.db,
                webhook_url=webhook_url,
                organization_id=org_id,
                payload=payload,
                signing_secret=cfg.get("data_rights_webhook_signing_secret"),
                bearer_token=cfg.get("data_rights_webhook_bearer_token"),
                subscribed_events=cfg.get("data_rights_webhook_subscribed_events"),
            )
        except Exception:
            logger.exception("Data-rights webhook dispatch failed for %s", req.tracking_id)

    def add_request_comment(
        self,
        user: User,
        request_id: UUID,
        message: str,
        *,
        org_id: UUID | None = None,
    ) -> DataRightsRequestRead:
        org_id = self._resolve_org_id(user, org_id)
        req = self.db.get(DataRightsRequest, request_id)
        if req is None or req.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Request not found")
        if not message.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Comment cannot be empty")
        record_dsar_activity(
            self.db,
            req,
            DataRightsActivityAction.comment_added,
            actor=user,
            message=message.strip(),
            metadata={"comment": message.strip()},
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"DSAR comment on {req.tracking_id}",
            details=message.strip()[:500],
            resource_type="dsar_request",
            resource_id=req.tracking_id,
        )
        self.db.commit()
        self.db.refresh(req)
        return self._to_read(req)

    def _build_closure_text(
        self, req: DataRightsRequest, org_name: str, notes: str | None
    ) -> str:
        right_labels = {
            DataRightType.access: "Right to Access",
            DataRightType.correction: "Right to Correction",
            DataRightType.erasure: "Right to Erasure",
            DataRightType.nomination: "Nomination of Representative",
            DataRightType.grievance: "Grievance Redressal",
            DataRightType.withdraw_consent: "Consent Withdrawal",
            DataRightType.masking: "Data Masking Request",
            DataRightType.anonymization: "Data Anonymization Request",
        }
        label = right_labels.get(req.right_type, req.right_type.value)
        lines = [
            f"Vajra — Request Closure Letter",
            f"Organization: {org_name}",
            f"Request ID: {req.tracking_id}",
            f"Right exercised: {label}",
            f"Data Principal: {req.requester_name} ({req.requester_email})",
            f"Received: {(req.received_at or req.created_at).strftime('%d %b %Y') if (req.received_at or req.created_at) else '—'}",
            f"Resolved: {datetime.now(timezone.utc).strftime('%d %b %Y')}",
            "",
            "This letter confirms that your data rights request has been processed "
            "in accordance with the Digital Personal Data Protection Act, 2023.",
            "",
        ]
        if notes:
            lines.extend(["Notes:", notes, ""])
        if req.retention_hold_applied or (req.fulfillment_metadata or {}).get("immediate_deletion_blocked"):
            lines.extend([
                "Retention notice (DPDPA / RBI compliance):",
                "Your request has been processed. Where applicable law requires retention "
                "(including RBI, AML, fraud investigation, taxation, or contractual obligations), "
                "personal data will be masked, anonymized, or deleted only after the retention period "
                "expires. Minimum evidentiary records required under DPDPA are preserved.",
                "",
            ])
        lines.append(
            "If you are not satisfied with this outcome, you may exercise your right "
            "of grievance redressal under Section 13 of the DPDPA before approaching "
            "the Data Protection Board of India."
        )
        return "\n".join(lines)

    def get_activity_log(
        self,
        user: User,
        *,
        org_id: UUID | None = None,
        tracking_id: str | None = None,
        action: DataRightsActivityAction | None = None,
        right_type: DataRightType | None = None,
        actor: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> DsarActivityLogRead:
        self._require_admin(user)
        org_id = self._resolve_org_id(user, org_id)

        q = self.db.query(DataRightsActivityEvent).filter(
            DataRightsActivityEvent.organization_id == org_id
        )
        if tracking_id:
            q = q.filter(DataRightsActivityEvent.tracking_id.ilike(f"%{tracking_id.strip()}%"))
        if action:
            q = q.filter(DataRightsActivityEvent.action == action)
        if right_type:
            q = q.filter(DataRightsActivityEvent.right_type == right_type)
        if actor:
            q = q.filter(DataRightsActivityEvent.actor_name.ilike(f"%{actor.strip()}%"))

        total = q.count()
        events = (
            q.order_by(DataRightsActivityEvent.created_at.desc())
            .offset(offset)
            .limit(min(max(limit, 1), 500))
            .all()
        )

        items: list[DsarActivityEventRead] = []
        for ev in events:
            req = self.db.get(DataRightsRequest, ev.request_id)
            items.append(
                DsarActivityEventRead(
                    id=ev.id,
                    created_at=ev.created_at,
                    tracking_id=ev.tracking_id,
                    right_type=ev.right_type,
                    action=ev.action,
                    actor_user_id=ev.actor_user_id,
                    actor_name=ev.actor_name,
                    assignee_user_id=ev.assignee_user_id,
                    assignee_name=ev.assignee_name,
                    message=ev.message,
                    event_metadata=ev.event_metadata or {},
                    requester_name=req.requester_name if req else None,
                    current_status=req.status if req else None,
                    current_assignee_user_id=req.assigned_to_user_id if req else None,
                )
            )

        return DsarActivityLogRead(items=items, total=total)

    def run_sla_engine_once(self) -> SlaEngineRunResult:
        now = datetime.now(timezone.utc)
        active = (
            self.db.query(DataRightsRequest)
            .filter(DataRightsRequest.status.in_(list(SLA_ACTIVE_STATUSES)))
            .filter(DataRightsRequest.verification_status == VerificationStatus.verified)
            .all()
        )
        reminders_sent = 0
        breaches_marked = 0

        for req in active:
            if req.right_type == DataRightType.grievance and req.acknowledged_at is None:
                if req.ack_due_at and now > req.ack_due_at:
                    if req.ack_breached_at is None:
                        req.ack_breached_at = now
                        breaches_marked += 1
                    if self._record_reminder(req, ReminderType.ack_overdue, now):
                        reminders_sent += 1
                elif req.ack_due_at:
                    ack_hours_left = (req.ack_due_at - now).total_seconds() / 3600
                    if ack_hours_left <= 4 and self._record_reminder(req, ReminderType.ack_due, now):
                        reminders_sent += 1

            if req.due_at is None:
                continue

            days_left = (req.due_at - now).total_seconds() / 86400

            if days_left < 0:
                if req.breached_at is None:
                    req.breached_at = now
                    breaches_marked += 1
                if self._record_reminder(req, ReminderType.overdue, now):
                    reminders_sent += 1
                continue

            reminder_map: list[tuple[float, ReminderType]] = [
                (7, ReminderType.due_7d),
                (3, ReminderType.due_3d),
                (1, ReminderType.due_1d),
            ]
            for threshold, rtype in reminder_map:
                if days_left <= threshold and self._record_reminder(req, rtype, now):
                    reminders_sent += 1
                    break

        self.db.commit()
        return SlaEngineRunResult(
            processed=len(active),
            reminders_sent=reminders_sent,
            breaches_marked=breaches_marked,
        )

    def _record_reminder(
        self, req: DataRightsRequest, rtype: ReminderType, now: datetime
    ) -> bool:
        existing = (
            self.db.query(DataRightsReminderEvent)
            .filter(
                DataRightsReminderEvent.request_id == req.id,
                DataRightsReminderEvent.reminder_type == rtype,
            )
            .first()
        )
        if existing:
            return False

        settings_row = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == req.organization_id)
            .first()
        )
        dpo_email = settings_row.dpo_email if settings_row else None
        days = 0
        if req.due_at is not None:
            days = max(0, int((req.due_at - now).total_seconds() // 86400))
        email_sent = False
        if dpo_email:
            email_sent = send_sla_reminder_email(
                dpo_email,
                req.tracking_id,
                req.right_type.value,
                days,
                reminder_type=rtype.value,
            )

        event = DataRightsReminderEvent(
            request_id=req.id,
            reminder_type=rtype,
            reminded_at=now,
            email_sent=email_sent,
        )
        self.db.add(event)
        self._notify_internal_sla_reminder(req, rtype)
        return True
