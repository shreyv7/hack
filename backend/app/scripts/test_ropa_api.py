from uuid import UUID
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.organization import Organization
from app.models.user import User
from app.models.ropa import BusinessUnit, Department, Team, ProcessingActivity, ActivityDpiaLink
from app.schemas.ropa import (
    BusinessUnitCreate,
    DepartmentCreate,
    TeamCreate,
    ProcessingActivityCreate,
    ProcessingActivityUpdate,
    ActivityOwnerCreate,
    ActivityDataCategoryCreate,
    ActivityDataPrincipalCreate,
    ActivityLawfulBasisCreate,
    ActivitySystemCreate,
    ActivityRecipientCreate,
    ActivityCrossBorderTransferCreate,
    ActivityRetentionPolicyCreate,
    ActivitySecurityMeasureCreate,
)
from app.services.ropa_service import RopaService


def test_ropa_crud():
    db = SessionLocal()
    try:
        # Fetch seed org and user
        org = db.query(Organization).first()
        if not org:
            print("No organization found; run seeds first.")
            return

        user = db.query(User).filter(User.organization_id == org.id).first()
        if not user:
            # Fallback to any user
            user = db.query(User).first()
        if not user:
            print("No user found in organization.")
            return

        service = RopaService(db)

        # Cleanup existing test Business Unit if exists
        existing_bu = db.query(BusinessUnit).filter(BusinessUnit.name == "Research & Development").first()
        if existing_bu:
            # Delete any processing activities that reference this BU or its departments/teams
            db.query(ProcessingActivity).filter(ProcessingActivity.business_unit_id == existing_bu.id).delete()
            db.delete(existing_bu)
            db.commit()
            print("Cleaned up existing Research & Development Business Unit and its activities.")

        print("=== Test Step 1: Create Org Hierarchy ===")
        bu_payload = BusinessUnitCreate(name="Research & Development", code="RND", head_user_id=user.id)
        bu = service.create_business_unit(user, bu_payload, org_id=org.id)
        print(f"Created Business Unit: {bu.name} ({bu.code})")

        dept_payload = DepartmentCreate(business_unit_id=bu.id, name="Artificial Intelligence", code="AI", head_user_id=user.id)
        dept = service.create_department(user, dept_payload, org_id=org.id)
        print(f"Created Department: {dept.name} ({dept.code})")

        team_payload = TeamCreate(department_id=dept.id, name="LLM Safety", code="LLMS", head_user_id=user.id)
        team = service.create_team(user, team_payload, org_id=org.id)
        print(f"Created Team: {team.name} ({team.code})")

        print("=== Test Step 2: Create Processing Activity ===")
        act_payload = ProcessingActivityCreate(
            title="LLM alignment fine-tuning",
            description="Fine-tuning frontier models with user preference feedbacks.",
            business_unit_id=bu.id,
            department_id=dept.id,
            team_id=team.id,
            owners=[ActivityOwnerCreate(user_id=user.id, owner_role="technical_owner")],
            data_categories=[
                ActivityDataCategoryCreate(category_name="User Prompts", is_special=False),
                ActivityDataCategoryCreate(category_name="User Ratings & Feedbacks", is_special=False),
                ActivityDataCategoryCreate(category_name="Profile Metadata", is_special=False)
            ],
            data_principals=[ActivityDataPrincipalCreate(category_name="Beta Testers", includes_children=False)],
            lawful_bases=[ActivityLawfulBasisCreate(basis_type="consent", justification="Consent form signed during beta registry.", dpdpa_section="Section 6")],
            systems=[ActivitySystemCreate(system_name="Fine-Tuning Cluster (Slurm)", system_type="on_premise", location="AWS Mumbai Region")],
            recipients=[ActivityRecipientCreate(recipient_type="vendor", name="Anyscale Compute Providers")],
            retention_policies=[ActivityRetentionPolicyCreate(retention_period="Until account deletion", trigger_event="Account termination", auto_delete=True)],
            security_measures=[ActivitySecurityMeasureCreate(measure_type="encryption", description="Encrypted storage volumes and in-transit TLS 1.3")]
        )
        activity = service.create_activity(user, act_payload, org_id=org.id)
        print(f"Created Activity: Ref={activity.activity_ref}, Title='{activity.title}', Risk Score={activity.risk_score}, Level={activity.risk_level}")
        assert activity.activity_ref.startswith("ZS-ROPA-")
        assert activity.risk_score > 0
        assert activity.status == "draft"

        print("=== Test Step 3: Get Activity Detail ===")
        details = service.get_activity(user, activity.id, org_id=org.id)
        print(f"Details Title: '{details.title}'")
        print(f"Data categories count: {len(details.data_categories)}")
        assert len(details.data_categories) == 3
        assert len(details.owners) == 1
        assert len(details.lawful_bases) == 1

        initial_score = activity.risk_score

        print("=== Test Step 4: Update Activity ===")
        update_payload = ProcessingActivityUpdate(
            title="LLM alignment fine-tuning & evaluation",
            data_categories=[
                ActivityDataCategoryCreate(category_name="User Prompts", is_special=False),
                ActivityDataCategoryCreate(category_name="User Ratings & Feedbacks", is_special=False),
                ActivityDataCategoryCreate(category_name="Profile Metadata", is_special=False),
                ActivityDataCategoryCreate(category_name="Chat History Records", is_special=True, sensitivity="sensitive")
            ]
        )
        updated = service.update_activity(user, activity.id, update_payload, org_id=org.id)
        print(f"Updated Title: '{updated.title}'")
        print(f"New categories count: {len(updated.data_categories)}")
        print(f"New Risk Score: {updated.risk_score}, Level: {updated.risk_level}")
        assert len(updated.data_categories) == 4
        # Since we added special/sensitive data, the risk score should increase!
        assert updated.risk_score > initial_score
        print(f"Auto-triggered DPIA links count: {len(updated.dpia_links)}")
        assert len(updated.dpia_links) == 1
        print(f" - Linked DPIA Ref: {updated.dpia_links[0].dpia.dpia_ref}")

        from app.services.ropa_workflow_service import RopaWorkflowService
        from app.services.ropa_version_service import RopaVersionService
        wf_service = RopaWorkflowService()
        ver_service = RopaVersionService()

        print("=== Test Step 5: Submit for review ===")
        approvals = wf_service.submit_for_review(db, activity.id, user)
        print(f"Submitted for review. Generated {len(approvals)} approval steps.")
        assert len(approvals) >= 1

        print("=== Test Step 6: Process approval decisions ===")
        for app in approvals:
            wf_service.process_decision(db, app.id, "approved", "Approved by testing suite", user)
            print(f"Approved role: {app.role_required}")
        
        db.refresh(activity)
        print(f"Activity status after all approvals: {activity.status}")
        assert activity.status == "approved"

        print("=== Test Step 7: Publish activity ===")
        wf_service.publish_activity(db, activity.id, user)
        db.refresh(activity)
        print(f"Activity status after publish: {activity.status}")
        assert activity.status == "published"

        print("=== Test Step 8: Checkout new version ===")
        new_ver = ver_service.checkout_new_version(db, activity.id, "Second version updates", user)
        print(f"New version number checked out: {new_ver.version_number}")
        assert new_ver.version_number == 2
        db.refresh(activity)
        assert activity.status == "draft"

        print("=== Test Step 9: Compare versions ===")
        v1_id = activity.versions[0].id
        v2_id = new_ver.id
        diff = ver_service.compare_versions(db, v1_id, v2_id)
        print(f"Compared v{diff['version_a_number']} and v{diff['version_b_number']}.")
        print(f"Diff keys: {list(diff['diff_data'].keys())}")

        print("=== Test Step 10: Rollback ===")
        rolled_back_ver = ver_service.rollback_to_version(db, activity.id, v1_id, user)
        print(f"Rolled back! Version created: {rolled_back_ver.version_number}")
        assert rolled_back_ver.version_number == 3

        print("=== Test Step 11: Compliance Score Engine integration ===")
        from app.services.compliance_map_service import ComplianceMapService
        map_service = ComplianceMapService(db)
        
        base_summary = map_service.get_summary(user, org_id=org.id)
        print(f"Baseline Compliance score: {base_summary.compliance_score}%")
        
        # Temporarily publish the activity which has special category (Chat History) but NO DPIA
        activity.status = "published"
        # Delete linked DPIA links to create a compliance violation
        db.query(ActivityDpiaLink).filter(ActivityDpiaLink.activity_id == activity.id).delete()
        db.commit()
        
        new_summary = map_service.get_summary(user, org_id=org.id)
        print(f"Compliance score after publishing activity with special data + no DPIA: {new_summary.compliance_score}%")
        # Assert score decreases by 10 points (unless it was already at 0)
        expected_score = max(0, base_summary.compliance_score - 10)
        assert new_summary.compliance_score == expected_score
        print("Compliance score successfully decreased by 10 points.")

        # Revert status
        activity.status = "draft"
        db.commit()

        print("=== Test Step 12: Soft Delete Activity ===")
        service.soft_delete_activity(user, activity.id, org_id=org.id)
        print("Soft delete triggered.")
        
        # Verify it is deleted
        try:
            service.get_activity(user, activity.id, org_id=org.id)
            print("FAILED: Get activity succeeded on soft deleted record.")
            assert False
        except Exception as e:
            print("SUCCESS: Get activity on deleted record failed as expected.")

        print("=== All RoPA Flow Test Phases Passed Successfully! ===")
    except Exception as e:
        print(f"Test failed with exception: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    test_ropa_crud()
