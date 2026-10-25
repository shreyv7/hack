"""Read-only vs read-write integration mode (Req 6)."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models.data_source import CONNECTOR_CATEGORY, DataSource, DataSourceCategory
from app.models.data_source import IntegrationMode


def default_integration_mode(source_type: str) -> IntegrationMode:
    cat = CONNECTOR_CATEGORY.get(source_type)
    if cat in (DataSourceCategory.database, DataSourceCategory.cloud):
        return IntegrationMode.read_write
    return IntegrationMode.discovery


def effective_integration_mode(source: DataSource) -> IntegrationMode:
    if source.integration_mode is not None:
        return source.integration_mode
    return default_integration_mode(source.source_type)


def allows_write_actions(source: DataSource) -> bool:
    return effective_integration_mode(source) == IntegrationMode.read_write


def assert_write_actions_allowed(source: DataSource, *, action: str = "write") -> None:
    if allows_write_actions(source):
        return
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        detail=(
            f"Data source '{source.name}' is discovery-only (read-only integration). "
            f"Cannot perform {action}. Switch integration mode to read-write in Data Sources "
            "after DPO approval (DPDPA — separate discovery from destructive actions)."
        ),
    )
