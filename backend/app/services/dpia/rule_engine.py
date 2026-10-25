from uuid import UUID
from sqlalchemy.orm import Session
from decimal import Decimal

from app.models.dpia import (
    DpiaRisk, DpiaControl, DpiaControlLibrary, DpiaStepAnswer, DpiaRiskStatus
)
from app.services.dpia.risk_engine import DpiaRiskEngine


class DpiaRuleEngine:
    def evaluate_rules(self, db: Session, version_id: UUID) -> int:
        # Clear auto-escalated risks for this version before evaluation
        auto_risks = (
            db.query(DpiaRisk)
            .filter(DpiaRisk.version_id == version_id, DpiaRisk.is_auto_escalated == True)
            .all()
        )
        for r in auto_risks:
            db.delete(r)
        db.flush()

        # Gather answer mappings
        answers = db.query(DpiaStepAnswer).filter(DpiaStepAnswer.version_id == version_id).all()
        ans_map = {}
        for ans in answers:
            ans_map[ans.question_key] = (ans.answer_text or "").strip().lower()

        created_count = 0
        risk_engine = DpiaRiskEngine()
        sensitivity = risk_engine.calculate_sensitivity_factor(db, version_id)

        # Rule 1: Children Data + AI Profiling -> Critical Escalation
        if ans_map.get("child_data") == "yes" and ans_map.get("ai_profiling") == "yes":
            score = 5 * 5 * sensitivity
            risk = DpiaRisk(
                version_id=version_id,
                title="Automated Profiling and Algorithmic Sorting of Children's Data",
                description="System processes children's identifiers with automated profiling mechanisms, triggering Section 9 DPDPA restriction.",
                category="children_data",
                likelihood=5,
                impact=5,
                sensitivity_factor=Decimal(str(sensitivity)),
                inherent_score=Decimal(str(score)),
                is_auto_escalated=True,
                status=DpiaRiskStatus.identified.value
            )
            db.add(risk)
            db.flush()
            created_count += 1

            # Suggest control: Consent management parental flow
            lib_ctrl = db.query(DpiaControlLibrary).filter(DpiaControlLibrary.control_code == "CTRL-CON-005").first()
            if lib_ctrl:
                ctrl = DpiaControl(
                    risk_id=risk.id,
                    control_library_id=lib_ctrl.id,
                    status="planned",
                    custom_instructions="Implement verified parental consent flow before onboarding users under 18."
                )
                db.add(ctrl)

        # Rule 2: Cross-border flow -> High Escalation
        if ans_map.get("cross_border") == "yes":
            score = 4 * 4 * sensitivity
            risk = DpiaRisk(
                version_id=version_id,
                title="Cross-Border Personal Data Transfer Vulnerabilities",
                description="Obligations under Rule 13 restrict transfer of specified personal data categories outside India.",
                category="cross_border",
                likelihood=4,
                impact=4,
                sensitivity_factor=Decimal(str(sensitivity)),
                inherent_score=Decimal(str(score)),
                is_auto_escalated=True,
                status=DpiaRiskStatus.identified.value
            )
            db.add(risk)
            db.flush()
            created_count += 1

            lib_ctrl = db.query(DpiaControlLibrary).filter(DpiaControlLibrary.control_code == "CTRL-LEG-002").first()
            if lib_ctrl:
                ctrl = DpiaControl(
                    risk_id=risk.id,
                    control_library_id=lib_ctrl.id,
                    status="planned",
                    custom_instructions="Draft and verify Standard Contractual Clauses (SCC) and check data flow boundaries."
                )
                db.add(ctrl)

        # Rule 3: Health or Biometric data -> Security Risk
        sens = ans_map.get("sensitive_type") or ""
        if "health" in sens or "biometric" in sens:
            score = 4 * 5 * sensitivity
            risk = DpiaRisk(
                version_id=version_id,
                title="High Sensitivity Health & Biometric Data Compromise Risk",
                description="Special categories of personal data processed without enhanced encryption safeguards.",
                category="security",
                likelihood=4,
                impact=5,
                sensitivity_factor=Decimal(str(sensitivity)),
                inherent_score=Decimal(str(score)),
                is_auto_escalated=True,
                status=DpiaRiskStatus.identified.value
            )
            db.add(risk)
            db.flush()
            created_count += 1

            lib_ctrl = db.query(DpiaControlLibrary).filter(DpiaControlLibrary.control_code == "CTRL-ENC-001").first()
            if lib_ctrl:
                ctrl = DpiaControl(
                    risk_id=risk.id,
                    control_library_id=lib_ctrl.id,
                    status="planned",
                    custom_instructions="Deploy AES-256 field-level encryption on database columns storing health keys."
                )
                db.add(ctrl)

        if created_count > 0:
            db.flush()
            risk_engine.sync_version_risks(db, version_id)

        db.commit()
        return created_count
