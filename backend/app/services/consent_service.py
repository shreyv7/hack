from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.consent import (
    ConsentNotice,
    ConsentNoticeVersion,
    LegalBasis,
    NoticeVersionStatus,
    Purpose,
    PurposeVersion,
    PurposeVersionStatus,
    notice_version_purposes,
    NoticeActivity,
    PurposeActivity,
)
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import OrganizationSettings
from app.models.user import User, UserRole
from app.models.compliance import AuditEventType
from app.schemas.consent import (
    ComplianceCheckResult,
    ComplianceWarning,
    NoticeCreate,
    NoticeDetailRead,
    NoticeSummaryRead,
    NoticeVersionContentUpdate,
    NoticeVersionPurposesUpdate,
    NoticeVersionRead,
    PurposeCreate,
    PurposeDetailRead,
    PurposeRead,
    PurposeUpdate,
    LinkedNoticeSummary,
    NoticeApprovalAction,
    NoticeApprovalQueueItem,
)


WITHDRAWAL_KEYWORDS = ("withdraw", "withdrawal", "revoke", "opt out", "opt-out")

DEFAULT_COMPLAINT_TEXT = (
    "You may lodge a complaint with the Data Protection Board of India if you believe "
    "your personal data has been processed in violation of the Digital Personal Data "
    "Protection Act, 2023."
)

DEFAULT_RIGHTS_WITHDRAWAL_TEXT = (
    "You may withdraw consent at any time using the same channel through which "
    "consent was provided. Withdrawal will not affect processing already performed "
    "under valid consent."
)

WITHDRAWAL_APPENDIX = (
    "\n\nYou may withdraw your consent at any time through the same method used to "
    "provide it. Withdrawal is as easy as giving consent and will not affect the "
    "lawfulness of processing based on consent before its withdrawal."
)

DEFAULT_OPENING_STATEMENT = (
    "We process your personal data for the purposes described in this notice. "
    "This notice explains what we collect, why, and how you can exercise your rights."
)


class ConsentService:
    def __init__(self, db: Session):
        self.db = db

    def _compliance_audit(
        self,
        org_id: UUID,
        user: User | None,
        *,
        action: str,
        details: str = "",
        event_type: AuditEventType = AuditEventType.consent,
        resource_type: str | None = None,
        resource_id: str | None = None,
    ) -> None:
        from app.services.audit_events import record_audit_event

        record_audit_event(
            self.db,
            org_id,
            user=user,
            action=action,
            details=details,
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            commit=False,
        )

    def log_notice_activity(
        self,
        org_id: UUID,
        notice_id: UUID | None,
        action: str,
        notice_name: str,
        notice_version: str,
        user_name: str,
    ) -> NoticeActivity:
        act = NoticeActivity(
            organization_id=org_id,
            notice_id=notice_id,
            action=action,
            notice_name=notice_name,
            notice_version=notice_version,
            user_name=user_name,
        )
        self.db.add(act)
        return act

    def log_purpose_activity(
        self,
        org_id: UUID,
        purpose_id: UUID | None,
        action: str,
        purpose_name: str,
        purpose_version: str,
        user_name: str,
    ) -> PurposeActivity:
        act = PurposeActivity(
            organization_id=org_id,
            purpose_id=purpose_id,
            action=action,
            purpose_name=purpose_name,
            purpose_version=purpose_version,
            user_name=user_name,
        )
        self.db.add(act)
        return act

    def list_notice_activities(self, user: User, org_id: UUID | None = None) -> list[NoticeActivity]:
        resolved_org_id = self._resolve_org_id(user, org_id)
        
        activities = self.db.query(NoticeActivity).filter(
            NoticeActivity.organization_id == resolved_org_id
        ).order_by(NoticeActivity.created_at.desc()).all()
        
        if not activities:
            notices = self.db.query(ConsentNotice).filter(
                ConsentNotice.organization_id == resolved_org_id
            ).all()
            
            for notice in notices:
                versions = self.db.query(ConsentNoticeVersion).filter(
                    ConsentNoticeVersion.notice_id == notice.id
                ).order_by(ConsentNoticeVersion.version_number.asc()).all()
                
                user_name = user.full_name or user.email or "System"
                
                for version in versions:
                    created_at = version.created_at or notice.created_at
                    if version.version_number == 1:
                        created_act = NoticeActivity(
                            organization_id=resolved_org_id,
                            notice_id=notice.id,
                            action="Created notice",
                            notice_name=notice.internal_name,
                            notice_version=self._version_label(1),
                            user_name=user_name,
                            created_at=created_at,
                            updated_at=created_at,
                        )
                        self.db.add(created_act)
                    
                    if version.version_number > 1 and version.status == NoticeVersionStatus.draft:
                        updated_act = NoticeActivity(
                            organization_id=resolved_org_id,
                            notice_id=notice.id,
                            action="Content updated",
                            notice_name=notice.internal_name,
                            notice_version=self._version_label(version.version_number),
                            user_name=user_name,
                            created_at=version.updated_at or created_at,
                            updated_at=version.updated_at or created_at,
                        )
                        self.db.add(updated_act)
                        
                    if version.status in (NoticeVersionStatus.live, NoticeVersionStatus.archived):
                        pub_time = version.published_at or version.updated_at or created_at
                        published_act = NoticeActivity(
                            organization_id=resolved_org_id,
                            notice_id=notice.id,
                            action="Published version",
                            notice_name=notice.internal_name,
                            notice_version=self._version_label(version.version_number),
                            user_name=user_name,
                            created_at=pub_time,
                            updated_at=pub_time,
                        )
                        self.db.add(published_act)
                
                if notice.archived_at:
                    archived_act = NoticeActivity(
                        organization_id=resolved_org_id,
                        notice_id=notice.id,
                        action="Archived notice",
                        notice_name=notice.internal_name,
                        notice_version=self._version_label(notice.versions[0].version_number if notice.versions else 1),
                        user_name=user_name,
                        created_at=notice.archived_at,
                        updated_at=notice.archived_at,
                    )
                    self.db.add(archived_act)
                    
            self.db.commit()
            
            activities = self.db.query(NoticeActivity).filter(
                NoticeActivity.organization_id == resolved_org_id
            ).order_by(NoticeActivity.created_at.desc()).all()
            
        return activities

    def list_purpose_activities(self, user: User, org_id: UUID | None = None) -> list[PurposeActivity]:
        resolved_org_id = self._resolve_org_id(user, org_id)
        
        activities = self.db.query(PurposeActivity).filter(
            PurposeActivity.organization_id == resolved_org_id
        ).order_by(PurposeActivity.created_at.desc()).all()
        
        if not activities:
            purposes = self.db.query(Purpose).filter(
                Purpose.organization_id == resolved_org_id
            ).all()
            
            for purpose in purposes:
                versions = self.db.query(PurposeVersion).filter(
                    PurposeVersion.purpose_id == purpose.id
                ).order_by(PurposeVersion.version_number.asc()).all()
                
                user_name = user.full_name or user.email or "System"
                
                for version in versions:
                    created_at = version.created_at or purpose.created_at
                    if version.version_number == 1:
                        created_act = PurposeActivity(
                            organization_id=resolved_org_id,
                            purpose_id=purpose.id,
                            action="Created purpose",
                            purpose_name=purpose.name,
                            purpose_version="v1.0",
                            user_name=user_name,
                            created_at=created_at,
                            updated_at=created_at,
                        )
                        self.db.add(created_act)
                    
                    if version.version_number > 1:
                        updated_act = PurposeActivity(
                            organization_id=resolved_org_id,
                            purpose_id=purpose.id,
                            action="Content updated",
                            purpose_name=purpose.name,
                            purpose_version=f"v{version.version_number}.0",
                            user_name=user_name,
                            created_at=version.updated_at or created_at,
                            updated_at=version.updated_at or created_at,
                        )
                        self.db.add(updated_act)
                
                if purpose.archived_at:
                    archived_act = PurposeActivity(
                        organization_id=resolved_org_id,
                        purpose_id=purpose.id,
                        action="Archived purpose",
                        purpose_name=purpose.name,
                        purpose_version=purpose.version or "v1.0",
                        user_name=user_name,
                        created_at=purpose.archived_at,
                        updated_at=purpose.archived_at,
                    )
                    self.db.add(archived_act)
                    
            self.db.commit()
            
            activities = self.db.query(PurposeActivity).filter(
                PurposeActivity.organization_id == resolved_org_id
            ).order_by(PurposeActivity.created_at.desc()).all()
            
        return activities


    def _ensure_org_accessible(self, org_id: UUID) -> None:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Consent management requires an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Consent management requires an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _require_admin(self, user: User) -> None:
        if user.role not in (UserRole.admin, UserRole.superadmin):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")

    def _is_banking_org(self, org_id: UUID) -> bool:
        from app.utils.industry_packs import is_banking_industry

        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        return bool(settings and is_banking_industry(settings.primary_industry))

    def _append_approval_note(
        self, version: ConsentNoticeVersion, user: User, action: str, comment: str | None
    ) -> None:
        notes = list(version.approval_notes or [])
        notes.append(
            {
                "action": action,
                "by": user.full_name or user.email or str(user.id),
                "user_id": str(user.id),
                "comment": comment,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        version.approval_notes = notes

    def _require_legal_reviewer(self, user: User) -> None:
        from app.core.rbac import Permission, has_permission

        if user.role in (UserRole.admin, UserRole.superadmin):
            return
        if has_permission(user, Permission.DSAR_LEGAL_DRAFT):
            return
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Legal review access required")

    def _require_dpo_reviewer(self, user: User) -> None:
        from app.core.rbac import Permission, has_permission

        if user.role in (UserRole.admin, UserRole.superadmin, UserRole.dpo):
            return
        if has_permission(user, Permission.DSAR_LEGAL_SIGNOFF):
            return
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="DPO approval access required")

    def _version_label(self, version_number: int) -> str:
        return f"v{version_number}.0"

    def _linked_notices_count(self, purpose_id: UUID) -> int:
        return (
            self.db.query(notice_version_purposes.c.notice_version_id)
            .join(
                ConsentNoticeVersion,
                ConsentNoticeVersion.id == notice_version_purposes.c.notice_version_id,
            )
            .join(
                PurposeVersion,
                PurposeVersion.id == notice_version_purposes.c.purpose_version_id,
            )
            .filter(PurposeVersion.purpose_id == purpose_id)
            .distinct()
            .count()
        )

    def _purpose_to_read(self, purpose: Purpose) -> PurposeRead:
        return PurposeRead(
            id=purpose.id,
            name=purpose.name,
            legal_basis=purpose.legal_basis,
            data_categories=purpose.data_categories or [],
            retention_period=purpose.retention_period or "",
            description=purpose.description,
            is_special_category=purpose.is_special_category,
            version=purpose.version or "v1.0",
            last_reviewed_at=purpose.last_reviewed_at,
            archived_at=purpose.archived_at,
            linked_notices_count=self._linked_notices_count(purpose.id),
            translations=purpose.current_live_version.translations or {} if purpose.current_live_version else {},
            lia_summary=purpose.lia_summary,
            lia_reviewed_at=purpose.lia_reviewed_at,
            lia_reviewed_by=purpose.lia_reviewed_by,
        )

    def _purpose_version_to_read(self, version: PurposeVersion) -> PurposeRead:
        return PurposeRead(
            id=version.purpose_id,
            name=version.name,
            legal_basis=version.legal_basis,
            data_categories=version.data_categories or [],
            retention_period=version.retention_period or "",
            description=version.description,
            is_special_category=version.is_special_category,
            version=f"v{version.version_number}.0",
            last_reviewed_at=version.last_reviewed_at,
            archived_at=version.purpose.archived_at if version.purpose else None,
            linked_notices_count=0,
            translations=version.translations or {},
            lia_summary=version.lia_summary,
            lia_reviewed_at=version.lia_reviewed_at,
            lia_reviewed_by=version.lia_reviewed_by,
        )

    def _version_to_read(self, version: ConsentNoticeVersion) -> NoticeVersionRead:
        purposes = sorted(version.purposes, key=lambda p: p.name)
        warnings_raw = version.compliance_warnings or []
        warnings = [ComplianceWarning.model_validate(w) for w in warnings_raw]
        return NoticeVersionRead(
            id=version.id,
            notice_id=version.notice_id,
            version_number=version.version_number,
            status=version.status,
            display_name=version.display_name,
            language=version.language,
            opening_statement=version.opening_statement,
            contact_email=version.contact_email,
            contact_website=version.contact_website,
            dpo_name=version.dpo_name,
            dpo_email=version.dpo_email,
            rights_exercise=version.rights_exercise,
            complaint_process=version.complaint_process,
            retention_policy=version.retention_policy,
            compliance_warnings=warnings,
            published_at=version.published_at,
            published_by_user_id=version.published_by_user_id,
            submitted_at=version.submitted_at,
            legal_reviewed_at=version.legal_reviewed_at,
            legal_reviewed_by_user_id=version.legal_reviewed_by_user_id,
            dpo_approved_at=version.dpo_approved_at,
            dpo_approved_by_user_id=version.dpo_approved_by_user_id,
            approval_notes=version.approval_notes,
            purpose_ids=[p.purpose_id for p in purposes],
            purposes=[self._purpose_version_to_read(p) for p in purposes],
            translations=version.translations or {},
        )

    def compute_compliance_warnings(
        self, version: ConsentNoticeVersion, purposes: list[PurposeVersion]
    ) -> list[ComplianceWarning]:
        warnings: list[ComplianceWarning] = []
        if not (version.dpo_email or version.contact_email):
            warnings.append(
                ComplianceWarning(
                    code="MISSING_DPO_CONTACT",
                    message="Provide a DPO email or general contact email (DPDPA Section 6(3)).",
                )
            )
        if not (version.opening_statement or "").strip():
            warnings.append(
                ComplianceWarning(
                    code="MISSING_OPENING_STATEMENT",
                    message="Opening statement is required for a clear, plain-language notice.",
                )
            )
        if not purposes:
            warnings.append(
                ComplianceWarning(
                    code="NO_PURPOSES_LINKED",
                    message="Link at least one processing purpose before publishing.",
                )
            )
        has_consent_purpose = any(p.legal_basis == LegalBasis.consent for p in purposes)
        rights_text = (version.rights_exercise or "").lower()
        if has_consent_purpose and not any(k in rights_text for k in WITHDRAWAL_KEYWORDS):
            warnings.append(
                ComplianceWarning(
                    code="CONSENT_WITHOUT_WITHDRAWAL",
                    message="Consent-based purposes require withdrawal instructions in rights exercise text.",
                )
            )
        now = datetime.now(timezone.utc)
        for purpose in purposes:
            if not purpose.is_special_category:
                continue
            reviewed = purpose.last_reviewed_at
            if reviewed is None:
                warnings.append(
                    ComplianceWarning(
                        code="SPECIAL_CATEGORY_REVIEW",
                        message=f"Special category purpose '{purpose.name}' has no last review date.",
                    )
                )
            elif (now - reviewed).days > 365:
                warnings.append(
                    ComplianceWarning(
                        code="SPECIAL_CATEGORY_REVIEW",
                        message=f"Special category purpose '{purpose.name}' was last reviewed over 12 months ago.",
                    )
                )

        # Legitimate Use validation
        for purpose in purposes:
            if purpose.legal_basis != LegalBasis.legitimate_use:
                continue

            # Rule 1: Special category data CANNOT use legitimate use under DPDPA §7
            if purpose.is_special_category:
                warnings.append(
                    ComplianceWarning(
                        code="LEGITIMATE_USE_SPECIAL_CATEGORY",
                        message=(
                            f"Purpose '{purpose.name}' uses Legitimate Use but is flagged as special-category data. "
                            "DPDPA §7 does not permit legitimate use for sensitive personal data — change to Consent."
                        ),
                    )
                )

            # Rule 2: Legitimate use purposes should have a balancing test documented
            if not purpose.lia_summary or not purpose.lia_summary.strip():
                warnings.append(
                    ComplianceWarning(
                        code="LEGITIMATE_USE_NO_BALANCING_TEST",
                        message=(
                            f"Purpose '{purpose.name}' (Legitimate Use) has no Legitimate Interest Assessment (LIA) "
                            "on record. Document the balancing test to satisfy DPDPA §7 accountability requirements."
                        ),
                    )
                )

            # Rule 3: Legitimate use purpose must have a retention period
            if not purpose.retention_period or not purpose.retention_period.strip():
                warnings.append(
                    ComplianceWarning(
                        code="LEGITIMATE_USE_NO_RETENTION",
                        message=(
                            f"Purpose '{purpose.name}' uses Legitimate Use but has no retention period set. "
                            "Retention limits must be defined under the necessity/proportionality principle."
                        ),
                    )
                )

        # Check for unmapped non-essential trackers on active properties linked to this notice
        from app.models.integration_property import IntegrationProperty, PropertyStatus
        properties = (
            self.db.query(IntegrationProperty)
            .filter(
                IntegrationProperty.consent_notice_id == version.notice_id,
                IntegrationProperty.status == PropertyStatus.active,
            )
            .all()
        )
        if properties:
            property_ids = [p.id for p in properties]
            version_purpose_ids = {p.purpose_id for p in purposes}
            
            from app.models.detected_tracker import DetectedTracker, TrackerCategory
            from app.models.tracker_override import TrackerOverride
            
            trackers = (
                self.db.query(DetectedTracker)
                .filter(DetectedTracker.property_id.in_(property_ids))
                .all()
            )
            
            overrides = (
                self.db.query(TrackerOverride)
                .filter(TrackerOverride.property_id.in_(property_ids))
                .all()
            )
            override_map = {(o.property_id, o.tracker_name): o for o in overrides}
            
            for t in trackers:
                active_cat = t.category
                active_purpose_id = t.purpose_id
                action = "auto"
                
                key = (t.property_id, t.name)
                if key in override_map:
                    override = override_map[key]
                    action = override.action
                    if override.overridden_category:
                        active_cat = override.overridden_category
                    if override.purpose_id:
                        active_purpose_id = override.purpose_id
                
                if action == "allow" or active_cat == TrackerCategory.essential:
                    continue
                    
                if active_purpose_id is None or active_purpose_id not in version_purpose_ids:
                    prop_name = next((p.domain for p in properties if p.id == t.property_id), str(t.property_id))
                    warnings.append(
                        ComplianceWarning(
                            code="UNMAPPED_TRACKERS",
                            message=f"Tracker '{t.name}' on property '{prop_name}' is not mapped to any active purpose in this notice.",
                        )
                    )
        return warnings

    def _refresh_warnings(self, version: ConsentNoticeVersion) -> None:
        purposes = list(version.purposes)
        warnings = self.compute_compliance_warnings(version, purposes)
        version.compliance_warnings = [w.model_dump() for w in warnings]

    def _apply_auto_fix(self, version: ConsentNoticeVersion) -> bool:
        changed = False
        purposes = list(version.purposes)
        has_consent_purpose = any(p.legal_basis == LegalBasis.consent for p in purposes)

        if not (version.complaint_process or "").strip():
            version.complaint_process = DEFAULT_COMPLAINT_TEXT
            changed = True

        if not (version.opening_statement or "").strip():
            version.opening_statement = DEFAULT_OPENING_STATEMENT
            changed = True

        rights_text = (version.rights_exercise or "").strip()
        if not rights_text:
            version.rights_exercise = DEFAULT_RIGHTS_WITHDRAWAL_TEXT
            changed = True
        elif has_consent_purpose and not any(k in rights_text.lower() for k in WITHDRAWAL_KEYWORDS):
            version.rights_exercise = rights_text + WITHDRAWAL_APPENDIX
            changed = True

        return changed

    def list_purposes(
        self, user: User, org_id: UUID | None = None, *, include_archived: bool = False
    ) -> list[PurposeRead]:
        org_id = self._resolve_org_id(user, org_id)
        q = self.db.query(Purpose).filter(Purpose.organization_id == org_id)
        if not include_archived:
            q = q.filter(Purpose.archived_at.is_(None))
        rows = q.order_by(Purpose.name).all()
        return [self._purpose_to_read(p) for p in rows]

    def get_purpose(self, user: User, purpose_id: UUID, org_id: UUID | None = None) -> PurposeDetailRead:
        org_id = self._resolve_org_id(user, org_id)
        purpose = self._get_purpose(org_id, purpose_id)
        base = self._purpose_to_read(purpose)
        linked = self._linked_notices_for_purpose(purpose.id)
        return PurposeDetailRead(**base.model_dump(), linked_notices=linked)

    def _linked_notices_for_purpose(self, purpose_id: UUID) -> list[LinkedNoticeSummary]:
        rows = (
            self.db.query(ConsentNoticeVersion, ConsentNotice)
            .join(ConsentNotice, ConsentNotice.id == ConsentNoticeVersion.notice_id)
            .join(
                notice_version_purposes,
                notice_version_purposes.c.notice_version_id == ConsentNoticeVersion.id,
            )
            .join(
                PurposeVersion,
                PurposeVersion.id == notice_version_purposes.c.purpose_version_id,
            )
            .filter(PurposeVersion.purpose_id == purpose_id)
            .order_by(ConsentNotice.internal_name, ConsentNoticeVersion.version_number.desc())
            .all()
        )
        summaries: list[LinkedNoticeSummary] = []
        seen: set[tuple[UUID, int]] = set()
        for version, notice in rows:
            key = (notice.id, version.version_number)
            if key in seen:
                continue
            seen.add(key)
            summaries.append(
                LinkedNoticeSummary(
                    notice_id=notice.id,
                    notice_name=notice.internal_name,
                    version_id=version.id,
                    version_number=version.version_number,
                    version_label=self._version_label(version.version_number),
                    status=version.status,
                )
            )
        return summaries

    def create_purpose(
        self, user: User, body: PurposeCreate, org_id: UUID | None = None
    ) -> PurposeRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        now = datetime.now(timezone.utc)
        purpose = Purpose(
            organization_id=org_id,
            name=body.name.strip(),
        )
        self.db.add(purpose)
        self.db.flush()
        
        version = PurposeVersion(
            purpose_id=purpose.id,
            version_number=1,
            name=body.name.strip(),
            legal_basis=body.legal_basis,
            data_categories=body.data_categories,
            retention_period=body.retention_period,
            description=body.description,
            is_special_category=body.is_special_category,
            last_reviewed_at=now,
            published_at=now,
            translations=body.translations or {},
            lia_summary=body.lia_summary,
            lia_reviewed_at=body.lia_reviewed_at,
            lia_reviewed_by=body.lia_reviewed_by,
        )
        self.db.add(version)
        self.db.flush()
        
        purpose.current_live_version_id = version.id
        self.log_purpose_activity(
            org_id=org_id,
            purpose_id=purpose.id,
            action="Created purpose",
            purpose_name=purpose.name,
            purpose_version="v1.0",
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent purpose created: {purpose.name}",
            details=f"Legal basis: {body.legal_basis}",
            resource_type="consent_purpose",
            resource_id=str(purpose.id),
        )
        self.db.commit()
        self.db.refresh(purpose)
        return self._purpose_to_read(purpose)

    def update_purpose(
        self, user: User, purpose_id: UUID, body: PurposeUpdate, org_id: UUID | None = None
    ) -> PurposeRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        purpose = self._get_purpose(org_id, purpose_id)
        if purpose.archived_at is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Purpose is archived")
        
        live = purpose.current_live_version
        data = body.model_dump(exclude_unset=True)
        if data:
            if "name" in data and data["name"]:
                data["name"] = data["name"].strip()
                purpose.name = data["name"]
            
            new_version_number = (live.version_number if live else 0) + 1
            now = datetime.now(timezone.utc)
            
            new_data = {
                "purpose_id": purpose.id,
                "version_number": new_version_number,
                "name": data.get("name", live.name if live else purpose.name),
                "legal_basis": data.get("legal_basis", live.legal_basis if live else LegalBasis.consent),
                "data_categories": data.get("data_categories", live.data_categories if live else []),
                "retention_period": data.get("retention_period", live.retention_period if live else ""),
                "description": data.get("description", live.description if live else None),
                "is_special_category": data.get("is_special_category", live.is_special_category if live else False),
                "last_reviewed_at": data.get("last_reviewed_at", now),
                "published_at": now,
                "translations": data.get("translations", live.translations if live else {}),
                "lia_summary": data.get("lia_summary", live.lia_summary if live else None),
                "lia_reviewed_at": data.get("lia_reviewed_at", live.lia_reviewed_at if live else None),
                "lia_reviewed_by": data.get("lia_reviewed_by", live.lia_reviewed_by if live else None),
            }
            
            new_version = PurposeVersion(**new_data)
            self.db.add(new_version)
            self.db.flush()
            purpose.current_live_version_id = new_version.id
            self.log_purpose_activity(
                org_id=org_id,
                purpose_id=purpose.id,
                action="Content updated",
                purpose_name=purpose.name,
                purpose_version=f"v{new_version_number}.0",
                user_name=user.full_name or user.email or "System",
            )
            self._compliance_audit(
                org_id,
                user,
                action=f"Consent purpose updated: {purpose.name}",
                details=f"New version v{new_version_number}.0",
                resource_type="consent_purpose",
                resource_id=str(purpose.id),
            )

        self.db.commit()
        self.db.refresh(purpose)
        return self._purpose_to_read(purpose)

    def archive_purpose(self, user: User, purpose_id: UUID, org_id: UUID | None = None) -> None:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        purpose = self._get_purpose(org_id, purpose_id)
        live_links = (
            self.db.query(ConsentNoticeVersion)
            .join(
                notice_version_purposes,
                notice_version_purposes.c.notice_version_id == ConsentNoticeVersion.id,
            )
            .join(
                PurposeVersion,
                PurposeVersion.id == notice_version_purposes.c.purpose_version_id,
            )
            .filter(
                PurposeVersion.purpose_id == purpose_id,
                notice_version_purposes.c.purpose_version_id == PurposeVersion.id,
                ConsentNoticeVersion.status == NoticeVersionStatus.live,
            )
            .count()
        )
        if live_links:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Cannot archive purpose linked to a live notice version",
            )
        
        # Check if mapped to any detected trackers or overrides
        from app.models.detected_tracker import DetectedTracker
        from app.models.tracker_override import TrackerOverride
        tracker_links = self.db.query(DetectedTracker).filter(DetectedTracker.purpose_id == purpose_id).count()
        override_links = self.db.query(TrackerOverride).filter(TrackerOverride.purpose_id == purpose_id).count()
        if tracker_links or override_links:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Cannot archive purpose actively mapped to scanned cookies/trackers",
            )

        purpose.archived_at = datetime.now(timezone.utc)
        self.log_purpose_activity(
            org_id=org_id,
            purpose_id=purpose.id,
            action="Archived purpose",
            purpose_name=purpose.name,
            purpose_version=purpose.version or "v1.0",
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent purpose archived: {purpose.name}",
            event_type=AuditEventType.deletion,
            resource_type="consent_purpose",
            resource_id=str(purpose.id),
        )
        self.db.commit()

    def _get_purpose(self, org_id: UUID, purpose_id: UUID) -> Purpose:
        purpose = self.db.get(Purpose, purpose_id)
        if purpose is None or purpose.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purpose not found")
        return purpose

    def list_notices(
        self, user: User, org_id: UUID | None = None, *, include_archived: bool = False
    ) -> list[NoticeSummaryRead]:
        org_id = self._resolve_org_id(user, org_id)
        q = self.db.query(ConsentNotice).filter(ConsentNotice.organization_id == org_id)
        if not include_archived:
            q = q.filter(ConsentNotice.archived_at.is_(None))
        notices = q.order_by(ConsentNotice.internal_name).all()
        summaries: list[NoticeSummaryRead] = []
        for notice in notices:
            versions = (
                self.db.query(ConsentNoticeVersion)
                .options(selectinload(ConsentNoticeVersion.purposes))
                .filter(ConsentNoticeVersion.notice_id == notice.id)
                .order_by(ConsentNoticeVersion.version_number.desc())
                .all()
            )
            live = next((v for v in versions if v.status == NoticeVersionStatus.live), None)
            draft = next((v for v in versions if v.status == NoticeVersionStatus.draft), None)
            in_review = next(
                (
                    v
                    for v in versions
                    if v.status
                    in (
                        NoticeVersionStatus.pending_legal,
                        NoticeVersionStatus.pending_dpo,
                        NoticeVersionStatus.dpo_approved,
                    )
                ),
                None,
            )
            current = live or in_review or draft or (versions[0] if versions else None)
            warnings_count = len(current.compliance_warnings or []) if current else 0
            purposes_count = len(current.purposes) if current else 0
            summaries.append(
                NoticeSummaryRead(
                    id=notice.id,
                    internal_name=notice.internal_name,
                    archived_at=notice.archived_at,
                    current_version_id=current.id if current else None,
                    version_number=current.version_number if current else None,
                    version_label=self._version_label(current.version_number)
                    if current
                    else None,
                    display_name=current.display_name if current else None,
                    status=current.status if current else None,
                    purposes_count=purposes_count,
                    warnings_count=warnings_count,
                    active_since=live.published_at if live else None,
                    has_draft=draft is not None or in_review is not None,
                )
            )
        return summaries

    def create_notice(
        self, user: User, body: NoticeCreate, org_id: UUID | None = None
    ) -> NoticeDetailRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        notice = ConsentNotice(
            organization_id=org_id,
            internal_name=body.internal_name.strip(),
        )
        self.db.add(notice)
        self.db.flush()
        version = ConsentNoticeVersion(
            notice_id=notice.id,
            version_number=1,
            status=NoticeVersionStatus.draft,
            display_name=(body.display_name or body.internal_name).strip(),
            language=body.language or "English",
            opening_statement=body.opening_statement or "",
            contact_email=body.contact_email,
            contact_website=body.contact_website,
            dpo_name=body.dpo_name,
            dpo_email=body.dpo_email,
            rights_exercise=body.rights_exercise or "",
            complaint_process=body.complaint_process or "",
            retention_policy=body.retention_policy or "",
            translations=body.translations or {},
        )
        self.db.add(version)
        self.db.flush()
        self._refresh_warnings(version)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="Created notice",
            notice_name=notice.internal_name,
            notice_version="v1.0",
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent notice created: {notice.internal_name}",
            details="Initial draft version v1.0",
            resource_type="consent_notice",
            resource_id=str(notice.id),
        )
        self.db.commit()
        return self.get_notice(user, notice.id, org_id=org_id)

    def get_notice(
        self, user: User, notice_id: UUID, org_id: UUID | None = None
    ) -> NoticeDetailRead:
        org_id = self._resolve_org_id(user, org_id)
        notice = self._get_notice(org_id, notice_id)
        versions = (
            self.db.query(ConsentNoticeVersion)
            .options(selectinload(ConsentNoticeVersion.purposes))
            .filter(ConsentNoticeVersion.notice_id == notice.id)
            .order_by(ConsentNoticeVersion.version_number.desc())
            .all()
        )
        return NoticeDetailRead(
            id=notice.id,
            internal_name=notice.internal_name,
            archived_at=notice.archived_at,
            current_live_version_id=notice.current_live_version_id,
            versions=[self._version_to_read(v) for v in versions],
        )

    def get_notice_version(
        self, user: User, notice_id: UUID, version_id: UUID, org_id: UUID | None = None
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        version = self._get_version(org_id, notice_id, version_id)
        return self._version_to_read(version)

    def update_notice_version(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        body: NoticeVersionContentUpdate,
        org_id: UUID | None = None,
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        version = self._get_version(org_id, notice_id, version_id)
        
        is_draft = version.status == NoticeVersionStatus.draft
        if not is_draft:
            dump = body.model_dump(exclude_unset=True)
            non_translation_fields = {k: v for k, v in dump.items() if k != 'translations' and v is not None}
            has_changes_outside_translations = False
            for key, val in non_translation_fields.items():
                current_val = getattr(version, key, None)
                if current_val != val:
                    if not (current_val == "" and val is None) and not (current_val is None and val == ""):
                        has_changes_outside_translations = True
                        break
            
            if has_changes_outside_translations:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="Only draft versions can be edited (except for translations)",
                )
            
            if 'translations' in dump:
                version.translations = dump['translations']
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(version, 'translations')
        else:
            for key, value in body.model_dump(exclude_unset=True).items():
                setattr(version, key, value)
                
        self._refresh_warnings(version)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=version.notice_id,
            action="Content updated" if is_draft else "Translations updated",
            notice_name=version.notice.internal_name if version.notice else "Notice",
            notice_version=self._version_label(version.version_number),
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent notice draft updated: {version.notice.internal_name if version.notice else 'Notice'}" if is_draft else f"Consent notice translations updated: {version.notice.internal_name if version.notice else 'Notice'}",
            details=f"Version {self._version_label(version.version_number)}",
            resource_type="consent_notice",
            resource_id=str(notice_id),
        )
        self.db.commit()
        self.db.refresh(version)
        return self._version_to_read(version)

    def set_version_purposes(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        body: NoticeVersionPurposesUpdate,
        org_id: UUID | None = None,
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        version = self._get_version(org_id, notice_id, version_id)
        if version.status != NoticeVersionStatus.draft:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Only draft versions can be edited",
            )
        if not body.purpose_ids:
            version.purposes = []
        else:
            purposes = (
                self.db.query(Purpose)
                .filter(
                    Purpose.organization_id == org_id,
                    Purpose.id.in_(body.purpose_ids),
                    Purpose.archived_at.is_(None),
                )
                .all()
            )
            if len(purposes) != len(set(body.purpose_ids)):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid purpose ids")
            order = {pid: idx for idx, pid in enumerate(body.purpose_ids)}
            purpose_versions = [p.current_live_version for p in purposes if p.current_live_version]
            version.purposes = sorted(purpose_versions, key=lambda pv: order[pv.purpose_id])
        self._refresh_warnings(version)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=version.notice_id,
            action="Content updated",
            notice_name=version.notice.internal_name if version.notice else "Notice",
            notice_version=self._version_label(version.version_number),
            user_name=user.full_name or user.email or "System",
        )
        self.db.commit()
        self.db.refresh(version)
        return self._version_to_read(version)

    def publish_version(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        org_id: UUID | None = None,
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        notice = self._get_notice(org_id, notice_id)
        version = self._get_version(org_id, notice_id, version_id)
        banking = self._is_banking_org(org_id)
        allowed_publish = (
            {NoticeVersionStatus.draft}
            if not banking
            else {NoticeVersionStatus.dpo_approved}
        )
        if version.status not in allowed_publish:
            detail = (
                "Only DPO-approved versions can be published for banking organizations"
                if banking
                else "Only draft versions can be published"
            )
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail)
        self._refresh_warnings(version)
        if version.compliance_warnings:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Resolve compliance warnings before publishing",
                    "warnings": version.compliance_warnings,
                },
            )
        for other in (
            self.db.query(ConsentNoticeVersion)
            .filter(
                ConsentNoticeVersion.notice_id == notice.id,
                ConsentNoticeVersion.status == NoticeVersionStatus.live,
            )
            .all()
        ):
            other.status = NoticeVersionStatus.archived
        version.status = NoticeVersionStatus.live
        version.published_at = datetime.now(timezone.utc)
        version.published_by_user_id = user.id
        notice.current_live_version_id = version.id
        from app.models.compliance import AuditEventType
        from app.services.audit_events import record_audit_event

        record_audit_event(
            self.db,
            org_id,
            user=user,
            action=f"Consent notice published: {notice.internal_name}",
            details=f"Version {self._version_label(version.version_number)} is now live",
            event_type=AuditEventType.consent,
            resource_type="consent_notice",
            resource_id=str(notice.id),
            commit=False,
        )
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="Published version",
            notice_name=notice.internal_name,
            notice_version=self._version_label(version.version_number),
            user_name=user.full_name or user.email or "System",
        )
        self.db.commit()
        self.db.refresh(version)
        return self._version_to_read(version)

    def submit_for_review(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        org_id: UUID | None = None,
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        notice = self._get_notice(org_id, notice_id)
        version = self._get_version(org_id, notice_id, version_id)
        if version.status != NoticeVersionStatus.draft:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Only draft versions can be submitted for review",
            )
        self._refresh_warnings(version)
        if version.compliance_warnings:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Resolve compliance warnings before submitting for review",
                    "warnings": version.compliance_warnings,
                },
            )
        version.status = NoticeVersionStatus.pending_legal
        version.submitted_at = datetime.now(timezone.utc)
        version.legal_reviewed_at = None
        version.legal_reviewed_by_user_id = None
        version.dpo_approved_at = None
        version.dpo_approved_by_user_id = None
        self._append_approval_note(version, user, "submitted", None)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="Submitted for legal review",
            notice_name=notice.internal_name,
            notice_version=self._version_label(version.version_number),
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent notice submitted for review: {notice.internal_name}",
            details=f"Version {self._version_label(version.version_number)}",
            resource_type="consent_notice",
            resource_id=str(notice.id),
        )
        self.db.commit()
        self.db.refresh(version)
        return self._version_to_read(version)

    def approve_legal(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        body: NoticeApprovalAction,
        org_id: UUID | None = None,
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_legal_reviewer(user)
        notice = self._get_notice(org_id, notice_id)
        version = self._get_version(org_id, notice_id, version_id)
        if version.status != NoticeVersionStatus.pending_legal:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Version is not pending legal review",
            )
        version.status = NoticeVersionStatus.pending_dpo
        version.legal_reviewed_at = datetime.now(timezone.utc)
        version.legal_reviewed_by_user_id = user.id
        self._append_approval_note(version, user, "legal_approved", body.comment)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="Legal review approved",
            notice_name=notice.internal_name,
            notice_version=self._version_label(version.version_number),
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent notice legal approval: {notice.internal_name}",
            details=body.comment or f"Version {self._version_label(version.version_number)}",
            resource_type="consent_notice",
            resource_id=str(notice.id),
        )
        self.db.commit()
        self.db.refresh(version)
        return self._version_to_read(version)

    def approve_dpo(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        body: NoticeApprovalAction,
        org_id: UUID | None = None,
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_dpo_reviewer(user)
        notice = self._get_notice(org_id, notice_id)
        version = self._get_version(org_id, notice_id, version_id)
        if version.status != NoticeVersionStatus.pending_dpo:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Version is not pending DPO approval",
            )
        version.status = NoticeVersionStatus.dpo_approved
        version.dpo_approved_at = datetime.now(timezone.utc)
        version.dpo_approved_by_user_id = user.id
        self._append_approval_note(version, user, "dpo_approved", body.comment)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="DPO approval granted",
            notice_name=notice.internal_name,
            notice_version=self._version_label(version.version_number),
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent notice DPO approval: {notice.internal_name}",
            details=body.comment or f"Version {self._version_label(version.version_number)}",
            resource_type="consent_notice",
            resource_id=str(notice.id),
        )
        self.db.commit()
        self.db.refresh(version)
        return self._version_to_read(version)

    def reject_review(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        body: NoticeApprovalAction,
        org_id: UUID | None = None,
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        notice = self._get_notice(org_id, notice_id)
        version = self._get_version(org_id, notice_id, version_id)
        if version.status == NoticeVersionStatus.pending_legal:
            self._require_legal_reviewer(user)
            action_label = "Legal review rejected"
            note_action = "legal_rejected"
        elif version.status == NoticeVersionStatus.pending_dpo:
            self._require_dpo_reviewer(user)
            action_label = "DPO approval rejected"
            note_action = "dpo_rejected"
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Version is not in an approval queue",
            )
        version.status = NoticeVersionStatus.draft
        version.submitted_at = None
        version.legal_reviewed_at = None
        version.legal_reviewed_by_user_id = None
        version.dpo_approved_at = None
        version.dpo_approved_by_user_id = None
        self._append_approval_note(version, user, note_action, body.comment)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action=action_label,
            notice_name=notice.internal_name,
            notice_version=self._version_label(version.version_number),
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent notice review rejected: {notice.internal_name}",
            details=body.comment or action_label,
            resource_type="consent_notice",
            resource_id=str(notice.id),
        )
        self.db.commit()
        self.db.refresh(version)
        return self._version_to_read(version)

    def list_approval_queue(
        self, user: User, org_id: UUID | None = None
    ) -> list[NoticeApprovalQueueItem]:
        org_id = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(ConsentNoticeVersion, ConsentNotice)
            .join(ConsentNotice, ConsentNoticeVersion.notice_id == ConsentNotice.id)
            .filter(
                ConsentNotice.organization_id == org_id,
                ConsentNotice.archived_at.is_(None),
                ConsentNoticeVersion.status.in_(
                    (
                        NoticeVersionStatus.pending_legal,
                        NoticeVersionStatus.pending_dpo,
                    )
                ),
            )
            .order_by(ConsentNoticeVersion.submitted_at.asc().nullslast())
            .all()
        )
        items: list[NoticeApprovalQueueItem] = []
        for version, notice in rows:
            items.append(
                NoticeApprovalQueueItem(
                    notice_id=notice.id,
                    notice_internal_name=notice.internal_name,
                    version_id=version.id,
                    version_number=version.version_number,
                    version_label=self._version_label(version.version_number),
                    status=version.status,
                    display_name=version.display_name,
                    submitted_at=version.submitted_at,
                    warnings_count=len(version.compliance_warnings or []),
                )
            )
        return items

    def create_draft_from_live(
        self, user: User, notice_id: UUID, org_id: UUID | None = None
    ) -> NoticeVersionRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        notice = self._get_notice(org_id, notice_id)
        existing_draft = (
            self.db.query(ConsentNoticeVersion)
            .filter(
                ConsentNoticeVersion.notice_id == notice.id,
                ConsentNoticeVersion.status == NoticeVersionStatus.draft,
            )
            .first()
        )
        if existing_draft:
            return self._version_to_read(existing_draft)
        in_pipeline = (
            self.db.query(ConsentNoticeVersion)
            .filter(
                ConsentNoticeVersion.notice_id == notice.id,
                ConsentNoticeVersion.status.in_(
                    (
                        NoticeVersionStatus.pending_legal,
                        NoticeVersionStatus.pending_dpo,
                        NoticeVersionStatus.dpo_approved,
                    )
                ),
            )
            .first()
        )
        if in_pipeline:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="A version is already in the approval pipeline",
            )
        live = (
            self.db.query(ConsentNoticeVersion)
            .options(selectinload(ConsentNoticeVersion.purposes))
            .filter(
                ConsentNoticeVersion.notice_id == notice.id,
                ConsentNoticeVersion.status == NoticeVersionStatus.live,
            )
            .order_by(ConsentNoticeVersion.version_number.desc())
            .first()
        )
        if live is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No live version to copy")
        max_version = (
            self.db.query(ConsentNoticeVersion.version_number)
            .filter(ConsentNoticeVersion.notice_id == notice.id)
            .order_by(ConsentNoticeVersion.version_number.desc())
            .first()
        )
        next_num = (max_version[0] if max_version else 0) + 1
        draft = ConsentNoticeVersion(
            notice_id=notice.id,
            version_number=next_num,
            status=NoticeVersionStatus.draft,
            display_name=live.display_name,
            language=live.language,
            opening_statement=live.opening_statement,
            contact_email=live.contact_email,
            contact_website=live.contact_website,
            dpo_name=live.dpo_name,
            dpo_email=live.dpo_email,
            rights_exercise=live.rights_exercise,
            complaint_process=live.complaint_process,
            retention_policy=live.retention_policy,
            purposes=list(live.purposes),
            translations=live.translations or {},
        )
        self.db.add(draft)
        self.db.flush()
        self._refresh_warnings(draft)
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="Content updated",
            notice_version=self._version_label(next_num),
            notice_name=notice.internal_name,
            user_name=user.full_name or user.email or "System",
        )
        self.db.commit()
        self.db.refresh(draft)
        return self._version_to_read(draft)

    def run_compliance_check(
        self,
        user: User,
        notice_id: UUID,
        version_id: UUID,
        *,
        auto_fix: bool = False,
        org_id: UUID | None = None,
    ) -> ComplianceCheckResult:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        version = self._get_version(org_id, notice_id, version_id)
        if version.status != NoticeVersionStatus.draft:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Compliance check applies to drafts only")
        fixed = self._apply_auto_fix(version) if auto_fix else False
        self._refresh_warnings(version)
        self.db.commit()
        self.db.refresh(version)
        warnings = [ComplianceWarning.model_validate(w) for w in (version.compliance_warnings or [])]
        return ComplianceCheckResult(warnings=warnings, auto_fixed=fixed)

    def archive_notice(self, user: User, notice_id: UUID, org_id: UUID | None = None) -> None:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        notice = self._get_notice(org_id, notice_id)
        
        # Check if the notice is linked to active properties
        from app.models.integration_property import PropertyStatus
        active_props = [p for p in notice.properties if p.status == PropertyStatus.active]
        if active_props:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot archive notice linked to active properties: {', '.join(p.domain for p in active_props)}",
            )
            
        now = datetime.now(timezone.utc)
        notice.archived_at = now
        if notice.current_live_version_id:
            live = self.db.get(ConsentNoticeVersion, notice.current_live_version_id)
            if live and live.status == NoticeVersionStatus.live:
                live.status = NoticeVersionStatus.archived
        notice.current_live_version_id = None
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="Archived notice",
            notice_name=notice.internal_name,
            notice_version=self._version_label(notice.versions[0].version_number if notice.versions else 1),
            user_name=user.full_name or user.email or "System",
        )
        self._compliance_audit(
            org_id,
            user,
            action=f"Consent notice archived: {notice.internal_name}",
            event_type=AuditEventType.deletion,
            resource_type="consent_notice",
            resource_id=str(notice.id),
        )
        self.db.commit()

    def _get_notice(self, org_id: UUID, notice_id: UUID) -> ConsentNotice:
        notice = self.db.get(ConsentNotice, notice_id)
        if notice is None or notice.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notice not found")
        return notice

    def _get_version(
        self, org_id: UUID, notice_id: UUID, version_id: UUID
    ) -> ConsentNoticeVersion:
        self._get_notice(org_id, notice_id)
        version = (
            self.db.query(ConsentNoticeVersion)
            .options(selectinload(ConsentNoticeVersion.purposes))
            .filter(
                ConsentNoticeVersion.id == version_id,
                ConsentNoticeVersion.notice_id == notice_id,
            )
            .first()
        )
        if version is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notice version not found")
        return version

    def unarchive_notice(self, user: User, notice_id: UUID, org_id: UUID | None = None) -> ConsentNotice:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        notice = self.db.query(ConsentNotice).filter(
            ConsentNotice.id == notice_id,
            ConsentNotice.organization_id == org_id
        ).first()
        if not notice:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notice not found")
        notice.archived_at = None
        self.log_notice_activity(
            org_id=org_id,
            notice_id=notice.id,
            action="Unarchived notice",
            notice_name=notice.internal_name,
            notice_version=self._version_label(notice.versions[0].version_number if notice.versions else 1),
            user_name=user.full_name or user.email or "System",
        )
        self.db.commit()
        self.db.refresh(notice)
        return notice

    def unarchive_purpose(self, user: User, purpose_id: UUID, org_id: UUID | None = None) -> Purpose:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        purpose = self.db.query(Purpose).filter(
            Purpose.id == purpose_id,
            Purpose.organization_id == org_id
        ).first()
        if not purpose:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purpose not found")
        purpose.archived_at = None
        self.log_purpose_activity(
            org_id=org_id,
            purpose_id=purpose.id,
            action="Unarchived purpose",
            purpose_name=purpose.name,
            purpose_version=purpose.version or "v1.0",
            user_name=user.full_name or user.email or "System",
        )
        self.db.commit()
        self.db.refresh(purpose)
        return purpose
