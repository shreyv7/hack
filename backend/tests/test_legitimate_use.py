"""
Tests for Legitimate Use compliance rules, LIA warnings, and score deductions.
"""

from uuid import uuid4
from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.models.consent import Purpose, PurposeVersion, LegalBasis, ConsentNoticeVersion
from app.services.consent_service import ConsentService
from app.services.compliance_map_service import ComplianceMapService
from app.services.dsar_service import DsarService
from app.models.dsar import DataRightType


def test_lia_warnings_validation():
    db = SessionLocal()
    svc = ConsentService(db)
    
    try:
        # Create a mock notice version
        notice_ver = ConsentNoticeVersion(
            id=uuid4(),
            notice_id=uuid4(),
            version_number=1,
            display_name="Test Notice",
            language="English",
            opening_statement="Consent Notice Opening...",
        )
        
        # Test Case 1: Legitimate use purpose with missing LIA summary & retention period
        p1 = PurposeVersion(
            purpose_id=uuid4(),
            version_number=1,
            name="Legit Purpose Without LIA",
            legal_basis=LegalBasis.legitimate_use,
            is_special_category=False,
            retention_period="",
            lia_summary="",
        )
        
        warnings = svc.compute_compliance_warnings(notice_ver, [p1])
        codes = [w.code for w in warnings]
        
        assert "LEGITIMATE_USE_NO_BALANCING_TEST" in codes, "Expected warning for missing LIA balancing test"
        assert "LEGITIMATE_USE_NO_RETENTION" in codes, "Expected warning for missing retention period"
        assert "LEGITIMATE_USE_SPECIAL_CATEGORY" not in codes
        
        # Test Case 2: Legitimate use purpose with special category data
        p2 = PurposeVersion(
            purpose_id=uuid4(),
            version_number=1,
            name="Legit Special Category Purpose",
            legal_basis=LegalBasis.legitimate_use,
            is_special_category=True,
            retention_period="3 years",
            lia_summary="Valid LIA summary is present here.",
        )
        
        warnings = svc.compute_compliance_warnings(notice_ver, [p2])
        codes = [w.code for w in warnings]
        
        assert "LEGITIMATE_USE_SPECIAL_CATEGORY" in codes, "Expected warning for special category data under legitimate use"
        assert "LEGITIMATE_USE_NO_BALANCING_TEST" not in codes
        assert "LEGITIMATE_USE_NO_RETENTION" not in codes

        print("  ✓ test_lia_warnings_validation passed")
    finally:
        db.close()


def test_dsar_erasure_legitimate_use_conflict():
    db = SessionLocal()
    svc = DsarService(db)
    try:
        # 1. Create a dummy org
        from app.models.organization import Organization
        org = Organization(id=uuid4(), name="Test Legit Conflict Org", slug=f"test-slug-{uuid4().hex[:6]}")
        db.add(org)
        db.flush()
        
        # 2. Add a legitimate use purpose to the org
        purpose = Purpose(id=uuid4(), organization_id=org.id, name="IT Security Checks")
        db.add(purpose)
        db.flush()
        
        purpose_version = PurposeVersion(
            purpose_id=purpose.id,
            version_number=1,
            name="IT Security Checks",
            legal_basis=LegalBasis.legitimate_use,
            retention_period="5 years",
            lia_summary="Balancing test documented.",
        )
        db.add(purpose_version)
        db.flush()
        purpose.current_live_version_id = purpose_version.id
        db.flush()
        
        # 3. Check conflict note
        note = svc._check_legitimate_use_conflict(org.id)
        assert note is not None
        assert "processes data under Legitimate Use for 1 purpose(s)" in note
        
        print("  ✓ test_dsar_erasure_legitimate_use_conflict passed")
    finally:
        db.rollback()
        db.close()


def test_compliance_score_deductions():
    db = SessionLocal()
    svc = ComplianceMapService(db)
    try:
        from app.models.organization import Organization
        org = Organization(id=uuid4(), name="Test Score Deduct Org", slug=f"test-slug-{uuid4().hex[:6]}")
        db.add(org)
        db.flush()
        
        # 1. Add Purpose Version without LIA
        p = Purpose(id=uuid4(), organization_id=org.id, name="Legit Purpose without LIA")
        db.add(p)
        db.flush()
        
        pv = PurposeVersion(
            purpose_id=p.id,
            version_number=1,
            name="Legit Purpose without LIA",
            legal_basis=LegalBasis.legitimate_use,
            retention_period="5 years",
            lia_summary="", # Missing LIA
        )
        db.add(pv)
        db.flush()
        p.current_live_version_id = pv.id
        db.flush()
        
        # 2. Assert LIA missing deduction is 3 points
        deductions = svc._legitimate_use_deductions(org.id)
        assert deductions == 3, f"Expected 3 points deduction, got {deductions}"
        
        # 3. Mark as special category to trigger 10 points deduction
        pv.is_special_category = True
        db.flush()
        deductions = svc._legitimate_use_deductions(org.id)
        assert deductions == 13, f"Expected 13 points deduction (3 for missing LIA, 10 for special category), got {deductions}"
        
        print("  ✓ test_compliance_score_deductions passed")
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    print("Running Legitimate Use Unit Tests...")
    test_lia_warnings_validation()
    test_dsar_erasure_legitimate_use_conflict()
    test_compliance_score_deductions()
    print("All Legitimate Use Unit Tests PASSED!")
