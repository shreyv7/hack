from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.policy import (
    PolicyDocument,
    PolicyVersion,
    PolicyAcknowledgement,
    PolicyActivity,
    PolicyType,
    PolicyVersionStatus,
    AcknowledgementStatus,
)
from app.models.user import User
from app.schemas.policy import (
    PolicyCreate,
    PolicyUpdate,
    PolicyVersionCreate,
    PolicyVersionUpdate,
    PolicySummaryRead,
    PolicyDetailRead,
    PolicyVersionRead,
    AcknowledgementSummaryRead,
    AcknowledgementRead,
    PolicyActivityRead,
    PolicyStatsRead,
)
from app.services.compliance_base import ComplianceBaseService
from app.services.notice_delivery_service import ProviderRegistry
from app.services.contracts.audit_contract import AuditContract


class PolicyService(ComplianceBaseService):
    def __init__(self, db: Session):
        super().__init__(db)

    def _log_activity(
        self,
        org_id: UUID,
        policy_id: UUID | None,
        action: str,
        title: str,
        version: str,
        user_name: str,
    ) -> PolicyActivity:
        activity = PolicyActivity(
            organization_id=org_id,
            policy_id=policy_id,
            action=action,
            policy_title=title,
            policy_version=version,
            user_name=user_name,
        )
        self.db.add(activity)
        self.db.flush()
        return activity

    def list_policies(
        self, user: User, org_id: UUID | None = None, include_archived: bool = False
    ) -> list[PolicySummaryRead]:
        org_uuid = self._resolve_org_id(user, org_id)

        query = self.db.query(PolicyDocument).filter(
            PolicyDocument.organization_id == org_uuid
        )
        if not include_archived:
            query = query.filter(PolicyDocument.archived_at.is_(None))

        policies = query.all()

        result = []
        for policy in policies:
            # Calculate pending acknowledgements
            pending_count = 0
            if policy.current_live_version_id:
                pending_count = (
                    self.db.query(func.count(PolicyAcknowledgement.id))
                    .filter(
                        PolicyAcknowledgement.policy_id == policy.id,
                        PolicyAcknowledgement.policy_version_id
                        == policy.current_live_version_id,
                        PolicyAcknowledgement.status
                        != AcknowledgementStatus.acknowledged,
                    )
                    .scalar()
                    or 0
                )

            # Get version status and label
            status_val = None
            if policy.current_live_version:
                status_val = policy.current_live_version.status
            elif policy.versions:
                # Fallback to latest updated version status if no live version
                latest_ver = sorted(policy.versions, key=lambda v: v.updated_at, reverse=True)[0]
                status_val = latest_ver.status

            result.append(
                PolicySummaryRead(
                    id=policy.id,
                    title=policy.title,
                    policy_type=policy.policy_type,
                    status=status_val,
                    version_label=policy.version_label,
                    updated_at=policy.updated_at,
                    pending_acknowledgements=pending_count,
                    archived_at=policy.archived_at,
                )
            )
        return result

    def get_policy(
        self, user: User, policy_id: UUID, org_id: UUID | None = None
    ) -> PolicyDetailRead:
        org_uuid = self._resolve_org_id(user, org_id)
        policy = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.id == policy_id,
                PolicyDocument.organization_id == org_uuid,
            )
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
            )

        versions_read = []
        for v in policy.versions:
            published_by_name = v.published_by.full_name if v.published_by else None
            reviewed_by_name = v.reviewed_by.full_name if v.reviewed_by else None
            versions_read.append(
                PolicyVersionRead(
                    id=v.id,
                    policy_id=v.policy_id,
                    version_number=v.version_number,
                    status=v.status,
                    content=v.content,
                    summary=v.summary,
                    effective_date=v.effective_date,
                    published_at=v.published_at,
                    published_by_user_id=v.published_by_user_id,
                    reviewed_by_user_id=v.reviewed_by_user_id,
                    reviewed_at=v.reviewed_at,
                    created_at=v.created_at,
                    updated_at=v.updated_at,
                    published_by_name=published_by_name,
                    reviewed_by_name=reviewed_by_name,
                )
            )

        # Sort versions by version number descending
        versions_read.sort(key=lambda x: x.version_number, reverse=True)

        return PolicyDetailRead(
            id=policy.id,
            organization_id=policy.organization_id,
            title=policy.title,
            policy_type=policy.policy_type,
            current_live_version_id=policy.current_live_version_id,
            archived_at=policy.archived_at,
            created_at=policy.created_at,
            updated_at=policy.updated_at,
            versions=versions_read,
        )

    def create_policy(
        self, user: User, body: PolicyCreate, org_id: UUID | None = None
    ) -> PolicyDetailRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        policy = PolicyDocument(
            organization_id=org_uuid,
            business_unit_id=body.business_unit_id,
            title=body.title,
            policy_type=body.policy_type,
        )
        self.db.add(policy)
        self.db.flush()

        version = PolicyVersion(
            policy_id=policy.id,
            version_number=1,
            status=PolicyVersionStatus.draft,
            content=body.content,
            summary=body.summary or "Initial draft",
        )
        self.db.add(version)
        self.db.flush()

        self._log_activity(
            org_id=org_uuid,
            policy_id=policy.id,
            action="Created policy",
            title=policy.title,
            version="v1.0",
            user_name=user.full_name or "System",
        )

        AuditContract.log_campaign_event(
            self.db,
            org_uuid,
            user.id,
            "policy.created",
            f"Policy '{policy.title}' created.",
        )
        self.db.commit()

        return self.get_policy(user, policy.id, org_uuid)

    def update_policy(
        self,
        user: User,
        policy_id: UUID,
        body: PolicyUpdate,
        org_id: UUID | None = None,
    ) -> PolicyDetailRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        policy = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.id == policy_id,
                PolicyDocument.organization_id == org_uuid,
            )
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
            )

        if body.title is not None:
            policy.title = body.title
        if body.policy_type is not None:
            policy.policy_type = body.policy_type

        self._log_activity(
            org_id=org_uuid,
            policy_id=policy.id,
            action="Updated policy settings",
            title=policy.title,
            version=policy.version_label,
            user_name=user.full_name or "System",
        )
        self.db.commit()
        return self.get_policy(user, policy.id, org_uuid)

    def archive_policy(
        self, user: User, policy_id: UUID, org_id: UUID | None = None
    ) -> PolicyDetailRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        policy = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.id == policy_id,
                PolicyDocument.organization_id == org_uuid,
            )
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
            )

        policy.archived_at = datetime.now(timezone.utc)
        self._log_activity(
            org_id=org_uuid,
            policy_id=policy.id,
            action="Archived policy",
            title=policy.title,
            version=policy.version_label,
            user_name=user.full_name or "System",
        )
        self.db.commit()
        return self.get_policy(user, policy.id, org_uuid)

    def unarchive_policy(
        self, user: User, policy_id: UUID, org_id: UUID | None = None
    ) -> PolicyDetailRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        policy = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.id == policy_id,
                PolicyDocument.organization_id == org_uuid,
            )
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
            )

        policy.archived_at = None
        self._log_activity(
            org_id=org_uuid,
            policy_id=policy.id,
            action="Restored policy",
            title=policy.title,
            version=policy.version_label,
            user_name=user.full_name or "System",
        )
        self.db.commit()
        return self.get_policy(user, policy.id, org_uuid)

    def create_new_version(
        self,
        user: User,
        policy_id: UUID,
        body: PolicyVersionCreate,
        org_id: UUID | None = None,
    ) -> PolicyVersionRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        policy = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.id == policy_id,
                PolicyDocument.organization_id == org_uuid,
            )
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
            )

        # Get latest version number
        latest_version_num = (
            self.db.query(func.max(PolicyVersion.version_number))
            .filter(PolicyVersion.policy_id == policy_id)
            .scalar()
            or 0
        )
        new_version_num = latest_version_num + 1

        version = PolicyVersion(
            policy_id=policy_id,
            version_number=new_version_num,
            status=PolicyVersionStatus.draft,
            content=body.content,
            summary=body.summary or f"Draft for version {new_version_num}.0",
            effective_date=body.effective_date,
        )
        self.db.add(version)
        self.db.flush()

        self._log_activity(
            org_id=org_uuid,
            policy_id=policy.id,
            action="Created new draft version",
            title=policy.title,
            version=f"v{new_version_num}.0",
            user_name=user.full_name or "System",
        )
        self.db.commit()

        return self.get_version(user, policy_id, version.id, org_uuid)

    def update_version(
        self,
        user: User,
        policy_id: UUID,
        version_id: UUID,
        body: PolicyVersionUpdate,
        org_id: UUID | None = None,
    ) -> PolicyVersionRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        version = (
            self.db.query(PolicyVersion)
            .filter(
                PolicyVersion.id == version_id, PolicyVersion.policy_id == policy_id
            )
            .first()
        )
        if not version or version.policy.organization_id != org_uuid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Version not found"
            )

        if version.status not in (PolicyVersionStatus.draft, PolicyVersionStatus.review):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft or under-review versions can be edited",
            )

        if body.content is not None:
            version.content = body.content
        if body.summary is not None:
            version.summary = body.summary
        if body.effective_date is not None:
            version.effective_date = body.effective_date

        self.db.commit()
        return self.get_version(user, policy_id, version_id, org_uuid)

    def get_version(
        self, user: User, policy_id: UUID, version_id: UUID, org_id: UUID | None = None
    ) -> PolicyVersionRead:
        org_uuid = self._resolve_org_id(user, org_id)

        version = (
            self.db.query(PolicyVersion)
            .filter(
                PolicyVersion.id == version_id, PolicyVersion.policy_id == policy_id
            )
            .first()
        )
        if not version or version.policy.organization_id != org_uuid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Version not found"
            )

        published_by_name = (
            version.published_by.full_name if version.published_by else None
        )
        reviewed_by_name = version.reviewed_by.full_name if version.reviewed_by else None

        return PolicyVersionRead(
            id=version.id,
            policy_id=version.policy_id,
            version_number=version.version_number,
            status=version.status,
            content=version.content,
            summary=version.summary,
            effective_date=version.effective_date,
            published_at=version.published_at,
            published_by_user_id=version.published_by_user_id,
            reviewed_by_user_id=version.reviewed_by_user_id,
            reviewed_at=version.reviewed_at,
            created_at=version.created_at,
            updated_at=version.updated_at,
            published_by_name=published_by_name,
            reviewed_by_name=reviewed_by_name,
        )

    def submit_for_review(
        self, user: User, policy_id: UUID, version_id: UUID, org_id: UUID | None = None
    ) -> PolicyVersionRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        version = (
            self.db.query(PolicyVersion)
            .filter(
                PolicyVersion.id == version_id, PolicyVersion.policy_id == policy_id
            )
            .first()
        )
        if not version or version.policy.organization_id != org_uuid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Version not found"
            )

        if version.status != PolicyVersionStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft versions can be submitted for review",
            )

        version.status = PolicyVersionStatus.review
        self._log_activity(
            org_id=org_uuid,
            policy_id=policy_id,
            action="Submitted for review",
            title=version.policy.title,
            version=f"v{version.version_number}.0",
            user_name=user.full_name or "System",
        )
        self.db.commit()
        return self.get_version(user, policy_id, version_id, org_uuid)

    def approve_version(
        self, user: User, policy_id: UUID, version_id: UUID, org_id: UUID | None = None
    ) -> PolicyVersionRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        version = (
            self.db.query(PolicyVersion)
            .filter(
                PolicyVersion.id == version_id, PolicyVersion.policy_id == policy_id
            )
            .first()
        )
        if not version or version.policy.organization_id != org_uuid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Version not found"
            )

        if version.status != PolicyVersionStatus.review:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only review versions can be approved",
            )

        version.status = PolicyVersionStatus.approved
        version.reviewed_by_user_id = user.id
        version.reviewed_at = datetime.now(timezone.utc)

        self._log_activity(
            org_id=org_uuid,
            policy_id=policy_id,
            action="Approved version",
            title=version.policy.title,
            version=f"v{version.version_number}.0",
            user_name=user.full_name or "System",
        )
        self.db.commit()
        return self.get_version(user, policy_id, version_id, org_uuid)

    def publish_version(
        self, user: User, policy_id: UUID, version_id: UUID, org_id: UUID | None = None
    ) -> PolicyVersionRead:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        policy = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.id == policy_id,
                PolicyDocument.organization_id == org_uuid,
            )
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
            )

        version = (
            self.db.query(PolicyVersion)
            .filter(
                PolicyVersion.id == version_id, PolicyVersion.policy_id == policy_id
            )
            .first()
        )
        if not version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Version not found"
            )

        if version.status not in (
            PolicyVersionStatus.approved,
            PolicyVersionStatus.draft,
            PolicyVersionStatus.review,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid version state for publishing",
            )

        # Archive current live version if exists
        if policy.current_live_version:
            policy.current_live_version.status = PolicyVersionStatus.archived

        # Publish the new one
        version.status = PolicyVersionStatus.live
        version.published_at = datetime.now(timezone.utc)
        version.published_by_user_id = user.id
        if not version.effective_date:
            version.effective_date = datetime.now(timezone.utc)

        policy.current_live_version_id = version.id

        self._log_activity(
            org_id=org_uuid,
            policy_id=policy.id,
            action="Published policy version",
            title=policy.title,
            version=f"v{version.version_number}.0",
            user_name=user.full_name or "System",
        )

        AuditContract.log_campaign_event(
            self.db,
            org_uuid,
            user.id,
            "policy.published",
            f"Policy '{policy.title}' version v{version.version_number}.0 published.",
        )

        # Auto-seed acknowledgement recipients for standard tracking
        self.seed_acknowledgement_recipients(
            user,
            policy.id,
            version.id,
            audience="All Employees" if policy.policy_type == PolicyType.employee else "All Users",
            org_id=org_uuid,
        )

        self.db.commit()
        return self.get_version(user, policy_id, version.id, org_uuid)

    def seed_acknowledgement_recipients(
        self,
        user: User,
        policy_id: UUID,
        version_id: UUID,
        audience: str,
        org_id: UUID | None = None,
    ) -> list[AcknowledgementRead]:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        # Fetch dynamic recipients via RecipientContract
        recipients = RecipientContract.get_recipients_by_segment(self.db, org_uuid, "all")

        result = []
        for r in recipients:
            # Check if acknowledgement record already exists
            existing = (
                self.db.query(PolicyAcknowledgement)
                .filter(
                    PolicyAcknowledgement.policy_id == policy_id,
                    PolicyAcknowledgement.policy_version_id == version_id,
                    PolicyAcknowledgement.recipient_id == r["id"],
                )
                .first()
            )
            if existing:
                continue

            ack = PolicyAcknowledgement(
                organization_id=org_uuid,
                policy_id=policy_id,
                policy_version_id=version_id,
                audience=audience,
                recipient_id=r["id"],
                recipient_name=r["name"],
                recipient_email=r["email"],
                status=AcknowledgementStatus.pending,
            )
            self.db.add(ack)
            result.append(ack)

        self.db.flush()
        return result

    def get_acknowledgement_summary(
        self, user: User, org_id: UUID | None = None
    ) -> list[AcknowledgementSummaryRead]:
        org_uuid = self._resolve_org_id(user, org_id)

        # Get list of live policies
        live_policies = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.organization_id == org_uuid,
                PolicyDocument.archived_at.is_(None),
                PolicyDocument.current_live_version_id.isnot(None),
            )
            .all()
        )

        result = []
        for policy in live_policies:
            v = policy.current_live_version
            if not v:
                continue

            acks = (
                self.db.query(PolicyAcknowledgement)
                .filter(
                    PolicyAcknowledgement.policy_id == policy.id,
                    PolicyAcknowledgement.policy_version_id == v.id,
                )
                .all()
            )

            if not acks:
                continue

            sent_count = sum(
                1
                for a in acks
                if a.status
                in (
                    AcknowledgementStatus.sent,
                    AcknowledgementStatus.acknowledged,
                    AcknowledgementStatus.overdue,
                )
            )
            ack_count = sum(
                1 for a in acks if a.status == AcknowledgementStatus.acknowledged
            )
            pending_count = sum(
                1 for a in acks if a.status == AcknowledgementStatus.pending
            )
            overdue_count = sum(
                1 for a in acks if a.status == AcknowledgementStatus.overdue
            )

            audience = acks[0].audience if acks else "All Users"

            result.append(
                AcknowledgementSummaryRead(
                    policy_id=policy.id,
                    policy_title=policy.title,
                    version=policy.version_label,
                    audience=audience,
                    sent=sent_count,
                    acknowledged=ack_count,
                    pending=pending_count,
                    overdue=overdue_count,
                )
            )

        return result

    def send_reminders(
        self,
        user: User,
        policy_id: UUID,
        version_id: UUID | None = None,
        channel: str = "email",
        org_id: UUID | None = None,
    ) -> dict:
        org_uuid = self._resolve_org_id(user, org_id)
        self._require_admin(user)

        policy = (
            self.db.query(PolicyDocument)
            .filter(
                PolicyDocument.id == policy_id,
                PolicyDocument.organization_id == org_uuid,
            )
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
            )

        v_id = version_id or policy.current_live_version_id
        if not v_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Policy has no live version to send reminders for",
            )

        version = self.db.query(PolicyVersion).get(v_id)
        if not version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Policy version not found"
            )

        # Get pending acknowledgements
        pending_acks = (
            self.db.query(PolicyAcknowledgement)
            .filter(
                PolicyAcknowledgement.policy_id == policy_id,
                PolicyAcknowledgement.policy_version_id == v_id,
                PolicyAcknowledgement.status != AcknowledgementStatus.acknowledged,
            )
            .all()
        )

        sent_count = 0
        for ack in pending_acks:
            # Wire with notice delivery infrastructure
            try:
                adapter = ProviderRegistry.get_adapter(channel, self.db, org_uuid)
            except Exception as e:
                # Fallback to mock adapter if not configured
                adapter = ProviderRegistry.get_adapter(channel)
                print(f"[Policy Reminder] Fallback to mock {channel} provider due to configuration error: {e}")
            recipient_details = {
                "id": ack.recipient_id,
                "email": ack.recipient_email,
                "phone": None,
                "address": None,
            }
            subject = f"Reminder: Review and Acknowledge {policy.title}"
            body = (
                f"Dear {ack.recipient_name},\n\n"
                f"This is a reminder to review and acknowledge our updated {policy.title} "
                f"({policy.version_label}).\n\n"
                f"Please log in to your dashboard to complete this process.\n\n"
                f"Best regards,\nCompliance Operations"
            )

            # Simulated dispatch through Pluggable Provider Adapter
            adapter.send_notice(recipient_details, subject, body)

            try:
                ack.reminder_count += 1
                ack.last_reminder_at = datetime.now(timezone.utc)
                if ack.reminder_count >= 3:
                    ack.status = AcknowledgementStatus.overdue
                else:
                    ack.status = AcknowledgementStatus.sent
                ack.sent_at = datetime.now(timezone.utc)
                sent_count += 1

            except Exception as e:
                print(f"[PolicyService Reminder Warning]: Failed to dispatch reminder: {e}")

        self._log_activity(
            org_id=org_uuid,
            policy_id=policy.id,
            action="Sent reminders",
            title=policy.title,
            version=policy.version_label,
            user_name=user.full_name or "System",
        )

        AuditContract.log_campaign_event(
            self.db,
            org_uuid,
            user.id,
            "policy.reminders_sent",
            f"Reminders sent for policy '{policy.title}' to {sent_count} recipients.",
        )

        self.db.commit()

        return {
            "policy_title": policy.title,
            "version": policy.version_label,
            "sent_count": sent_count,
        }

    def list_activities(
        self, user: User, org_id: UUID | None = None
    ) -> list[PolicyActivityRead]:
        org_uuid = self._resolve_org_id(user, org_id)
        activities = (
            self.db.query(PolicyActivity)
            .filter(PolicyActivity.organization_id == org_uuid)
            .order_by(PolicyActivity.created_at.desc())
            .limit(50)
            .all()
        )
        return [
            PolicyActivityRead(
                id=a.id,
                action=a.action,
                policy_title=a.policy_title,
                policy_version=a.policy_version,
                user_name=a.user_name,
                created_at=a.created_at,
            )
            for a in activities
        ]

    def get_stats(
        self, user: User, org_id: UUID | None = None, business_unit_id: UUID | None = None
    ) -> PolicyStatsRead:
        org_uuid = self._resolve_org_id(user, org_id)

        policy_q = self.db.query(PolicyDocument).filter(
            PolicyDocument.organization_id == org_uuid,
            PolicyDocument.archived_at.is_(None),
            PolicyDocument.current_live_version_id.isnot(None),
        )
        if business_unit_id:
            policy_q = policy_q.filter(PolicyDocument.business_unit_id == business_unit_id)

        # Count active policies
        active_count = policy_q.count()

        # Count total versions
        total_versions = (
            self.db.query(func.count(PolicyVersion.id))
            .join(PolicyDocument, PolicyVersion.policy_id == PolicyDocument.id)
            .filter(PolicyDocument.organization_id == org_uuid)
            .scalar()
            or 0
        )

        # Count pending acknowledgements
        pending_acks = (
            self.db.query(func.count(PolicyAcknowledgement.id))
            .filter(
                PolicyAcknowledgement.organization_id == org_uuid,
                PolicyAcknowledgement.status != AcknowledgementStatus.acknowledged,
            )
            .scalar()
            or 0
        )

        # Count auto-published this year
        this_year = datetime.now(timezone.utc).year
        auto_published = (
            self.db.query(func.count(PolicyVersion.id))
            .join(PolicyDocument, PolicyVersion.policy_id == PolicyDocument.id)
            .filter(
                PolicyDocument.organization_id == org_uuid,
                PolicyVersion.status == PolicyVersionStatus.live,
                func.extract("year", PolicyVersion.published_at) == this_year,
            )
            .scalar()
            or 0
        )

        return PolicyStatsRead(
            active_count=active_count,
            total_versions=total_versions,
            pending_acknowledgements=pending_acks,
            auto_published_this_year=auto_published,
        )

    def _auto_seed(self, user: User, org_id: UUID):
        # Default policies for seeding
        templates = [
            {
                "title": "Privacy Policy",
                "type": PolicyType.privacy,
                "status": PolicyVersionStatus.live,
                "content": "# Privacy Policy\n\nThis Privacy Policy describes how we collect, use, and disclose your personal data under the Digital Personal Data Protection Act (DPDPA).\n\n### 1. Data Collection\nWe only collect data necessary to provide services.\n\n### 2. User Rights\nYou have the right to access, correct, and erase your personal data.",
                "summary": "Initial launch of DPDPA-compliant Privacy Policy.",
            },
            {
                "title": "Cookie and Consent Policy",
                "type": PolicyType.cookie,
                "status": PolicyVersionStatus.live,
                "content": "# Cookie Policy\n\nThis Cookie Policy explains how cookies and trackers are utilized on our platform to enhance performance and analyze user flows under explicit consent mechanisms.",
                "summary": "Initial release detailing standard tracker consents.",
            },
            {
                "title": "Children's Privacy Notice",
                "type": PolicyType.children,
                "status": PolicyVersionStatus.live,
                "content": "# Children's Privacy Notice\n\nIn compliance with DPDPA requirements for processing children's data, we obtain verifiable parental consent and do not process data in harmful ways.",
                "summary": "Mandatory compliance document for children's data.",
            },
            {
                "title": "Employee Data Protection Policy",
                "type": PolicyType.employee,
                "status": PolicyVersionStatus.live,
                "content": "# Employee Data Protection Policy\n\nThis notice details processing activities for employment records, payroll, benefits administration, and internal compliance rules.",
                "summary": "Employee-facing data privacy obligations.",
            },
            {
                "title": "Vendor Data Processing Agreement",
                "type": PolicyType.vendor,
                "status": PolicyVersionStatus.approved,
                "content": "# Vendor DPA Agreement\n\nThis standard agreement outlines data protection obligations required of third-party vendors and processors handling personal data on our behalf.",
                "summary": "Standard vendor compliance template.",
            },
            {
                "title": "Acceptable Use Policy",
                "type": PolicyType.aup,
                "status": PolicyVersionStatus.draft,
                "content": "# Acceptable Use Policy\n\nGuidelines for acceptable use of company assets, information security protocols, and data handling classification rules.",
                "summary": "Draft policy under internal revision.",
            },
            {
                "title": "Data Retention & Erasure Schedule",
                "type": PolicyType.retention,
                "status": PolicyVersionStatus.live,
                "content": "# Data Retention & Erasure Schedule\n\nThis document sets forth retention and erasure schedules for all categories of personal data, in compliance with DPDPA Section 8.",
                "summary": "DPDPA retention schedules.",
            },
            {
                "title": "Incident Response Plan",
                "type": PolicyType.incident,
                "status": PolicyVersionStatus.review,
                "content": "# Data Breach Incident Response Plan\n\nProcedures for identifying, isolating, and reporting personal data breaches to the Data Protection Board of India and affected data principals.",
                "summary": "DPO draft under DPO review.",
            },
        ]

        for temp in templates:
            policy = PolicyDocument(
                organization_id=org_id,
                title=temp["title"],
                policy_type=temp["type"],
            )
            self.db.add(policy)
            self.db.flush()

            version = PolicyVersion(
                policy_id=policy.id,
                version_number=1,
                status=temp["status"],
                content=temp["content"],
                summary=temp["summary"],
                effective_date=datetime.now(timezone.utc),
            )
            self.db.add(version)
            self.db.flush()

            if temp["status"] == PolicyVersionStatus.live:
                version.published_at = datetime.now(timezone.utc)
                version.published_by_user_id = user.id
                policy.current_live_version_id = version.id
            elif temp["status"] == PolicyVersionStatus.approved:
                version.reviewed_at = datetime.now(timezone.utc)
                version.reviewed_by_user_id = user.id

            self._log_activity(
                org_id=org_id,
                policy_id=policy.id,
                action="Created policy (Auto-seed)",
                title=policy.title,
                version="v1.0",
                user_name="System",
            )

            # If it's a live policy, seed acknowledgement records
            if temp["status"] == PolicyVersionStatus.live:
                # Seed some sample recipient logs
                recipients = [
                    {"id": "rec-1", "name": "Amit Sharma", "email": "amit.sharma@example.com", "status": AcknowledgementStatus.acknowledged, "ack_offset_days": 3},
                    {"id": "rec-2", "name": "Priya Patel", "email": "priya.patel@example.com", "status": AcknowledgementStatus.pending, "ack_offset_days": None},
                    {"id": "rec-3", "name": "Rohan Das", "email": "rohan.das@example.com", "status": AcknowledgementStatus.sent, "ack_offset_days": None},
                    {"id": "rec-4", "name": "Sunita Reddy", "email": "sunita.reddy@example.com", "status": AcknowledgementStatus.overdue, "ack_offset_days": None},
                ]
                for r in recipients:
                    ack = PolicyAcknowledgement(
                        organization_id=org_id,
                        policy_id=policy.id,
                        policy_version_id=version.id,
                        audience="All Employees" if temp["type"] == PolicyType.employee else "All Users",
                        recipient_id=r["id"],
                        recipient_name=r["name"],
                        recipient_email=r["email"],
                        status=r["status"],
                        sent_at=datetime.now(timezone.utc) if r["status"] in (AcknowledgementStatus.sent, AcknowledgementStatus.acknowledged) else None,
                        acknowledged_at=datetime.now(timezone.utc) if r["status"] == AcknowledgementStatus.acknowledged else None,
                        reminder_count=3 if r["status"] == AcknowledgementStatus.overdue else (1 if r["status"] == AcknowledgementStatus.sent else 0),
                        last_reminder_at=datetime.now(timezone.utc) if r["status"] in (AcknowledgementStatus.sent, AcknowledgementStatus.overdue) else None,
                    )
                    self.db.add(ack)

        self.db.commit()
