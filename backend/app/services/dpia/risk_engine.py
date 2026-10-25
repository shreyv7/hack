from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.dpia import (
    DpiaRisk, DpiaControl, DpiaControlLibrary, DpiaVersion, DpiaStepAnswer,
    DpiaRiskStatus, DpiaControlStatus
)
from app.schemas.dpia import DpiaRiskCreate, DpiaRiskUpdate, DpiaControlCreate, DpiaControlUpdate


class DpiaRiskEngine:
    def calculate_sensitivity_factor(self, db: Session, version_id: UUID) -> float:
        # Fetch processing step answers
        answers = (
            db.query(DpiaStepAnswer)
            .filter(
                DpiaStepAnswer.version_id == version_id,
                DpiaStepAnswer.step_key == "processing"
            )
            .all()
        )

        weights = 0.00
        for ans in answers:
            q_key = ans.question_key
            text = (ans.answer_text or "").strip().lower()

            if q_key == "child_data" and text in ("yes", "true"):
                weights += 0.60
            elif q_key == "cross_border" and text in ("yes", "true"):
                weights += 0.40
            elif q_key == "ai_profiling" and text in ("yes", "true"):
                weights += 0.50
            elif q_key == "volume" and text in ("1m+", "100k-1m"):
                weights += 0.30
            elif q_key == "retention" and text in ("indefinite", "long_term"):
                weights += 0.30
            elif q_key == "sensitive_type" and ("health" in text or "biometric" in text or "financial" in text):
                weights += 0.60
            elif q_key == "third_party_sharing" and text in ("yes", "true"):
                weights += 0.30

        factor = 1.00 + weights
        return float(min(Decimal("3.00"), Decimal(str(factor))))

    def calculate_risk_scores(self, db: Session, risk_id: UUID) -> dict:
        risk = db.query(DpiaRisk).filter(DpiaRisk.id == risk_id).first()
        if not risk:
            raise ValueError("Risk not found")

        # 1. Inherent Risk
        sensitivity = self.calculate_sensitivity_factor(db, risk.version_id)
        risk.sensitivity_factor = Decimal(str(sensitivity))
        risk.inherent_score = Decimal(str(risk.likelihood * risk.impact * sensitivity))

        # 2. Residual Risk
        controls = db.query(DpiaControl).filter(DpiaControl.risk_id == risk_id).all()
        total_discount = Decimal("0.00")
        
        for ctrl in controls:
            lib = db.query(DpiaControlLibrary).filter(DpiaControlLibrary.id == ctrl.control_library_id).first()
            if not lib:
                continue
            
            weight = Decimal(str(lib.mitigation_weight))
            if ctrl.status == DpiaControlStatus.active.value:
                total_discount += weight
            elif ctrl.status == DpiaControlStatus.implementing.value:
                total_discount += (weight * Decimal("0.10"))
        
        capped_discount = min(Decimal("0.85"), total_discount)
        residual_multiplier = Decimal("1.00") - capped_discount

        risk.residual_score = risk.inherent_score * residual_multiplier
        
        # Scale remaining scores
        risk.residual_likelihood = max(1, round(float(risk.likelihood) * float(residual_multiplier)))
        risk.residual_impact = max(1, round(float(risk.impact) * float(residual_multiplier)))

        db.flush()
        return {
            "inherent_score": float(risk.inherent_score),
            "residual_score": float(risk.residual_score),
            "residual_likelihood": risk.residual_likelihood,
            "residual_impact": risk.residual_impact
        }

    def sync_version_risks(self, db: Session, version_id: UUID) -> None:
        risks = db.query(DpiaRisk).filter(DpiaRisk.version_id == version_id).all()
        for r in risks:
            self.calculate_risk_scores(db, r.id)
        db.commit()

    def add_risk(self, db: Session, version_id: UUID, payload: DpiaRiskCreate) -> DpiaRisk:
        sensitivity = self.calculate_sensitivity_factor(db, version_id)
        inherent = float(payload.likelihood * payload.impact * sensitivity)

        risk = DpiaRisk(
            version_id=version_id,
            title=payload.title,
            description=payload.description,
            category=payload.category,
            likelihood=payload.likelihood,
            impact=payload.impact,
            sensitivity_factor=Decimal(str(sensitivity)),
            inherent_score=Decimal(str(inherent)),
            status=payload.status
        )
        db.add(risk)
        db.flush()

        self.calculate_risk_scores(db, risk.id)
        db.commit()
        return risk

    def update_risk(self, db: Session, risk_id: UUID, payload: DpiaRiskUpdate) -> DpiaRisk:
        risk = db.query(DpiaRisk).filter(DpiaRisk.id == risk_id).first()
        if not risk:
            raise ValueError("Risk not found")

        if payload.title is not None:
            risk.title = payload.title
        if payload.description is not None:
            risk.description = payload.description
        if payload.category is not None:
            risk.category = payload.category
        if payload.likelihood is not None:
            risk.likelihood = payload.likelihood
        if payload.impact is not None:
            risk.impact = payload.impact
        if payload.status is not None:
            risk.status = payload.status

        db.flush()
        self.calculate_risk_scores(db, risk.id)
        db.commit()
        return risk

    def delete_risk(self, db: Session, risk_id: UUID) -> bool:
        risk = db.query(DpiaRisk).filter(DpiaRisk.id == risk_id).first()
        if risk:
            db.delete(risk)
            db.commit()
            return True
        return False

    def list_risks(self, db: Session, version_id: UUID) -> list[DpiaRisk]:
        return db.query(DpiaRisk).filter(DpiaRisk.version_id == version_id).all()

    # Controls Integration
    def add_control_to_risk(self, db: Session, risk_id: UUID, payload: DpiaControlCreate) -> DpiaControl:
        risk = db.query(DpiaRisk).filter(DpiaRisk.id == risk_id).first()
        if not risk:
            raise ValueError("Risk not found")

        ctrl = DpiaControl(
            risk_id=risk_id,
            control_library_id=payload.control_library_id,
            status=payload.status,
            owner_user_id=payload.owner_user_id,
            custom_instructions=payload.custom_instructions
        )
        db.add(ctrl)
        db.flush()

        self.calculate_risk_scores(db, risk_id)
        db.commit()
        return ctrl

    def update_control_status(self, db: Session, control_id: UUID, payload: DpiaControlUpdate) -> DpiaControl:
        ctrl = db.query(DpiaControl).filter(DpiaControl.id == control_id).first()
        if not ctrl:
            raise ValueError("Control not found")

        if payload.status is not None:
            ctrl.status = payload.status
        if payload.owner_user_id is not None:
            ctrl.owner_user_id = payload.owner_user_id
        if payload.custom_instructions is not None:
            ctrl.custom_instructions = payload.custom_instructions

        db.flush()
        self.calculate_risk_scores(db, ctrl.risk_id)
        db.commit()
        return ctrl

    def verify_control(self, db: Session, control_id: UUID, verifier_user_id: UUID, is_verified: bool) -> DpiaControl:
        ctrl = db.query(DpiaControl).filter(DpiaControl.id == control_id).first()
        if not ctrl:
            raise ValueError("Control not found")

        if is_verified:
            ctrl.status = DpiaControlStatus.active.value
            ctrl.verified_at = datetime.now()
            ctrl.verified_by = verifier_user_id
        else:
            ctrl.status = DpiaControlStatus.failed.value
            ctrl.verified_at = None
            ctrl.verified_by = None

        db.flush()
        self.calculate_risk_scores(db, ctrl.risk_id)
        db.commit()
        return ctrl

    def get_control_library(self, db: Session, org_id: UUID) -> list[DpiaControlLibrary]:
        # Fetch global controls + org-specific controls
        from sqlalchemy import or_
        return (
            db.query(DpiaControlLibrary)
            .filter(or_(DpiaControlLibrary.organization_id == None, DpiaControlLibrary.organization_id == org_id))
            .all()
        )
