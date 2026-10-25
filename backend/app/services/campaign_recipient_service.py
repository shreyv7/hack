"""Resolve campaign recipients from known contacts, CSV uploads, or data assets."""

from __future__ import annotations

import csv
import io
import re
import uuid
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.consent_receipt import ConsentReceipt
from app.models.data_inventory import DataInventoryAsset, DataInventoryField
from app.models.data_source import DataSource
from app.models.notice_delivery import CampaignRecipientUpload, CampaignRecipientUploadStatus
from app.models.user import User
from app.services.compliance_base import ComplianceBaseService
from app.services.contracts.recipient_contract import RecipientContract
from app.services.db_connector import fetch_mapped_columns
from app.services.file_scanner import parse_bytes

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_CAMPAIGN_RECIPIENTS = 5000
MAX_CSV_ROWS = 10000
PREVIEW_LIMIT = 20


def _normalize_email(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip().lower()
    return s if EMAIL_RE.match(s) else None


def _normalize_phone(value: Any) -> str | None:
    if value is None:
        return None
    s = re.sub(r"\s+", "", str(value).strip())
    return s if len(s) >= 8 else None


def _normalize_name(value: Any, fallback: str = "Data Principal") -> str:
    if value is None or not str(value).strip():
        return fallback
    return str(value).strip()[:255]


def normalize_recipient_row(
    *,
    email: Any = None,
    name: Any = None,
    phone: Any = None,
) -> dict[str, str] | None:
    norm_email = _normalize_email(email)
    norm_phone = _normalize_phone(phone)
    if not norm_email and not norm_phone:
        return None
    recipient_id = norm_email or norm_phone or ""
    return {
        "id": recipient_id,
        "name": _normalize_name(name),
        "email": norm_email,
        "phone": norm_phone,
    }


def dedupe_recipients(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = row.get("id") or row.get("email") or row.get("phone")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


class CampaignRecipientService(ComplianceBaseService):
    def search_known_contacts(
        self,
        user: User,
        *,
        q: str | None = None,
        segment: str = "all",
        notice_id: UUID | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        org_id = self._resolve_org_id(user, None)
        recipients = RecipientContract.get_recipients_by_segment(self.db, org_id, segment, notice_id)
        if q:
            q_lower = q.lower()
            recipients = [
                r
                for r in recipients
                if q_lower in (r.get("name") or "").lower()
                or q_lower in (r.get("email") or "").lower()
                or q_lower in (r.get("phone") or "").lower()
            ]
        enriched: list[dict[str, Any]] = []
        for r in recipients[:limit]:
            last_receipt = (
                self.db.query(ConsentReceipt)
                .filter(
                    ConsentReceipt.organization_id == org_id,
                    (
                        (ConsentReceipt.principal_email == r.get("email"))
                        if r.get("email")
                        else (ConsentReceipt.principal_phone == r.get("phone"))
                    ),
                )
                .order_by(ConsentReceipt.created_at.desc())
                .first()
            )
            last_purposes = None
            last_consent_at = None
            if last_receipt:
                last_purposes = last_receipt.consented_purposes
                last_consent_at = last_receipt.created_at.isoformat() if last_receipt.created_at else None
            enriched.append(
                {
                    **r,
                    "last_consent_at": last_consent_at,
                    "last_purposes": last_purposes,
                }
            )
        return enriched

    async def upload_csv(
        self,
        user: User,
        file: UploadFile,
    ) -> CampaignRecipientUpload:
        org_id = self._resolve_org_id(user, None)
        if not file.filename:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Filename is required")
        content = await file.read()
        if len(content) > settings.MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

        upload_dir = Path(settings.UPLOAD_DIR) / str(org_id) / "campaign_recipients"
        upload_dir.mkdir(parents=True, exist_ok=True)
        upload_id = uuid.uuid4()
        stored_path = upload_dir / f"{upload_id}_{file.filename}"
        stored_path.write_bytes(content)

        try:
            parsed = parse_bytes(content, file.filename, max_rows=MAX_CSV_ROWS)
        except Exception as exc:
            stored_path.unlink(missing_ok=True)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Could not parse file: {exc}") from exc

        if not parsed.tables:
            stored_path.unlink(missing_ok=True)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No tabular data found in file")

        table = parsed.tables[0]
        headers, rows = table.columns, table.rows
        if len(rows) > MAX_CSV_ROWS:
            stored_path.unlink(missing_ok=True)
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"CSV exceeds maximum of {MAX_CSV_ROWS} rows",
            )

        record = CampaignRecipientUpload(
            organization_id=org_id,
            original_filename=file.filename,
            stored_path=str(stored_path),
            column_headers=list(headers),
            row_count=len(rows),
            status=CampaignRecipientUploadStatus.uploaded.value,
            created_by_user_id=user.id,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def save_upload_mapping(
        self,
        user: User,
        upload_id: UUID,
        field_map: dict[str, str],
    ) -> CampaignRecipientUpload:
        org_id = self._resolve_org_id(user, None)
        record = self._get_upload(org_id, upload_id)
        if "email" not in field_map or not field_map["email"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email column mapping is required")

        rows = self._parse_upload_rows(record)
        normalized, warnings = self._apply_field_map(rows, record.column_headers or [], field_map)
        if not normalized:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No valid recipients after mapping")

        record.field_map = field_map
        record.normalized_rows = normalized
        record.status = CampaignRecipientUploadStatus.validated.value
        record.row_count = len(normalized)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def preview_upload(
        self,
        user: User,
        upload_id: UUID,
        limit: int = PREVIEW_LIMIT,
    ) -> dict[str, Any]:
        org_id = self._resolve_org_id(user, None)
        record = self._get_upload(org_id, upload_id)
        rows = record.normalized_rows or []
        if not rows and record.field_map:
            raw = self._parse_upload_rows(record)
            rows, warnings = self._apply_field_map(raw, record.column_headers or [], record.field_map)
        else:
            warnings = []
        return {
            "total": len(rows),
            "preview": rows[:limit],
            "warnings": warnings,
            "upload_id": str(record.id),
            "status": record.status,
        }

    def resolve_from_upload(
        self,
        org_id: UUID,
        upload_id: UUID,
        selected_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        record = self._get_upload(org_id, upload_id)
        rows = record.normalized_rows or []
        if not rows:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Upload is not validated")
        if selected_ids:
            selected = set(selected_ids)
            rows = [r for r in rows if r.get("id") in selected]
        return dedupe_recipients(rows)[:MAX_CAMPAIGN_RECIPIENTS]

    def preview_data_asset(
        self,
        user: User,
        *,
        asset_id: UUID,
        field_map: dict[str, str],
        limit: int = PREVIEW_LIMIT,
    ) -> dict[str, Any]:
        org_id = self._resolve_org_id(user, None)
        rows, warnings = self._fetch_asset_rows(org_id, asset_id, field_map)
        return {
            "total": len(rows),
            "preview": rows[:limit],
            "warnings": warnings,
        }

    def resolve_from_data_asset(
        self,
        org_id: UUID,
        asset_id: UUID,
        field_map: dict[str, str],
        selected_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        rows, _ = self._fetch_asset_rows(org_id, asset_id, field_map)
        if selected_ids:
            selected = set(selected_ids)
            rows = [r for r in rows if r.get("id") in selected]
        return dedupe_recipients(rows)[:MAX_CAMPAIGN_RECIPIENTS]

    def resolve_known_contacts(
        self,
        org_id: UUID,
        *,
        segment: str,
        notice_id: UUID | None,
        selected_ids: list[str] | None,
    ) -> list[dict[str, Any]]:
        recipients = RecipientContract.get_recipients_by_segment(self.db, org_id, segment, notice_id)
        if selected_ids:
            selected = set(selected_ids)
            recipients = [r for r in recipients if r.get("id") in selected]
        return dedupe_recipients(recipients)[:MAX_CAMPAIGN_RECIPIENTS]

    def resolve_for_campaign(
        self,
        org_id: UUID,
        *,
        recipient_source: str,
        recipient_source_config: dict[str, Any],
        recipient_segment: str,
        notice_id: UUID | None,
        recipient_snapshot: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        if recipient_snapshot:
            return recipient_snapshot

        if recipient_source == "known_contacts":
            return self.resolve_known_contacts(
                org_id,
                segment=recipient_segment,
                notice_id=notice_id,
                selected_ids=recipient_source_config.get("selected_recipient_ids"),
            )
        if recipient_source == "csv_upload":
            upload_id = recipient_source_config.get("upload_id")
            if not upload_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="upload_id required for csv_upload")
            return self.resolve_from_upload(
                org_id,
                UUID(str(upload_id)),
                recipient_source_config.get("selected_recipient_ids"),
            )
        if recipient_source == "data_asset":
            asset_id = recipient_source_config.get("asset_id")
            field_map = recipient_source_config.get("field_map") or {}
            if not asset_id or not field_map:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="asset_id and field_map required")
            return self.resolve_from_data_asset(
                org_id,
                UUID(str(asset_id)),
                field_map,
                recipient_source_config.get("selected_recipient_ids"),
            )
        return RecipientContract.get_recipients_by_segment(
            self.db, org_id, recipient_segment, notice_id
        )

    def _get_upload(self, org_id: UUID, upload_id: UUID) -> CampaignRecipientUpload:
        record = (
            self.db.query(CampaignRecipientUpload)
            .filter(
                CampaignRecipientUpload.id == upload_id,
                CampaignRecipientUpload.organization_id == org_id,
            )
            .first()
        )
        if not record:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Upload not found")
        return record

    def _parse_upload_rows(self, record: CampaignRecipientUpload) -> list[list[Any]]:
        path = Path(record.stored_path)
        if not path.exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Upload file missing")
        tables = parse_bytes(path.read_bytes(), record.original_filename, max_rows=MAX_CSV_ROWS)
        if not tables.tables:
            return []
        table = tables.tables[0]
        return [list(r) for r in table.rows]

    def _apply_field_map(
        self,
        rows: list[list[Any]],
        headers: list[str],
        field_map: dict[str, str],
    ) -> tuple[list[dict[str, Any]], list[str]]:
        col_index = {h: i for i, h in enumerate(headers)}
        warnings: list[str] = []
        normalized: list[dict[str, Any]] = []
        email_col = field_map.get("email")
        name_col = field_map.get("name")
        phone_col = field_map.get("phone")

        for idx, row in enumerate(rows):
            def val(col: str | None) -> Any:
                if not col or col not in col_index:
                    return None
                i = col_index[col]
                return row[i] if i < len(row) else None

            item = normalize_recipient_row(email=val(email_col), name=val(name_col), phone=val(phone_col))
            if not item:
                warnings.append(f"Row {idx + 1}: missing valid email or phone")
                continue
            if not item.get("email"):
                warnings.append(f"Row {idx + 1}: email recommended for email campaigns")
            normalized.append(item)

        return dedupe_recipients(normalized), warnings

    def _fetch_asset_rows(
        self,
        org_id: UUID,
        asset_id: UUID,
        field_map: dict[str, str],
    ) -> tuple[list[dict[str, Any]], list[str]]:
        asset = (
            self.db.query(DataInventoryAsset)
            .filter(DataInventoryAsset.id == asset_id, DataInventoryAsset.organization_id == org_id)
            .first()
        )
        if not asset:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data asset not found")
        if not asset.data_source_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Asset is not linked to a data source")

        source = self.db.get(DataSource, asset.data_source_id)
        if not source:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data source not found")

        email_field = field_map.get("email")
        if not email_field:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email field mapping is required")

        columns = [c for c in [email_field, field_map.get("name"), field_map.get("phone")] if c]
        table_name = asset.name
        if source.source_type == "file_upload":
            return self._fetch_upload_source_rows(source, asset, field_map)

        col_names, raw_rows = fetch_mapped_columns(source, table_name, columns, limit=MAX_CAMPAIGN_RECIPIENTS)
        col_index = {c: i for i, c in enumerate(col_names)}
        warnings: list[str] = []
        normalized: list[dict[str, Any]] = []
        for idx, row in enumerate(raw_rows):
            def val(col: str | None) -> Any:
                if not col or col not in col_index:
                    return None
                i = col_index[col]
                return row[i] if i < len(row) else None

            item = normalize_recipient_row(
                email=val(email_field),
                name=val(field_map.get("name")),
                phone=val(field_map.get("phone")),
            )
            if not item:
                warnings.append(f"Row {idx + 1}: missing valid email or phone")
                continue
            normalized.append(item)
        return dedupe_recipients(normalized), warnings

    def _fetch_upload_source_rows(
        self,
        source: DataSource,
        asset: DataInventoryAsset,
        field_map: dict[str, str],
    ) -> tuple[list[dict[str, Any]], list[str]]:
        stored_path = (source.extra_config or {}).get("stored_path")
        if not stored_path:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Upload source has no stored file")
        path = Path(stored_path)
        tables = parse_bytes(path.read_bytes(), path.name, max_rows=MAX_CSV_ROWS)
        if not tables.tables:
            return [], ["No rows in upload source"]
        table = tables.tables[0]
        return self._apply_field_map([list(r) for r in table.rows], list(table.columns), field_map)
