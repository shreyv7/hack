from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.retention import PolicyStatus, RetentionAction, RetentionPolicy, TriggerEvent
from app.models.retention_obligation import ObligationStatus, RetentionObligation
from app.models.user import User
from app.schemas.retention import (
    DueObligation,
    ObligationApiInfo,
    ObligationCreate,
    ObligationEventRequest,
    ObligationFulfill,
    ObligationRead,
    ObligationSummary,
)
from app.services.retention_service import RetentionService, retention_days


class RetentionObligationService:
    """Application-level erasure obligations: created from lifecycle events, driven
    to completion by the org's own app over an API-key-authenticated purge API."""

    def __init__(self, db: Session):
        self.db = db
        self._ret = RetentionService(db)  # reuse tenant scoping + hold helpers

    # --- dates from a matched policy (or overrides) ---

    def _match_policy(
        self, org_id: UUID, data_category: str | None, trigger_event: TriggerEvent
    ) -> RetentionPolicy | None:
        stmt = (
            select(RetentionPolicy)
            .where(
                RetentionPolicy.organization_id == org_id,
                RetentionPolicy.status == PolicyStatus.active,
                RetentionPolicy.trigger_event == trigger_event,
            )
            .order_by(RetentionPolicy.created_at.desc())
        )
        if data_category:
            stmt = stmt.where(func.lower(RetentionPolicy.data_category) == data_category.lower())
        return self.db.execute(stmt).scalars().first()

    def _plan(
        self,
        org_id: UUID,
        event_at: datetime,
        data_category: str | None,
        trigger_event: TriggerEvent,
        action_override: RetentionAction | None,
        days_override: int | None,
    ) -> tuple[datetime, datetime | None, RetentionAction, UUID | None]:
        """Compute (due_at, legal_hold_until, action, policy_id) for an event."""
        policy = self._match_policy(org_id, data_category, trigger_event)
        if policy is not None:
            base_days = retention_days(policy)
            hold_days = self._ret._hold_days_for_asset(policy.asset_id)
            action = action_override or policy.action
            policy_id = policy.id
        else:
            base_days = 0
            hold_days = 0
            action = action_override or RetentionAction.delete
            policy_id = None
        if days_override is not None:
            base_days = days_override
        # due_at is the policy-based due date; the legal hold is tracked separately.
        # Lifecycle (see _evaluate_status): before due_at → Pending; due_at until the
        # hold expires → On Hold; after the hold expires → Due.
        due_at = event_at + timedelta(days=base_days)
        legal_hold_until = event_at + timedelta(days=hold_days) if hold_days > 0 else None
        return due_at, legal_hold_until, action, policy_id

    @staticmethod
    def _evaluate_status(ob: RetentionObligation, now: datetime) -> ObligationStatus:
        if ob.status in (ObligationStatus.fulfilled, ObligationStatus.cancelled):
            return ob.status
        if ob.legal_hold_until and now < ob.legal_hold_until and now >= ob.due_at:
            return ObligationStatus.on_hold
        if now >= ob.due_at and (ob.legal_hold_until is None or now >= ob.legal_hold_until):
            return ObligationStatus.due
        return ObligationStatus.pending

    # --- create / upsert from an event ---

    def _open_obligation(
        self, org_id: UUID, subject_ref: str, data_category: str | None
    ) -> RetentionObligation | None:
        return self.db.execute(
            select(RetentionObligation).where(
                RetentionObligation.organization_id == org_id,
                RetentionObligation.subject_ref == subject_ref,
                or_(
                    RetentionObligation.data_category == data_category,
                    (RetentionObligation.data_category.is_(None)) & (data_category is None),
                ),
                RetentionObligation.status.in_(
                    [ObligationStatus.pending, ObligationStatus.due, ObligationStatus.on_hold]
                ),
            )
        ).scalars().first()

    def create_from_event(
        self, org_id: UUID, body: ObligationEventRequest | ObligationCreate, source: str
    ) -> tuple[RetentionObligation, bool]:
        now = datetime.now(timezone.utc)
        event_at = body.occurred_at or now
        due_at, hold_until, action, policy_id = self._plan(
            org_id, event_at, body.data_category, body.trigger_event, body.action, body.retention_days
        )
        existing = self._open_obligation(org_id, body.subject_ref, body.data_category)
        if existing is not None:
            existing.trigger_event = body.trigger_event
            existing.purpose = body.purpose
            existing.policy_id = policy_id
            existing.action = action
            existing.event_at = event_at
            existing.due_at = due_at
            existing.legal_hold_until = hold_until
            existing.source = source
            if body.notes:
                existing.notes = body.notes
            existing.status = self._evaluate_status(existing, now)
            self.db.commit()
            self.db.refresh(existing)
            return existing, False

        ob = RetentionObligation(
            organization_id=org_id,
            subject_ref=body.subject_ref,
            data_category=body.data_category,
            purpose=body.purpose,
            policy_id=policy_id,
            trigger_event=body.trigger_event,
            action=action,
            event_at=event_at,
            due_at=due_at,
            legal_hold_until=hold_until,
            source=source,
            notes=body.notes,
        )
        ob.status = self._evaluate_status(ob, now)
        self.db.add(ob)
        self.db.commit()
        self.db.refresh(ob)
        return ob, True

    # --- public API (org app, API-key authenticated) ---

    def record_event(self, org_id: UUID, body: ObligationEventRequest) -> tuple[ObligationRead, bool]:
        ob, created = self.create_from_event(org_id, body, source="api")
        return ObligationRead.model_validate(ob), created

    def list_due_for_org(self, org_id: UUID) -> list[DueObligation]:
        """Obligations whose erasure is due now (past due_at, no active hold).
        Flips pending → due as a side effect so the dashboard stays accurate."""
        now = datetime.now(timezone.utc)
        rows = (
            self.db.execute(
                select(RetentionObligation).where(
                    RetentionObligation.organization_id == org_id,
                    RetentionObligation.status.in_(
                        [ObligationStatus.pending, ObligationStatus.due]
                    ),
                    RetentionObligation.due_at <= now,
                    or_(
                        RetentionObligation.legal_hold_until.is_(None),
                        RetentionObligation.legal_hold_until <= now,
                    ),
                )
            )
            .scalars()
            .all()
        )
        out: list[DueObligation] = []
        for ob in rows:
            if ob.status != ObligationStatus.due:
                ob.status = ObligationStatus.due
            out.append(
                DueObligation(
                    id=ob.id,
                    subject_ref=ob.subject_ref,
                    data_category=ob.data_category,
                    purpose=ob.purpose,
                    action=ob.action,
                    due_at=ob.due_at,
                )
            )
        self.db.commit()
        return out

    def fulfill_for_org(
        self, org_id: UUID, obligation_id: UUID, body: ObligationFulfill, *, by: str
    ) -> ObligationRead:
        ob = self.db.get(RetentionObligation, obligation_id)
        if ob is None or ob.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Obligation not found")
        if ob.status == ObligationStatus.fulfilled:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Obligation already fulfilled")
        now = datetime.now(timezone.utc)
        ob.status = ObligationStatus.fulfilled
        ob.fulfilled_at = now
        ob.fulfilled_by = body.fulfilled_by or by
        ob.evidence = body.evidence
        self.db.commit()
        self.db.refresh(ob)
        return ObligationRead.model_validate(ob)

    # --- admin (dashboard) ---

    def create_manual(
        self, user: User, body: ObligationCreate, org_id: UUID | None = None
    ) -> ObligationRead:
        resolved = self._ret._resolve_org_id(user, org_id)
        ob, _ = self.create_from_event(resolved, body, source="manual")
        return ObligationRead.model_validate(ob)

    def list_obligations(
        self,
        user: User,
        org_id: UUID | None = None,
        status_filter: ObligationStatus | None = None,
    ) -> list[ObligationRead]:
        resolved = self._ret._resolve_org_id(user, org_id)
        # Keep stored status fresh so filters/summary line up with reality.
        now = datetime.now(timezone.utc)
        rows = (
            self.db.execute(
                select(RetentionObligation)
                .where(RetentionObligation.organization_id == resolved)
                .order_by(RetentionObligation.due_at.asc())
            )
            .scalars()
            .all()
        )
        changed = False
        for ob in rows:
            new_status = self._evaluate_status(ob, now)
            if new_status != ob.status:
                ob.status = new_status
                changed = True
        if changed:
            self.db.commit()
        if status_filter is not None:
            rows = [ob for ob in rows if ob.status == status_filter]
        return [ObligationRead.model_validate(ob) for ob in rows]

    def fulfill_manual(
        self, user: User, obligation_id: UUID, body: ObligationFulfill, org_id: UUID | None = None
    ) -> ObligationRead:
        resolved = self._ret._resolve_org_id(user, org_id)
        return self.fulfill_for_org(resolved, obligation_id, body, by=user.email)

    def cancel(self, user: User, obligation_id: UUID, org_id: UUID | None = None) -> ObligationRead:
        resolved = self._ret._resolve_org_id(user, org_id)
        ob = self.db.get(RetentionObligation, obligation_id)
        if ob is None or ob.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Obligation not found")
        ob.status = ObligationStatus.cancelled
        self.db.commit()
        self.db.refresh(ob)
        return ObligationRead.model_validate(ob)

    def api_info(
        self, user: User, org_id: UUID | None = None, base_url: str | None = None
    ) -> ObligationApiInfo:
        """Public endpoint URLs + the org's active API-key prefix for the dev page.
        `base_url` (the live request host) is used when no explicit public URL is
        configured, so deployed environments never show a localhost URL."""
        from app.core.config import settings
        from app.models.integration_api_key import IntegrationApiKey

        resolved = self._ret._resolve_org_id(user, org_id)
        root = (base_url.rstrip("/") if base_url else settings.BACKEND_PUBLIC_URL.rstrip("/"))
        base = root + "/public/v1/retention"
        key = self.db.execute(
            select(IntegrationApiKey)
            .where(
                IntegrationApiKey.organization_id == resolved,
                IntegrationApiKey.status == "active",
            )
            .order_by(IntegrationApiKey.created_at.desc())
        ).scalars().first()
        return ObligationApiInfo(
            events_url=f"{base}/events",
            due_url=f"{base}/due",
            fulfill_url=f"{base}/obligations/{{obligation_id}}/fulfill",
            has_api_key=key is not None,
            api_key_prefix=key.key_prefix if key else None,
        )

    def get_summary(self, user: User, org_id: UUID | None = None) -> ObligationSummary:
        resolved = self._ret._resolve_org_id(user, org_id)
        # Refresh statuses first (cheap; obligations volumes are modest).
        self.list_obligations(user, org_id=org_id)

        def count(*statuses: ObligationStatus) -> int:
            return self.db.scalar(
                select(func.count(RetentionObligation.id)).where(
                    RetentionObligation.organization_id == resolved,
                    RetentionObligation.status.in_(statuses),
                )
            ) or 0

        return ObligationSummary(
            total=self.db.scalar(
                select(func.count(RetentionObligation.id)).where(
                    RetentionObligation.organization_id == resolved
                )
            ) or 0,
            pending=count(ObligationStatus.pending),
            due=count(ObligationStatus.due),
            on_hold=count(ObligationStatus.on_hold),
            fulfilled=count(ObligationStatus.fulfilled),
        )

    def handle_consent_withdrawal(
        self,
        *,
        organization_id: UUID,
        principal_id: UUID | None,
        withdrawn_purpose_keys: list[str],
        receipt_id: UUID | None = None,
        property_id: UUID | None = None,
    ):
        """Entry point for consent withdrawal → retention / remediation orchestration."""
        from app.services.consent_withdrawal_remediation_service import (
            ConsentWithdrawalRemediationService,
        )

        return ConsentWithdrawalRemediationService(self.db).handle_consent_withdrawal(
            organization_id=organization_id,
            principal_id=principal_id,
            withdrawn_purpose_keys=withdrawn_purpose_keys,
            receipt_id=receipt_id,
            property_id=property_id,
        )
