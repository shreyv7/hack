import enum

from sqlalchemy import Column, Enum, Integer, String, Text

from app.core.database import Base
from app.models.base import BaseModel


class RoleRequirement(str, enum.Enum):
    required = "required"
    recommended = "recommended"
    no = "no"
    mandatory = "mandatory"
    mandatory_high_risk = "mandatory-high-risk"


_role_requirement_enum = Enum(
    RoleRequirement,
    name="role_requirement",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class DpdpObligationDefinition(Base, BaseModel):
    """Read-only catalog for the DPDP role comparison matrix."""

    __tablename__ = "dpdp_obligation_definitions"

    sort_order = Column(Integer, nullable=False, default=0)
    obligation = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    statute_reference = Column(String(128), nullable=False)
    df_requirement = Column(_role_requirement_enum, nullable=False)
    dp_requirement = Column(_role_requirement_enum, nullable=False)
    sdf_requirement = Column(_role_requirement_enum, nullable=False)
