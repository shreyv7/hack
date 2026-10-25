from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CoveragePageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scan_id: UUID
    url: str
    status: str
    issues: list[str] = []
    snippet_detected: bool
    load_time: int | None = None


class PageCoverageScanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    status: str
    total_pages_found: int
    pages_with_cmp: int
    pages_without_cmp: int
    coverage_percentage: float
    pages_missing_cmp_urls: list[str]
    started_at: datetime
    completed_at: datetime | None
    pages: list[CoveragePageRead] = []


class IntegrationAnalyticsDailyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    banner_id: UUID | None = None
    date: date
    total_visitors: int
    consent_given: int
    consent_denied: int
    consent_partial: int
    avg_load_time_ms: int
    config_requests: int
