from uuid import UUID
from datetime import datetime, timezone
import secrets

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.consent_manager import ConsentManagerConnection
from app.models.consent_receipt import ConsentReceipt
from app.models.user import User, UserRole
from app.schemas.consent_manager import ConsentManagerCreate, ConsentSyncPayload
from app.services.consent_service import ConsentService
from app.utils.webhook_signature import verify_webhook_signature


class ConsentManagerService:
    def __init__(self, db: Session):
        self.db = db
        self.consent_service = ConsentService(db)

    def list_connections(self, user: User, org_id: UUID | None = None) -> list[ConsentManagerConnection]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        return self.db.query(ConsentManagerConnection).filter(
            ConsentManagerConnection.organization_id == resolved_org_id
        ).all()

    def connect(self, user: User, body: ConsentManagerCreate, org_id: UUID | None = None) -> ConsentManagerConnection:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)

        existing = self.db.query(ConsentManagerConnection).filter(
            ConsentManagerConnection.organization_id == resolved_org_id,
            ConsentManagerConnection.provider_name == body.provider_name
        ).first()

        if existing:
            existing.status = "Connected"
            existing.api_key = body.api_key
            existing.webhook_url = body.webhook_url
            if not existing.webhook_secret:
                existing.webhook_secret = secrets.token_hex(32)
            self.db.commit()
            self.db.refresh(existing)
            return existing

        conn = ConsentManagerConnection(
            organization_id=resolved_org_id,
            provider_name=body.provider_name,
            api_key=body.api_key,
            webhook_url=body.webhook_url,
            webhook_secret=secrets.token_hex(32),
            status="Connected"
        )
        self.db.add(conn)
        self.db.commit()
        self.db.refresh(conn)
        return conn

    def disconnect(self, user: User, conn_id: UUID, org_id: UUID | None = None) -> ConsentManagerConnection:
        self.consent_service._require_admin(user)
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)

        conn = self.db.query(ConsentManagerConnection).filter(
            ConsentManagerConnection.id == conn_id,
            ConsentManagerConnection.organization_id == resolved_org_id
        ).first()

        if not conn:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Consent manager connection not found")

        conn.status = "Disconnected"
        self.db.commit()
        self.db.refresh(conn)
        return conn

    def sync_consent(
        self,
        conn_id: UUID,
        payload: ConsentSyncPayload,
        *,
        raw_body: bytes,
        signature_header: str | None,
        timestamp_header: str | None,
        event_id: str | None,
    ) -> dict:
        conn = self.db.query(ConsentManagerConnection).filter(
            ConsentManagerConnection.id == conn_id
        ).first()

        if not conn or conn.status != "Connected":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or disconnected Consent Manager")

        secret = conn.webhook_secret or conn.api_key
        if not secret:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Webhook secret not configured")
        try:
            verify_webhook_signature(
                secret,
                raw_body,
                signature_header,
                timestamp_header,
            )
        except ValueError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

        if event_id and conn.last_webhook_event_id == event_id:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Duplicate webhook event")

        conn.last_sync_at = datetime.now(timezone.utc)
        if event_id:
            conn.last_webhook_event_id = event_id

        # Persist consent sync as receipt evidence when session metadata is present.
        if payload.session_id:
            receipt = ConsentReceipt(
                organization_id=conn.organization_id,
                session_id=payload.session_id,
                consented_purposes={"granted": payload.granted_purposes},
                basis_type="consent",
                ip_hash="webhook-sync",
                user_agent=f"consent-manager:{conn.provider_name}",
                banner_snapshot={"source": payload.source, "synced_at": payload.timestamp.isoformat()},
                signature=secrets.token_hex(32),
                principal_phone=payload.phone_number,
            )
            self.db.add(receipt)

        try:
            current_count = int(str(conn.consents_managed).replace(",", "").split()[0])
        except (ValueError, IndexError):
            current_count = 0
        conn.consents_managed = str(current_count + 1)

        self.db.commit()
        return {"status": "success", "message": "Consent state synced"}
