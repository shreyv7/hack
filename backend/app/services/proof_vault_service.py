import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.models.consent import ConsentNoticeVersion, LegalBasis
from app.models.consent_receipt import ConsentReceipt
from app.models.proof_vault import ProofVaultRecord, ProofVaultVerification
from app.schemas.proof_vault import (
    ProofVaultChainVerifyResult,
    ProofVaultDisputePackRead,
    ProofVaultSummaryRead,
    ProofVaultVerifyResult,
)
from app.services.proof_vault_payload import (
    PAYLOAD_VERSION_V1,
    PAYLOAD_VERSION_V2,
    build_consent_proof_payload,
    compute_proof_hash,
    purpose_strings_for_receipt,
)


class ProofVaultService:
    @staticmethod
    def compute_merkle_root(hashes: list[str]) -> str | None:
        if not hashes:
            return None
        current_level = hashes
        while len(current_level) > 1:
            next_level = []
            for i in range(0, len(current_level), 2):
                if i + 1 < len(current_level):
                    combined = current_level[i] + current_level[i + 1]
                else:
                    combined = current_level[i] + current_level[i]
                next_level.append(hashlib.sha256(combined.encode()).hexdigest())
            current_level = next_level
        return current_level[0]

    @staticmethod
    def _normalize_dt(created_at: datetime) -> datetime:
        if created_at.tzinfo is None:
            return created_at.replace(tzinfo=timezone.utc)
        return created_at

    @staticmethod
    def _chain_hash_v1(
        *,
        block_number: int,
        previous_hash: str,
        event_type: str,
        action: str,
        purposes: str,
        channel: str,
        source: str,
        created_at: datetime,
    ) -> str:
        created_at = ProofVaultService._normalize_dt(created_at)
        raw_payload = (
            f"{block_number}|{previous_hash}|{event_type}|{action}|{purposes}|"
            f"{channel}|{source}|{created_at.isoformat()}"
        )
        return hashlib.sha256(raw_payload.encode()).hexdigest()

    @staticmethod
    def _chain_hash_v2(
        *,
        block_number: int,
        previous_hash: str,
        proof_hash: str,
        event_type: str,
        action: str,
        purposes: str,
        channel: str,
        source: str,
        created_at: datetime,
    ) -> str:
        created_at = ProofVaultService._normalize_dt(created_at)
        raw_payload = (
            f"{block_number}|{previous_hash}|{proof_hash}|{event_type}|{action}|{purposes}|"
            f"{channel}|{source}|{created_at.isoformat()}"
        )
        return hashlib.sha256(raw_payload.encode()).hexdigest()

    @staticmethod
    def _expected_hash(record: ProofVaultRecord) -> str:
        created_at = ProofVaultService._normalize_dt(record.created_at)
        if (record.payload_version or PAYLOAD_VERSION_V1) >= PAYLOAD_VERSION_V2 and record.proof_hash:
            return ProofVaultService._chain_hash_v2(
                block_number=record.block_number,
                previous_hash=record.previous_hash,
                proof_hash=record.proof_hash,
                event_type=record.event_type,
                action=record.action,
                purposes=record.purposes,
                channel=record.channel,
                source=record.source,
                created_at=created_at,
            )
        return ProofVaultService._chain_hash_v1(
            block_number=record.block_number,
            previous_hash=record.previous_hash,
            event_type=record.event_type,
            action=record.action,
            purposes=record.purposes,
            channel=record.channel,
            source=record.source,
            created_at=created_at,
        )

    @staticmethod
    def _lock_last_block(db: Session, org_id: UUID) -> ProofVaultRecord | None:
        return (
            db.query(ProofVaultRecord)
            .filter(ProofVaultRecord.organization_id == org_id)
            .order_by(ProofVaultRecord.block_number.desc())
            .with_for_update()
            .first()
        )

    @staticmethod
    def _create_record(
        db: Session,
        *,
        org_id: UUID,
        consent_receipt_id: UUID | None,
        event_type: str,
        action: str,
        purposes: str,
        channel: str,
        source: str,
        created_at: datetime,
        payload_version: int = PAYLOAD_VERSION_V1,
        proof_hash: str | None = None,
        proof_payload_json: dict | None = None,
        notice_version_id: UUID | None = None,
        language: str | None = None,
        journey_key: str | None = None,
        customer_ref_fingerprint: str | None = None,
        identifier_types: list[str] | None = None,
        receipt_signature: str | None = None,
    ) -> ProofVaultRecord:
        created_at = ProofVaultService._normalize_dt(created_at)
        last_rec = ProofVaultService._lock_last_block(db, org_id)

        if last_rec:
            block_number = last_rec.block_number + 1
            previous_hash = last_rec.current_hash
        else:
            block_number = 1
            previous_hash = "0" * 64

        if payload_version >= PAYLOAD_VERSION_V2 and proof_hash:
            current_hash = ProofVaultService._chain_hash_v2(
                block_number=block_number,
                previous_hash=previous_hash,
                proof_hash=proof_hash,
                event_type=event_type,
                action=action,
                purposes=purposes,
                channel=channel,
                source=source,
                created_at=created_at,
            )
        else:
            current_hash = ProofVaultService._chain_hash_v1(
                block_number=block_number,
                previous_hash=previous_hash,
                event_type=event_type,
                action=action,
                purposes=purposes,
                channel=channel,
                source=source,
                created_at=created_at,
            )

        rec = ProofVaultRecord(
            organization_id=org_id,
            consent_receipt_id=consent_receipt_id,
            block_number=block_number,
            previous_hash=previous_hash,
            current_hash=current_hash,
            merkle_leaf_hash=current_hash,
            payload_version=payload_version,
            proof_hash=proof_hash,
            proof_payload_json=proof_payload_json,
            notice_version_id=notice_version_id,
            language=language,
            journey_key=journey_key,
            customer_ref_fingerprint=customer_ref_fingerprint,
            identifier_types=identifier_types,
            receipt_signature=receipt_signature,
            event_type=event_type,
            action=action,
            purposes=purposes,
            channel=channel,
            source=source[:512] if source else "",
            created_at=created_at,
            sealed_at=datetime.now(timezone.utc),
            sealed=True,
            verification_status="verified",
        )
        db.add(rec)
        db.flush()
        return rec

    @staticmethod
    def seal_event(
        db: Session,
        org_id: UUID,
        consent_receipt_id: UUID | None,
        event_type: str,
        action: str,
        purposes: str,
        channel: str,
        source: str,
        created_at: datetime | None = None,
    ) -> ProofVaultRecord:
        """Legacy v1 seal — retained for notice-delivery and backward compatibility."""
        if created_at is None:
            created_at = datetime.now(timezone.utc)
        return ProofVaultService._create_record(
            db,
            org_id=org_id,
            consent_receipt_id=consent_receipt_id,
            event_type=event_type,
            action=action,
            purposes=purposes,
            channel=channel,
            source=source,
            created_at=created_at,
            payload_version=PAYLOAD_VERSION_V1,
        )

    @staticmethod
    def seal_consent_proof(
        db: Session,
        *,
        organization_id: UUID,
        receipt: ConsentReceipt,
        live_version: ConsentNoticeVersion | None,
        channel: str,
        source: str,
    ) -> UUID | None:
        """Seal DPDPA-compliant v2 proof for a consent receipt (fingerprints only)."""
        primary_id: UUID | None = None
        created_at = receipt.created_at or datetime.now(timezone.utc)
        id_types = [
            str(i.get("type"))
            for i in (receipt.identifier_snapshot or [])
            if i.get("type")
        ]

        consent_str, legit_str, consent_action = purpose_strings_for_receipt(
            receipt, live_version, basis_filter=LegalBasis.consent
        )
        _, legit_only_str, _ = purpose_strings_for_receipt(
            receipt, live_version, basis_filter=LegalBasis.legitimate_use
        )

        consented_pids = [pid for pid, val in (receipt.consented_purposes or {}).items() if val]
        purpose_basis_map: dict[str, LegalBasis] = {}
        if live_version:
            for p in live_version.purposes:
                purpose_basis_map[str(p.purpose_id)] = p.legal_basis
                purpose_basis_map[p.name] = p.legal_basis
        consent_pids = [
            pid for pid in consented_pids if purpose_basis_map.get(pid, LegalBasis.consent) == LegalBasis.consent
        ]
        legit_pids = [pid for pid in consented_pids if purpose_basis_map.get(pid) == LegalBasis.legitimate_use]

        try:
            if consent_pids or not consented_pids:
                event_type = "consent_grant" if consent_pids else "consent_withdrawal"
                payload = build_consent_proof_payload(
                    receipt,
                    org_id=organization_id,
                    event_type=event_type,
                    action=consent_action,
                    purposes_str=consent_str,
                    channel=channel,
                    source=source,
                    live_version=live_version,
                )
                proof_hash = compute_proof_hash(payload)
                rec = ProofVaultService._create_record(
                    db,
                    org_id=organization_id,
                    consent_receipt_id=receipt.id,
                    event_type=event_type,
                    action=consent_action,
                    purposes=consent_str,
                    channel=channel,
                    source=source,
                    created_at=created_at,
                    payload_version=PAYLOAD_VERSION_V2,
                    proof_hash=proof_hash,
                    proof_payload_json=payload,
                    notice_version_id=receipt.notice_version_id,
                    language=receipt.language,
                    journey_key=receipt.journey_key,
                    customer_ref_fingerprint=payload.get("customer_ref_fingerprint"),
                    identifier_types=id_types or None,
                    receipt_signature=receipt.signature,
                )
                primary_id = rec.id

            if legit_pids:
                payload = build_consent_proof_payload(
                    receipt,
                    org_id=organization_id,
                    event_type="notice_of_processing",
                    action="NOTICED",
                    purposes_str=legit_only_str or legit_str,
                    channel=channel,
                    source=source,
                    live_version=live_version,
                )
                proof_hash = compute_proof_hash(payload)
                legit_rec = ProofVaultService._create_record(
                    db,
                    org_id=organization_id,
                    consent_receipt_id=receipt.id,
                    event_type="notice_of_processing",
                    action="NOTICED",
                    purposes=legit_only_str or legit_str,
                    channel=channel,
                    source=source,
                    created_at=created_at,
                    payload_version=PAYLOAD_VERSION_V2,
                    proof_hash=proof_hash,
                    proof_payload_json=payload,
                    notice_version_id=receipt.notice_version_id,
                    language=receipt.language,
                    journey_key=receipt.journey_key,
                    customer_ref_fingerprint=payload.get("customer_ref_fingerprint"),
                    identifier_types=id_types or None,
                    receipt_signature=receipt.signature,
                )
                if primary_id is None:
                    primary_id = legit_rec.id

            receipt.proof_seal_status = "sealed" if primary_id else "skipped"
            if primary_id:
                receipt.proof_vault_record_id = primary_id
            return primary_id
        except Exception as exc:
            receipt.proof_seal_status = "failed"
            print(f"Proof Vault v2 seal failed: {exc}")
            return None

    def get_summary(self, db: Session, org_id: UUID) -> ProofVaultSummaryRead:
        total = db.query(ProofVaultRecord).filter(ProofVaultRecord.organization_id == org_id).count()
        verified = (
            db.query(ProofVaultRecord)
            .filter(
                ProofVaultRecord.organization_id == org_id,
                ProofVaultRecord.verification_status == "verified",
            )
            .count()
        )

        last_block = (
            db.query(ProofVaultRecord)
            .filter(ProofVaultRecord.organization_id == org_id)
            .order_by(ProofVaultRecord.block_number.desc())
            .first()
        )
        chain_length = last_block.block_number if last_block else 0

        tampering_attempts = (
            db.query(ProofVaultVerification)
            .filter(
                ProofVaultVerification.organization_id == org_id,
                ProofVaultVerification.integrity_ok == False,
            )
            .count()
        )

        all_records = (
            db.query(ProofVaultRecord)
            .filter(ProofVaultRecord.organization_id == org_id)
            .order_by(ProofVaultRecord.block_number.asc())
            .all()
        )
        hashes = [r.merkle_leaf_hash for r in all_records]
        current_merkle_root = self.compute_merkle_root(hashes)

        last_sealed_block = None
        if last_block:
            last_sealed_block = (
                f"#{last_block.block_number} at "
                f"{last_block.created_at.strftime('%d %b %Y, %H:%M:%S.%f')[:-3]} UTC"
            )

        last_ver = (
            db.query(ProofVaultVerification)
            .filter(ProofVaultVerification.organization_id == org_id)
            .order_by(ProofVaultVerification.verified_at.desc())
            .first()
        )

        return ProofVaultSummaryRead(
            total_records=total,
            verified_records=verified,
            chain_length=chain_length,
            tampering_attempts=tampering_attempts,
            current_merkle_root=current_merkle_root,
            last_sealed_block=last_sealed_block,
            last_verified_at=last_ver.verified_at if last_ver else None,
        )

    def list_records(
        self,
        db: Session,
        org_id: UUID,
        query: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[ProofVaultRecord]:
        q = db.query(ProofVaultRecord).filter(ProofVaultRecord.organization_id == org_id)

        if start_date:
            q = q.filter(ProofVaultRecord.created_at >= start_date)
        if end_date:
            q = q.filter(ProofVaultRecord.created_at <= end_date)

        if query:
            q = q.filter(
                or_(
                    ProofVaultRecord.purposes.icontains(query),
                    ProofVaultRecord.channel.icontains(query),
                    ProofVaultRecord.source.icontains(query),
                    ProofVaultRecord.action.icontains(query),
                    ProofVaultRecord.current_hash.icontains(query),
                    ProofVaultRecord.proof_hash.icontains(query),
                    ProofVaultRecord.customer_ref_fingerprint.icontains(query),
                    ProofVaultRecord.journey_key.icontains(query),
                    ProofVaultRecord.event_type.icontains(query),
                )
            )

        return q.order_by(ProofVaultRecord.block_number.desc()).all()

    def get_records_for_receipt(self, db: Session, org_id: UUID, receipt_id: UUID) -> list[ProofVaultRecord]:
        return (
            db.query(ProofVaultRecord)
            .filter(
                ProofVaultRecord.organization_id == org_id,
                ProofVaultRecord.consent_receipt_id == receipt_id,
            )
            .order_by(ProofVaultRecord.block_number.asc())
            .all()
        )

    def lookup_by_customer_fingerprint(
        self, db: Session, org_id: UUID, fingerprint: str, limit: int = 50
    ) -> list[ProofVaultRecord]:
        return (
            db.query(ProofVaultRecord)
            .filter(
                ProofVaultRecord.organization_id == org_id,
                ProofVaultRecord.customer_ref_fingerprint == fingerprint,
            )
            .order_by(ProofVaultRecord.block_number.desc())
            .limit(limit)
            .all()
        )

    def build_dispute_pack(
        self, db: Session, org_id: UUID, record_id: UUID
    ) -> ProofVaultDisputePackRead | None:
        record = (
            db.query(ProofVaultRecord)
            .filter(ProofVaultRecord.id == record_id, ProofVaultRecord.organization_id == org_id)
            .first()
        )
        if not record:
            return None

        receipt = None
        if record.consent_receipt_id:
            receipt = db.get(ConsentReceipt, record.consent_receipt_id)

        payload_valid = False
        if record.proof_payload_json and record.proof_hash:
            payload_valid = compute_proof_hash(record.proof_payload_json) == record.proof_hash

        chain_valid = ProofVaultService._expected_hash(record) == record.current_hash

        return ProofVaultDisputePackRead(
            record_id=record.id,
            block_number=record.block_number,
            proof_hash=record.proof_hash,
            current_hash=record.current_hash,
            payload_version=record.payload_version or PAYLOAD_VERSION_V1,
            proof_payload=record.proof_payload_json,
            payload_integrity_ok=payload_valid,
            chain_integrity_ok=chain_valid,
            notice_version_id=record.notice_version_id,
            language=record.language,
            journey_key=record.journey_key,
            customer_ref_fingerprint=record.customer_ref_fingerprint,
            identifier_types=record.identifier_types,
            receipt_signature=record.receipt_signature,
            consent_receipt_id=record.consent_receipt_id,
            receipt_created_at=receipt.created_at if receipt else None,
            dpdpa_data_minimization=True,
            sealed_at=record.sealed_at,
        )

    def verify_integrity(self, db: Session, org_id: UUID, user_id: UUID | None = None) -> ProofVaultVerifyResult:
        now = datetime.now(timezone.utc)
        records = (
            db.query(ProofVaultRecord)
            .filter(ProofVaultRecord.organization_id == org_id)
            .order_by(ProofVaultRecord.block_number.asc())
            .all()
        )

        failures = []
        verified_count = 0

        for r in records:
            expected_hash = ProofVaultService._expected_hash(r)
            if expected_hash != r.current_hash:
                r.verification_status = "failed"
                failures.append(
                    f"Block #{r.block_number} hash mismatch. Expected: {expected_hash}, got: {r.current_hash}"
                )
            elif r.proof_hash and r.proof_payload_json:
                if compute_proof_hash(r.proof_payload_json) != r.proof_hash:
                    r.verification_status = "failed"
                    failures.append(f"Block #{r.block_number} proof payload hash mismatch.")
                else:
                    r.verification_status = "verified"
                    verified_count += 1
            else:
                r.verification_status = "verified"
                verified_count += 1

        integrity_ok = len(failures) == 0
        hashes = [r.merkle_leaf_hash for r in records]
        merkle_root = self.compute_merkle_root(hashes) or "0" * 64

        ver = ProofVaultVerification(
            organization_id=org_id,
            verified_at=now,
            verified_by_user_id=user_id,
            merkle_root=merkle_root,
            records_checked=len(records),
            integrity_ok=integrity_ok,
            errors=json.dumps(failures) if failures else None,
        )
        db.add(ver)
        db.commit()

        return ProofVaultVerifyResult(
            success=integrity_ok,
            verified_count=verified_count,
            failed_count=len(failures),
            checked_at=now,
            errors=failures,
        )

    def verify_entire_chain(
        self, db: Session, org_id: UUID, user_id: UUID | None = None
    ) -> ProofVaultChainVerifyResult:
        records = (
            db.query(ProofVaultRecord)
            .filter(ProofVaultRecord.organization_id == org_id)
            .order_by(ProofVaultRecord.block_number.asc())
            .all()
        )

        errors = []
        blocks_checked = len(records)

        for r in records:
            if ProofVaultService._expected_hash(r) != r.current_hash:
                errors.append(f"Block #{r.block_number} hash integrity compromised.")
            if r.proof_hash and r.proof_payload_json:
                if compute_proof_hash(r.proof_payload_json) != r.proof_hash:
                    errors.append(f"Block #{r.block_number} proof payload integrity compromised.")

        for i in range(len(records)):
            r = records[i]
            if i == 0:
                if r.previous_hash != "0" * 64:
                    errors.append(f"Genesis block previous hash is invalid: {r.previous_hash}")
                if r.block_number != 1:
                    errors.append(f"First block does not have sequence number 1: {r.block_number}")
            else:
                prev = records[i - 1]
                if r.previous_hash != prev.current_hash:
                    errors.append(
                        f"Linkage broken between block #{prev.block_number} and block #{r.block_number}"
                    )
                if r.block_number != prev.block_number + 1:
                    errors.append(
                        f"Sequence break between block #{prev.block_number} and block #{r.block_number}"
                    )

        valid = len(errors) == 0
        hashes = [r.merkle_leaf_hash for r in records]
        merkle_root = self.compute_merkle_root(hashes) or "0" * 64
        ver = ProofVaultVerification(
            organization_id=org_id,
            verified_at=datetime.now(timezone.utc),
            verified_by_user_id=user_id,
            merkle_root=merkle_root,
            records_checked=blocks_checked,
            integrity_ok=valid,
            errors=json.dumps(errors) if errors else None,
        )
        db.add(ver)
        db.commit()

        return ProofVaultChainVerifyResult(
            valid=valid,
            blocks_checked=blocks_checked,
            invalid_blocks=len(errors),
            errors=errors,
        )

    def list_verifications(self, db: Session, org_id: UUID, limit: int = 5) -> list[ProofVaultVerification]:
        return (
            db.query(ProofVaultVerification)
            .filter(ProofVaultVerification.organization_id == org_id)
            .order_by(desc(ProofVaultVerification.verified_at))
            .limit(limit)
            .all()
        )
