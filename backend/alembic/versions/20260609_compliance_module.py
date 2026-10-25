"""Compliance module — map catalog, safeguards, breach, audit log

Revision ID: 20260609_compliance
Revises: 20260608_dpdpa
Create Date: 2026-06-09
"""

from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.scripts.seed_compliance_map import (
    SECTION_6_EXCERPT,
    SECTION_6_FEATURES,
    STATUTE_SECTIONS,
)

revision: str = "20260609_compliance"
down_revision: Union[str, None] = ("20260608_dpdpa", "20260607_css_2500")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

section_coverage_status = postgresql.ENUM(
    "covered", "partial", "na", name="section_coverage_status", create_type=False
)
security_control_status = postgresql.ENUM(
    "documented", "partial", "missing", name="security_control_status", create_type=False
)
breach_incident_status = postgresql.ENUM(
    "draft", "submitted", "closed", name="breach_incident_status", create_type=False
)
breach_notification_channel = postgresql.ENUM(
    "dpb_email", "dp_email", "public", name="breach_notification_channel", create_type=False
)
audit_event_type = postgresql.ENUM(
    "Configuration", "Deletion", "Consent", "Access", "Rights", "Breach",
    name="audit_event_type", create_type=False,
)
audit_severity = postgresql.ENUM(
    "info", "warning", "critical", name="audit_severity", create_type=False
)


def upgrade() -> None:
    section_coverage_status.create(op.get_bind(), checkfirst=True)
    security_control_status.create(op.get_bind(), checkfirst=True)
    breach_incident_status.create(op.get_bind(), checkfirst=True)
    breach_notification_channel.create(op.get_bind(), checkfirst=True)
    audit_event_type.create(op.get_bind(), checkfirst=True)
    audit_severity.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "dpdpa_statute_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("section_key", sa.String(16), nullable=False),
        sa.Column("chapter", sa.Integer(), nullable=False),
        sa.Column("chapter_title", sa.String(255), nullable=False),
        sa.Column("section_number", sa.String(32), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("statute_reference", sa.String(128), nullable=False, server_default="DPDPA 2023"),
        sa.Column("statute_excerpt", sa.Text(), nullable=True),
        sa.Column("penalty_crores", sa.Integer(), nullable=True),
        sa.Column("feature_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("coverage_status", section_coverage_status, nullable=False, server_default="covered"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("section_key", name="uq_dpdpa_statute_sections_key"),
    )
    op.create_index("ix_dpdpa_statute_sections_section_key", "dpdpa_statute_sections", ["section_key"])

    op.create_table(
        "dpdpa_feature_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("section_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dpdpa_statute_sections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_key", sa.String(16), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("route", sa.String(128), nullable=False, server_default=""),
        sa.Column("implementation_status", sa.String(32), nullable=False, server_default="implemented"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_dpdpa_feature_mappings_section_id", "dpdpa_feature_mappings", ["section_id"])
    op.create_index("ix_dpdpa_feature_mappings_section_key", "dpdpa_feature_mappings", ["section_key"])

    op.add_column(
        "organization_settings",
        sa.Column("dpdpa_map_last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "organization_settings",
        sa.Column("dpdpa_map_reviewed_by", sa.String(255), nullable=True),
    )

    op.create_table(
        "security_controls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("control_key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", security_control_status, nullable=False, server_default="missing"),
        sa.Column("checklist_items", postgresql.JSON(), nullable=False, server_default="[]"),
        sa.Column("items_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("items_completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("evidence_label", sa.String(512), nullable=True),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "control_key", name="uq_security_controls_org_key"),
    )
    op.create_index("ix_security_controls_organization_id", "security_controls", ["organization_id"])

    op.create_table(
        "security_certifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(64), nullable=False, server_default="active"),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auditor_firm", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_security_certifications_organization_id", "security_certifications", ["organization_id"])

    op.create_table(
        "breach_incidents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("incident_ref", sa.String(32), nullable=False),
        sa.Column("status", breach_incident_status, nullable=False, server_default="draft"),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("severity", sa.String(32), nullable=False, server_default="medium"),
        sa.Column("wizard_data", postgresql.JSON(), nullable=False, server_default="{}"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("incident_ref", name="uq_breach_incidents_ref"),
    )
    op.create_index("ix_breach_incidents_organization_id", "breach_incidents", ["organization_id"])
    op.create_index("ix_breach_incidents_incident_ref", "breach_incidents", ["incident_ref"])

    op.create_table(
        "breach_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("breach_incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", breach_notification_channel, nullable=False),
        sa.Column("recipient", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(512), nullable=True),
        sa.Column("body_snapshot", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_sent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_breach_notifications_incident_id", "breach_notifications", ["incident_id"])

    op.create_table(
        "audit_log_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_email", sa.String(320), nullable=False, server_default="system"),
        sa.Column("actor_role", sa.String(64), nullable=False, server_default="system"),
        sa.Column("action", sa.String(512), nullable=False),
        sa.Column("details", sa.Text(), nullable=False, server_default=""),
        sa.Column("event_type", audit_event_type, nullable=False, server_default="Configuration"),
        sa.Column("severity", audit_severity, nullable=False, server_default="info"),
        sa.Column("resource_type", sa.String(128), nullable=True),
        sa.Column("resource_id", sa.String(128), nullable=True),
        sa.Column("prev_hash", sa.String(64), nullable=False, server_default="0" * 64),
        sa.Column("entry_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_log_entries_organization_id", "audit_log_entries", ["organization_id"])
    op.create_index("ix_audit_log_entries_entry_hash", "audit_log_entries", ["entry_hash"])

    op.create_table(
        "audit_log_verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("merkle_root", sa.String(64), nullable=False),
        sa.Column("entry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("integrity_ok", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_log_verifications_organization_id", "audit_log_verifications", ["organization_id"])

    # Seed statute catalog
    sections_table = sa.table(
        "dpdpa_statute_sections",
        sa.column("id", postgresql.UUID),
        sa.column("section_key", sa.String),
        sa.column("chapter", sa.Integer),
        sa.column("chapter_title", sa.String),
        sa.column("section_number", sa.String),
        sa.column("title", sa.String),
        sa.column("statute_reference", sa.String),
        sa.column("statute_excerpt", sa.Text),
        sa.column("penalty_crores", sa.Integer),
        sa.column("feature_count", sa.Integer),
        sa.column("coverage_status", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    features_table = sa.table(
        "dpdpa_feature_mappings",
        sa.column("id", postgresql.UUID),
        sa.column("section_id", postgresql.UUID),
        sa.column("section_key", sa.String),
        sa.column("name", sa.String),
        sa.column("route", sa.String),
        sa.column("implementation_status", sa.String),
        sa.column("sort_order", sa.Integer),
    )

    section_rows = []
    section_id_by_key: dict[str, uuid.UUID] = {}
    for idx, row in enumerate(STATUTE_SECTIONS):
        sid = uuid.uuid4()
        key, chapter, ch_title, sec_num, title, feat_count, cov, penalty = row
        section_id_by_key[key] = sid
        excerpt = SECTION_6_EXCERPT if key == "2-6" else None
        section_rows.append({
            "id": sid,
            "section_key": key,
            "chapter": chapter,
            "chapter_title": ch_title,
            "section_number": sec_num,
            "title": title,
            "statute_reference": f"DPDPA 2023 Section {sec_num.split('-')[0]}",
            "statute_excerpt": excerpt,
            "penalty_crores": penalty,
            "feature_count": feat_count,
            "coverage_status": cov,
            "sort_order": idx,
        })
    op.bulk_insert(sections_table, section_rows)

    feature_rows = []
    section_6_id = section_id_by_key["2-6"]
    for idx, (name, route) in enumerate(SECTION_6_FEATURES):
        feature_rows.append({
            "id": uuid.uuid4(),
            "section_id": section_6_id,
            "section_key": "2-6",
            "name": name,
            "route": route,
            "implementation_status": "implemented",
            "sort_order": idx,
        })
    op.bulk_insert(features_table, feature_rows)


def downgrade() -> None:
    op.drop_table("audit_log_verifications")
    op.drop_table("audit_log_entries")
    op.drop_table("breach_notifications")
    op.drop_table("breach_incidents")
    op.drop_table("security_certifications")
    op.drop_table("security_controls")
    op.drop_column("organization_settings", "dpdpa_map_reviewed_by")
    op.drop_column("organization_settings", "dpdpa_map_last_reviewed_at")
    op.drop_table("dpdpa_feature_mappings")
    op.drop_table("dpdpa_statute_sections")

    audit_severity.drop(op.get_bind(), checkfirst=True)
    audit_event_type.drop(op.get_bind(), checkfirst=True)
    breach_notification_channel.drop(op.get_bind(), checkfirst=True)
    breach_incident_status.drop(op.get_bind(), checkfirst=True)
    security_control_status.drop(op.get_bind(), checkfirst=True)
    section_coverage_status.drop(op.get_bind(), checkfirst=True)
