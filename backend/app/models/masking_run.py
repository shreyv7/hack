"""Audit ledger for destructive in-place masking apply operations."""

import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel
from app.models.masking import MaskingStrategy


class MaskingRunTrigger(str, enum.Enum):
    manual = "manual"
    retention = "retention"
    withdrawal = "withdrawal"


class MaskingRun(Base, BaseModel):
    __tablename__ = "masking_runs"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    inventory_field_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_fields.id", ondelete="SET NULL"),
        nullable=True,
    )
    table_name = Column(String(255), nullable=False)
    column_name = Column(String(255), nullable=False)
    pii_category = Column(String(64), nullable=True)
    strategy = Column(Enum(MaskingStrategy, name="masking_strategy", create_type=False), nullable=False)
    rows_updated = Column(Integer, nullable=False, server_default="0")
    trigger = Column(
        Enum(MaskingRunTrigger, name="masking_run_trigger"),
        nullable=False,
        server_default="manual",
    )
    triggered_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    proof_vault_record_id = Column(
        UUID(as_uuid=True),
        ForeignKey("proof_vault_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization = relationship("Organization")
    data_source = relationship("DataSource")
    triggered_by = relationship("User")
