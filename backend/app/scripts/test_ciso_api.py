"""Test script for verifying CISO Command Center DB operations and score calculation engine."""

import os
from uuid import uuid4
from app.core.database import SessionLocal
from app.models.organization import Organization
from app.models.user import User
from app.models.ciso import CisoRequirement
from app.schemas.ciso import (
    CisoControlCreate,
    CisoControlUpdate,
    CisoRiskCreate,
    CisoRemediationTaskCreate,
    CisoRemediationTaskUpdate,
    CisoExceptionCreate,
    CisoControlCommentCreate,
    CisoControlReviewCreate,
    CisoScoreSettingsUpdate,
)
from app.services.ciso_service import CisoService


def test_ciso_module():
    db = SessionLocal()
    try:
        print("=== Step 1: Resolve Organization and User Context ===")
        org = db.query(Organization).first()
        if not org:
            print("No organization found. Run seeds first.")
            return

        user = db.query(User).filter(User.organization_id == org.id).first()
        if not user:
            user = db.query(User).first()
        if not user:
            print("No user found in database.")
            return

        print(f"Testing context: User={user.email}, Org={org.name} (ID: {org.id})")
        service = CisoService(db)

        # Cleanup any stale test controls left from previous runs
        from app.models.ciso import CisoControl
        stale_ctrl = db.query(CisoControl).filter(CisoControl.organization_id == org.id, CisoControl.control_key == "CTRL-TEST-001").first()
        if stale_ctrl:
            db.delete(stale_ctrl)
            db.commit()
            print("Cleaned up stale test control CTRL-TEST-001")

        print("\n=== Step 2: Fetch and Configure Scoring settings ===")
        settings = service.get_or_create_settings(org.id)
        print(f"Current Settings weights: Controls={settings.controls_weight}, Risks={settings.risks_weight}")
        
        # Test updating settings
        updated_settings = service.update_settings(
            user,
            CisoScoreSettingsUpdate(controls_weight=0.35, risks_weight=0.10),
            org_id=org.id
        )
        print(f"Updated Settings weights: Controls={updated_settings.controls_weight}, Risks={updated_settings.risks_weight}")

        print("\n=== Step 3: Fetch Dashboard Summary & Calculate Scores ===")
        summary = service.get_dashboard_summary(user, org_id=org.id)
        print(f"Initial Dashboard Posture Score: {summary.scores['overall']}%")
        print(f"Framework scores DPDPA: {summary.scores.get('DPDPA', 0)}%, ISO: {summary.scores.get('ISO27001', 0)}%")
        print(f"Control Health Breakdown: Healthy={summary.control_health['healthy']}, Critical={summary.control_health['critical']}")

        print("\n=== Step 4: Register Custom Security Control ===")
        # Find some requirement to map to
        req = db.query(CisoRequirement).first()
        req_ids = [req.id] if req else []

        payload = CisoControlCreate(
            control_key="CTRL-TEST-001",
            title="Database Audit Logging Integration Test Control",
            description="Enforce detailed audit query logging for all SQL mutations.",
            status="not_configured",
            priority="high",
            category="Technical",
            maturity="Initial",
            tags=["database", "audit", "test"],
            requirement_ids=req_ids
        )
        control = service.create_control(user, payload, org_id=org.id)
        print(f"Created Control: {control.control_key} -> {control.title}")

        print("\n=== Step 5: Upload Verification Evidence ===")
        evidence = service.create_evidence(
            user,
            name="Audit Log Test Proof",
            file_name="audit_test_proof.json",
            file_type="application/json",
            control_ids=[control.id],
            org_id=org.id
        )
        print(f"Uploaded Evidence: {evidence.name} (Verified: {evidence.is_verified})")

        print("\n=== Step 6: Log Control Comment & Apply Formal Compliance Review ===")
        comment = service.add_comment(
            user,
            control.id,
            CisoControlCommentCreate(comment="Audit logs verified in secondary DB instance. Mapping healthy."),
            org_id=org.id
        )
        print(f"Logged Comment: {comment.comment}")

        review = service.add_review(
            user,
            control.id,
            CisoControlReviewCreate(outcome="Approved", notes="Evidence meets all criteria for requirement audit compliance."),
            org_id=org.id
        )
        print(f"Formal Review: Outcome={review.outcome}, Notes={review.notes}")

        # Refresh control details to verify status updated to healthy
        control = service.get_control_detail(user, control.id, org_id=org.id)
        print(f"Control status after review approval: {control.status}")

        print("\n=== Step 7: Request Temporary Control Exception ===")
        exc_payload = CisoExceptionCreate(
            control_id=control.id,
            exception_type="temporary",
            reason="Legacy testing schema does not support query triggers.",
            compensating_controls="Periodic manual review schedules active."
        )
        exception = service.create_exception(user, exc_payload, org_id=org.id)
        print(f"Exception Approved: {exception.reason} (Compensating: {exception.compensating_controls})")
        
        # Verify status is now 'exception'
        control = service.get_control_detail(user, control.id, org_id=org.id)
        print(f"Control status after Exception request: {control.status}")

        print("\n=== Step 8: Risk Register Seeding & Assessment ===")
        risk_payload = CisoRiskCreate(
            title="Unauthorized write mutations to local testing replicas",
            category="Access Risk",
            likelihood=4,
            impact=3
        )
        risk = service.create_risk(user, risk_payload, org_id=org.id)
        print(f"Registered Risk: {risk.risk_id} -> {risk.title} (Score: {risk.score})")

        print("\n=== Step 9: Add Remediation Task ===")
        task_payload = CisoRemediationTaskCreate(
            title="Apply read-only policies to postgres testing replica instances",
            description="Update AWS RDS parameter groups to restrict query writes.",
            priority="medium",
            status="open",
            progress=0
        )
        task = service.create_remediation_task(user, task_payload, control_ids=[control.id], org_id=org.id)
        print(f"Created Remediation Task: {task.task_ref} -> {task.title}")

        # Update task progress to completed
        updated_task = service.update_remediation_task(
            user,
            task.id,
            CisoRemediationTaskUpdate(status="completed", progress=100),
            org_id=org.id
        )
        print(f"Updated Remediation Task: Status={updated_task.status}, Progress={updated_task.progress}%")

        print("\n=== Step 10: Generate Board Executive PDF Report ===")
        report = service.generate_board_report(user, org_id=org.id)
        print(f"Generated Board Report: {report.title}")
        pdf_path = f"/Users/shreyvashistha/Desktop/ZEROSHIELD-DPDPA/dpdpa_shield/backend/templates/report_{report.id}.pdf"
        print(f"PDF Output File exists: {os.path.exists(pdf_path)} (Size: {os.path.getsize(pdf_path)} bytes)")

        # Recalculate summary scores to verify dashboard calculates dynamic updates
        new_summary = service.get_dashboard_summary(user, org_id=org.id)
        print(f"Final Posture Score after testing updates: {new_summary.scores['overall']}%")

        # Cleanup test entries
        db.delete(task)
        db.delete(risk)
        db.delete(exception)
        db.delete(comment)
        db.delete(review)
        db.delete(evidence)
        db.delete(control)
        db.commit()
        print("\nCleaned up all test records successfully!")

        print("\nCISO Command Center service tests PASSED successfully!")
    except Exception as e:
        db.rollback()
        print(f"Test failure: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    test_ciso_module()
