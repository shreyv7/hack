import hashlib
import os
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.dpia import DpiaEvidence


class DpiaEvidenceService:
    def _storage_root(self) -> Path:
        root = Path(settings.UPLOAD_DIR).parent / "dpia_evidence"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def upload_evidence(
        self,
        db: Session,
        org_id: UUID,
        file_name: str,
        file_content: bytes,
        uploaded_by_user_id: UUID | None,
        linked_control_id: UUID | None = None,
        linked_answer_id: UUID | None = None,
    ) -> DpiaEvidence:
        file_hash = hashlib.sha256(file_content).hexdigest()
        file_size = len(file_content)

        org_dir = self._storage_root() / str(org_id)
        org_dir.mkdir(parents=True, exist_ok=True)
        safe_name = file_name.replace("/", "_").replace("\\", "_")
        disk_name = f"{file_hash}_{safe_name}"
        disk_path = org_dir / disk_name
        disk_path.write_bytes(file_content)
        file_path = str(disk_path)

        evidence = DpiaEvidence(
            organization_id=org_id,
            file_name=file_name,
            file_path=file_path,
            file_hash=file_hash,
            file_size=file_size,
            uploaded_by=uploaded_by_user_id,
            linked_control_id=linked_control_id,
            linked_answer_id=linked_answer_id,
        )
        db.add(evidence)
        db.commit()
        return evidence

    def verify_evidence_integrity(self, db: Session, evidence_id: UUID) -> bool:
        ev = db.query(DpiaEvidence).filter(DpiaEvidence.id == evidence_id).first()
        if not ev:
            raise ValueError("Evidence record not found")
        path = Path(ev.file_path)
        if not path.exists():
            return False
        computed = hashlib.sha256(path.read_bytes()).hexdigest()
        return computed == ev.file_hash

    def list_evidence(
        self, db: Session, org_id: UUID, linked_control_id: UUID | None = None
    ) -> list[DpiaEvidence]:
        q = db.query(DpiaEvidence).filter(DpiaEvidence.organization_id == org_id)
        if linked_control_id:
            q = q.filter(DpiaEvidence.linked_control_id == linked_control_id)
        return q.all()
