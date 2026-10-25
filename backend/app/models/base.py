"""
Reusable model building blocks.

Most tables in DPDPA Shield share three things:
  * a primary key,
  * created_at / updated_at timestamps,
  * a tenant_id (the platform is multi-tenant).

`BaseModel` below bundles the id + timestamps. Inherit from it to save
boilerplate. Example (this is just a pattern — no real model is defined yet):

    # app/models/tenant.py
    from sqlalchemy import Column, String
    from app.core.database import Base
    from app.models.base import BaseModel

    class Tenant(Base, BaseModel):
        __tablename__ = "tenants"
        name = Column(String, nullable=False)
        slug = Column(String, unique=True, nullable=False)

After writing a model, import it in app/models/__init__.py so Alembic can see
it, then run:  alembic revision --autogenerate -m "add tenants"
"""

import uuid

from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class BaseModel(TimestampMixin):
    """UUID primary key + timestamps. Combine with `Base` on each model."""

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


# NOTE: `UUID` above is the PostgreSQL-native UUID type. If you ever fall back
# to SQLite for a quick test, swap it for a String column, or use a portable
# GUID type. Postgres is the intended database, so this is the default.
