"""Shared query scoping helpers for org + business unit filters."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Query


def apply_bu_filter(query: Query, model, business_unit_id: UUID | None) -> Query:
    """Filter a query by business_unit_id when set."""
    if business_unit_id is None:
        return query
    if not hasattr(model, "business_unit_id"):
        return query
    return query.filter(model.business_unit_id == business_unit_id)
