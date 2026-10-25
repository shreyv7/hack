"""
Data Masking & Anonymisation rules.

A MaskingRule says "for PII category X, apply strategy Y" (e.g. aadhaar → hash,
email → mask). Rules drive both the structured-column masking preview and the
default operators for free-text anonymisation. Transforms run through Microsoft
Presidio's anonymizer operators (see app/services/masking_service.py).
"""

import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class MaskingStrategy(str, enum.Enum):
    mask = "mask"            # partial mask, keep a few chars (reversible? no — display)
    redact = "redact"        # remove entirely
    hash = "hash"            # SHA-256, irreversible
    replace = "replace"      # fixed token, e.g. <EMAIL>
    encrypt = "encrypt"      # reversible (Fernet)
    generalize = "generalize"  # reduce precision (date→year, number→range)


class MaskingRule(Base, BaseModel):
    __tablename__ = "masking_rules"
    __table_args__ = (
        UniqueConstraint("organization_id", "pii_category", name="uq_masking_rule_org_category"),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A PII category from the scanner ("email", "aadhaar", …) or "*" for default.
    pii_category = Column(String(64), nullable=False)
    strategy = Column(Enum(MaskingStrategy, name="masking_strategy"), nullable=False)
    params = Column(JSON, nullable=False, server_default="{}")
    enabled = Column(Boolean, nullable=False, server_default="true")

    organization = relationship("Organization", back_populates="masking_rules")
