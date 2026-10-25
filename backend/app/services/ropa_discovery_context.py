"""Build a compact org snapshot for RoPA auto-discovery AI prompts."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.data_inventory import DataInventoryAsset, FieldClassification
from app.models.data_processor import DataProcessor
from app.models.data_source import DataSource
from app.models.detected_tracker import DetectedTracker, TrackerStatus
from app.models.integration_property import IntegrationProperty
from app.models.organization import Organization
from app.models.pii_scan import FindingStatus, PiiFinding
from app.models.ropa import ProcessingActivity

_MAX_ASSETS = 50
_MAX_FINDINGS = 30
_MAX_EXISTING_ROPA = 40
_MAX_VENDORS = 25
_MAX_TRACKERS = 20

_PII_CLASSIFICATIONS = {
    FieldClassification.personal,
    FieldClassification.sensitive,
}


@dataclass
class RopaDiscoveryContext:
    """Org-scoped snapshot fed to Bedrock or the rule-based fallback."""

    organization_id: UUID
    organization_name: str
    data_sources: list[dict] = field(default_factory=list)
    inventory_assets: list[dict] = field(default_factory=list)
    pii_findings: list[dict] = field(default_factory=list)
    existing_ropa: list[dict] = field(default_factory=list)
    vendors: list[dict] = field(default_factory=list)
    discovered_trackers: list[dict] = field(default_factory=list)

    @property
    def has_data(self) -> bool:
        return bool(
            self.data_sources
            or self.inventory_assets
            or self.pii_findings
            or self.discovered_trackers
        )

    def to_json(self) -> str:
        return json.dumps(
            {
                "organization_id": str(self.organization_id),
                "organization_name": self.organization_name,
                "data_sources": self.data_sources,
                "inventory_assets": self.inventory_assets,
                "pii_findings": self.pii_findings,
                "existing_ropa": self.existing_ropa,
                "vendors": self.vendors,
                "discovered_trackers": self.discovered_trackers,
            },
            indent=2,
        )


def build_ropa_discovery_context(db: Session, org_id: UUID) -> RopaDiscoveryContext:
    org = db.get(Organization, org_id)
    org_name = org.name if org else "Organization"

    data_sources = _load_data_sources(db, org_id)
    inventory_assets = _load_inventory_assets(db, org_id)
    pii_findings = _load_pii_findings(db, org_id)
    existing_ropa = _load_existing_ropa(db, org_id)
    vendors = _load_vendors(db, org_id)
    trackers = _load_trackers(db, org_id)

    return RopaDiscoveryContext(
        organization_id=org_id,
        organization_name=org_name,
        data_sources=data_sources,
        inventory_assets=inventory_assets,
        pii_findings=pii_findings,
        existing_ropa=existing_ropa,
        vendors=vendors,
        discovered_trackers=trackers,
    )


def _load_data_sources(db: Session, org_id: UUID) -> list[dict]:
    rows = db.execute(
        select(DataSource)
        .where(DataSource.organization_id == org_id)
        .order_by(DataSource.name)
    ).scalars().all()
    return [
        {
            "name": s.name,
            "source_type": s.source_type,
            "category": s.category,
            "host": s.host,
            "status": s.status.value if s.status else None,
        }
        for s in rows
    ]


def _load_inventory_assets(db: Session, org_id: UUID) -> list[dict]:
    rows = db.execute(
        select(DataInventoryAsset)
        .where(DataInventoryAsset.organization_id == org_id)
        .options(selectinload(DataInventoryAsset.fields))
        .order_by(DataInventoryAsset.name)
        .limit(_MAX_ASSETS)
    ).scalars().all()

    assets: list[dict] = []
    for asset in rows:
        pii_fields = [
            {
                "name": f.name,
                "classification": f.classification.value,
                "pii_category": f.pii_category,
            }
            for f in asset.fields
            if f.classification in _PII_CLASSIFICATIONS or f.pii_category
        ]
        if not pii_fields and not asset.data_categories:
            continue
        assets.append(
            {
                "id": str(asset.id),
                "name": asset.name,
                "asset_type": asset.asset_type.value,
                "location": asset.location,
                "data_categories": asset.data_categories or [],
                "pii_fields": pii_fields,
            }
        )
    return assets


def _load_pii_findings(db: Session, org_id: UUID) -> list[dict]:
    rows = db.execute(
        select(PiiFinding)
        .where(
            PiiFinding.organization_id == org_id,
            PiiFinding.status == FindingStatus.detected,
        )
        .order_by(PiiFinding.confidence.desc(), PiiFinding.created_at.desc())
        .limit(_MAX_FINDINGS)
    ).scalars().all()
    return [
        {
            "table_name": f.table_name,
            "column_name": f.column_name,
            "pii_category": f.pii_category,
            "classification": f.classification.value,
            "confidence": f.confidence,
        }
        for f in rows
    ]


def _load_existing_ropa(db: Session, org_id: UUID) -> list[dict]:
    rows = db.execute(
        select(ProcessingActivity)
        .where(
            ProcessingActivity.organization_id == org_id,
            ProcessingActivity.is_deleted.is_(False),
        )
        .options(
            selectinload(ProcessingActivity.data_categories),
            selectinload(ProcessingActivity.systems),
            selectinload(ProcessingActivity.recipients),
        )
        .order_by(ProcessingActivity.updated_at.desc())
        .limit(_MAX_EXISTING_ROPA)
    ).scalars().all()
    return [
        {
            "title": a.title,
            "status": a.status,
            "data_categories": [c.category_name for c in a.data_categories],
            "systems": [s.system_name for s in a.systems],
            "recipients": [r.name for r in a.recipients if r.name],
        }
        for a in rows
    ]


def _load_vendors(db: Session, org_id: UUID) -> list[dict]:
    rows = db.execute(
        select(DataProcessor)
        .where(DataProcessor.organization_id == org_id)
        .order_by(DataProcessor.name)
        .limit(_MAX_VENDORS)
    ).scalars().all()
    return [
        {
            "name": p.name,
            "category": p.category,
            "purpose": p.purpose,
            "location": p.location,
            "data_categories": p.data_categories,
        }
        for p in rows
    ]


def _load_trackers(db: Session, org_id: UUID) -> list[dict]:
    rows = db.execute(
        select(DetectedTracker, IntegrationProperty.domain)
        .join(IntegrationProperty, DetectedTracker.property_id == IntegrationProperty.id)
        .where(
            IntegrationProperty.organization_id == org_id,
            DetectedTracker.status == TrackerStatus.active,
        )
        .order_by(DetectedTracker.last_seen_at.desc())
        .limit(_MAX_TRACKERS)
    ).all()
    return [
        {
            "name": tracker.name,
            "domain": tracker.domain or domain,
            "category": tracker.category.value,
            "type": tracker.type.value,
        }
        for tracker, domain in rows
    ]
