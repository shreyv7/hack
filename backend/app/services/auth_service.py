from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.organization import Organization, OrganizationStatus
from app.models.refresh_token import RefreshTokenSession
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import ChangePasswordRequest, LoginRequest, SignupRequest, TokenResponse
from app.models.compliance import AuditEventType, AuditSeverity
from app.services.audit_log_service import AuditLogService
from app.utils.text import slugify
from app.utils.workspace_defaults import create_default_organization_settings


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def _ensure_org_active(self, user: User) -> None:
        if user.organization_id is None:
            return
        org = self.db.get(Organization, user.organization_id)
        if org is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if org.status == OrganizationStatus.suspended:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is suspended")

    def _tokens_for_user(self, user: User, *, user_agent: str | None = None) -> TokenResponse:
        jti = str(uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        session = RefreshTokenSession(
            user_id=user.id,
            token_jti=jti,
            expires_at=expires_at,
            user_agent=user_agent,
        )
        self.db.add(session)
        self.db.flush()
        return TokenResponse(
            access_token=create_access_token(
                str(user.id),
                role=user.role.value,
                org_id=user.organization_id,
            ),
            refresh_token=create_refresh_token(
                str(user.id),
                role=user.role.value,
                org_id=user.organization_id,
                jti=jti,
            ),
            must_change_password=user.must_change_password,
        )

    def _unique_org_slug(self, company_name: str) -> str:
        base = slugify(company_name) or "org"
        slug = base
        n = 2
        while self.db.query(Organization).filter(Organization.slug == slug).first() is not None:
            slug = f"{base}-{n}"
            n += 1
        return slug

    def signup(self, body: SignupRequest) -> User:
        """Self-service signup. Creates a pending Organization + its pending admin.

        The user can log in immediately but is gated out of the app (403) until a
        superadmin approves them via /api/admin/signups/{id}/approve.
        """
        email = body.email.lower()
        if self.db.query(User).filter(User.email == email).first() is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered")

        org = Organization(
            name=body.company_name,
            slug=self._unique_org_slug(body.company_name),
            status=OrganizationStatus.pending,
        )
        self.db.add(org)
        self.db.flush()
        self.db.add(create_default_organization_settings(org.id))

        user = User(
            organization_id=org.id,
            email=email,
            password_hash=hash_password(body.password),
            full_name=body.full_name,
            role=UserRole.admin,
            status=UserStatus.pending_approval,
            must_change_password=False,  # they chose their own password at signup
        )
        self.db.add(user)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered") from exc
        self.db.refresh(user)
        return user

    def login(self, body: LoginRequest) -> TokenResponse:
        email = body.email.lower()
        user = self.db.query(User).filter(User.email == email).first()
        if user is None or not verify_password(body.password, user.password_hash):
            if user is not None and user.organization_id is not None:
                AuditLogService(self.db).record_event(
                    user.organization_id,
                    action="Failed login attempt",
                    details=f"Invalid password for {email}",
                    event_type=AuditEventType.access,
                    severity=AuditSeverity.warning,
                    resource_type="auth",
                    resource_id=str(user.id),
                )
                self.db.commit()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if user.status == UserStatus.disabled:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        self._ensure_org_active(user)

        user.last_login_at = datetime.now(timezone.utc)
        if user.organization_id is not None and user.role in (UserRole.admin, UserRole.superadmin):
            AuditLogService(self.db).record_event(
                user.organization_id,
                user=user,
                action="Privileged user login",
                details=f"{user.role.value} session started",
                event_type=AuditEventType.access,
                severity=AuditSeverity.info,
                resource_type="auth",
                resource_id=str(user.id),
            )
        self.db.commit()
        self.db.refresh(user)
        return self._tokens_for_user(user)

    def refresh(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        session = (
            self.db.query(RefreshTokenSession)
            .filter(RefreshTokenSession.token_jti == jti)
            .first()
        )
        if session is None or session.revoked_at is not None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")
        if session.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

        user = self.db.get(User, UUID(user_id))
        if user is None or user.status == UserStatus.disabled:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        self._ensure_org_active(user)

        session.revoked_at = datetime.now(timezone.utc)
        new_jti = str(uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        self.db.add(
            RefreshTokenSession(
                user_id=user.id,
                token_jti=new_jti,
                expires_at=expires_at,
                user_agent=session.user_agent,
            )
        )
        self.db.commit()

        return TokenResponse(
            access_token=create_access_token(
                str(user.id),
                role=user.role.value,
                org_id=user.organization_id,
            ),
            refresh_token=create_refresh_token(
                str(user.id),
                role=user.role.value,
                org_id=user.organization_id,
                jti=new_jti,
            ),
            must_change_password=user.must_change_password,
        )

    def logout(self, refresh_token: str) -> None:
        payload = decode_token(refresh_token)
        if payload is None:
            return
        jti = payload.get("jti")
        if not jti:
            return
        session = (
            self.db.query(RefreshTokenSession)
            .filter(RefreshTokenSession.token_jti == jti, RefreshTokenSession.revoked_at.is_(None))
            .first()
        )
        if session is None:
            return
        session.revoked_at = datetime.now(timezone.utc)
        self.db.commit()

    def change_password(self, user: User, body: ChangePasswordRequest) -> User:
        db_user = self.db.get(User, user.id)
        if db_user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="User not found")
        if not verify_password(body.old_password, db_user.password_hash):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Incorrect current password")

        db_user.password_hash = hash_password(body.new_password)
        db_user.must_change_password = False
        if db_user.status == UserStatus.invited:
            db_user.status = UserStatus.active
        self.db.commit()
        self.db.refresh(db_user)
        return db_user
