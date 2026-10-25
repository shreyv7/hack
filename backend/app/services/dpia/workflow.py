from datetime import datetime, date, timedelta
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.dpia import (
    Dpia, DpiaVersion, DpiaApproval, DpiaReviewCycle, DpiaStatus, DpiaVersionStatus,
    DpiaApprovalStatus, DpiaReviewCycleStatus
)
from app.schemas.dpia import DpiaApprovalDecision
from app.services.dpia.governance import DpiaGovernanceService


class DpiaWorkflowService:
    def submit_for_approval(self, db: Session, version_id: UUID, actor_id: UUID | None) -> list[DpiaApproval]:
        version = db.query(DpiaVersion).filter(DpiaVersion.id == version_id).first()
        if not version:
            raise ValueError("DPIA Version not found")

        dpia = db.query(Dpia).filter(Dpia.id == version.dpia_id).first()
        if not dpia:
            raise ValueError("DPIA not found")

        # Set status
        dpia.status = DpiaStatus.under_review.value
        version.status = DpiaVersionStatus.submitted.value

        # Clean existing approvals for this version
        db.query(DpiaApproval).filter(DpiaApproval.version_id == version_id).delete()

        # Build configurable approval chain
        # Default chain: business_owner -> security_lead -> legal_counsel -> dpo
        roles = ["business_owner", "security_lead", "legal_counsel", "dpo"]
        approvals = []
        
        for r in roles:
            app = DpiaApproval(
                version_id=version_id,
                role_required=r,
                status=DpiaApprovalStatus.pending.value
            )
            db.add(app)
            approvals.append(app)

        DpiaGovernanceService.record_event(
            db=db,
            dpia_id=dpia.id,
            event_type="workflow.submitted",
            actor_id=actor_id,
            details={"version_id": str(version_id), "version_number": version.version_number}
        )

        db.commit()
        return approvals

    def process_decision(
        self,
        db: Session,
        approval_id: UUID,
        payload: DpiaApprovalDecision,
        actor_id: UUID
    ) -> DpiaApproval:
        app = db.query(DpiaApproval).filter(DpiaApproval.id == approval_id).first()
        if not app:
            raise ValueError("Approval item not found")

        version = db.query(DpiaVersion).filter(DpiaVersion.id == app.version_id).first()
        dpia = db.query(Dpia).filter(Dpia.id == version.dpia_id).first()

        app.approver_user_id = actor_id
        app.comments = payload.comments
        app.decided_at = datetime.now()

        if payload.status == "approved":
            app.status = DpiaApprovalStatus.approved.value
            DpiaGovernanceService.record_event(
                db=db,
                dpia_id=dpia.id,
                event_type="workflow.approved",
                actor_id=actor_id,
                details={"role_required": app.role_required, "comments": payload.comments}
            )

            # Check if all approvals in this version chain are approved
            all_apps = db.query(DpiaApproval).filter(DpiaApproval.version_id == version.id).all()
            all_done = all(a.status == DpiaApprovalStatus.approved.value for a in all_apps)

            if all_done:
                # Promote status to approved
                dpia.status = DpiaStatus.approved.value
                version.status = DpiaVersionStatus.approved.value
                version.approved_at = datetime.now()

                # Schedule DPDPA Rule 13: 12-month re-assessment
                db.query(DpiaReviewCycle).filter(
                    DpiaReviewCycle.dpia_id == dpia.id,
                    DpiaReviewCycle.status == DpiaReviewCycleStatus.scheduled.value
                ).update({"status": "completed"})

                next_review = DpiaReviewCycle(
                    dpia_id=dpia.id,
                    scheduled_date=date.today() + timedelta(days=365),
                    status=DpiaReviewCycleStatus.scheduled.value
                )
                db.add(next_review)

                DpiaGovernanceService.record_event(
                    db=db,
                    dpia_id=dpia.id,
                    event_type="workflow.completed",
                    actor_id=None,
                    details={"approved_version": version.version_number}
                )

        elif payload.status == "rejected":
            app.status = DpiaApprovalStatus.rejected.value
            dpia.status = DpiaStatus.rejected.value
            version.status = DpiaVersionStatus.draft.value

            DpiaGovernanceService.record_event(
                db=db,
                dpia_id=dpia.id,
                event_type="workflow.rejected",
                actor_id=actor_id,
                details={"role_required": app.role_required, "comments": payload.comments}
            )

        db.commit()
        return app

    def list_approvals(self, db: Session, version_id: UUID) -> list[DpiaApproval]:
        return db.query(DpiaApproval).filter(DpiaApproval.version_id == version_id).all()

    def run_review_cycle_check(self, db: Session) -> int:
        """Triggered periodically to transition overdue scheduled audits."""
        today = date.today()
        cycles = (
            db.query(DpiaReviewCycle)
            .filter(
                DpiaReviewCycle.scheduled_date <= today,
                DpiaReviewCycle.status == DpiaReviewCycleStatus.scheduled.value
            )
            .all()
        )

        triggered_count = 0
        for cycle in cycles:
            cycle.status = DpiaReviewCycleStatus.overdue.value
            cycle.triggered_at = datetime.now()
            
            dpia = db.query(Dpia).filter(Dpia.id == cycle.dpia_id).first()
            if dpia:
                dpia.status = DpiaStatus.periodic_review.value
                DpiaGovernanceService.record_event(
                    db=db,
                    dpia_id=dpia.id,
                    event_type="review.due",
                    actor_id=None,
                    details={"cycle_id": str(cycle.id), "scheduled_date": cycle.scheduled_date.isoformat()}
                )
                triggered_count += 1

        db.commit()
        return triggered_count
