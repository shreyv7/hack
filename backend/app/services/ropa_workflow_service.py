import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ropa import (
    ProcessingActivity,
    ActivityVersion,
    ActivityApproval,
    ActivityEvent,
    ActivityOwner,
)
from app.models.user import User
from app.services.audit_log_service import AuditLogService
from app.models.compliance import AuditEventType, AuditSeverity


class RopaWorkflowService:
    @staticmethod
    def record_event(
        db: Session,
        activity_id: UUID,
        event_type: str,
        actor_id: UUID | None,
        details: dict | None = None,
        previous_state: dict | None = None,
        new_state: dict | None = None,
        ip_address: str | None = None,
    ) -> ActivityEvent:
        # Get last event for chain-hashing
        last_event = (
            db.query(ActivityEvent)
            .filter(ActivityEvent.activity_id == activity_id)
            .order_by(ActivityEvent.created_at.desc())
            .first()
        )
        prev_hash = last_event.chain_hash if last_event else "0" * 64

        raw_payload = f"{prev_hash}|{event_type}|{actor_id}|{json.dumps(details)}|{json.dumps(previous_state)}|{json.dumps(new_state)}"
        current_hash = hashlib.sha256(raw_payload.encode()).hexdigest()

        ev = ActivityEvent(
            activity_id=activity_id,
            event_type=event_type,
            actor_user_id=actor_id,
            details=details,
            previous_state=previous_state,
            new_state=new_state,
            ip_address=ip_address,
            chain_hash=current_hash
        )
        db.add(ev)
        db.flush()

        # Propagate to global immutable audit log
        activity = db.get(ProcessingActivity, activity_id)
        if activity:
            actor_user = db.get(User, actor_id) if actor_id else None
            # Map event_type to global AuditLog categories
            action_desc = f"RoPA Event: {event_type} on activity {activity.activity_ref}"
            details_str = f"Details: {json.dumps(details or {})}"
            
            # Map event types to severity
            sev = AuditSeverity.info
            if "rejected" in event_type or "risk_changed" in event_type:
                sev = AuditSeverity.warning

            AuditLogService(db).record_event(
                org_id=activity.organization_id,
                user=actor_user,
                action=action_desc,
                details=details_str,
                event_type=AuditEventType.configuration,
                severity=sev,
                resource_type="processing_activity",
                resource_id=str(activity_id)
            )

        return ev

    def submit_for_review(self, db: Session, activity_id: UUID, actor: User) -> list[ActivityApproval]:
        activity = db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        if activity.status not in ("draft", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot submit activity for review in status {activity.status}"
            )

        # Set status
        activity.status = "pending_review"

        # Mark current version as submitted
        if activity.current_version_id:
            version = db.get(ActivityVersion, activity.current_version_id)
            if version:
                version.status = "submitted"

        # Clean existing approvals for this version
        db.query(ActivityApproval).filter(
            ActivityApproval.activity_id == activity_id,
            ActivityApproval.version_id == activity.current_version_id
        ).delete()

        # Build approval chain
        # 1. Business Owner (checks if assigned)
        # 2. Privacy Officer
        approvals = []
        
        # Check if there is a business owner assigned
        has_biz_owner = db.query(ActivityOwner).filter(
            ActivityOwner.activity_id == activity_id,
            ActivityOwner.owner_role == "business_owner"
        ).first()

        roles = []
        if has_biz_owner:
            roles.append("business_owner")
        roles.append("privacy_officer")

        for r in roles:
            app = ActivityApproval(
                activity_id=activity_id,
                version_id=activity.current_version_id,
                role_required=r,
                status="pending"
            )
            db.add(app)
            approvals.append(app)

        self.record_event(
            db=db,
            activity_id=activity_id,
            event_type="activity.submitted",
            actor_id=actor.id,
            details={"version_id": str(activity.current_version_id)}
        )

        from app.models.user import UserRole
        from app.services.notification_service import (
            NotificationCategory,
            NotificationSeverity,
            notify_users_by_roles,
        )

        notify_users_by_roles(
            db,
            activity.organization_id,
            [UserRole.compliance_officer, UserRole.data_steward],
            title="RoPA activity pending review",
            message=f"Processing activity \"{activity.title}\" has been submitted for approval.",
            category=NotificationCategory.ropa,
            action_url="/data/ropa",
            severity=NotificationSeverity.warning,
            exclude_user_id=actor.id,
        )

        db.commit()
        return approvals

    def process_decision(
        self,
        db: Session,
        approval_id: UUID,
        status_decision: str,  # approved | rejected
        comments: str | None,
        actor: User
    ) -> ActivityApproval:
        app = db.query(ActivityApproval).filter(ActivityApproval.id == approval_id).first()
        if not app:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")

        if app.status != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Approval request has already been processed")

        activity = db.get(ProcessingActivity, app.activity_id)
        version = db.get(ActivityVersion, app.version_id) if app.version_id else None

        app.approver_id = actor.id
        app.comments = comments
        app.decided_at = datetime.now(timezone.utc)

        if status_decision == "approved":
            app.status = "approved"
            self.record_event(
                db=db,
                activity_id=app.activity_id,
                event_type="activity.approved",
                actor_id=actor.id,
                details={"role_required": app.role_required, "comments": comments}
            )

            # Check if all approvals in this version chain are approved
            all_apps = db.query(ActivityApproval).filter(ActivityApproval.version_id == app.version_id).all()
            all_done = all(a.status == "approved" for a in all_apps)

            if all_done:
                # Promote status to approved
                activity.status = "approved"
                if version:
                    version.status = "approved"
                    version.approved_at = datetime.now(timezone.utc)

                self.record_event(
                    db=db,
                    activity_id=app.activity_id,
                    event_type="activity.workflow_completed",
                    actor_id=None,
                    details={"approved_version": version.version_number if version else None}
                )

        elif status_decision == "rejected":
            app.status = "rejected"
            activity.status = "draft"
            if version:
                version.status = "draft"

            self.record_event(
                db=db,
                activity_id=app.activity_id,
                event_type="activity.rejected",
                actor_id=actor.id,
                details={"role_required": app.role_required, "comments": comments}
            )

        db.commit()
        return app

    def publish_activity(self, db: Session, activity_id: UUID, actor: User) -> ProcessingActivity:
        activity = db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        if activity.status != "approved":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only publish approved activities")

        # Supersede old versions
        if activity.current_version_id:
            old_version = db.get(ActivityVersion, activity.current_version_id)
            # Find any other approved/superseded versions and ensure they are marked as superseded
            db.query(ActivityVersion).filter(
                ActivityVersion.activity_id == activity_id,
                ActivityVersion.id != activity.current_version_id
            ).update({"status": "superseded"})

        activity.status = "published"

        self.record_event(
            db=db,
            activity_id=activity_id,
            event_type="activity.published",
            actor_id=actor.id,
            details={"version_id": str(activity.current_version_id)}
        )
        db.commit()
        return activity

    def deprecate_activity(self, db: Session, activity_id: UUID, actor: User) -> ProcessingActivity:
        activity = db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        activity.status = "deprecated"

        self.record_event(
            db=db,
            activity_id=activity_id,
            event_type="activity.deprecated",
            actor_id=actor.id
        )
        db.commit()
        return activity

    def archive_activity(self, db: Session, activity_id: UUID, actor: User) -> ProcessingActivity:
        activity = db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        activity.status = "archived"

        self.record_event(
            db=db,
            activity_id=activity_id,
            event_type="activity.archived",
            actor_id=actor.id
        )
        db.commit()
        return activity

    def restore_activity(self, db: Session, activity_id: UUID, actor: User) -> ProcessingActivity:
        activity = db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        activity.status = "draft"

        self.record_event(
            db=db,
            activity_id=activity_id,
            event_type="activity.restored",
            actor_id=actor.id
        )
        db.commit()
        return activity
