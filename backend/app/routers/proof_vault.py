import io
import json
import zipfile
from datetime import datetime, timezone
from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.proof_vault import (
    ProofVaultRecordRead,
    ProofVaultRecordDetailRead,
    ProofVaultSummaryRead,
    ProofVaultVerificationRead,
    ProofVaultVerifyResult,
    ProofVaultChainVerifyResult,
    ProofVaultDisputePackRead,
)
from app.models.proof_vault import ProofVaultRecord
from app.services.proof_vault_service import ProofVaultService

router = APIRouter(prefix="/proof-vault", tags=["proof_vault"])


def resolve_org_id(user: User, org_id: UUID | None) -> UUID:
    if user.role == UserRole.superadmin:
        if not org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="org_id parameter required for superadmin",
            )
        return org_id
    return user.organization_id


@router.get("/summary", response_model=ProofVaultSummaryRead)
def get_proof_vault_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProofVaultSummaryRead:
    resolved_org_id = resolve_org_id(current_user, org_id)
    return ProofVaultService().get_summary(db, resolved_org_id)


@router.get("/records", response_model=list[ProofVaultRecordRead])
def list_proof_vault_records(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    query: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
) -> list[ProofVaultRecordRead]:
    resolved_org_id = resolve_org_id(current_user, org_id)
    records = ProofVaultService().list_records(
        db, resolved_org_id, query, start_date, end_date
    )
    return [ProofVaultRecordRead.model_validate(r) for r in records]


@router.get("/verifications", response_model=list[ProofVaultVerificationRead])
def list_proof_vault_verifications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=50),
) -> list[ProofVaultVerificationRead]:
    resolved_org_id = resolve_org_id(current_user, org_id)
    verifications = ProofVaultService().list_verifications(db, resolved_org_id, limit)
    return [ProofVaultVerificationRead.model_validate(v) for v in verifications]


@router.get("/records/by-receipt/{receipt_id}", response_model=list[ProofVaultRecordRead])
def list_proof_records_for_receipt(
    receipt_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ProofVaultRecordRead]:
    resolved_org_id = resolve_org_id(current_user, org_id)
    records = ProofVaultService().get_records_for_receipt(db, resolved_org_id, receipt_id)
    return [ProofVaultRecordRead.model_validate(r) for r in records]


@router.get("/records/lookup", response_model=list[ProofVaultRecordRead])
def lookup_proof_by_customer_fingerprint(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    customer_ref_fingerprint: str = Query(..., min_length=64, max_length=64),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[ProofVaultRecordRead]:
    """Lookup proof records by opaque customer-ref fingerprint (DPDPA — no raw CIF)."""
    resolved_org_id = resolve_org_id(current_user, org_id)
    records = ProofVaultService().lookup_by_customer_fingerprint(
        db, resolved_org_id, customer_ref_fingerprint, limit=limit
    )
    return [ProofVaultRecordRead.model_validate(r) for r in records]


@router.get("/records/{record_id}", response_model=ProofVaultRecordDetailRead)
def get_proof_vault_record(
    record_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProofVaultRecordDetailRead:
    resolved_org_id = resolve_org_id(current_user, org_id)
    record = db.query(ProofVaultRecord).filter(
        ProofVaultRecord.id == record_id,
        ProofVaultRecord.organization_id == resolved_org_id,
    ).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proof vault record not found",
        )
    return ProofVaultRecordDetailRead.model_validate(record)


@router.get("/records/{record_id}/dispute-pack", response_model=ProofVaultDisputePackRead)
def get_proof_dispute_pack(
    record_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProofVaultDisputePackRead:
    resolved_org_id = resolve_org_id(current_user, org_id)
    pack = ProofVaultService().build_dispute_pack(db, resolved_org_id, record_id)
    if not pack:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proof vault record not found")
    return pack


@router.post("/verify", response_model=ProofVaultVerifyResult)
def verify_proof_vault_integrity(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProofVaultVerifyResult:
    resolved_org_id = resolve_org_id(current_user, org_id)
    return ProofVaultService().verify_integrity(db, resolved_org_id, current_user.id)


@router.post("/verify-chain", response_model=ProofVaultChainVerifyResult)
def verify_proof_vault_chain(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProofVaultChainVerifyResult:
    resolved_org_id = resolve_org_id(current_user, org_id)
    return ProofVaultService().verify_entire_chain(db, resolved_org_id, current_user.id)


@router.post("/export")
def export_proof_pack(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    resolved_org_id = resolve_org_id(current_user, org_id)
    service = ProofVaultService()

    summary = service.get_summary(db, resolved_org_id)
    records = service.list_records(db, resolved_org_id)
    verifications = service.list_verifications(db, resolved_org_id)

    # Serialize data
    summary_data = summary.model_dump_json(indent=2)
    records_data = json.dumps(
        [
            {
                "block_number": r.block_number,
                "timestamp": r.created_at.isoformat(),
                "dp_id": str(r.consent_receipt_id) if r.consent_receipt_id else None,
                "action": r.action,
                "purposes": r.purposes,
                "channel": r.channel,
                "source": r.source,
                "previous_hash": r.previous_hash,
                "current_hash": r.current_hash,
                "merkle_leaf_hash": r.merkle_leaf_hash,
                "payload_version": r.payload_version,
                "proof_hash": r.proof_hash,
                "notice_version_id": str(r.notice_version_id) if r.notice_version_id else None,
                "language": r.language,
                "journey_key": r.journey_key,
                "customer_ref_fingerprint": r.customer_ref_fingerprint,
                "identifier_types": r.identifier_types,
                "receipt_signature": r.receipt_signature,
                "sealed_at": r.sealed_at.isoformat(),
                "sealed": r.sealed,
                "verification_status": r.verification_status,
            }
            for r in records
        ],
        indent=2,
    )

    verifications_data = json.dumps(
        [
            {
                "verified_at": v.verified_at.isoformat(),
                "merkle_root": v.merkle_root,
                "records_checked": v.records_checked,
                "integrity_ok": v.integrity_ok,
                "errors": v.errors,
            }
            for v in verifications
        ],
        indent=2,
    )

    metadata_data = json.dumps(
        {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by_user": str(current_user.id),
            "exported_by_email": current_user.email,
            "organization_id": str(resolved_org_id),
            "law_references": [
                "DPDPA 2023 Section 6 (Consent audit log mandate)",
                "Indian Evidence Act 1872 Section 65B (Cryptographic admissibility certificates)",
            ],
        },
        indent=2,
    )

    # Write to zip
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        zip_file.writestr("summary.json", summary_data)
        zip_file.writestr("records.json", records_data)
        zip_file.writestr("verifications.json", verifications_data)
        zip_file.writestr("metadata.json", metadata_data)

    zip_buffer.seek(0)

    filename = f"proof_pack_{resolved_org_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
