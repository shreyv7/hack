"""
Data Inventory — the catalogue of WHAT personal data an organization holds.

Two levels:
  * DataInventoryAsset — a table / application / file / bucket. Optionally linked
    to a registered DataSource.
  * DataInventoryField — a column / field within an asset, each classified
    (personal / sensitive / non-personal). This is what the PII Scanner will
    later auto-populate (see docs/MODULE_ROADMAP.md §3.1 / §5.2).

Assets carry organization_id for tenant scoping; fields are scoped through their
parent asset (same pattern as DSAR reminder events).
"""

import enum
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class AssetType(str, enum.Enum):
    database = "database"
    application = "application"
    file_system = "file_system"
    api = "api"
    table = "table"
    collection = "collection"
    warehouse = "warehouse"
    other = "other"


class AssetStatus(str, enum.Enum):
    active = "active"
    review_needed = "review_needed"
    archived = "archived"


class FieldClassification(str, enum.Enum):
    unclassified = "unclassified"
    non_personal = "non_personal"
    personal = "personal"
    sensitive = "sensitive"  # sensitive personal data (health, financial, biometric…)


class SecuritySafeguard(str, enum.Enum):
    none = "none"
    encryption = "encryption"
    masking = "masking"
    obfuscation = "obfuscation"
    tokenization = "tokenization"


class ClassificationSource(str, enum.Enum):
    manual = "manual"
    heuristic = "heuristic"
    pii_scanner = "pii_scanner"


class AuditAction(str, enum.Enum):
    created = "created"
    updated = "updated"
    deleted = "deleted"


class DataInventoryAsset(Base, BaseModel):
    __tablename__ = "data_inventory_assets"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Optional link to a registered data source. SET NULL so deleting a source
    # doesn't erase the inventory catalogued from it.
    data_source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = Column(String(255), nullable=False)
    asset_type = Column(Enum(AssetType, name="asset_type"), nullable=False)
    location = Column(String(255), nullable=True)
    owner = Column(String(255), nullable=True)
    # Free-form record count to match how teams describe scale ("1.2M", "856K").
    record_count = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    # Quick asset-level category tags for display, e.g. ["Names", "Emails"].
    data_categories = Column(JSON, nullable=False, server_default="[]")
    status = Column(
        Enum(AssetStatus, name="asset_status"),
        nullable=False,
        default=AssetStatus.active,
    )
    # DPDPA Sec 16 — cross-border transfer metadata
    country = Column(String(3), nullable=True)
    cross_border_transfer = Column(Boolean, nullable=False, server_default="false")
    transfer_mechanism = Column(String(255), nullable=True)
    # DPDPA Sec 10 — SDF / high-risk assets may require DPIA
    dpia_required = Column(Boolean, nullable=False, server_default="false")
    # DPDPA Sec 9 — children's data flag at asset level
    contains_child_data = Column(Boolean, nullable=False, server_default="false")
    last_imported_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="data_inventory_assets")
    fields = relationship(
        "DataInventoryField",
        back_populates="asset",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    processor_links = relationship(
        "DataInventoryAssetProcessor",
        back_populates="asset",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    activity_links = relationship(
        "DataInventoryAssetActivity",
        back_populates="asset",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DataInventoryField(Base, BaseModel):
    __tablename__ = "data_inventory_fields"

    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    data_type = Column(String(128), nullable=True)  # e.g. varchar, int, jsonb
    classification = Column(
        Enum(FieldClassification, name="field_classification"),
        nullable=False,
        default=FieldClassification.unclassified,
    )
    # PII category label, e.g. "email", "phone", "aadhaar", "pan". Free-form so it
    # can grow as the PII Scanner learns new categories.
    pii_category = Column(String(64), nullable=True)
    is_encrypted = Column(Boolean, nullable=False, server_default="false")
    security_safeguard = Column(
        Enum(SecuritySafeguard, name="security_safeguard"),
        nullable=False,
        default=SecuritySafeguard.none,
        server_default="none",
    )
    classification_source = Column(
        Enum(ClassificationSource, name="classification_source"),
        nullable=False,
        default=ClassificationSource.manual,
        server_default="manual",
    )
    is_child_data = Column(Boolean, nullable=False, server_default="false")
    # DPDP legal hold: this field must be retained for a legal minimum even when a
    # retention policy would otherwise delete the row (e.g. processing/traffic logs
    # kept ≥1 year after consent withdrawal). Days default to 365 when flagged.
    mandatory_retention = Column(Boolean, nullable=False, server_default="false")
    mandatory_retention_days = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    asset = relationship("DataInventoryAsset", back_populates="fields")


class DataInventoryAssetProcessor(Base, BaseModel):
    """Links an inventory asset to a third-party processor (DPDPA Sec 8(2), Sec 11)."""

    __tablename__ = "data_inventory_asset_processors"
    __table_args__ = (
        UniqueConstraint("asset_id", "processor_id", name="uq_inventory_asset_processor"),
    )

    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    processor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_processors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_categories_shared = Column(JSON, nullable=False, server_default="[]")
    notes = Column(Text, nullable=True)

    asset = relationship("DataInventoryAsset", back_populates="processor_links")
    processor = relationship("DataProcessor", backref="inventory_asset_links")


class DataInventoryAssetActivity(Base, BaseModel):
    """Links an inventory asset to a RoPA processing activity (DPDPA Sec 8(1))."""

    __tablename__ = "data_inventory_asset_activities"
    __table_args__ = (
        UniqueConstraint("asset_id", "activity_id", name="uq_inventory_asset_activity"),
    )

    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    notes = Column(Text, nullable=True)

    asset = relationship("DataInventoryAsset", back_populates="activity_links")
    activity = relationship("ProcessingActivity", backref="inventory_asset_links")


class DataInventoryAuditLog(Base):
    """Audit trail for classification and metadata changes (DPDPA Sec 10)."""

    __tablename__ = "data_inventory_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_fields.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action = Column(Enum(AuditAction, name="inventory_audit_action"), nullable=False)
    field_name = Column(String(128), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    asset = relationship("DataInventoryAsset", backref="audit_logs")
    field = relationship("DataInventoryField", backref="audit_logs")
    actor = relationship("User")
