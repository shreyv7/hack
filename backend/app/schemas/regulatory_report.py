"""Schemas for regulatory report pack generation (Req 9)."""

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

ReportKey = Literal[
    "consent_proof",
    "consent_status",
    "data_rights",
    "ropa_register",
    "dpia_portfolio",
    "retention_actions",
    "compliance_gaps",
    "fino_regulatory_pack",
]

ReportFormat = Literal["pdf", "xlsx", "json", "zip"]


class ReportFilters(BaseModel):
    time_range: str = "90d"
    business_unit_id: UUID | None = None
    property_id: UUID | None = None
    purpose_id: UUID | None = None
    channel: str | None = None
    journey_key: str | None = None


class RegulatoryReportRequest(BaseModel):
    report_key: ReportKey
    format: ReportFormat
    filters: ReportFilters = Field(default_factory=ReportFilters)


class RegulatoryReportCatalogItem(BaseModel):
    key: ReportKey
    name: str
    description: str
    formats: list[ReportFormat]
    dpdpa_sections: list[str] = Field(default_factory=list)


class RegulatoryReportResponse(BaseModel):
    report_key: str
    format: str
    filename: str
    content_type: str
    data_base64: str


class CrosswalkControlMapping(BaseModel):
    section_key: str
    title: str
    dpdpa_section: str
    controls: list[str]
    evidence_count: int
    feature_count: int


class FrameworkCrosswalkResponse(BaseModel):
    framework: str
    framework_label: str
    primary_framework: str
    sections: list[CrosswalkControlMapping]
