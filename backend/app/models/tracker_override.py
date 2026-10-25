import enum

from sqlalchemy import Column, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


# We reuse the TrackerCategory from detected_tracker, but wait, ENUM creation in alembic might conflict if we define it twice with same name?
# Actually, SQLAlchemy Handles it if we define an Enum type.
# It's better to reuse the Python Enum, so we'll import it. Or define it separately if needed.
# Since we might have circular imports, let's just define ActionEnum.

class TrackerAction(str, enum.Enum):
    allow = "allow"
    block = "block"
    auto = "auto" # Meaning rely on category logic


class TrackerOverride(Base, BaseModel):
    __tablename__ = "tracker_overrides"
    __table_args__ = (
        UniqueConstraint("property_id", "tracker_name", name="uq_override_property_tracker"),
    )

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    tracker_name = Column(String, nullable=False, index=True)
    
    # We use string for overridden_category instead of an Enum type to avoid duplicate enum type creation errors in postgres
    # Alternatively, we could reuse TrackerCategory enum but passing it directly.
    overridden_category = Column(String, nullable=True) # essential, analytics, marketing, functional
    
    action = Column(
        Enum(TrackerAction, name="tracker_action"),
        nullable=False,
        default=TrackerAction.auto,
    )

    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    property = relationship("IntegrationProperty", backref="tracker_overrides")
    purpose = relationship("Purpose", backref="tracker_overrides")
