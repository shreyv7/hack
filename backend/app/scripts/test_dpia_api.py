from uuid import UUID
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.dpia import DpiaCreate, DpiaStepAnswerCreate, DpiaRiskCreate, DpiaApprovalDecision
from app.services.dpia.governance import DpiaGovernanceService
from app.services.dpia.risk_engine import DpiaRiskEngine
from app.services.dpia.workflow import DpiaWorkflowService
from app.services.dpia.rule_engine import DpiaRuleEngine
from app.services.dpia.compliance import DpiaComplianceService


def test_dpia_flow():
    db = SessionLocal()
    try:
        # Fetch seed org and user
        org = db.query(Organization).first()
        if not org:
            print("No organization found; run seeds first.")
            return

        user = db.query(User).filter(User.organization_id == org.id).first()
        if not user:
            print("No user found in organization.")
            return

        print("=== Test Step 1: Create DPIA Assessment ===")
        gov_service = DpiaGovernanceService()
        payload = DpiaCreate(
            title="AI personalized ad targeting",
            description="Algorithmic processing model targeting user profiles"
        )
        dpia = gov_service.create_dpia(db, org.id, payload, user.id)
        print(f"Created DPIA: Ref={dpia.dpia_ref}, Title='{dpia.title}'")
        assert dpia.status == "draft"

        print("=== Test Step 2: Save Step Answers ===")
        ans_payload = DpiaStepAnswerCreate(
            step_key="processing",
            question_key="child_data",
            answer_text="yes"
        )
        ans = gov_service.save_step_answer(db, dpia.current_version_id, ans_payload, user.id)
        print(f"Answer saved: question={ans.question_key}, value='{ans.answer_text}'")

        # Save AI profiling question
        ans_payload_2 = DpiaStepAnswerCreate(
            step_key="processing",
            question_key="ai_profiling",
            answer_text="yes"
        )
        gov_service.save_step_answer(db, dpia.current_version_id, ans_payload_2, user.id)

        print("=== Test Step 3: Run Rule Engine Scans ===")
        rule_engine = DpiaRuleEngine()
        triggered = rule_engine.evaluate_rules(db, dpia.current_version_id)
        print(f"Rules triggered: {triggered}")
        assert triggered > 0

        # Verify risk was created
        risk_engine = DpiaRiskEngine()
        risks = risk_engine.list_risks(db, dpia.current_version_id)
        print(f"Risks found in version: {len(risks)}")
        for r in risks:
            print(f" - Risk: {r.title}, Inherent Score: {r.inherent_score}")

        print("=== Test Step 4: Run Compliance Engine Check ===")
        comp_service = DpiaComplianceService()
        score = comp_service.evaluate_compliance(db, dpia.current_version_id)
        print(f"Evaluated DPDPA Compliance Score: {score}%")

        print("=== Test Step 5: Submit for Approvals ===")
        wf_service = DpiaWorkflowService()
        approvals = wf_service.submit_for_approval(db, dpia.current_version_id, user.id)
        print(f"Workflow initiated with {len(approvals)} approval steps.")
        assert len(approvals) == 4

        print("=== Test Step 6: Process Approval Decision ===")
        pending = approvals[0]
        wf_service.process_decision(
            db=db,
            approval_id=pending.id,
            payload=DpiaApprovalDecision(status="approved", comments="Approved project info"),
            actor_id=user.id
        )
        print(f"First step approved: role={pending.role_required}")

        print("=== All Test Phases Passed Successfully! ===")
    finally:
        db.close()


if __name__ == "__main__":
    test_dpia_flow()
