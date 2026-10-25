from __future__ import annotations

import logging
import os
import uuid as uuid_lib
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings

from app.models.consent import Purpose
from app.models.cross_border_transfer import CbtTransfer
from app.models.data_inventory import DataInventoryAsset, DataInventoryField, FieldClassification
from app.models.data_processor import DataProcessor
from app.models.data_source import (
    DataSource,
    DataSourceActivity,
    DataSourceStatus,
    IntegrationMode,
    category_for,
)
from app.models.enforcement import PurposeDataMapping
from app.models.masking import MaskingRule
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import OrganizationSettings
from app.models.pii_scan import PiiFinding, PiiScanJob, ScanStatus
from app.models.retention import RetentionPolicy
from app.models.user import User, UserRole
from app.schemas.data_source import (
    ConnectionTestResult,
    ConsentPurposeSummary,
    CrossBorderTransferSummary,
    CredentialRotateRequest,
    DataSourceActivityEntry,
    DataSourceCreate,
    DataSourceRead,
    DataSourceUpdate,
    DataSourceUsageSummary,
    InventoryAssetSummary,
    MaskingCoverageSummary,
    PiiScanSummary,
    RetentionPolicySummary,
)
from app.core.crypto import encrypt_secret
from app.services import source_connectors
from app.utils.data_source_governance import compute_residency_flag, needs_retest
from app.utils.data_source_integration import default_integration_mode, effective_integration_mode

logger = logging.getLogger(__name__)

CLASSIFICATION_RANK = {
    FieldClassification.unclassified: 0,
    FieldClassification.non_personal: 1,
    FieldClassification.personal: 2,
    FieldClassification.sensitive: 3,
}


class DataSourceService:
    def __init__(self, db: Session):
        self.db = db

    # --- tenant scoping (mirrors DsarService) ---

    def _ensure_org_accessible(self, org_id: UUID) -> Organization:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")
        return org

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Data source management requires an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Data source management requires an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _get_owned(self, user: User, source_id: UUID, org_id: UUID | None) -> DataSource:
        resolved = self._resolve_org_id(user, org_id)
        source = self.db.get(DataSource, source_id)
        if source is None or source.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")
        return source

    def _user_display_name(self, user: User) -> str:
        if user.full_name:
            return user.full_name
        return user.email or str(user.id)

    def _org_settings(self, org_id: UUID) -> OrganizationSettings | None:
        return (
            self.db.execute(
                select(OrganizationSettings).where(OrganizationSettings.organization_id == org_id)
            )
            .scalars()
            .first()
        )

    def _log_activity(
        self,
        *,
        org_id: UUID,
        source: DataSource | None,
        action: str,
        user: User,
        details: dict | None = None,
    ) -> None:
        entry = DataSourceActivity(
            organization_id=org_id,
            data_source_id=source.id if source else None,
            action=action,
            source_name=source.name if source else "Unknown",
            user_name=self._user_display_name(user),
            details=details,
        )
        self.db.add(entry)

    def _serialize(self, source: DataSource) -> DataSourceRead:
        settings = self._org_settings(source.organization_id)
        processor = (
            self.db.get(DataProcessor, source.data_processor_id)
            if source.data_processor_id
            else None
        )
        return DataSourceRead(
            id=source.id,
            organization_id=source.organization_id,
            name=source.name,
            source_type=source.source_type,
            category=source.category or category_for(source.source_type),
            region=source.region,
            description=source.description,
            host=source.host,
            port=source.port,
            database_name=source.database_name,
            username=source.username,
            ssl_enabled=source.ssl_enabled,
            extra_config=source.extra_config or {},
            integration_mode=effective_integration_mode(source),
            owner_user_id=source.owner_user_id,
            owner_name=source.owner_name,
            environment=source.environment,
            criticality=source.criticality,
            data_processor_id=source.data_processor_id,
            encryption_at_rest=source.encryption_at_rest,
            tags=source.tags or [],
            status=source.status,
            has_password=bool(source.password),
            last_tested_at=source.last_tested_at,
            last_error=source.last_error,
            credential_rotated_at=source.credential_rotated_at,
            residency_flag=compute_residency_flag(source, settings, processor),
            data_processor_name=processor.name if processor else None,
            needs_retest=needs_retest(source),
            created_at=source.created_at,
            updated_at=source.updated_at,
        )

    # --- CRUD ---

    def list_sources(self, user: User, org_id: UUID | None = None) -> list[DataSourceRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.execute(
                select(DataSource)
                .where(DataSource.organization_id == resolved)
                .order_by(DataSource.created_at.desc())
            )
            .scalars()
            .all()
        )
        return [self._serialize(r) for r in rows]

    def get_source(self, user: User, source_id: UUID, org_id: UUID | None = None) -> DataSourceRead:
        return self._serialize(self._get_owned(user, source_id, org_id))

    def create_source(
        self, user: User, body: DataSourceCreate, org_id: UUID | None = None
    ) -> DataSourceRead:
        resolved = self._resolve_org_id(user, org_id)
        source = DataSource(
            organization_id=resolved,
            name=body.name,
            source_type=body.source_type,
            category=body.category or category_for(body.source_type),
            region=body.region,
            description=body.description,
            host=body.host,
            port=body.port,
            database_name=body.database_name,
            username=body.username,
            password=encrypt_secret(body.password) if body.password else None,
            ssl_enabled=body.ssl_enabled,
            extra_config=body.extra_config,
            integration_mode=body.integration_mode or default_integration_mode(body.source_type),
            owner_user_id=body.owner_user_id,
            owner_name=body.owner_name,
            environment=body.environment,
            criticality=body.criticality,
            data_processor_id=body.data_processor_id,
            encryption_at_rest=body.encryption_at_rest,
            tags=body.tags,
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
            status=DataSourceStatus.pending,
        )
        if body.password:
            source.credential_rotated_at = datetime.now(timezone.utc)
        self.db.add(source)
        self.db.flush()
        self._log_activity(
            org_id=resolved,
            source=source,
            action="created",
            user=user,
            details={"source_type": source.source_type, "category": source.category},
        )
        self.db.commit()
        self.db.refresh(source)
        return self._serialize(source)

    def update_source(
        self, user: User, source_id: UUID, body: DataSourceUpdate, org_id: UUID | None = None
    ) -> DataSourceRead:
        source = self._get_owned(user, source_id, org_id)
        data = body.model_dump(exclude_unset=True)
        if "password" in data:
            pw = data.pop("password")
            source.password = encrypt_secret(pw) if pw else None
            if pw:
                source.credential_rotated_at = datetime.now(timezone.utc)
        for field, value in data.items():
            setattr(source, field, value)
        source.updated_by_user_id = user.id
        connection_fields = {
            "source_type", "host", "port", "database_name", "username", "password", "ssl_enabled",
        }
        if connection_fields & data.keys():
            source.status = DataSourceStatus.pending
            source.last_tested_at = None
            source.last_error = None
        self._log_activity(
            org_id=source.organization_id,
            source=source,
            action="updated",
            user=user,
            details={"fields": sorted(data.keys())},
        )
        self.db.commit()
        self.db.refresh(source)
        return self._serialize(source)

    def delete_source(self, user: User, source_id: UUID, org_id: UUID | None = None) -> None:
        source = self._get_owned(user, source_id, org_id)
        stored_path = (source.extra_config or {}).get("stored_path")
        self._log_activity(
            org_id=source.organization_id,
            source=source,
            action="deleted",
            user=user,
        )
        self.db.delete(source)
        self.db.commit()
        if stored_path:
            try:
                Path(stored_path).unlink(missing_ok=True)
            except OSError:  # pragma: no cover - cleanup is best-effort
                logger.warning("Could not delete upload file %s", stored_path)

    def rotate_credential(
        self,
        user: User,
        source_id: UUID,
        body: CredentialRotateRequest,
        org_id: UUID | None = None,
    ) -> DataSourceRead:
        source = self._get_owned(user, source_id, org_id)
        source.password = encrypt_secret(body.password)
        source.credential_rotated_at = datetime.now(timezone.utc)
        source.updated_by_user_id = user.id
        source.status = DataSourceStatus.pending
        source.last_tested_at = None
        source.last_error = None
        self._log_activity(
            org_id=source.organization_id,
            source=source,
            action="credential_rotated",
            user=user,
        )
        self.db.commit()
        self.db.refresh(source)
        return self._serialize(source)

    # --- file upload ---

    def create_upload_source(
        self,
        user: User,
        file: UploadFile,
        name: str | None = None,
        description: str | None = None,
        org_id: UUID | None = None,
    ) -> DataSourceRead:
        """Save an uploaded file (≤ MAX_UPLOAD_BYTES) and register it as a source."""
        resolved = self._resolve_org_id(user, org_id)

        if not file.filename:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No file provided")

        upload_root = Path(settings.UPLOAD_DIR) / str(resolved)
        upload_root.mkdir(parents=True, exist_ok=True)
        safe_name = os.path.basename(file.filename)
        stored_name = f"{uuid_lib.uuid4().hex}_{safe_name}"
        dest = upload_root / stored_name

        max_bytes = settings.MAX_UPLOAD_BYTES
        written = 0
        try:
            with dest.open("wb") as out:
                while chunk := file.file.read(1024 * 1024):
                    written += len(chunk)
                    if written > max_bytes:
                        out.close()
                        dest.unlink(missing_ok=True)
                        mb = max_bytes // (1024 * 1024)
                        raise HTTPException(
                            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"File exceeds the {mb} MB upload limit.",
                        )
                    out.write(chunk)
        except HTTPException:
            raise
        except OSError as exc:
            dest.unlink(missing_ok=True)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to store file: {exc}"
            ) from exc

        source = DataSource(
            organization_id=resolved,
            name=name or safe_name,
            source_type="file_upload",
            category="upload",
            description=description,
            extra_config={
                "original_filename": safe_name,
                "stored_path": str(dest),
                "size_bytes": written,
                "content_type": file.content_type,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            },
            status=DataSourceStatus.connected,
            last_tested_at=datetime.now(timezone.utc),
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
        )
        self.db.add(source)
        self.db.flush()
        self._log_activity(
            org_id=resolved,
            source=source,
            action="uploaded",
            user=user,
            details={"filename": safe_name, "size_bytes": written},
        )
        self.db.commit()
        self.db.refresh(source)
        return self._serialize(source)

    # --- connection test ---

    def test_connection(
        self, user: User, source_id: UUID, org_id: UUID | None = None
    ) -> ConnectionTestResult:
        source = self._get_owned(user, source_id, org_id)
        success, message = self._probe(source)
        now = datetime.now(timezone.utc)
        source.last_tested_at = now
        source.status = DataSourceStatus.connected if success else DataSourceStatus.error
        source.last_error = None if success else message
        self._log_activity(
            org_id=source.organization_id,
            source=source,
            action="test_connection",
            user=user,
            details={"success": success, "message": message},
        )
        self.db.commit()
        self.db.refresh(source)
        return ConnectionTestResult(
            success=success, status=source.status, message=message, tested_at=now
        )

    def log_schema_scan(self, user: User, source_id: UUID, org_id: UUID | None = None) -> None:
        source = self._get_owned(user, source_id, org_id)
        self._log_activity(
            org_id=source.organization_id,
            source=source,
            action="schema_scan",
            user=user,
        )
        self.db.commit()

    def _probe(self, source: DataSource) -> tuple[bool, str]:
        """Attempt a real connection for any category. Returns (success, message)."""
        return source_connectors.test_source(source)

    # --- activity & usage ---

    def list_activity(
        self, user: User, source_id: UUID, org_id: UUID | None = None
    ) -> list[DataSourceActivityEntry]:
        source = self._get_owned(user, source_id, org_id)
        rows = (
            self.db.execute(
                select(DataSourceActivity)
                .where(
                    DataSourceActivity.organization_id == source.organization_id,
                    DataSourceActivity.data_source_id == source.id,
                )
                .order_by(DataSourceActivity.created_at.desc())
                .limit(100)
            )
            .scalars()
            .all()
        )
        return [DataSourceActivityEntry.model_validate(r) for r in rows]

    def get_usage_summary(
        self, user: User, source_id: UUID, org_id: UUID | None = None
    ) -> DataSourceUsageSummary:
        source = self._get_owned(user, source_id, org_id)

        assets = (
            self.db.execute(
                select(DataInventoryAsset).where(
                    DataInventoryAsset.organization_id == source.organization_id,
                    DataInventoryAsset.data_source_id == source.id,
                )
            )
            .scalars()
            .all()
        )

        asset_summaries: list[InventoryAssetSummary] = []
        total_fields = 0
        highest: FieldClassification | None = None

        for asset in assets:
            fields = (
                self.db.execute(
                    select(DataInventoryField).where(DataInventoryField.asset_id == asset.id)
                )
                .scalars()
                .all()
            )
            total_fields += len(fields)
            asset_highest: FieldClassification | None = None
            for field in fields:
                if asset_highest is None or CLASSIFICATION_RANK[field.classification] > CLASSIFICATION_RANK[asset_highest]:
                    asset_highest = field.classification
                if highest is None or CLASSIFICATION_RANK[field.classification] > CLASSIFICATION_RANK[highest]:
                    highest = field.classification
            asset_summaries.append(
                InventoryAssetSummary(
                    id=asset.id,
                    name=asset.name,
                    field_count=len(fields),
                    highest_classification=asset_highest.value if asset_highest else None,
                )
            )

        latest_scan = (
            self.db.execute(
                select(PiiScanJob)
                .where(
                    PiiScanJob.organization_id == source.organization_id,
                    PiiScanJob.data_source_id == source.id,
                )
                .order_by(PiiScanJob.created_at.desc())
                .limit(1)
            )
            .scalars()
            .first()
        )

        findings_count = 0
        pii_scan_summary = PiiScanSummary()
        if latest_scan:
            findings_count = (
                self.db.execute(
                    select(func.count(PiiFinding.id)).where(PiiFinding.scan_job_id == latest_scan.id)
                )
                .scalar()
                or 0
            )
            pii_scan_summary = PiiScanSummary(
                job_id=latest_scan.id,
                status=latest_scan.status.value if isinstance(latest_scan.status, ScanStatus) else str(latest_scan.status),
                finished_at=latest_scan.finished_at,
                fields_flagged=latest_scan.fields_flagged,
                findings_count=findings_count,
            )

        pii_fields: list[DataInventoryField] = []
        for asset in assets:
            pii_fields.extend(
                self.db.execute(
                    select(DataInventoryField).where(
                        DataInventoryField.asset_id == asset.id,
                        DataInventoryField.pii_category.isnot(None),
                    )
                )
                .scalars()
                .all()
            )

        masking_rules = (
            self.db.execute(
                select(MaskingRule).where(MaskingRule.organization_id == source.organization_id)
            )
            .scalars()
            .all()
        )
        from app.utils.masking_coverage import covered_pii_field_count

        covered = covered_pii_field_count(pii_fields, masking_rules)
        total_pii = len(pii_fields)
        masking_summary = MaskingCoverageSummary(
            total_pii_fields=total_pii,
            covered_by_rules=covered,
            coverage_pct=round((covered / total_pii) * 100, 1) if total_pii else 0.0,
        )

        retention_rows = (
            self.db.execute(
                select(RetentionPolicy).where(
                    RetentionPolicy.organization_id == source.organization_id,
                    RetentionPolicy.data_source_id == source.id,
                )
            )
            .scalars()
            .all()
        )
        retention_summaries = [
            RetentionPolicySummary(
                id=p.id,
                name=p.name,
                status=p.status.value if hasattr(p.status, "value") else str(p.status),
                action=p.action.value if hasattr(p.action, "value") else str(p.action),
                last_run_at=p.last_run_at,
            )
            for p in retention_rows
        ]

        cbt_rows: list[CbtTransfer] = []
        if source.data_processor_id:
            cbt_rows = (
                self.db.execute(
                    select(CbtTransfer).where(
                        CbtTransfer.organization_id == source.organization_id,
                        CbtTransfer.data_processor_id == source.data_processor_id,
                    )
                )
                .scalars()
                .all()
            )
        cbt_summaries = [
            CrossBorderTransferSummary(
                id=t.id,
                name=t.name,
                destination_country=t.destination_country,
                status=t.status.value if hasattr(t.status, "value") else str(t.status),
            )
            for t in cbt_rows
        ]

        field_ids = [
            f.id
            for asset in assets
            for f in self.db.execute(
                select(DataInventoryField.id).where(DataInventoryField.asset_id == asset.id)
            ).scalars().all()
        ]
        purpose_summaries: list[ConsentPurposeSummary] = []
        if field_ids:
            mappings = (
                self.db.execute(
                    select(PurposeDataMapping).where(
                        PurposeDataMapping.organization_id == source.organization_id,
                        PurposeDataMapping.inventory_field_id.in_(field_ids),
                    )
                )
                .scalars()
                .all()
            )
            purpose_counts: dict[UUID, int] = {}
            for mapping in mappings:
                purpose_counts[mapping.purpose_id] = purpose_counts.get(mapping.purpose_id, 0) + 1
            for purpose_id, count in purpose_counts.items():
                purpose = self.db.get(Purpose, purpose_id)
                if purpose:
                    purpose_summaries.append(
                        ConsentPurposeSummary(
                            purpose_id=purpose.id,
                            purpose_name=purpose.name,
                            mapped_field_count=count,
                        )
                    )

        return DataSourceUsageSummary(
            source_id=source.id,
            inventory_assets=asset_summaries,
            total_fields=total_fields,
            highest_classification=highest.value if highest else None,
            pii_scan=pii_scan_summary,
            masking=masking_summary,
            retention_policies=retention_summaries,
            cross_border_transfers=cbt_summaries,
            consent_purposes=purpose_summaries,
        )
