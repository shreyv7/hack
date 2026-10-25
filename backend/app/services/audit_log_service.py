"""Immutable hash-chained audit log."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.compliance import (
    AuditEventType,
    AuditLogEntry,
    AuditLogVerification,
    AuditSeverity,
)
from app.models.user import User
from app.schemas.compliance import (
    AuditEventRead,
    AuditLogSummaryRead,
    AuditVerifyResult,
    PaginatedAuditEvents,
)
from app.services.compliance_base import ComplianceBaseService

GENESIS_HASH = "0" * 64


def _utc_datetime(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _canonical_payload(
    *,
    organization_id: UUID,
    occurred_at: datetime,
    actor_email: str,
    actor_role: str,
    action: str,
    details: str,
    event_type: str,
    severity: str,
    resource_type: str | None,
    resource_id: str | None,
    prev_hash: str,
) -> str:
    data = {
        "organization_id": str(organization_id),
        "occurred_at": _utc_datetime(occurred_at).isoformat(),
        "actor_email": actor_email,
        "actor_role": actor_role,
        "action": action,
        "details": details,
        "event_type": event_type,
        "severity": severity,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "prev_hash": prev_hash,
    }
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def compute_entry_hash(prev_hash: str, payload: str) -> str:
    return hashlib.sha256(f"{prev_hash}:{payload}".encode()).hexdigest()


class AuditLogService(ComplianceBaseService):
    def _last_entry(self, org_id: UUID) -> AuditLogEntry | None:
        return (
            self.db.query(AuditLogEntry)
            .filter(AuditLogEntry.organization_id == org_id)
            .order_by(AuditLogEntry.occurred_at.desc(), AuditLogEntry.created_at.desc())
            .first()
        )

    def ensure_initialized(self, org_id: UUID) -> None:
        if self._last_entry(org_id) is not None:
            return
        now = datetime.now(timezone.utc)
        payload = _canonical_payload(
            organization_id=org_id,
            occurred_at=now,
            actor_email="system",
            actor_role="system",
            action="Audit log initialized",
            details="Immutable tamper-evident audit trail created for organization.",
            event_type=AuditEventType.configuration.value,
            severity=AuditSeverity.info.value,
            resource_type="audit_log",
            resource_id=str(org_id),
            prev_hash=GENESIS_HASH,
        )
        entry_hash = compute_entry_hash(GENESIS_HASH, payload)
        self.db.add(
            AuditLogEntry(
                organization_id=org_id,
                occurred_at=now,
                actor_email="system",
                actor_role="system",
                action="Audit log initialized",
                details="Immutable tamper-evident audit trail created for organization.",
                event_type=AuditEventType.configuration,
                severity=AuditSeverity.info,
                resource_type="audit_log",
                resource_id=str(org_id),
                prev_hash=GENESIS_HASH,
                entry_hash=entry_hash,
            )
        )
        self.db.commit()

    def record_event(
        self,
        org_id: UUID,
        *,
        user: User | None = None,
        action: str,
        details: str = "",
        event_type: AuditEventType = AuditEventType.configuration,
        severity: AuditSeverity = AuditSeverity.info,
        resource_type: str | None = None,
        resource_id: str | None = None,
    ) -> AuditLogEntry:
        self.ensure_initialized(org_id)
        last = self._last_entry(org_id)
        prev_hash = last.entry_hash if last else GENESIS_HASH
        now = datetime.now(timezone.utc)
        actor_email = user.email if user else "system"
        actor_role = user.role.value if user else "system"
        payload = _canonical_payload(
            organization_id=org_id,
            occurred_at=now,
            actor_email=actor_email,
            actor_role=actor_role,
            action=action,
            details=details,
            event_type=event_type.value,
            severity=severity.value,
            resource_type=resource_type,
            resource_id=resource_id,
            prev_hash=prev_hash,
        )
        entry_hash = compute_entry_hash(prev_hash, payload)
        entry = AuditLogEntry(
            organization_id=org_id,
            occurred_at=now,
            actor_user_id=user.id if user else None,
            actor_email=actor_email,
            actor_role=actor_role,
            action=action,
            details=details,
            event_type=event_type,
            severity=severity,
            resource_type=resource_type,
            resource_id=resource_id,
            prev_hash=prev_hash,
            entry_hash=entry_hash,
        )
        self.db.add(entry)
        self.db.flush()
        return entry

    def _to_read(self, entry: AuditLogEntry) -> AuditEventRead:
        return AuditEventRead(
            id=entry.id,
            time=entry.occurred_at,
            actor=entry.actor_email,
            role=entry.actor_role,
            action=entry.action,
            details=entry.details,
            type=entry.event_type.value,
            severity=entry.severity.value,
            entry_hash=entry.entry_hash,
            prev_hash=entry.prev_hash,
            resource_type=entry.resource_type,
            resource_id=entry.resource_id,
        )

    def list_events(
        self,
        user: User,
        *,
        org_id: UUID | None = None,
        q: str | None = None,
        event_type: str | None = None,
        actor: str | None = None,
        resource_type: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> PaginatedAuditEvents:
        resolved = self._resolve_org_id(user, org_id)
        self.ensure_initialized(resolved)
        query = self.db.query(AuditLogEntry).filter(AuditLogEntry.organization_id == resolved)
        if q:
            like = f"%{q}%"
            query = query.filter(
                (AuditLogEntry.action.ilike(like)) | (AuditLogEntry.details.ilike(like))
            )
        if event_type:
            try:
                et = AuditEventType(event_type)
                query = query.filter(AuditLogEntry.event_type == et)
            except ValueError:
                pass
        if actor:
            query = query.filter(AuditLogEntry.actor_email.ilike(f"%{actor}%"))
        if resource_type:
            query = query.filter(AuditLogEntry.resource_type == resource_type)
        total = query.count()
        items = (
            query.order_by(AuditLogEntry.occurred_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return PaginatedAuditEvents(
            items=[self._to_read(e) for e in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get_event(self, user: User, event_id: UUID, *, org_id: UUID | None = None) -> AuditEventRead:
        resolved = self._resolve_org_id(user, org_id)
        entry = (
            self.db.query(AuditLogEntry)
            .filter(AuditLogEntry.organization_id == resolved, AuditLogEntry.id == event_id)
            .first()
        )
        if entry is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Audit event not found")
        return self._to_read(entry)

    def verify(self, user: User, *, org_id: UUID | None = None) -> AuditVerifyResult:
        resolved = self._resolve_org_id(user, org_id)
        self.ensure_initialized(resolved)
        entries = (
            self.db.query(AuditLogEntry)
            .filter(AuditLogEntry.organization_id == resolved)
            .order_by(AuditLogEntry.occurred_at.asc(), AuditLogEntry.created_at.asc())
            .all()
        )
        prev = GENESIS_HASH
        integrity_ok = True
        for entry in entries:
            payload = _canonical_payload(
                organization_id=entry.organization_id,
                occurred_at=entry.occurred_at,
                actor_email=entry.actor_email,
                actor_role=entry.actor_role,
                action=entry.action,
                details=entry.details,
                event_type=entry.event_type.value,
                severity=entry.severity.value,
                resource_type=entry.resource_type,
                resource_id=entry.resource_id,
                prev_hash=entry.prev_hash,
            )
            expected = compute_entry_hash(entry.prev_hash, payload)
            if entry.prev_hash != prev or entry.entry_hash != expected:
                integrity_ok = False
                break
            prev = entry.entry_hash
        merkle_root = prev if entries else GENESIS_HASH
        now = datetime.now(timezone.utc)
        self.db.add(
            AuditLogVerification(
                organization_id=resolved,
                verified_at=now,
                verified_by_user_id=user.id,
                merkle_root=merkle_root,
                entry_count=len(entries),
                integrity_ok=integrity_ok,
            )
        )
        self.db.commit()
        return AuditVerifyResult(
            merkle_root=merkle_root,
            entry_count=len(entries),
            integrity_ok=integrity_ok,
            verified_at=now,
        )

    def get_summary(self, user: User, *, org_id: UUID | None = None) -> AuditLogSummaryRead:
        resolved = self._resolve_org_id(user, org_id)
        self.ensure_initialized(resolved)
        count = (
            self.db.query(func.count(AuditLogEntry.id))
            .filter(AuditLogEntry.organization_id == resolved)
            .scalar()
        ) or 0
        last = self._last_entry(resolved)
        last_verification = (
            self.db.query(AuditLogVerification)
            .filter(AuditLogVerification.organization_id == resolved)
            .order_by(AuditLogVerification.verified_at.desc())
            .first()
        )
        return AuditLogSummaryRead(
            entry_count=count,
            merkle_root=last.entry_hash if last else GENESIS_HASH,
            last_verified_at=last_verification.verified_at if last_verification else None,
            integrity_ok=last_verification.integrity_ok if last_verification else None,
        )
