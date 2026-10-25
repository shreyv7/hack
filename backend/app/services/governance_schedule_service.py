"""Scheduled dashboard report delivery."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import joinedload

from app.models.governance_dashboard import (
    DeliveryChannel,
    GovernanceDashboard,
    GovernanceDashboardSchedule,
    ScheduleFrequency,
)
from app.models.user import User, UserRole
from app.schemas.governance_dashboard import ScheduleCreate, ScheduleRead, ScheduleUpdate
from app.services.compliance_base import ComplianceBaseService
from app.services.governance_audit_service import GovernanceAuditService
from app.services.governance_dashboard_service import GovernanceDashboardService
from app.services.governance_email_service import send_scheduled_dashboard_report
from app.services.governance_export_service import GovernanceExportService

logger = logging.getLogger(__name__)


class GovernanceScheduleService(ComplianceBaseService):
    def _next_run(self, frequency: ScheduleFrequency) -> datetime:
        now = datetime.now(timezone.utc)
        deltas = {
            ScheduleFrequency.daily: timedelta(days=1),
            ScheduleFrequency.weekly: timedelta(weeks=1),
            ScheduleFrequency.monthly: timedelta(days=30),
            ScheduleFrequency.quarterly: timedelta(days=90),
        }
        return now + deltas.get(frequency, timedelta(days=7))

    def list_schedules(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None) -> list[ScheduleRead]:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        rows = (
            self.db.query(GovernanceDashboardSchedule)
            .filter(
                GovernanceDashboardSchedule.dashboard_id == dashboard.id,
                GovernanceDashboardSchedule.deleted_at.is_(None),
            )
            .order_by(GovernanceDashboardSchedule.created_at.desc())
            .all()
        )
        return [ScheduleRead.model_validate(r) for r in rows]

    def create_schedule(
        self, user: User, dashboard_id: UUID, body: ScheduleCreate, *, org_id: UUID | None = None
    ) -> ScheduleRead:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not GovernanceDashboardService(self.db)._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Edit access required")
        schedule = GovernanceDashboardSchedule(
            dashboard_id=dashboard.id,
            created_by_user_id=user.id,
            name=body.name,
            frequency=body.frequency,
            cron_expression=body.cron_expression,
            delivery_channel=body.delivery_channel,
            delivery_config_json=body.delivery_config_json,
            export_format=body.export_format,
            is_active=body.is_active,
            next_run_at=self._next_run(body.frequency),
        )
        self.db.add(schedule)
        GovernanceAuditService(self.db).log(
            organization_id=dashboard.organization_id,
            user=user,
            action="dashboard.schedule_created",
            dashboard_id=dashboard.id,
            details={"name": body.name, "frequency": body.frequency.value},
        )
        self.db.commit()
        self.db.refresh(schedule)
        return ScheduleRead.model_validate(schedule)

    def update_schedule(
        self, user: User, dashboard_id: UUID, schedule_id: UUID, body: ScheduleUpdate, *, org_id: UUID | None = None
    ) -> ScheduleRead:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        schedule = (
            self.db.query(GovernanceDashboardSchedule)
            .filter(
                GovernanceDashboardSchedule.id == schedule_id,
                GovernanceDashboardSchedule.dashboard_id == dashboard.id,
                GovernanceDashboardSchedule.deleted_at.is_(None),
            )
            .first()
        )
        if schedule is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        if body.name is not None:
            schedule.name = body.name
        if body.frequency is not None:
            schedule.frequency = body.frequency
            schedule.next_run_at = self._next_run(body.frequency)
        if body.cron_expression is not None:
            schedule.cron_expression = body.cron_expression
        if body.delivery_channel is not None:
            schedule.delivery_channel = body.delivery_channel
        if body.delivery_config_json is not None:
            schedule.delivery_config_json = body.delivery_config_json
        if body.export_format is not None:
            schedule.export_format = body.export_format
        if body.is_active is not None:
            schedule.is_active = body.is_active
        self.db.commit()
        self.db.refresh(schedule)
        return ScheduleRead.model_validate(schedule)

    def delete_schedule(self, user: User, dashboard_id: UUID, schedule_id: UUID, *, org_id: UUID | None = None) -> None:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        schedule = (
            self.db.query(GovernanceDashboardSchedule)
            .filter(
                GovernanceDashboardSchedule.id == schedule_id,
                GovernanceDashboardSchedule.dashboard_id == dashboard.id,
                GovernanceDashboardSchedule.deleted_at.is_(None),
            )
            .first()
        )
        if schedule is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        schedule.deleted_at = datetime.now(timezone.utc)
        self.db.commit()

    def _acting_user(self, dashboard: GovernanceDashboard, schedule: GovernanceDashboardSchedule) -> User | None:
        if schedule.created_by_user_id:
            user = self.db.get(User, schedule.created_by_user_id)
            if user is not None:
                return user
        if dashboard.owner_user_id:
            user = self.db.get(User, dashboard.owner_user_id)
            if user is not None:
                return user
        return (
            self.db.query(User)
            .filter(
                User.organization_id == dashboard.organization_id,
                User.role.in_([UserRole.admin, UserRole.superadmin]),
            )
            .first()
        )

    def run_due_schedules(self) -> dict[str, int]:
        now = datetime.now(timezone.utc)
        due = (
            self.db.query(GovernanceDashboardSchedule)
            .options(joinedload(GovernanceDashboardSchedule.dashboard))
            .filter(
                GovernanceDashboardSchedule.is_active.is_(True),
                GovernanceDashboardSchedule.deleted_at.is_(None),
                GovernanceDashboardSchedule.next_run_at.isnot(None),
                GovernanceDashboardSchedule.next_run_at <= now,
            )
            .all()
        )
        processed = 0
        delivered = 0
        failed = 0
        export_service = GovernanceExportService(self.db)

        for schedule in due:
            dashboard = schedule.dashboard
            if dashboard is None or dashboard.deleted_at is not None:
                schedule.is_active = False
                failed += 1
                continue
            acting_user = self._acting_user(dashboard, schedule)
            if acting_user is None:
                logger.warning("No acting user for schedule %s", schedule.id)
                failed += 1
                continue
            try:
                raw, filename, content_type = export_service.export_dashboard_bytes(
                    acting_user,
                    dashboard.id,
                    schedule.export_format,
                    org_id=dashboard.organization_id,
                )
                if schedule.delivery_channel == DeliveryChannel.email:
                    config = schedule.delivery_config_json or {}
                    recipients = config.get("recipients") or []
                    if isinstance(recipients, str):
                        recipients = [r.strip() for r in recipients.split(",") if r.strip()]
                    sent = send_scheduled_dashboard_report(
                        recipients=recipients,
                        dashboard_name=dashboard.name,
                        schedule_name=schedule.name,
                        attachment_filename=filename,
                        attachment_bytes=raw,
                        content_type=content_type,
                    )
                    delivered += sent
                else:
                    logger.info(
                        "Schedule %s: channel %s not configured — export generated only",
                        schedule.id,
                        schedule.delivery_channel.value,
                    )
                schedule.last_run_at = now
                schedule.next_run_at = self._next_run(schedule.frequency)
                GovernanceAuditService(self.db).log(
                    organization_id=dashboard.organization_id,
                    user=acting_user,
                    action="dashboard.schedule_executed",
                    dashboard_id=dashboard.id,
                    details={"schedule_id": str(schedule.id), "format": schedule.export_format.value},
                )
                processed += 1
            except Exception:
                logger.exception("Failed to run schedule %s", schedule.id)
                failed += 1

        if due:
            self.db.commit()
        return {"due": len(due), "processed": processed, "emails_sent": delivered, "failed": failed}
