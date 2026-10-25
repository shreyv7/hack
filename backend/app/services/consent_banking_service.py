"""Admin APIs for banking consent industry configuration and principal registry."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.consent_principal import ConsentPrincipal, ConsentPrincipalIdentifier
from app.models.consent_receipt import ConsentReceipt
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import OrganizationSettings
from app.models.user import User, UserRole
from app.schemas.consent_banking import (
    ConsentIndustryConfigRead,
    ConsentIndustryConfigUpdate,
    ConsentPrincipalDetail,
    ConsentPrincipalSummary,
    IdentifierTypeConfig,
    JourneyConfig,
)
from app.utils.industry_packs import (
    banking_pack_enabled,
    ensure_banking_config,
    is_banking_industry,
    merge_banking_config_update,
)
from app.utils.workspace_defaults import create_default_organization_settings


class ConsentBankingService:
    def __init__(self, db: Session):
        self.db = db

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization context required")
            return org_id
        if user.organization_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization context required")
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        return user.organization_id

    def _get_settings(self, org_id: UUID) -> OrganizationSettings:
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        if settings is None:
            settings = create_default_organization_settings(org_id)
            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)
        return settings

    def _require_banking(self, settings: OrganizationSettings) -> None:
        if not is_banking_industry(settings.primary_industry):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Banking consent modules require Primary Industry = Banking & Financial Services",
            )

    def get_config(self, user: User, org_id: UUID | None = None) -> ConsentIndustryConfigRead:
        resolved = self._resolve_org_id(user, org_id)
        settings = self._get_settings(resolved)
        cfg = ensure_banking_config(settings.primary_industry, settings.consent_industry_config)
        if not cfg:
            return ConsentIndustryConfigRead(enabled=False)
        return ConsentIndustryConfigRead(
            pack=cfg.get("pack"),
            enabled=bool(cfg.get("enabled")),
            identifier_types=[IdentifierTypeConfig.model_validate(t) for t in cfg.get("identifier_types", [])],
            journeys=[JourneyConfig.model_validate(j) for j in cfg.get("journeys", [])],
            property_journey_map=cfg.get("property_journey_map") or {},
        )

    def update_config(
        self, user: User, body: ConsentIndustryConfigUpdate, org_id: UUID | None = None
    ) -> ConsentIndustryConfigRead:
        resolved = self._resolve_org_id(user, org_id)
        if user.role not in (UserRole.admin, UserRole.superadmin):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")
        settings = self._get_settings(resolved)
        self._require_banking(settings)
        patch = body.model_dump(exclude_unset=True)
        settings.consent_industry_config = merge_banking_config_update(
            settings.consent_industry_config,
            patch,
        )
        self.db.commit()
        return self.get_config(user, resolved)

    def list_principals(
        self,
        user: User,
        org_id: UUID | None = None,
        search: str | None = None,
        limit: int = 50,
    ) -> list[ConsentPrincipalSummary]:
        resolved = self._resolve_org_id(user, org_id)
        self._require_banking(self._get_settings(resolved))

        q = self.db.query(ConsentPrincipal).filter(ConsentPrincipal.organization_id == resolved)
        if search:
            like = f"%{search.strip()}%"
            q = q.filter(ConsentPrincipal.canonical_ref.ilike(like))

        principals = q.order_by(ConsentPrincipal.created_at.desc()).limit(limit).all()
        out: list[ConsentPrincipalSummary] = []
        for p in principals:
            id_types = [i.identifier_type for i in p.identifiers]
            receipt_stats = (
                self.db.query(
                    func.count(ConsentReceipt.id),
                    func.max(ConsentReceipt.created_at),
                )
                .filter(ConsentReceipt.principal_id == p.id)
                .first()
            )
            out.append(
                ConsentPrincipalSummary(
                    id=p.id,
                    canonical_ref=p.canonical_ref,
                    linkage_source=p.linkage_source.value,
                    identifier_types=sorted(set(id_types)),
                    receipt_count=int(receipt_stats[0] or 0),
                    last_consent_at=receipt_stats[1],
                    created_at=p.created_at,
                )
            )
        return out

    def get_principal(
        self, user: User, principal_id: UUID, org_id: UUID | None = None
    ) -> ConsentPrincipalDetail:
        resolved = self._resolve_org_id(user, org_id)
        principal = (
            self.db.query(ConsentPrincipal)
            .filter(
                ConsentPrincipal.id == principal_id,
                ConsentPrincipal.organization_id == resolved,
            )
            .first()
        )
        if principal is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Principal not found")

        identifiers = [
            {
                "type": i.identifier_type,
                "fingerprint": i.token_fingerprint,
                "last_seen_channel": i.last_seen_channel,
                "last_seen_at": i.last_seen_at.isoformat() if i.last_seen_at else None,
            }
            for i in principal.identifiers
        ]
        receipts = (
            self.db.query(ConsentReceipt)
            .filter(ConsentReceipt.principal_id == principal.id)
            .order_by(ConsentReceipt.created_at.desc())
            .limit(100)
            .all()
        )
        receipt_rows = [
            {
                "id": str(r.id),
                "journey_key": r.journey_key,
                "capture_channel": r.capture_channel,
                "language": r.language,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "consented_purposes": r.consented_purposes,
            }
            for r in receipts
        ]
        last_at = receipts[0].created_at if receipts else None
        return ConsentPrincipalDetail(
            id=principal.id,
            canonical_ref=principal.canonical_ref,
            linkage_source=principal.linkage_source.value,
            identifier_types=sorted({i.identifier_type for i in principal.identifiers}),
            receipt_count=len(receipts),
            last_consent_at=last_at,
            created_at=principal.created_at,
            identifiers=identifiers,
            receipts=receipt_rows,
        )

    def resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        return self._resolve_org_id(user, org_id)

    def is_banking_enabled(self, org_id: UUID) -> bool:
        settings = self._get_settings(org_id)
        return is_banking_industry(settings.primary_industry) and banking_pack_enabled(
            ensure_banking_config(settings.primary_industry, settings.consent_industry_config) or {}
        )
