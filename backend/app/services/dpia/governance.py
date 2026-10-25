import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.dpia import (
    Dpia, DpiaVersion, DpiaStep, DpiaStepAnswer, DpiaEvent, DpiaComment,
    DpiaDataflow, DpiaAsset, DpiaTemplate, DpiaStatus, DpiaVersionStatus,
    DpiaStepStatus
)
from app.schemas.dpia import DpiaCreate, DpiaUpdate, DpiaStepAnswerCreate


class DpiaGovernanceService:
    @staticmethod
    def generate_ref(db: Session) -> str:
        current_year = datetime.now().year
        count = db.query(Dpia).filter(Dpia.dpia_ref.like(f"DPIA-{current_year}-%")).count()
        return f"DPIA-{current_year}-{str(count + 1).zfill(5)}"

    @staticmethod
    def record_event(
        db: Session,
        dpia_id: UUID,
        event_type: str,
        actor_id: UUID | None,
        details: dict | None = None,
        previous_state: dict | None = None,
        new_state: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None
    ) -> DpiaEvent:
        last_event = (
            db.query(DpiaEvent)
            .filter(DpiaEvent.dpia_id == dpia_id)
            .order_by(DpiaEvent.created_at.desc())
            .first()
        )
        prev_hash = last_event.chain_hash if last_event else "0" * 64

        raw_payload = f"{prev_hash}|{event_type}|{actor_id}|{json.dumps(details)}|{json.dumps(previous_state)}|{json.dumps(new_state)}"
        current_hash = hashlib.sha256(raw_payload.encode()).hexdigest()

        ev = DpiaEvent(
            dpia_id=dpia_id,
            event_type=event_type,
            actor_user_id=actor_id,
            details=details,
            previous_state=previous_state,
            new_state=new_state,
            ip_address=ip_address,
            user_agent=user_agent,
            chain_hash=current_hash
        )
        db.add(ev)
        db.flush()

        dpia = db.get(Dpia, dpia_id)
        if dpia:
            from app.models.compliance import AuditEventType, AuditSeverity
            from app.models.user import User
            from app.services.audit_log_service import AuditLogService

            actor_user = db.get(User, actor_id) if actor_id else None
            sev = AuditSeverity.warning if "reject" in event_type else AuditSeverity.info
            AuditLogService(db).record_event(
                dpia.organization_id,
                user=actor_user,
                action=f"DPIA event: {event_type} on {dpia.dpia_ref}",
                details=f"Details: {json.dumps(details or {})}",
                event_type=AuditEventType.configuration,
                severity=sev,
                resource_type="dpia",
                resource_id=str(dpia_id),
            )

        return ev

    def create_dpia(
        self,
        db: Session,
        org_id: UUID,
        payload: DpiaCreate,
        actor_id: UUID | None
    ) -> Dpia:
        ref = self.generate_ref(db)
        
        # 1. Create Core DPIA
        dpia = Dpia(
            organization_id=org_id,
            business_unit_id=payload.business_unit_id,
            dpia_ref=ref,
            title=payload.title,
            description=payload.description,
            status=DpiaStatus.draft.value
        )
        db.add(dpia)
        db.flush()

        # 2. Create version 1
        version = DpiaVersion(
            dpia_id=dpia.id,
            version_number=1,
            status=DpiaVersionStatus.draft.value,
            changelog="Initial creation",
            created_by_user_id=actor_id
        )
        db.add(version)
        db.flush()

        dpia.current_version_id = version.id

        # 3. Create dynamic step templates (7 default steps)
        steps_configs = [
            ("project", 1, "Project Description"),
            ("processing", 2, "Processing Description"),
            ("necessity", 3, "Necessity & Proportionality"),
            ("risks", 4, "Risk Identification"),
            ("mitigations", 5, "Mitigation Plan"),
            ("approvals", 6, "Stakeholder Consultation"),
            ("review", 7, "DPO Sign-off & Submission")
        ]

        for step_key, order, name in steps_configs:
            step = DpiaStep(
                dpia_id=dpia.id,
                step_key=step_key,
                step_order=order,
                completion_percentage=0,
                status=DpiaStepStatus.not_started.value
            )
            db.add(step)

        # 4. Record Event
        self.record_event(
            db=db,
            dpia_id=dpia.id,
            event_type="dpia.created",
            actor_id=actor_id,
            details={"ref": ref, "title": payload.title, "template": payload.template_key}
        )

        db.commit()
        return dpia

    def update_dpia(
        self,
        db: Session,
        dpia_id: UUID,
        payload: DpiaUpdate,
        actor_id: UUID | None
    ) -> Dpia:
        dpia = db.query(Dpia).filter(Dpia.id == dpia_id).first()
        if not dpia:
            raise ValueError("DPIA not found")

        old_state = {"title": dpia.title, "description": dpia.description, "status": dpia.status}
        new_state = {}

        if payload.title is not None:
            dpia.title = payload.title
            new_state["title"] = payload.title
        if payload.description is not None:
            dpia.description = payload.description
            new_state["description"] = payload.description
        if payload.status is not None:
            dpia.status = payload.status
            new_state["status"] = payload.status

        self.record_event(
            db=db,
            dpia_id=dpia.id,
            event_type="dpia.updated",
            actor_id=actor_id,
            previous_state=old_state,
            new_state=new_state
        )
        db.commit()
        return dpia

    def checkout_new_version(
        self,
        db: Session,
        dpia_id: UUID,
        changelog: str,
        actor_id: UUID | None
    ) -> DpiaVersion:
        dpia = db.query(Dpia).filter(Dpia.id == dpia_id).first()
        if not dpia:
            raise ValueError("DPIA not found")

        current_ver = db.query(DpiaVersion).filter(DpiaVersion.id == dpia.current_version_id).first()
        if not current_ver:
            raise ValueError("Current version not found")

        new_version_num = current_ver.version_number + 1

        # Create new version
        new_ver = DpiaVersion(
            dpia_id=dpia.id,
            version_number=new_version_num,
            status=DpiaVersionStatus.draft.value,
            changelog=changelog,
            created_by_user_id=actor_id
        )
        db.add(new_ver)
        db.flush()

        # Copy Answers
        for ans in current_ver.step_answers:
            new_ans = DpiaStepAnswer(
                version_id=new_ver.id,
                step_key=ans.step_key,
                question_key=ans.question_key,
                answer_text=ans.answer_text,
                answer_json=ans.answer_json,
                compliance_status=ans.compliance_status
            )
            db.add(new_ans)

        # Copy Risks & their Mitigations
        from app.models.dpia import DpiaRisk, DpiaControl, DpiaTask
        for risk in current_ver.risks:
            new_risk = DpiaRisk(
                version_id=new_ver.id,
                title=risk.title,
                description=risk.description,
                category=risk.category,
                likelihood=risk.likelihood,
                impact=risk.impact,
                sensitivity_factor=risk.sensitivity_factor,
                inherent_score=risk.inherent_score,
                residual_likelihood=risk.residual_likelihood,
                residual_impact=risk.residual_impact,
                residual_score=risk.residual_score,
                status=risk.status,
                is_auto_escalated=risk.is_auto_escalated
            )
            db.add(new_risk)
            db.flush()

            # Copy Controls linked to this risk
            for ctrl in risk.controls:
                new_ctrl = DpiaControl(
                    risk_id=new_risk.id,
                    control_library_id=ctrl.control_library_id,
                    status=ctrl.status,
                    owner_user_id=ctrl.owner_user_id,
                    custom_instructions=ctrl.custom_instructions
                )
                db.add(new_ctrl)

        # Update dpia mapping
        dpia.current_version_id = new_ver.id
        dpia.status = DpiaStatus.draft.value

        self.record_event(
            db=db,
            dpia_id=dpia.id,
            event_type="dpia.version_created",
            actor_id=actor_id,
            details={"version_number": new_version_num, "changelog": changelog}
        )

        db.commit()
        return new_ver

    def save_step_answer(
        self,
        db: Session,
        version_id: UUID,
        payload: DpiaStepAnswerCreate,
        actor_id: UUID | None
    ) -> DpiaStepAnswer:
        version = db.query(DpiaVersion).filter(DpiaVersion.id == version_id).first()
        if not version:
            raise ValueError("DPIA Version not found")

        # Find or create answer
        ans = (
            db.query(DpiaStepAnswer)
            .filter(
                DpiaStepAnswer.version_id == version_id,
                DpiaStepAnswer.step_key == payload.step_key,
                DpiaStepAnswer.question_key == payload.question_key
            )
            .first()
        )

        prev_val = ans.answer_text if ans else None

        if not ans:
            ans = DpiaStepAnswer(
                version_id=version_id,
                step_key=payload.step_key,
                question_key=payload.question_key
            )
            db.add(ans)

        ans.answer_text = payload.answer_text
        ans.answer_json = payload.answer_json
        db.flush()

        # Recalculate step completion percentage
        step = (
            db.query(DpiaStep)
            .filter(
                DpiaStep.dpia_id == version.dpia_id,
                DpiaStep.step_key == payload.step_key
            )
            .first()
        )
        if step:
            # Let's count answers inside this step
            ans_count = (
                db.query(DpiaStepAnswer)
                .filter(
                    DpiaStepAnswer.version_id == version_id,
                    DpiaStepAnswer.step_key == payload.step_key
                )
                .count()
            )
            # Standardize step questions count or use dynamic heuristic
            total_q_estimate = 5.0
            completion = min(100, int((ans_count / total_q_estimate) * 100))
            step.completion_percentage = completion
            step.status = DpiaStepStatus.in_progress.value if completion < 100 else DpiaStepStatus.completed.value

        self.record_event(
            db=db,
            dpia_id=version.dpia_id,
            event_type="dpia.step_answer_saved",
            actor_id=actor_id,
            details={
                "step_key": payload.step_key,
                "question_key": payload.question_key,
                "previous_val": prev_val,
                "new_val": payload.answer_text
            }
        )

        db.commit()
        return ans

    def update_dataflow(self, db: Session, dpia_id: UUID, flow_data: dict) -> DpiaDataflow:
        df = db.query(DpiaDataflow).filter(DpiaDataflow.dpia_id == dpia_id).first()
        if not df:
            df = DpiaDataflow(dpia_id=dpia_id)
            db.add(df)
        
        df.flow_data = flow_data
        db.commit()
        return df

    def get_dataflow(self, db: Session, dpia_id: UUID) -> DpiaDataflow | None:
        return db.query(DpiaDataflow).filter(DpiaDataflow.dpia_id == dpia_id).first()

    def add_asset(self, db: Session, dpia_id: UUID, asset_type: str, asset_id: UUID) -> DpiaAsset:
        asset = DpiaAsset(
            dpia_id=dpia_id,
            asset_type=asset_type,
            asset_id=asset_id
        )
        db.add(asset)
        db.commit()
        return asset

    def remove_asset(self, db: Session, dpia_id: UUID, asset_id: UUID) -> bool:
        asset = db.query(DpiaAsset).filter(
            DpiaAsset.dpia_id == dpia_id,
            DpiaAsset.asset_id == asset_id
        ).first()
        if asset:
            db.delete(asset)
            db.commit()
            return True
        return False

    def list_assets(self, db: Session, dpia_id: UUID) -> list[DpiaAsset]:
        return db.query(DpiaAsset).filter(DpiaAsset.dpia_id == dpia_id).all()

    def add_comment(
        self,
        db: Session,
        dpia_id: UUID,
        parent_comment_id: UUID | None,
        step_key: str | None,
        content: str,
        actor_id: UUID
    ) -> DpiaComment:
        comment = DpiaComment(
            dpia_id=dpia_id,
            parent_comment_id=parent_comment_id,
            user_id=actor_id,
            step_key=step_key,
            content=content
        )
        db.add(comment)
        db.commit()
        return comment

    def list_comments(self, db: Session, dpia_id: UUID) -> list[DpiaComment]:
        return (
            db.query(DpiaComment)
            .filter(DpiaComment.dpia_id == dpia_id, DpiaComment.parent_comment_id == None)
            .order_by(DpiaComment.created_at.asc())
            .all()
        )
