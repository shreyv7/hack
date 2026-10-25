"""Governance compliance dashboard persistence models."""

import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class DashboardVisibility(str, enum.Enum):
    private = "private"
    workspace = "workspace"
    organization = "organization"


class DashboardPermission(str, enum.Enum):
    read = "read"
    editor = "editor"
    owner = "owner"


class WidgetType(str, enum.Enum):
    kpi_card = "kpi_card"
    line_chart = "line_chart"
    bar_chart = "bar_chart"
    pie_chart = "pie_chart"
    donut_chart = "donut_chart"
    heatmap = "heatmap"
    table = "table"
    list = "list"
    compliance_card = "compliance_card"
    deadlines = "deadlines"
    risk_matrix = "risk_matrix"
    incident_timeline = "incident_timeline"
    scorecard = "scorecard"
    progress_bar = "progress_bar"
    map = "map"
    markdown = "markdown"
    ai_summary = "ai_summary"


class WidgetDataSource(str, enum.Enum):
    consent = "consent"
    proof_vault = "proof_vault"
    rights = "rights"
    dpia = "dpia"
    ropa = "ropa"
    policy = "policy"
    vendor_risk = "vendor_risk"
    security = "security"
    breach = "breach"
    audit = "audit"
    monitoring = "monitoring"
    compliance_score = "compliance_score"
    module_health = "module_health"
    retention = "retention"
    data_sources = "data_sources"


class ScheduleFrequency(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    custom = "custom"


class DeliveryChannel(str, enum.Enum):
    email = "email"
    slack = "slack"
    teams = "teams"
    webhook = "webhook"


class ExportFormat(str, enum.Enum):
    pdf = "pdf"
    xlsx = "xlsx"
    csv = "csv"
    pptx = "pptx"
    png = "png"
    json = "json"


class GovernanceDashboard(Base, BaseModel):
    __tablename__ = "governance_dashboards"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    slug = Column(String(120), nullable=False, index=True)
    visibility = Column(Enum(DashboardVisibility, name="governance_dashboard_visibility"), nullable=False, default=DashboardVisibility.private)
    is_template = Column(Boolean, nullable=False, default=False)
    template_key = Column(String(80), nullable=True, index=True)
    is_pinned = Column(Boolean, nullable=False, default=False)
    is_favourite = Column(Boolean, nullable=False, default=False)
    layout_json = Column(JSONB, nullable=False, default=dict)
    filters_json = Column(JSONB, nullable=False, default=dict)
    auto_refresh_seconds = Column(Integer, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    last_refreshed_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization")
    owner = relationship("User", foreign_keys=[owner_user_id])
    widgets = relationship("GovernanceWidget", back_populates="dashboard", cascade="all, delete-orphan")
    shares = relationship("GovernanceDashboardShare", back_populates="dashboard", cascade="all, delete-orphan")
    schedules = relationship("GovernanceDashboardSchedule", back_populates="dashboard", cascade="all, delete-orphan")
    versions = relationship("GovernanceDashboardVersion", back_populates="dashboard", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_governance_dashboard_org_slug"),
    )


class GovernanceWidget(Base, BaseModel):
    __tablename__ = "governance_widgets"

    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    widget_type = Column(Enum(WidgetType, name="governance_widget_type"), nullable=False)
    data_source = Column(Enum(WidgetDataSource, name="governance_widget_data_source"), nullable=False)
    title = Column(String(255), nullable=False)
    config_json = Column(JSONB, nullable=False, default=dict)
    layout_json = Column(JSONB, nullable=False, default=dict)
    sort_order = Column(Integer, nullable=False, default=0)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    dashboard = relationship("GovernanceDashboard", back_populates="widgets")


class GovernanceDashboardShare(Base, BaseModel):
    __tablename__ = "governance_dashboard_shares"

    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    shared_with_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    shared_with_role = Column(String(40), nullable=True)
    permission = Column(Enum(DashboardPermission, name="governance_dashboard_permission"), nullable=False, default=DashboardPermission.read)
    public_token = Column(String(64), nullable=True, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    password_hash = Column(String(255), nullable=True)

    dashboard = relationship("GovernanceDashboard", back_populates="shares")
    shared_with_user = relationship("User", foreign_keys=[shared_with_user_id])


class GovernanceDashboardSchedule(Base, BaseModel):
    __tablename__ = "governance_dashboard_schedules"

    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    frequency = Column(Enum(ScheduleFrequency, name="governance_schedule_frequency"), nullable=False)
    cron_expression = Column(String(120), nullable=True)
    delivery_channel = Column(Enum(DeliveryChannel, name="governance_delivery_channel"), nullable=False)
    delivery_config_json = Column(JSONB, nullable=False, default=dict)
    export_format = Column(Enum(ExportFormat, name="governance_export_format"), nullable=False, default=ExportFormat.pdf)
    is_active = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    dashboard = relationship("GovernanceDashboard", back_populates="schedules")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class GovernanceDashboardVersion(Base, BaseModel):
    __tablename__ = "governance_dashboard_versions"

    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    snapshot_json = Column(JSONB, nullable=False, default=dict)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    dashboard = relationship("GovernanceDashboard", back_populates="versions")
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        UniqueConstraint("dashboard_id", "version_number", name="uq_governance_dashboard_version"),
    )


class GovernanceDashboardFavorite(Base, BaseModel):
    __tablename__ = "governance_dashboard_favorites"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "dashboard_id", name="uq_governance_dashboard_favorite"),
    )


class GovernanceDashboardAudit(Base, BaseModel):
    __tablename__ = "governance_dashboard_audits"

    dashboard_id = Column(UUID(as_uuid=True), ForeignKey("governance_dashboards.id", ondelete="SET NULL"), nullable=True, index=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(80), nullable=False)
    details_json = Column(JSONB, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
