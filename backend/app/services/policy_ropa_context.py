"""Build a RoPA snapshot for Shield AI policy generation."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.organization import Organization
from app.models.ropa import ProcessingActivity

_MAX_ACTIVITIES = 40


@dataclass
class PolicyRopaContext:
    organization_id: UUID
    organization_name: str
    activities: list[dict] = field(default_factory=list)

    @property
    def has_activities(self) -> bool:
        return bool(self.activities)

    def to_json(self) -> str:
        return json.dumps(
            {
                "organization_id": str(self.organization_id),
                "organization_name": self.organization_name,
                "processing_activities": self.activities,
            },
            indent=2,
        )


def build_policy_ropa_context(db: Session, org_id: UUID) -> PolicyRopaContext:
    org = db.get(Organization, org_id)
    org_name = org.name if org else "Organization"

    rows = db.execute(
        select(ProcessingActivity)
        .where(
            ProcessingActivity.organization_id == org_id,
            ProcessingActivity.is_deleted.is_(False),
        )
        .options(
            selectinload(ProcessingActivity.data_categories),
            selectinload(ProcessingActivity.data_principals),
            selectinload(ProcessingActivity.lawful_bases),
            selectinload(ProcessingActivity.systems),
            selectinload(ProcessingActivity.recipients),
            selectinload(ProcessingActivity.cross_border_transfers),
            selectinload(ProcessingActivity.retention_policies),
            selectinload(ProcessingActivity.purposes),
            selectinload(ProcessingActivity.business_unit),
            selectinload(ProcessingActivity.department),
        )
        .order_by(ProcessingActivity.updated_at.desc())
        .limit(_MAX_ACTIVITIES)
    ).scalars().all()

    activities: list[dict] = []
    for act in rows:
        activities.append(
            {
                "activity_ref": act.activity_ref,
                "title": act.title,
                "description": act.description,
                "status": act.status,
                "risk_level": act.risk_level,
                "business_unit": act.business_unit.name if act.business_unit else None,
                "department": act.department.name if act.department else None,
                "data_categories": [c.category_name for c in act.data_categories],
                "data_principals": [
                    {
                        "category": p.category_name,
                        "includes_children": p.includes_children,
                    }
                    for p in act.data_principals
                ],
                "lawful_bases": [
                    {
                        "basis": b.basis_type,
                        "justification": b.justification,
                        "dpdpa_section": b.dpdpa_section,
                    }
                    for b in act.lawful_bases
                ],
                "systems": [s.system_name for s in act.systems],
                "recipients": [
                    {
                        "name": r.name,
                        "type": r.recipient_type,
                        "data_shared": r.data_shared,
                    }
                    for r in act.recipients
                    if r.name
                ],
                "cross_border_transfers": [
                    {
                        "destination_country": t.destination_country,
                        "destination_entity": t.destination_entity,
                        "safeguard": t.safeguard_mechanism,
                    }
                    for t in act.cross_border_transfers
                ],
                "retention": [
                    {
                        "period": r.retention_period,
                        "trigger": r.trigger_event,
                        "auto_delete": r.auto_delete,
                    }
                    for r in act.retention_policies
                ],
            }
        )

    return PolicyRopaContext(
        organization_id=org_id,
        organization_name=org_name,
        activities=activities,
    )
