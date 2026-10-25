from uuid import UUID
from sqlalchemy.orm import Session

from app.models.dpia import (
    DpiaComplianceCheck, DpiaStepAnswer, DpiaControl, DpiaVersion, DpiaControlLibrary
)


class DpiaComplianceService:
    def evaluate_compliance(self, db: Session, version_id: UUID) -> float:
        # 1. Fetch Version Answers & Controls
        answers = db.query(DpiaStepAnswer).filter(DpiaStepAnswer.version_id == version_id).all()
        
        # Clear old checks for these answers/controls
        ans_ids = [a.id for a in answers]
        
        # Controls linked to risks in this version
        from app.models.dpia import DpiaRisk
        risks = db.query(DpiaRisk).filter(DpiaRisk.version_id == version_id).all()
        risk_ids = [r.id for r in risks]
        controls = db.query(DpiaControl).filter(DpiaControl.risk_id.in_(risk_ids)).all() if risk_ids else []
        ctrl_ids = [c.id for c in controls]

        if ans_ids:
            db.query(DpiaComplianceCheck).filter(DpiaComplianceCheck.answer_id.in_(ans_ids)).delete(synchronize_session=False)
        if ctrl_ids:
            db.query(DpiaComplianceCheck).filter(DpiaComplianceCheck.control_id.in_(ctrl_ids)).delete(synchronize_session=False)
        db.flush()

        checks_created = 0
        satisfied_count = 0

        # Run mapping checks
        # Check Notice (Section 6)
        notice_ans = next((a for a in answers if a.question_key == "notice_delivery"), None)
        if notice_ans:
            val = (notice_ans.answer_text or "").strip().lower()
            is_ok = len(val) > 3
            chk = DpiaComplianceCheck(
                answer_id=notice_ans.id,
                obligation_code="DPDPA_SEC_6",
                is_satisfied=is_ok
            )
            db.add(chk)
            checks_created += 1
            if is_ok:
                satisfied_count += 1
                notice_ans.compliance_status = "compliant"
            else:
                notice_ans.compliance_status = "non_compliant"

        # Check Consent (Section 7)
        consent_ans = next((a for a in answers if a.question_key == "consent_mechanism"), None)
        if consent_ans:
            val = (consent_ans.answer_text or "").strip().lower()
            is_ok = "consent" in val or len(val) > 3
            chk = DpiaComplianceCheck(
                answer_id=consent_ans.id,
                obligation_code="DPDPA_SEC_7",
                is_satisfied=is_ok
            )
            db.add(chk)
            checks_created += 1
            if is_ok:
                satisfied_count += 1
                consent_ans.compliance_status = "compliant"
            else:
                consent_ans.compliance_status = "non_compliant"

        # Check Child Data (Section 9)
        child_ans = next((a for a in answers if a.question_key == "child_data"), None)
        if child_ans:
            val = (child_ans.answer_text or "").strip().lower()
            if val == "yes":
                # Must have parental consent check
                parental_ans = next((a for a in answers if a.question_key == "parental_consent_flow"), None)
                is_ok = parental_ans is not None and "yes" in (parental_ans.answer_text or "").strip().lower()
                chk = DpiaComplianceCheck(
                    answer_id=child_ans.id,
                    obligation_code="DPDPA_SEC_9_1",
                    is_satisfied=is_ok
                )
                db.add(chk)
                checks_created += 1
                if is_ok:
                    satisfied_count += 1
                    child_ans.compliance_status = "compliant"
                else:
                    child_ans.compliance_status = "non_compliant"
            else:
                # N/A is considered satisfied compliance
                chk = DpiaComplianceCheck(
                    answer_id=child_ans.id,
                    obligation_code="DPDPA_SEC_9_1",
                    is_satisfied=True
                )
                db.add(chk)
                checks_created += 1
                satisfied_count += 1
                child_ans.compliance_status = "compliant"

        # Check Technical Controls (Section 8(5))
        for ctrl in controls:
            lib = db.query(DpiaControlLibrary).filter(DpiaControlLibrary.id == ctrl.control_library_id).first()
            if not lib:
                continue

            # Standard codes mapping to Section 8(5) obligations
            if lib.control_code in ("CTRL-ENC-001", "CTRL-MASK-001", "CTRL-RBAC-001"):
                is_ok = ctrl.status == "active"
                chk = DpiaComplianceCheck(
                    control_id=ctrl.id,
                    obligation_code="DPDPA_SEC_8_5",
                    is_satisfied=is_ok
                )
                db.add(chk)
                checks_created += 1
                if is_ok:
                    satisfied_count += 1

        db.commit()

        if checks_created == 0:
            return 100.0
        
        return round((satisfied_count / checks_created) * 100, 2)
