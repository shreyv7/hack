from __future__ import annotations

import csv
import io
import re
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.rbac import Permission, can_access_data_asset_scope, has_permission
from app.models.consent import Purpose
from app.models.data_inventory import (
    AssetStatus,
    AssetType,
    AuditAction,
    ClassificationSource,
    DataInventoryAsset,
    DataInventoryAssetActivity,
    DataInventoryAssetProcessor,
    DataInventoryAuditLog,
    DataInventoryField,
    FieldClassification,
    SecuritySafeguard,
)
from app.models.data_processor import DataProcessor
from app.models.data_source import DataSource
from app.models.enforcement import PurposeDataMapping
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import OrganizationSettings
from app.models.ropa import ProcessingActivity
from app.models.user import User, UserRole
from app.utils.data_source_governance import compute_residency_flag, region_to_country_code
from app.schemas.data_inventory import (
    ActivityLinkCreate,
    ActivityLinkRead,
    AssetCreate,
    AssetDetail,
    AssetRead,
    AssetUpdate,
    AssetUsageMap,
    AuditLogEntry,
    BulkStatusResult,
    BulkStatusUpdate,
    FieldCreate,
    FieldRead,
    FieldUpdate,
    InventorySummary,
    ProcessorLinkCreate,
    ProcessorLinkRead,
    SchemaImportResult,
    UsagePurposeEntry,
)
from app.services import db_connector

_CLASSIFY_RULES: list[tuple[re.Pattern[str], FieldClassification, str]] = [
    (re.compile(r"\b(aadhaar|aadhar|uidai)\b"), FieldClassification.sensitive, "aadhaar"),
    (re.compile(r"\bpan\b|pan[_ ]?(no|number|card)"), FieldClassification.sensitive, "pan"),
    (re.compile(r"passport"), FieldClassification.sensitive, "passport"),
    (re.compile(r"health|medical|diagnos|disease|blood[_ ]?group"), FieldClassification.sensitive, "health"),
    (re.compile(r"salary|income|bank|account[_ ]?(no|number)|ifsc|card[_ ]?(no|number)|cvv|credit"), FieldClassification.sensitive, "financial"),
    (re.compile(r"biometric|fingerprint|face[_ ]?id|retina"), FieldClassification.sensitive, "biometric"),
    (re.compile(r"religion|caste|ethnic|political|sexual"), FieldClassification.sensitive, "special_category"),
    (re.compile(r"password|passwd|secret|api[_ ]?key|token"), FieldClassification.sensitive, "credential"),
    (re.compile(r"email|e[_ ]?mail"), FieldClassification.personal, "email"),
    (re.compile(r"phone|mobile|msisdn|contact[_ ]?(no|number)|whatsapp"), FieldClassification.personal, "phone"),
    (re.compile(r"\b(dob|birth)\b|date[_ ]?of[_ ]?birth"), FieldClassification.personal, "date_of_birth"),
    (re.compile(r"(first|last|middle|full|user|customer)?[_ ]?name\b|fname|lname"), FieldClassification.personal, "name"),
    (re.compile(r"address|street|city|state|pincode|postal|zip"), FieldClassification.personal, "address"),
    (re.compile(r"\bip\b|ip[_ ]?addr"), FieldClassification.personal, "ip_address"),
    (re.compile(r"gender|\bsex\b"), FieldClassification.personal, "gender"),
    (re.compile(r"geo|latitude|longitude|location|lat|lng|lon"), FieldClassification.personal, "location"),
]

_AUDIT_TRACKED_ASSET_FIELDS = {
    "name",
    "status",
    "country",
    "cross_border_transfer",
    "transfer_mechanism",
    "dpia_required",
    "contains_child_data",
    "owner",
    "location",
}

_AUDIT_TRACKED_FIELD_ATTRS = {
    "classification",
    "pii_category",
    "security_safeguard",
    "is_encrypted",
    "is_child_data",
    "mandatory_retention",
    "mandatory_retention_days",
    "status",
}


def classify_column_name(name: str) -> tuple[FieldClassification, str | None]:
    normalized = re.sub(r"[^a-z0-9]+", " ", name.lower())
    for pattern, classification, category in _CLASSIFY_RULES:
        if pattern.search(normalized):
            return classification, category
    return FieldClassification.unclassified, None


def _sync_encryption_flags(
    *,
    is_encrypted: bool | None = None,
    security_safeguard: SecuritySafeguard | None = None,
) -> tuple[bool, SecuritySafeguard]:
    """Keep is_encrypted and security_safeguard aligned."""
    if security_safeguard is not None:
        encrypted = security_safeguard == SecuritySafeguard.encryption
        return encrypted, security_safeguard
    if is_encrypted is not None:
        safeguard = SecuritySafeguard.encryption if is_encrypted else SecuritySafeguard.none
        return is_encrypted, safeguard
    return False, SecuritySafeguard.none


class DataInventoryService:
    def __init__(self, db: Session):
        self.db = db

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
                    detail="Data inventory requires an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Data inventory requires an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _get_asset(self, user: User, asset_id: UUID, org_id: UUID | None) -> DataInventoryAsset:
        resolved = self._resolve_org_id(user, org_id)
        asset = self.db.get(
            DataInventoryAsset,
            asset_id,
            options=(selectinload(DataInventoryAsset.fields),),
        )
        if asset is None or asset.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Asset not found")
        return asset

    def _get_field(self, user: User, field_id: UUID, org_id: UUID | None) -> DataInventoryField:
        resolved = self._resolve_org_id(user, org_id)
        field = self.db.get(DataInventoryField, field_id)
        if field is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Field not found")
        if field.asset is None or field.asset.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Field not found")
        return field

    def _require_data_asset_write(self, user: User, asset: DataInventoryAsset) -> None:
        if user.role == UserRole.data_steward:
            if not can_access_data_asset_scope(self.db, user):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Out of steward scope")
            return
        if not has_permission(user, Permission.DATA_ASSET_WRITE) and user.role not in (
            UserRole.admin,
            UserRole.superadmin,
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    def _validate_data_source(self, resolved_org: UUID, data_source_id: UUID | None) -> None:
        if data_source_id is None:
            return
        src = self.db.get(DataSource, data_source_id)
        if src is None or src.organization_id != resolved_org:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Data source not found")

    def _write_audit(
        self,
        *,
        organization_id: UUID,
        asset_id: UUID,
        actor: User,
        action: AuditAction,
        field_id: UUID | None = None,
        field_name: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
    ) -> None:
        self.db.add(
            DataInventoryAuditLog(
                organization_id=organization_id,
                asset_id=asset_id,
                field_id=field_id,
                actor_id=actor.id,
                action=action,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
            )
        )

    @staticmethod
    def _field_counts(asset: DataInventoryAsset) -> tuple[int, int, int]:
        total = len(asset.fields)
        personal = sum(1 for f in asset.fields if f.classification == FieldClassification.personal)
        sensitive = sum(
            1 for f in asset.fields if f.classification == FieldClassification.sensitive
        )
        return total, personal, sensitive

    def _source_names_for_assets(self, assets: list[DataInventoryAsset]) -> dict[UUID, str]:
        ids = {a.data_source_id for a in assets if a.data_source_id}
        if not ids:
            return {}
        rows = self.db.execute(
            select(DataSource.id, DataSource.name).where(DataSource.id.in_(ids))
        ).all()
        return {row[0]: row[1] for row in rows}

    def _source_name_for_asset(self, asset: DataInventoryAsset) -> str | None:
        if not asset.data_source_id:
            return None
        src = self.db.get(DataSource, asset.data_source_id)
        return src.name if src else None

    def _asset_defaults_from_source(self, source: DataSource) -> dict:
        """Prefill inventory asset fields from source governance metadata."""
        settings = self.db.scalar(
            select(OrganizationSettings).where(
                OrganizationSettings.organization_id == source.organization_id
            )
        )
        processor = (
            self.db.get(DataProcessor, source.data_processor_id)
            if source.data_processor_id
            else None
        )
        residency = compute_residency_flag(source, settings, processor)
        asset_type = (
            AssetType.file_system
            if source.category in ("upload", "files")
            else AssetType.table
        )
        return {
            "owner": source.owner_name,
            "location": source.region or source.host or source.name,
            "country": region_to_country_code(source.region),
            "cross_border_transfer": residency == "outside_approved_residency",
            "asset_type": asset_type,
        }

    def _ensure_processor_link(self, asset: DataInventoryAsset, source: DataSource) -> None:
        if not source.data_processor_id:
            return
        existing = self.db.scalar(
            select(DataInventoryAssetProcessor).where(
                DataInventoryAssetProcessor.asset_id == asset.id,
                DataInventoryAssetProcessor.processor_id == source.data_processor_id,
            )
        )
        if existing:
            return
        self.db.add(
            DataInventoryAssetProcessor(
                asset_id=asset.id,
                processor_id=source.data_processor_id,
                data_categories_shared=[],
            )
        )

    def _serialize_asset(
        self, asset: DataInventoryAsset, *, data_source_name: str | None = None
    ) -> AssetRead:
        total, personal, sensitive = self._field_counts(asset)
        return AssetRead(
            id=asset.id,
            organization_id=asset.organization_id,
            data_source_id=asset.data_source_id,
            data_source_name=data_source_name,
            name=asset.name,
            asset_type=asset.asset_type,
            location=asset.location,
            owner=asset.owner,
            record_count=asset.record_count,
            description=asset.description,
            data_categories=asset.data_categories or [],
            status=asset.status,
            country=asset.country,
            cross_border_transfer=asset.cross_border_transfer,
            transfer_mechanism=asset.transfer_mechanism,
            dpia_required=asset.dpia_required,
            contains_child_data=asset.contains_child_data,
            last_imported_at=asset.last_imported_at,
            field_count=total,
            personal_field_count=personal,
            sensitive_field_count=sensitive,
            created_at=asset.created_at,
            updated_at=asset.updated_at,
        )

    def _serialize_detail(
        self, asset: DataInventoryAsset, *, data_source_name: str | None = None
    ) -> AssetDetail:
        base = self._serialize_asset(asset, data_source_name=data_source_name)
        return AssetDetail(
            **base.model_dump(),
            fields=[FieldRead.model_validate(f) for f in sorted(asset.fields, key=lambda x: x.name)],
        )

    def _serialize_processor_link(self, link: DataInventoryAssetProcessor) -> ProcessorLinkRead:
        processor = link.processor
        return ProcessorLinkRead(
            id=link.id,
            asset_id=link.asset_id,
            processor_id=link.processor_id,
            processor_name=processor.name if processor else "Unknown",
            processor_dpa_status=processor.dpa_status.value if processor and processor.dpa_status else None,
            data_categories_shared=link.data_categories_shared or [],
            notes=link.notes,
            created_at=link.created_at,
        )

    def _serialize_activity_link(self, link: DataInventoryAssetActivity) -> ActivityLinkRead:
        activity = link.activity
        return ActivityLinkRead(
            id=link.id,
            asset_id=link.asset_id,
            activity_id=link.activity_id,
            activity_title=activity.title if activity else "Unknown",
            activity_ref=activity.activity_ref if activity else None,
            risk_level=activity.risk_level if activity else None,
            notes=link.notes,
            created_at=link.created_at,
        )

    # --- asset CRUD ---

    def list_assets(
        self,
        user: User,
        org_id: UUID | None = None,
        data_source_id: UUID | None = None,
    ) -> list[AssetRead]:
        resolved = self._resolve_org_id(user, org_id)
        stmt = (
            select(DataInventoryAsset)
            .where(DataInventoryAsset.organization_id == resolved)
            .options(selectinload(DataInventoryAsset.fields))
            .order_by(DataInventoryAsset.created_at.desc())
        )
        if data_source_id is not None:
            stmt = stmt.where(DataInventoryAsset.data_source_id == data_source_id)
        rows = self.db.execute(stmt).scalars().all()
        names = self._source_names_for_assets(rows)
        return [
            self._serialize_asset(a, data_source_name=names.get(a.data_source_id) if a.data_source_id else None)
            for a in rows
        ]

    def get_asset(self, user: User, asset_id: UUID, org_id: UUID | None = None) -> AssetDetail:
        asset = self._get_asset(user, asset_id, org_id)
        return self._serialize_detail(asset, data_source_name=self._source_name_for_asset(asset))

    def create_asset(
        self, user: User, body: AssetCreate, org_id: UUID | None = None
    ) -> AssetDetail:
        resolved = self._resolve_org_id(user, org_id)
        self._validate_data_source(resolved, body.data_source_id)
        asset = DataInventoryAsset(
            organization_id=resolved,
            data_source_id=body.data_source_id,
            name=body.name,
            asset_type=body.asset_type,
            location=body.location,
            owner=body.owner,
            record_count=body.record_count,
            description=body.description,
            data_categories=body.data_categories,
            status=body.status,
            country=body.country,
            cross_border_transfer=body.cross_border_transfer,
            transfer_mechanism=body.transfer_mechanism,
            dpia_required=body.dpia_required,
            contains_child_data=body.contains_child_data,
        )
        self.db.add(asset)
        self.db.flush()
        self._write_audit(
            organization_id=resolved,
            asset_id=asset.id,
            actor=user,
            action=AuditAction.created,
            field_name="asset",
            new_value=body.name,
        )
        self.db.commit()
        self.db.refresh(asset)
        return self._serialize_detail(asset, data_source_name=self._source_name_for_asset(asset))

    def update_asset(
        self, user: User, asset_id: UUID, body: AssetUpdate, org_id: UUID | None = None
    ) -> AssetDetail:
        asset = self._get_asset(user, asset_id, org_id)
        self._require_data_asset_write(user, asset)
        data = body.model_dump(exclude_unset=True)
        if "data_source_id" in data:
            self._validate_data_source(asset.organization_id, data["data_source_id"])
        for field, value in data.items():
            if field in _AUDIT_TRACKED_ASSET_FIELDS:
                old = getattr(asset, field)
                if old != value:
                    self._write_audit(
                        organization_id=asset.organization_id,
                        asset_id=asset.id,
                        actor=user,
                        action=AuditAction.updated,
                        field_name=field,
                        old_value=str(old) if old is not None else None,
                        new_value=str(value) if value is not None else None,
                    )
            setattr(asset, field, value)
        self.db.commit()
        self.db.refresh(asset)
        return self._serialize_detail(asset, data_source_name=self._source_name_for_asset(asset))

    def bulk_update_status(
        self, user: User, body: BulkStatusUpdate, org_id: UUID | None = None
    ) -> BulkStatusResult:
        resolved = self._resolve_org_id(user, org_id)
        updated = 0
        for asset_id in body.asset_ids:
            asset = self.db.get(DataInventoryAsset, asset_id)
            if asset is None or asset.organization_id != resolved:
                continue
            self._require_data_asset_write(user, asset)
            if asset.status != body.status:
                self._write_audit(
                    organization_id=resolved,
                    asset_id=asset.id,
                    actor=user,
                    action=AuditAction.updated,
                    field_name="status",
                    old_value=asset.status.value,
                    new_value=body.status.value,
                )
                asset.status = body.status
                updated += 1
        self.db.commit()
        return BulkStatusResult(updated=updated)

    def delete_asset(self, user: User, asset_id: UUID, org_id: UUID | None = None) -> None:
        asset = self._get_asset(user, asset_id, org_id)
        self._require_data_asset_write(user, asset)
        self._write_audit(
            organization_id=asset.organization_id,
            asset_id=asset.id,
            actor=user,
            action=AuditAction.deleted,
            field_name="asset",
            old_value=asset.name,
        )
        self.db.delete(asset)
        self.db.commit()

    # --- field CRUD ---

    def add_field(
        self, user: User, asset_id: UUID, body: FieldCreate, org_id: UUID | None = None
    ) -> FieldRead:
        asset = self._get_asset(user, asset_id, org_id)
        self._require_data_asset_write(user, asset)
        encrypted, safeguard = _sync_encryption_flags(
            is_encrypted=body.is_encrypted,
            security_safeguard=body.security_safeguard,
        )
        field = DataInventoryField(
            asset_id=asset.id,
            name=body.name,
            data_type=body.data_type,
            classification=body.classification,
            pii_category=body.pii_category,
            is_encrypted=encrypted,
            security_safeguard=safeguard,
            classification_source=body.classification_source,
            is_child_data=body.is_child_data,
            mandatory_retention=body.mandatory_retention,
            mandatory_retention_days=body.mandatory_retention_days,
            notes=body.notes,
        )
        self.db.add(field)
        self.db.flush()
        self._write_audit(
            organization_id=asset.organization_id,
            asset_id=asset.id,
            field_id=field.id,
            actor=user,
            action=AuditAction.created,
            field_name=field.name,
            new_value=field.classification.value,
        )
        self.db.commit()
        self.db.refresh(field)
        return FieldRead.model_validate(field)

    def update_field(
        self, user: User, field_id: UUID, body: FieldUpdate, org_id: UUID | None = None
    ) -> FieldRead:
        field = self._get_field(user, field_id, org_id)
        self._require_data_asset_write(user, field.asset)
        data = body.model_dump(exclude_unset=True)

        if "security_safeguard" in data or "is_encrypted" in data:
            encrypted, safeguard = _sync_encryption_flags(
                is_encrypted=data.get("is_encrypted", field.is_encrypted),
                security_safeguard=data.get("security_safeguard", field.security_safeguard),
            )
            data["is_encrypted"] = encrypted
            data["security_safeguard"] = safeguard

        if "classification" in data and data["classification"] != field.classification:
            data["classification_source"] = ClassificationSource.manual

        for attr, value in data.items():
            if attr in _AUDIT_TRACKED_FIELD_ATTRS or attr == "classification":
                old = getattr(field, attr, None)
                old_str = old.value if hasattr(old, "value") else str(old) if old is not None else None
                new_str = value.value if hasattr(value, "value") else str(value) if value is not None else None
                if old_str != new_str:
                    self._write_audit(
                        organization_id=field.asset.organization_id,
                        asset_id=field.asset_id,
                        field_id=field.id,
                        actor=user,
                        action=AuditAction.updated,
                        field_name=attr,
                        old_value=old_str,
                        new_value=new_str,
                    )
            setattr(field, attr, value)

        self.db.commit()
        self.db.refresh(field)
        return FieldRead.model_validate(field)

    def delete_field(self, user: User, field_id: UUID, org_id: UUID | None = None) -> None:
        field = self._get_field(user, field_id, org_id)
        self._require_data_asset_write(user, field.asset)
        self._write_audit(
            organization_id=field.asset.organization_id,
            asset_id=field.asset_id,
            field_id=field.id,
            actor=user,
            action=AuditAction.deleted,
            field_name=field.name,
            old_value=field.classification.value,
        )
        self.db.delete(field)
        self.db.commit()

    # --- processor / activity links ---

    def list_asset_processors(
        self, user: User, asset_id: UUID, org_id: UUID | None = None
    ) -> list[ProcessorLinkRead]:
        asset = self._get_asset(user, asset_id, org_id)
        links = self.db.execute(
            select(DataInventoryAssetProcessor)
            .where(DataInventoryAssetProcessor.asset_id == asset.id)
            .options(selectinload(DataInventoryAssetProcessor.processor))
        ).scalars().all()
        return [self._serialize_processor_link(link) for link in links]

    def link_processor(
        self, user: User, asset_id: UUID, body: ProcessorLinkCreate, org_id: UUID | None = None
    ) -> ProcessorLinkRead:
        asset = self._get_asset(user, asset_id, org_id)
        self._require_data_asset_write(user, asset)
        processor = self.db.get(DataProcessor, body.processor_id)
        if processor is None or processor.organization_id != asset.organization_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Processor not found")
        existing = self.db.scalar(
            select(DataInventoryAssetProcessor).where(
                DataInventoryAssetProcessor.asset_id == asset.id,
                DataInventoryAssetProcessor.processor_id == body.processor_id,
            )
        )
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Processor already linked")
        link = DataInventoryAssetProcessor(
            asset_id=asset.id,
            processor_id=body.processor_id,
            data_categories_shared=body.data_categories_shared,
            notes=body.notes,
        )
        self.db.add(link)
        self.db.flush()
        link.processor = processor
        self._write_audit(
            organization_id=asset.organization_id,
            asset_id=asset.id,
            actor=user,
            action=AuditAction.created,
            field_name="processor_link",
            new_value=processor.name,
        )
        self.db.commit()
        self.db.refresh(link)
        return self._serialize_processor_link(link)

    def unlink_processor(
        self, user: User, asset_id: UUID, link_id: UUID, org_id: UUID | None = None
    ) -> None:
        asset = self._get_asset(user, asset_id, org_id)
        self._require_data_asset_write(user, asset)
        link = self.db.get(DataInventoryAssetProcessor, link_id)
        if link is None or link.asset_id != asset.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Link not found")
        self._write_audit(
            organization_id=asset.organization_id,
            asset_id=asset.id,
            actor=user,
            action=AuditAction.deleted,
            field_name="processor_link",
            old_value=link.processor.name if link.processor else str(link.processor_id),
        )
        self.db.delete(link)
        self.db.commit()

    def list_asset_activities(
        self, user: User, asset_id: UUID, org_id: UUID | None = None
    ) -> list[ActivityLinkRead]:
        asset = self._get_asset(user, asset_id, org_id)
        links = self.db.execute(
            select(DataInventoryAssetActivity)
            .where(DataInventoryAssetActivity.asset_id == asset.id)
            .options(selectinload(DataInventoryAssetActivity.activity))
        ).scalars().all()
        return [self._serialize_activity_link(link) for link in links]

    def link_activity(
        self, user: User, asset_id: UUID, body: ActivityLinkCreate, org_id: UUID | None = None
    ) -> ActivityLinkRead:
        asset = self._get_asset(user, asset_id, org_id)
        self._require_data_asset_write(user, asset)
        activity = self.db.get(ProcessingActivity, body.activity_id)
        if activity is None or activity.organization_id != asset.organization_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Processing activity not found")
        existing = self.db.scalar(
            select(DataInventoryAssetActivity).where(
                DataInventoryAssetActivity.asset_id == asset.id,
                DataInventoryAssetActivity.activity_id == body.activity_id,
            )
        )
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Activity already linked")
        link = DataInventoryAssetActivity(
            asset_id=asset.id,
            activity_id=body.activity_id,
            notes=body.notes,
        )
        self.db.add(link)
        self.db.flush()
        link.activity = activity
        self._write_audit(
            organization_id=asset.organization_id,
            asset_id=asset.id,
            actor=user,
            action=AuditAction.created,
            field_name="activity_link",
            new_value=activity.title,
        )
        self.db.commit()
        self.db.refresh(link)
        return self._serialize_activity_link(link)

    def unlink_activity(
        self, user: User, asset_id: UUID, link_id: UUID, org_id: UUID | None = None
    ) -> None:
        asset = self._get_asset(user, asset_id, org_id)
        self._require_data_asset_write(user, asset)
        link = self.db.get(DataInventoryAssetActivity, link_id)
        if link is None or link.asset_id != asset.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Link not found")
        self._write_audit(
            organization_id=asset.organization_id,
            asset_id=asset.id,
            actor=user,
            action=AuditAction.deleted,
            field_name="activity_link",
            old_value=link.activity.title if link.activity else str(link.activity_id),
        )
        self.db.delete(link)
        self.db.commit()

    # --- audit log ---

    def get_audit_log(
        self, user: User, asset_id: UUID, org_id: UUID | None = None, limit: int = 100
    ) -> list[AuditLogEntry]:
        asset = self._get_asset(user, asset_id, org_id)
        rows = self.db.execute(
            select(DataInventoryAuditLog)
            .where(DataInventoryAuditLog.asset_id == asset.id)
            .options(selectinload(DataInventoryAuditLog.actor))
            .order_by(DataInventoryAuditLog.created_at.desc())
            .limit(limit)
        ).scalars().all()
        return [
            AuditLogEntry(
                id=row.id,
                organization_id=row.organization_id,
                asset_id=row.asset_id,
                field_id=row.field_id,
                actor_id=row.actor_id,
                actor_email=row.actor.email if row.actor else None,
                action=row.action,
                field_name=row.field_name,
                old_value=row.old_value,
                new_value=row.new_value,
                created_at=row.created_at,
            )
            for row in rows
        ]

    # --- usage map ---

    def get_usage_map(
        self, user: User, asset_id: UUID, org_id: UUID | None = None
    ) -> AssetUsageMap:
        asset = self._get_asset(user, asset_id, org_id)
        field_ids = [f.id for f in asset.fields]

        purpose_map: dict[UUID, UsagePurposeEntry] = {}
        if field_ids:
            mappings = self.db.execute(
                select(PurposeDataMapping)
                .where(
                    PurposeDataMapping.organization_id == asset.organization_id,
                    PurposeDataMapping.inventory_field_id.in_(field_ids),
                )
                .options(
                    selectinload(PurposeDataMapping.inventory_field),
                    selectinload(PurposeDataMapping.purpose).selectinload(Purpose.current_live_version),
                )
            ).scalars().all()

            field_by_id = {f.id: f for f in asset.fields}
            for mapping in mappings:
                purpose = mapping.purpose
                if purpose is None:
                    continue
                entry = purpose_map.get(purpose.id)
                field = field_by_id.get(mapping.inventory_field_id)
                if entry is None:
                    entry = UsagePurposeEntry(
                        purpose_id=purpose.id,
                        purpose_name=purpose.name,
                        legal_basis=purpose.legal_basis.value,
                        field_ids=[mapping.inventory_field_id],
                        field_names=[field.name] if field else [],
                    )
                    purpose_map[purpose.id] = entry
                else:
                    if mapping.inventory_field_id not in entry.field_ids:
                        entry.field_ids.append(mapping.inventory_field_id)
                        if field:
                            entry.field_names.append(field.name)

        processors = self.list_asset_processors(user, asset_id, org_id)
        activities = self.list_asset_activities(user, asset_id, org_id)

        return AssetUsageMap(
            asset_id=asset.id,
            asset_name=asset.name,
            purpose_count=len(purpose_map),
            processor_count=len(processors),
            activity_count=len(activities),
            purposes=list(purpose_map.values()),
            processors=processors,
            activities=activities,
        )

    # --- CSV export ---

    def export_csv(self, user: User, org_id: UUID | None = None) -> str:
        resolved = self._resolve_org_id(user, org_id)
        assets = self.db.execute(
            select(DataInventoryAsset)
            .where(DataInventoryAsset.organization_id == resolved)
            .options(selectinload(DataInventoryAsset.fields))
            .order_by(DataInventoryAsset.name)
        ).scalars().all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "asset_name",
            "asset_type",
            "status",
            "location",
            "country",
            "cross_border_transfer",
            "transfer_mechanism",
            "dpia_required",
            "contains_child_data",
            "owner",
            "record_count",
            "field_name",
            "field_type",
            "classification",
            "pii_category",
            "security_safeguard",
            "classification_source",
            "is_child_data",
            "mandatory_retention",
            "mandatory_retention_days",
        ])
        for asset in assets:
            if not asset.fields:
                writer.writerow([
                    asset.name,
                    asset.asset_type.value,
                    asset.status.value,
                    asset.location or "",
                    asset.country or "",
                    asset.cross_border_transfer,
                    asset.transfer_mechanism or "",
                    asset.dpia_required,
                    asset.contains_child_data,
                    asset.owner or "",
                    asset.record_count or "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                ])
            else:
                for field in sorted(asset.fields, key=lambda f: f.name):
                    writer.writerow([
                        asset.name,
                        asset.asset_type.value,
                        asset.status.value,
                        asset.location or "",
                        asset.country or "",
                        asset.cross_border_transfer,
                        asset.transfer_mechanism or "",
                        asset.dpia_required,
                        asset.contains_child_data,
                        asset.owner or "",
                        asset.record_count or "",
                        field.name,
                        field.data_type or "",
                        field.classification.value,
                        field.pii_category or "",
                        field.security_safeguard.value,
                        field.classification_source.value,
                        field.is_child_data,
                        field.mandatory_retention,
                        field.mandatory_retention_days or "",
                    ])
        return output.getvalue()

    # --- schema introspection ---

    def import_schema_from_source(
        self, user: User, source_id: UUID, org_id: UUID | None = None
    ) -> SchemaImportResult:
        resolved = self._resolve_org_id(user, org_id)
        source = self.db.get(DataSource, source_id)
        if source is None or source.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")

        if db_connector.supports_schema_import(source):
            try:
                tables = self._db_tables(source)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, detail=f"Schema scan failed: {exc}"
                ) from exc
        elif source.category in ("upload", "files"):
            try:
                tables = self._file_tables(source)
            except HTTPException:
                raise
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, detail=f"File parsing failed: {exc}"
                ) from exc
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Auto-import isn't available for '{source.source_type}' sources. "
                    "Run a PII scan to catalog them, or add assets manually."
                ),
            )

        if not tables:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    "No columnar data found to import (free-text files like PDF/DOCX have "
                    "no columns). Run a PII scan instead, or add the asset manually."
                ),
            )
        return self._upsert_tables(resolved, source, tables, user=user)

    def _db_tables(self, source: DataSource) -> list[tuple[str, list[tuple[str, str]]]]:
        out: list[tuple[str, list[tuple[str, str]]]] = []
        for tbl in db_connector.read_schema(source):
            asset_name = (
                tbl.table if tbl.schema in ("", "public") else f"{tbl.schema}.{tbl.table}"
            )
            out.append((asset_name, list(tbl.columns)))
        return out

    def _file_tables(self, source: DataSource) -> list[tuple[str, list[tuple[str, str]]]]:
        from pathlib import Path

        from app.services import file_scanner, file_source_reader

        out: list[tuple[str, list[tuple[str, str]]]] = []

        def collect(parsed, fallback_name: str) -> None:
            for table in parsed.tables:
                cols = [(c, "text") for c in table.columns]
                if cols:
                    out.append((table.name or fallback_name, cols))

        if source.category == "upload":
            cfg = source.extra_config or {}
            path = cfg.get("stored_path")
            if not path:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, detail="No file is associated with this source."
                )
            filename = cfg.get("original_filename") or Path(path).name
            collect(file_scanner.parse_file(path, filename), filename)
        else:
            seen = 0
            for name, data in file_source_reader.iter_files(source):
                seen += 1
                try:
                    parsed = file_scanner.parse_bytes(data, name)
                except ValueError:
                    continue
                collect(parsed, name)
            if seen == 0:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="No supported files found in this source (CSV/TSV/XLSX/JSON).",
                )
        return out

    def _upsert_tables(
        self,
        resolved: UUID,
        source: DataSource,
        tables: list[tuple[str, list[tuple[str, str]]]],
        *,
        user: User | None = None,
    ) -> SchemaImportResult:
        now = datetime.now(UTC)
        defaults = self._asset_defaults_from_source(source)
        existing_assets = {
            a.name: a
            for a in self.db.execute(
                select(DataInventoryAsset)
                .where(
                    DataInventoryAsset.organization_id == resolved,
                    DataInventoryAsset.data_source_id == source.id,
                )
                .options(selectinload(DataInventoryAsset.fields))
            )
            .scalars()
            .all()
        }

        assets_created = assets_updated = fields_created = fields_updated = auto_classified = 0

        for asset_name, columns in tables:
            asset = existing_assets.get(asset_name)
            if asset is None:
                asset = DataInventoryAsset(
                    organization_id=resolved,
                    data_source_id=source.id,
                    name=asset_name,
                    asset_type=defaults["asset_type"],
                    location=defaults["location"],
                    owner=defaults["owner"],
                    country=defaults["country"],
                    cross_border_transfer=defaults["cross_border_transfer"],
                    status=AssetStatus.active,
                    data_categories=[],
                    last_imported_at=now,
                )
                self.db.add(asset)
                self.db.flush()
                existing_assets[asset_name] = asset
                self._ensure_processor_link(asset, source)
                assets_created += 1
            else:
                asset.last_imported_at = now
                if not asset.owner and defaults["owner"]:
                    asset.owner = defaults["owner"]
                if not asset.country and defaults["country"]:
                    asset.country = defaults["country"]
                if not asset.cross_border_transfer and defaults["cross_border_transfer"]:
                    asset.cross_border_transfer = defaults["cross_border_transfer"]
                if asset.location in (None, "", source.name) and defaults["location"]:
                    asset.location = defaults["location"]
                self._ensure_processor_link(asset, source)
                assets_updated += 1

            existing_fields = {f.name: f for f in asset.fields}
            categories: set[str] = set()
            for col_name, col_type in columns:
                field = existing_fields.get(col_name)
                if field is None:
                    classification, category = classify_column_name(col_name)
                    field = DataInventoryField(
                        asset_id=asset.id,
                        name=col_name,
                        data_type=col_type,
                        classification=classification,
                        pii_category=category,
                        classification_source=ClassificationSource.heuristic,
                    )
                    self.db.add(field)
                    fields_created += 1
                    if classification != FieldClassification.unclassified:
                        auto_classified += 1
                else:
                    field.data_type = col_type
                    fields_updated += 1
                    category = field.pii_category
                if category:
                    categories.add(category)

            if categories:
                asset.data_categories = sorted(categories)

        self.db.commit()

        if user is not None:
            from app.services.data_source_service import DataSourceService

            DataSourceService(self.db).log_schema_scan(user, source.id, org_id=resolved)

        return SchemaImportResult(
            source_id=source.id,
            tables_found=len(tables),
            assets_created=assets_created,
            assets_updated=assets_updated,
            fields_created=fields_created,
            fields_updated=fields_updated,
            auto_classified=auto_classified,
            message=(
                f"Imported {len(tables)} table(s) from '{source.name}': "
                f"{assets_created} new, {fields_created} new field(s) "
                f"({auto_classified} auto-classified)."
            ),
        )

    # --- summary ---

    def get_summary(self, user: User, org_id: UUID | None = None) -> InventorySummary:
        resolved = self._resolve_org_id(user, org_id)
        total_assets = self.db.scalar(
            select(func.count(DataInventoryAsset.id)).where(
                DataInventoryAsset.organization_id == resolved
            )
        )
        review = self.db.scalar(
            select(func.count(DataInventoryAsset.id)).where(
                DataInventoryAsset.organization_id == resolved,
                DataInventoryAsset.status == AssetStatus.review_needed,
            )
        )

        def count_fields(classification: FieldClassification | None) -> int:
            stmt = (
                select(func.count(DataInventoryField.id))
                .join(DataInventoryAsset, DataInventoryField.asset_id == DataInventoryAsset.id)
                .where(DataInventoryAsset.organization_id == resolved)
            )
            if classification is not None:
                stmt = stmt.where(DataInventoryField.classification == classification)
            return self.db.scalar(stmt) or 0

        return InventorySummary(
            total_assets=total_assets or 0,
            total_fields=count_fields(None),
            personal_fields=count_fields(FieldClassification.personal),
            sensitive_fields=count_fields(FieldClassification.sensitive),
            unclassified_fields=count_fields(FieldClassification.unclassified),
            assets_needing_review=review or 0,
        )
