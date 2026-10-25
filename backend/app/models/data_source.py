"""
Data Source model — a registry of WHERE an organization's personal data lives.

This is the foundation of the Data Protection cluster: Data Inventory, the PII
Scanner, Retention Policies and Masking/Anonymisation all reference a data
source. The MVP is manual entry plus an optional "test connection" check.

Secrets note: `password` is stored on the row but is NEVER returned by the read
schema (`DataSourceRead`). There is no secrets manager yet — see
docs/MODULE_ROADMAP.md §3.1 for the planned hardening.
"""

import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class DataSourceCategory(str, enum.Enum):
    """Top-level grouping shown in the UI's source picker."""

    database = "database"
    cloud = "cloud"
    files = "files"
    api = "api"
    logs = "logs"
    upload = "upload"


# Connector catalog: the granular `source_type` slug → its category. The column
# itself is a free-form String (not a DB enum) so new connectors can be added
# without a migration; this map is the source of truth for which slugs are known
# and which category they belong to. Keep in sync with the frontend catalog in
# `frontend/src/types/dataSource.ts`.
CONNECTOR_CATEGORY: dict[str, DataSourceCategory] = {
    # Database
    "postgresql": DataSourceCategory.database,
    "mysql": DataSourceCategory.database,
    "mariadb": DataSourceCategory.database,
    "mongodb": DataSourceCategory.database,
    "oracle": DataSourceCategory.database,
    "sqlserver": DataSourceCategory.database,
    "sqlite": DataSourceCategory.database,
    "other_db": DataSourceCategory.database,
    # Cloud (managed/hosted databases)
    "aws_rds": DataSourceCategory.cloud,
    "azure_sql": DataSourceCategory.cloud,
    "gcp_sql": DataSourceCategory.cloud,
    "mongodb_atlas": DataSourceCategory.cloud,
    "self_hosted": DataSourceCategory.cloud,
    "other_cloud": DataSourceCategory.cloud,
    # Files / object storage
    "s3": DataSourceCategory.files,
    "azure_blob": DataSourceCategory.files,
    "gcs": DataSourceCategory.files,
    "gdrive": DataSourceCategory.files,
    "sftp": DataSourceCategory.files,
    # API
    "rest": DataSourceCategory.api,
    "graphql": DataSourceCategory.api,
    "soap": DataSourceCategory.api,
    "other_api": DataSourceCategory.api,
    # Logs
    "cloudwatch": DataSourceCategory.logs,
    "azure_monitor": DataSourceCategory.logs,
    "gcp_logging": DataSourceCategory.logs,
    "splunk": DataSourceCategory.logs,
    "other_logs": DataSourceCategory.logs,
    # Direct file upload
    "file_upload": DataSourceCategory.upload,
    # --- Legacy slugs (pre-taxonomy rows) kept valid so they still serialize.
    #     Not offered in the picker; superseded by the slugs above. ---
    "bigquery": DataSourceCategory.cloud,
    "snowflake": DataSourceCategory.cloud,
    "salesforce": DataSourceCategory.cloud,
    "api": DataSourceCategory.api,
}


def category_for(source_type: str) -> str | None:
    """Best-effort category for a connector slug (None if unknown)."""
    cat = CONNECTOR_CATEGORY.get(source_type)
    return cat.value if cat else None


class DataSourceStatus(str, enum.Enum):
    pending = "pending"      # created, never tested
    connected = "connected"  # last connection test succeeded
    error = "error"          # last connection test failed


class IntegrationMode(str, enum.Enum):
    """Discovery/reporting vs destructive retention/masking actions (Req 6)."""
    discovery = "discovery"
    read_write = "read_write"


class SourceEnvironment(str, enum.Enum):
    production = "production"
    staging = "staging"
    development = "development"
    test = "test"


class SourceCriticality(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class DataSource(Base, BaseModel):
    __tablename__ = "data_sources"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    # Granular connector slug, e.g. "postgresql", "s3", "splunk". Free-form
    # String (not a DB enum) so new connectors need no migration — validated
    # against CONNECTOR_CATEGORY at the schema layer.
    source_type = Column(String(64), nullable=False)
    # Top-level category (database | cloud | files | api | logs | upload).
    # Nullable for rows created before the taxonomy existed.
    category = Column(String(32), nullable=True)
    region = Column(String(128), nullable=True)
    description = Column(Text, nullable=True)

    # Connection metadata (non-secret).
    host = Column(String(255), nullable=True)
    port = Column(Integer, nullable=True)
    database_name = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True)
    # Secret — never serialized back to the client.
    password = Column(String(512), nullable=True)
    ssl_enabled = Column(Boolean, nullable=False, server_default="false")
    extra_config = Column(JSON, nullable=False, server_default="{}")

    integration_mode = Column(
        Enum(IntegrationMode, name="data_source_integration_mode"),
        nullable=True,
    )

    # Governance & accountability (DPDPA §8(1), §8(2), §8(5))
    owner_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    owner_name = Column(String(255), nullable=True)
    environment = Column(
        Enum(SourceEnvironment, name="data_source_environment"),
        nullable=False,
        default=SourceEnvironment.production,
        server_default="production",
    )
    criticality = Column(
        Enum(SourceCriticality, name="data_source_criticality"),
        nullable=False,
        default=SourceCriticality.medium,
        server_default="medium",
    )
    data_processor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_processors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    encryption_at_rest = Column(Boolean, nullable=False, server_default="false")
    credential_rotated_at = Column(DateTime(timezone=True), nullable=True)
    tags = Column(JSON, nullable=False, server_default="[]")
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    status = Column(
        Enum(DataSourceStatus, name="data_source_status"),
        nullable=False,
        default=DataSourceStatus.pending,
    )
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

    organization = relationship("Organization", back_populates="data_sources")
    owner_user = relationship("User", foreign_keys=[owner_user_id])
    data_processor = relationship("DataProcessor")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])


class DataSourceActivity(Base, BaseModel):
    """Audit trail for data source lifecycle events (mirrors CbtActivity pattern)."""

    __tablename__ = "data_source_activities"

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
    action = Column(String(100), nullable=False)
    source_name = Column(String(255), nullable=False)
    user_name = Column(String(255), nullable=False)
    details = Column(JSONB, nullable=True)
