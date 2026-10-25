from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.data_source import (
    ConnectionTestResult,
    CredentialRotateRequest,
    DataSourceActivityEntry,
    DataSourceCreate,
    DataSourceRead,
    DataSourceUpdate,
    DataSourceUsageSummary,
)
from app.services.data_source_service import DataSourceService

router = APIRouter(prefix="/data-sources", tags=["data-sources"])


@router.get("", response_model=list[DataSourceRead])
def list_data_sources(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DataSourceRead]:
    return DataSourceService(db).list_sources(current_user, org_id=org_id)


@router.post("", response_model=DataSourceRead, status_code=201)
def create_data_source(
    body: DataSourceCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataSourceRead:
    return DataSourceService(db).create_source(current_user, body, org_id=org_id)


@router.post("/upload", response_model=DataSourceRead, status_code=201)
def upload_data_source_file(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    description: str | None = Form(default=None),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataSourceRead:
    return DataSourceService(db).create_upload_source(
        current_user, file, name=name, description=description, org_id=org_id
    )


@router.get("/{source_id}", response_model=DataSourceRead)
def get_data_source(
    source_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataSourceRead:
    return DataSourceService(db).get_source(current_user, source_id, org_id=org_id)


@router.patch("/{source_id}", response_model=DataSourceRead)
def update_data_source(
    source_id: UUID,
    body: DataSourceUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataSourceRead:
    return DataSourceService(db).update_source(current_user, source_id, body, org_id=org_id)


@router.delete("/{source_id}", status_code=204)
def delete_data_source(
    source_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    DataSourceService(db).delete_source(current_user, source_id, org_id=org_id)


@router.post("/{source_id}/test-connection", response_model=ConnectionTestResult)
def test_data_source_connection(
    source_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConnectionTestResult:
    return DataSourceService(db).test_connection(current_user, source_id, org_id=org_id)


@router.post("/{source_id}/rotate-credential", response_model=DataSourceRead)
def rotate_data_source_credential(
    source_id: UUID,
    body: CredentialRotateRequest,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataSourceRead:
    return DataSourceService(db).rotate_credential(current_user, source_id, body, org_id=org_id)


@router.get("/{source_id}/usage-summary", response_model=DataSourceUsageSummary)
def get_data_source_usage_summary(
    source_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataSourceUsageSummary:
    return DataSourceService(db).get_usage_summary(current_user, source_id, org_id=org_id)


@router.get("/{source_id}/activity", response_model=list[DataSourceActivityEntry])
def list_data_source_activity(
    source_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DataSourceActivityEntry]:
    return DataSourceService(db).list_activity(current_user, source_id, org_id=org_id)


@router.post("/{source_id}/log-schema-scan", status_code=204)
def log_data_source_schema_scan(
    source_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    DataSourceService(db).log_schema_scan(current_user, source_id, org_id=org_id)
