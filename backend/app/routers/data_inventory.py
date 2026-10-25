from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.data_inventory import (
    ActivityLinkCreate,
    ActivityLinkRead,
    AssetCreate,
    AssetDetail,
    AssetRead,
    AssetUpdate,
    AssetUsageMap,
    AuditLogEntry,
    BulkStatusResult,
    BulkStatusUpdate,
    FieldCreate,
    FieldRead,
    FieldUpdate,
    InventorySummary,
    ProcessorLinkCreate,
    ProcessorLinkRead,
    SchemaImportResult,
)
from app.services.data_inventory_service import DataInventoryService

router = APIRouter(prefix="/data-inventory", tags=["data-inventory"])

AdminUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))]


@router.get("/summary", response_model=InventorySummary)
def get_inventory_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> InventorySummary:
    return DataInventoryService(db).get_summary(current_user, org_id=org_id)


@router.get("/export")
def export_inventory(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PlainTextResponse:
    csv_data = DataInventoryService(db).export_csv(current_user, org_id=org_id)
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="data-inventory-export.csv"'},
    )


@router.post("/sources/{source_id}/import-schema", response_model=SchemaImportResult)
def import_schema(
    source_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SchemaImportResult:
    return DataInventoryService(db).import_schema_from_source(current_user, source_id, org_id=org_id)


@router.get("/assets", response_model=list[AssetRead])
def list_assets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    data_source_id: UUID | None = Query(default=None),
) -> list[AssetRead]:
    return DataInventoryService(db).list_assets(
        current_user, org_id=org_id, data_source_id=data_source_id
    )


@router.post("/assets", response_model=AssetDetail, status_code=201)
def create_asset(
    body: AssetCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AssetDetail:
    return DataInventoryService(db).create_asset(current_user, body, org_id=org_id)


@router.patch("/assets/bulk-status", response_model=BulkStatusResult)
def bulk_update_status(
    body: BulkStatusUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BulkStatusResult:
    return DataInventoryService(db).bulk_update_status(current_user, body, org_id=org_id)


@router.get("/assets/{asset_id}", response_model=AssetDetail)
def get_asset(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AssetDetail:
    return DataInventoryService(db).get_asset(current_user, asset_id, org_id=org_id)


@router.patch("/assets/{asset_id}", response_model=AssetDetail)
def update_asset(
    asset_id: UUID,
    body: AssetUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AssetDetail:
    return DataInventoryService(db).update_asset(current_user, asset_id, body, org_id=org_id)


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(
    asset_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    DataInventoryService(db).delete_asset(current_user, asset_id, org_id=org_id)


@router.get("/assets/{asset_id}/usage", response_model=AssetUsageMap)
def get_asset_usage(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AssetUsageMap:
    return DataInventoryService(db).get_usage_map(current_user, asset_id, org_id=org_id)


@router.get("/assets/{asset_id}/audit-log", response_model=list[AuditLogEntry])
def get_asset_audit_log(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[AuditLogEntry]:
    return DataInventoryService(db).get_audit_log(current_user, asset_id, org_id=org_id, limit=limit)


@router.get("/assets/{asset_id}/processors", response_model=list[ProcessorLinkRead])
def list_asset_processors(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ProcessorLinkRead]:
    return DataInventoryService(db).list_asset_processors(current_user, asset_id, org_id=org_id)


@router.post("/assets/{asset_id}/processors", response_model=ProcessorLinkRead, status_code=201)
def link_processor(
    asset_id: UUID,
    body: ProcessorLinkCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProcessorLinkRead:
    return DataInventoryService(db).link_processor(current_user, asset_id, body, org_id=org_id)


@router.delete("/assets/{asset_id}/processors/{link_id}", status_code=204)
def unlink_processor(
    asset_id: UUID,
    link_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    DataInventoryService(db).unlink_processor(current_user, asset_id, link_id, org_id=org_id)


@router.get("/assets/{asset_id}/activities", response_model=list[ActivityLinkRead])
def list_asset_activities(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ActivityLinkRead]:
    return DataInventoryService(db).list_asset_activities(current_user, asset_id, org_id=org_id)


@router.post("/assets/{asset_id}/activities", response_model=ActivityLinkRead, status_code=201)
def link_activity(
    asset_id: UUID,
    body: ActivityLinkCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ActivityLinkRead:
    return DataInventoryService(db).link_activity(current_user, asset_id, body, org_id=org_id)


@router.delete("/assets/{asset_id}/activities/{link_id}", status_code=204)
def unlink_activity(
    asset_id: UUID,
    link_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    DataInventoryService(db).unlink_activity(current_user, asset_id, link_id, org_id=org_id)


@router.post("/assets/{asset_id}/fields", response_model=FieldRead, status_code=201)
def add_field(
    asset_id: UUID,
    body: FieldCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> FieldRead:
    return DataInventoryService(db).add_field(current_user, asset_id, body, org_id=org_id)


@router.patch("/fields/{field_id}", response_model=FieldRead)
def update_field(
    field_id: UUID,
    body: FieldUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> FieldRead:
    return DataInventoryService(db).update_field(current_user, field_id, body, org_id=org_id)


@router.delete("/fields/{field_id}", status_code=204)
def delete_field(
    field_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    DataInventoryService(db).delete_field(current_user, field_id, org_id=org_id)
