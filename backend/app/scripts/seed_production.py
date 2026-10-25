"""
Comprehensive production seed script for nikit@zeroshield.ai (admin role).

Seeds ALL major tables in the database with realistic demo data so every
UI module has content during the 11 AM demo.

Run locally:
    cd backend
    .venv/bin/python -m app.scripts.seed_production
"""

import uuid
import hashlib
import random
from datetime import datetime, timezone, timedelta, date

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import OrganizationSettings
from app.models.user import User, UserRole, UserStatus
from app.utils.workspace_defaults import create_default_organization_settings

# ──────────── constants ────────────
ADMIN_EMAIL = "test@zeroshield.ai"
ADMIN_PASSWORD = "Test1234"
ORG_NAME = "ZeroShield Sandbox Org"
ORG_SLUG = "zeroshield-sandbox-org"
NOW = datetime.now(timezone.utc)


def _ts(days_ago: int = 0, hours_ago: int = 0) -> datetime:
    return NOW - timedelta(days=days_ago, hours=hours_ago)


def seed_org_and_user(db):
    """Create the org and admin user. Returns (org, user)."""
    org = db.query(Organization).filter(Organization.slug == ORG_SLUG).first()
    if not org:
        org = Organization(name=ORG_NAME, slug=ORG_SLUG, status=OrganizationStatus.active)
        db.add(org)
        db.flush()
        db.add(create_default_organization_settings(org.id))
        db.flush()
        print(f"  ✅ Created org: {ORG_NAME}")
    else:
        print(f"  ℹ️  Org exists: {ORG_NAME}")

    user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if not user:
        user = User(
            organization_id=org.id,
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            full_name="Nikit (Demo Admin)",
            role=UserRole.admin,
            status=UserStatus.active,
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        print(f"  ✅ Created admin: {ADMIN_EMAIL}")
    else:
        user.organization_id = org.id
        user.password_hash = hash_password(ADMIN_PASSWORD)
        user.status = UserStatus.active
        user.must_change_password = False
        db.flush()
        print(f"  ℹ️  Updated admin: {ADMIN_EMAIL}")

    return org, user


# ──────────── Data Sources & Inventory ────────────
def seed_data_sources(db, org):
    from app.models.data_source import DataSource, DataSourceStatus

    if db.query(DataSource).filter(DataSource.organization_id == org.id).count() > 0:
        print("  ℹ️  Data sources exist — skip")
        return []

    sources = [
        DataSource(organization_id=org.id, name="Customer PostgreSQL",   source_type="postgresql", category="database", host="db.prod.internal", port=5432, database_name="customers",  status=DataSourceStatus.connected, last_tested_at=_ts(1), region="ap-south-1"),
        DataSource(organization_id=org.id, name="HR MongoDB Atlas",      source_type="mongodb_atlas", category="cloud", host="cluster0.mongodb.net", port=27017, database_name="hr_data",  status=DataSourceStatus.connected, last_tested_at=_ts(2), region="ap-south-1"),
        DataSource(organization_id=org.id, name="Marketing S3 Bucket",   source_type="s3",        category="files", host="s3://zeroshield-marketing", status=DataSourceStatus.connected, last_tested_at=_ts(0, 5), region="ap-south-1"),
        DataSource(organization_id=org.id, name="Payment Gateway API",   source_type="rest",      category="api",   host="https://api.payment.in",    status=DataSourceStatus.connected, last_tested_at=_ts(3), region="ap-south-1"),
        DataSource(organization_id=org.id, name="CloudWatch Audit Logs", source_type="cloudwatch", category="logs",  host="logs.ap-south-1", status=DataSourceStatus.connected, last_tested_at=_ts(1), region="ap-south-1"),
    ]
    db.add_all(sources)
    db.flush()
    print(f"  ✅ Seeded {len(sources)} data sources")
    return sources


def seed_data_inventory(db, org, sources):
    from app.models.data_inventory import DataInventoryAsset, DataInventoryField, AssetType, AssetStatus, FieldClassification

    if db.query(DataInventoryAsset).filter(DataInventoryAsset.organization_id == org.id).count() > 0:
        print("  ℹ️  Data inventory exists — skip")
        return

    ds_map = {}
    for s in sources:
        ds_map[s.name] = s.id

    assets_data = [
        {"name": "users",          "type": AssetType.table,      "source": "Customer PostgreSQL",   "count": "1.2M",  "cats": ["Name","Email","Phone","Aadhaar"], "fields": [("user_id","uuid","non_personal"),("full_name","varchar","personal"),("email","varchar","personal"),("phone","varchar","personal"),("aadhaar_number","varchar","sensitive")]},
        {"name": "orders",         "type": AssetType.table,      "source": "Customer PostgreSQL",   "count": "4.8M",  "cats": ["Payment","Address"], "fields": [("order_id","uuid","non_personal"),("billing_address","text","personal"),("card_last4","varchar","sensitive")]},
        {"name": "employees",      "type": AssetType.collection,  "source": "HR MongoDB Atlas",      "count": "856",   "cats": ["Name","PAN","Salary"], "fields": [("emp_id","objectid","non_personal"),("name","string","personal"),("pan_number","string","sensitive"),("salary","number","sensitive")]},
        {"name": "campaign_leads", "type": AssetType.file_system, "source": "Marketing S3 Bucket",   "count": "320K",  "cats": ["Email","Behavioral"], "fields": [("lead_email","varchar","personal"),("utm_source","varchar","non_personal")]},
        {"name": "payment_txns",   "type": AssetType.api,         "source": "Payment Gateway API",   "count": "12M",   "cats": ["Payment","UPI"], "fields": [("txn_id","string","non_personal"),("upi_vpa","string","sensitive"),("amount","decimal","non_personal")]},
    ]

    for a in assets_data:
        asset = DataInventoryAsset(
            organization_id=org.id,
            data_source_id=ds_map.get(a["source"]),
            name=a["name"],
            asset_type=a["type"],
            record_count=a["count"],
            data_categories=a["cats"],
            status=AssetStatus.active,
            owner="Nikit",
        )
        db.add(asset)
        db.flush()
        for fname, ftype, fclass in a["fields"]:
            db.add(DataInventoryField(
                asset_id=asset.id, name=fname, data_type=ftype,
                classification=FieldClassification(fclass),
                pii_category=fname if fclass != "non_personal" else None,
            ))
    db.flush()
    print(f"  ✅ Seeded {len(assets_data)} inventory assets with fields")


# ──────────── PII Scanner ────────────
def seed_pii(db, org):
    from app.models.pii_scan import PiiScanJob, PiiFinding, ScanStatus, FindingStatus
    from app.models.data_inventory import FieldClassification

    if db.query(PiiScanJob).filter(PiiScanJob.organization_id == org.id).count() > 0:
        print("  ℹ️  PII scans exist — skip")
        return

    job = PiiScanJob(
        organization_id=org.id,
        status=ScanStatus.completed, started_at=_ts(7), finished_at=_ts(7, -2),
        tables_scanned=5, columns_scanned=18, fields_flagged=8,
        triggered_by="admin",
    )
    db.add(job)
    db.flush()

    findings = [
        ("users",           "aadhaar_number", "aadhaar",     FieldClassification.sensitive),
        ("users",           "phone",          "phone",       FieldClassification.personal),
        ("employees",       "pan_number",     "pan",         FieldClassification.sensitive),
        ("employees",       "salary",         "financial",   FieldClassification.sensitive),
        ("orders",          "card_last4",     "payment_card",FieldClassification.sensitive),
        ("payment_txns",    "upi_vpa",        "upi",         FieldClassification.sensitive),
        ("campaign_leads",  "lead_email",     "email",       FieldClassification.personal),
        ("users",           "email",          "email",       FieldClassification.personal),
    ]
    for tbl, col, cat, cls in findings:
        db.add(PiiFinding(
            scan_job_id=job.id, organization_id=org.id,
            table_name=tbl, column_name=col, pii_category=cat,
            classification=cls,
            match_count=random.randint(50, 500), sample_count=100,
            confidence=random.randint(85, 99),
            status=FindingStatus.detected,
        ))
    db.flush()
    print(f"  ✅ Seeded PII scan with {len(findings)} findings")


# ──────────── Retention ────────────
def seed_retention(db, org):
    from app.models.retention import RetentionPolicy, RetentionRun, RetentionPeriodUnit, TriggerEvent, RetentionAction, PolicyStatus, RunStatus

    if db.query(RetentionPolicy).filter(RetentionPolicy.organization_id == org.id).count() > 0:
        print("  ℹ️  Retention policies exist — skip")
        return

    policies = [
        RetentionPolicy(organization_id=org.id, name="Customer PII 7-Year Hold",  data_category="Customer Data",  period_value=7, period_unit=RetentionPeriodUnit.years,  trigger_event=TriggerEvent.creation_date, action=RetentionAction.delete,    status=PolicyStatus.active),
        RetentionPolicy(organization_id=org.id, name="Marketing Leads 2-Year",     data_category="Marketing",      period_value=2, period_unit=RetentionPeriodUnit.years,  trigger_event=TriggerEvent.last_interaction, action=RetentionAction.anonymize, status=PolicyStatus.active),
        RetentionPolicy(organization_id=org.id, name="Employee Records Archive",   data_category="HR",             period_value=10, period_unit=RetentionPeriodUnit.years, trigger_event=TriggerEvent.contract_end,  action=RetentionAction.archive,   status=PolicyStatus.active),
    ]
    db.add_all(policies)
    db.flush()

    for p in policies:
        db.add(RetentionRun(
            policy_id=p.id, organization_id=org.id,
            status=RunStatus.completed, action=p.action,
            run_at=_ts(3), cutoff_date=_ts(3).date() if hasattr(_ts(3), 'date') else _ts(3),
            records_matched=random.randint(50, 500), records_deleted=0,
        ))
    db.flush()
    print(f"  ✅ Seeded {len(policies)} retention policies with runs")


# ──────────── DSAR ────────────
def seed_dsar(db, org, user):
    from app.models.dsar import DataRightsRequest, DataRightType, VerificationStatus, DataRightsRequestStatus

    if db.query(DataRightsRequest).filter(DataRightsRequest.organization_id == org.id).count() > 0:
        print("  ℹ️  DSAR requests exist — skip")
        return

    requests = [
        DataRightsRequest(
            organization_id=org.id, tracking_id="DSAR-2026-0001",
            right_type=DataRightType.access, requester_name="Ananya Sharma",
            requester_email="ananya@example.com", request_details="I want a copy of all my personal data.",
            verification_status=VerificationStatus.verified,
            status=DataRightsRequestStatus.completed,
            received_at=_ts(15), due_at=_ts(15) + timedelta(days=30),
            resolved_at=_ts(5), resolved_by_user_id=user.id,
        ),
        DataRightsRequest(
            organization_id=org.id, tracking_id="DSAR-2026-0002",
            right_type=DataRightType.erasure, requester_name="Rajesh Kumar",
            requester_email="rajesh.k@example.com", request_details="Please delete all my data from your systems.",
            verification_status=VerificationStatus.verified,
            status=DataRightsRequestStatus.in_review,
            received_at=_ts(5), due_at=_ts(5) + timedelta(days=30),
            assigned_to_user_id=user.id,
        ),
        DataRightsRequest(
            organization_id=org.id, tracking_id="DSAR-2026-0003",
            right_type=DataRightType.correction, requester_name="Priya Patel",
            requester_email="priya.p@example.com", request_details="My phone number is wrong. Please correct it.",
            verification_status=VerificationStatus.verified,
            status=DataRightsRequestStatus.received,
            received_at=_ts(2), due_at=_ts(2) + timedelta(days=30),
        ),
        DataRightsRequest(
            organization_id=org.id, tracking_id="DSAR-2026-0004",
            right_type=DataRightType.withdraw_consent, requester_name="Vikram Singh",
            requester_email="vikram@example.com", request_details="I withdraw consent for marketing emails.",
            verification_status=VerificationStatus.verified,
            status=DataRightsRequestStatus.response_ready,
            received_at=_ts(10), due_at=_ts(10) + timedelta(days=30),
        ),
    ]
    db.add_all(requests)
    db.flush()
    print(f"  ✅ Seeded {len(requests)} DSAR requests")


# ──────────── Anonymisation ────────────
def seed_anonymisation(db, org, user):
    from app.models.anonymisation import AnonymisationJob

    if db.query(AnonymisationJob).filter(AnonymisationJob.organization_id == org.id).count() > 0:
        print("  ℹ️  Anonymisation jobs exist — skip")
        return

    jobs = [
        AnonymisationJob(organization_id=org.id, name="Q1 Marketing Leads Anonymisation", status="completed", technique="k_anonymity", dataset_name="campaign_leads", field_rules=[{"field": "lead_email", "method": "generalize"}], records_processed=12500, k_value=5, risk_percent=2.1, risk_level="low", business_purpose="Q1 churn model training", output_recipient="Data Science team", requested_by_email=user.email, started_at=_ts(30), finished_at=_ts(30, -3)),
        AnonymisationJob(organization_id=org.id, name="Inactive Customer PII Redaction",  status="completed", technique="suppression",    dataset_name="users",           field_rules=[{"field": "aadhaar_number", "method": "suppress"}, {"field": "phone", "method": "suppress"}], records_processed=3200, k_value=3, risk_percent=5.2, risk_level="medium", business_purpose="Legacy analytics archive", output_recipient="Internal BI", requested_by_email=user.email, started_at=_ts(14), finished_at=_ts(14, -2)),
        AnonymisationJob(organization_id=org.id, name="Payment Data Pseudonymization",    status="running",   technique="pseudonymization", dataset_name="payment_txns",    field_rules=[{"field": "upi_vpa", "method": "pseudonymize"}], records_processed=0, business_purpose="Fraud pattern research (de-ID)", output_recipient="Risk Analytics", requested_by_email=user.email, started_at=_ts(0, 2)),
    ]
    db.add_all(jobs)
    db.flush()
    print(f"  ✅ Seeded {len(jobs)} anonymisation jobs")


# ──────────── Child Data ────────────
def seed_child_data(db, org):
    from app.models.child_data import ChildDataRecord

    if db.query(ChildDataRecord).filter(ChildDataRecord.organization_id == org.id).count() > 0:
        print("  ℹ️  Child data records exist — skip")
        return

    from datetime import date as dt_date
    records = [
        ChildDataRecord(organization_id=org.id, child_ref="CHILD-001", date_of_birth=dt_date(2014, 3, 15), age=12, detection_method="declared", consent_status="verified", parent_name="Meera M.", parent_email="meera@example.com", parent_relationship="mother", consent_verification_method="email_otp", consent_verified_at=_ts(20), profiling_blocked=True, ad_targeting_blocked=True),
        ChildDataRecord(organization_id=org.id, child_ref="CHILD-002", date_of_birth=dt_date(2016, 8, 22), age=10, detection_method="declared", consent_status="pending", parent_name="Kavita K.", parent_email="kavita@example.com", parent_relationship="mother", consent_verification_method="email_otp", profiling_blocked=True, ad_targeting_blocked=True),
    ]
    db.add_all(records)
    db.flush()
    print(f"  ✅ Seeded {len(records)} child data records")


# ──────────── Compliance (Breach, Audit, Security) ────────────
def seed_compliance(db, org, user):
    from app.models.compliance import BreachIncident, BreachIncidentStatus, AuditLogEntry, AuditEventType, AuditSeverity, SecurityControl

    if db.query(BreachIncident).filter(BreachIncident.organization_id == org.id).count() > 0:
        print("  ℹ️  Compliance data exists — skip")
        return

    # Breach incidents
    breaches = [
        BreachIncident(organization_id=org.id, incident_ref="BRI-2026-001", severity="high", status=BreachIncidentStatus.submitted, discovered_at=_ts(10), deadline_at=_ts(10) + timedelta(hours=72), current_step=5, wizard_data={"title": "Unauthorized API Access Attempt", "description": "Rate-limited brute force on /api/auth/login detected by WAF.", "affected_records": 0, "root_cause": "Credential stuffing via leaked database."}, created_by_user_id=user.id),
        BreachIncident(organization_id=org.id, incident_ref="BRI-2026-002", severity="critical", status=BreachIncidentStatus.closed, discovered_at=_ts(25), deadline_at=_ts(25) + timedelta(hours=72), current_step=5, wizard_data={"title": "S3 Bucket Misconfiguration", "description": "Marketing S3 bucket had public-read ACL for 2 hours.", "affected_records": 320000, "root_cause": "Terraform config drift."}, submitted_at=_ts(24), created_by_user_id=user.id),
    ]
    db.add_all(breaches)
    db.flush()

    # Audit log entries
    import hashlib as _hl
    audit_entries = []
    audit_data = [
        (AuditEventType.access,        AuditSeverity.info,     ADMIN_EMAIL, "admin",  "Admin login from 103.x.x.x"),
        (AuditEventType.consent,       AuditSeverity.info,     "visitor@example.com", "anonymous", "Cookie consent accepted"),
        (AuditEventType.access,        AuditSeverity.warning,  ADMIN_EMAIL, "admin",  "Exported 1200 user records"),
        (AuditEventType.configuration, AuditSeverity.info,     ADMIN_EMAIL, "admin",  "Retention policy updated"),
        (AuditEventType.breach,        AuditSeverity.critical, ADMIN_EMAIL, "admin",  "S3 bucket breach reported to DPB"),
    ]
    prev = "0" * 64
    for i, (et, sev, email, role, action) in enumerate(audit_data):
        entry_hash = _hl.sha256(f"{prev}{action}{i}".encode()).hexdigest()
        audit_entries.append(AuditLogEntry(
            organization_id=org.id, event_type=et, severity=sev,
            actor_email=email, actor_role=role, action=action, details=action,
            occurred_at=_ts(10 - i), prev_hash=prev, entry_hash=entry_hash,
        ))
        prev = entry_hash
    db.add_all(audit_entries)

    # Security controls
    controls = [
        SecurityControl(organization_id=org.id, control_key="encryption_at_rest", name="Encryption at Rest (AES-256)",       status="documented", items_total=3, items_completed=3, evidence_label="AWS KMS audit report"),
        SecurityControl(organization_id=org.id, control_key="access_control",     name="Role-Based Access Control (RBAC)",   status="documented", items_total=4, items_completed=4, evidence_label="IAM policy screenshot"),
        SecurityControl(organization_id=org.id, control_key="vuln_management",    name="Vulnerability Management",           status="partial",     items_total=3, items_completed=1, evidence_label=None),
        SecurityControl(organization_id=org.id, control_key="incident_response",  name="Incident Response Plan",             status="missing",     items_total=4, items_completed=0, evidence_label=None),
    ]
    db.add_all(controls)
    db.flush()
    print(f"  ✅ Seeded compliance: {len(breaches)} breaches, {len(audit_entries)} audit logs, {len(controls)} security controls")


# ──────────── Data Processor / Vendors ────────────
def seed_vendors(db, org):
    from app.models.data_processor import DataProcessor, DpaStatus

    if db.query(DataProcessor).filter(DataProcessor.organization_id == org.id).count() > 0:
        print("  ℹ️  Vendors exist — skip")
        return

    vendors = [
        DataProcessor(organization_id=org.id, name="AWS India",         purpose="Cloud infrastructure & storage", dpa_status=DpaStatus.signed, location="India",   risk_level="low",    contact_email="aws-india@aws.com",    last_audit_date=_ts(30)),
        DataProcessor(organization_id=org.id, name="Razorpay",          purpose="Payment gateway",                dpa_status=DpaStatus.signed, location="India",   risk_level="medium", contact_email="legal@razorpay.com",   last_audit_date=_ts(60)),
        DataProcessor(organization_id=org.id, name="SendGrid (Twilio)", purpose="Transactional email delivery",   dpa_status=DpaStatus.signed, location="USA",     risk_level="medium", contact_email="legal@twilio.com",     last_audit_date=_ts(90)),
        DataProcessor(organization_id=org.id, name="Freshdesk",         purpose="Customer support ticketing",     dpa_status=DpaStatus.under_review, location="India",  risk_level="low",    contact_email="dpo@freshworks.com"),
    ]
    db.add_all(vendors)
    db.flush()
    print(f"  ✅ Seeded {len(vendors)} data processors/vendors")


# ──────────── Integration Property, Banners, Containers ────────────
def seed_integrations(db, org):
    from app.models.integration_property import IntegrationProperty, PropertyStatus, PropertyType, PropertyEnvironment, BlockerMode
    from app.models.consent_banner import ConsentBanner
    from app.models.tag_manager import TagManagerContainer, ManagedTag
    from app.models.consent import Purpose

    if db.query(IntegrationProperty).filter(IntegrationProperty.organization_id == org.id).count() > 0:
        print("  ℹ️  Integration properties exist — skip")
        return

    prop = IntegrationProperty(
        organization_id=org.id, domain="www.zeroshield.ai",
        display_name="Corporate Website", property_type=PropertyType.website,
        environment=PropertyEnvironment.production, status=PropertyStatus.active,
        blocker_mode=BlockerMode.strict, auto_language=True, default_language="en",
    )
    db.add(prop)
    db.flush()

    banner = ConsentBanner(
        organization_id=org.id, name="Global Cookie Banner", version="v1.0", status="Live",
        deployed_on=[{"type": "website", "label": "Web"}], languages=1, purposes=3,
        description="Production cookie consent banner.", banner_purpose_type=["cookie"],
        display_style="banner", position="bottom", theme="#4F46E5", template="classic",
        heading="We Value Your Privacy",
        body_text="We use cookies to enhance your experience. You can manage your preferences below.",
        cta_accept="Accept All", cta_reject="Reject All", cta_customize="Customize",
        privacy_policy_url="https://www.zeroshield.ai/privacy",
        cookie_policy_url="https://www.zeroshield.ai/cookies",
        dpo_email="dpo@zeroshield.ai", show_language_switcher=True,
        properties=[str(prop.id)],
    )
    db.add(banner)
    db.flush()

    container = TagManagerContainer(
        organization_id=org.id, property_id=prop.id,
        provider="Google Tag Manager", container_name="Web GTM Container",
        container_identifier="GTM-ZS9876X", environment="production",
        status="active", auto_sync=True, consent_mode=True,
    )
    db.add(container)
    db.flush()

    purposes = db.query(Purpose).filter(Purpose.organization_id == org.id).all()
    pid = purposes[0].id if purposes else None

    tags = [
        ManagedTag(container_id=container.id, property_id=prop.id, provider="Google Tag Manager", purpose_id=pid, tag_name="Google Analytics 4",  trigger="All Pages", execution_type="External Script", script_url="https://www.googletagmanager.com/gtag/js?id=G-XXXXXX", status="active", priority=10),
        ManagedTag(container_id=container.id, property_id=prop.id, provider="Google Tag Manager", purpose_id=pid, tag_name="Meta Pixel",          trigger="Purchase Event", execution_type="Pixel", script_url="https://connect.facebook.net/en_US/fbevents.js", status="active", priority=20),
        ManagedTag(container_id=container.id, property_id=prop.id, provider="Google Tag Manager", purpose_id=None, tag_name="Intercom Chat",      trigger="Initialization", execution_type="Inline", inline_script="console.log('Intercom');", status="active", priority=5),
    ]
    db.add_all(tags)
    db.flush()
    print(f"  ✅ Seeded property, banner, GTM container, {len(tags)} tags")


# ──────────── Proof Vault ────────────
def seed_proof_vault(db, org, user):
    from app.models.proof_vault import ProofVaultRecord

    if db.query(ProofVaultRecord).filter(ProofVaultRecord.organization_id == org.id).count() > 0:
        print("  ℹ️  Proof vault exists — skip")
        return

    prev = "0" * 64
    records_data = [
        ("consent_collected",   "accept",   ["Marketing"], "banner"),
        ("dsar_completed",      "complete", [],            "portal"),
        ("notice_delivered",    "deliver",  [],            "email"),
        ("breach_notification", "notify",   [],            "system"),
    ]
    for i, (etype, action, purposes_list, source) in enumerate(records_data):
        curr = hashlib.sha256(f"{prev}{etype}{i}".encode()).hexdigest()
        leaf = hashlib.sha256(f"leaf{i}".encode()).hexdigest()
        db.add(ProofVaultRecord(
            organization_id=org.id, event_type=etype, action=action,
            purposes=", ".join(purposes_list), channel="web", source=source,
            block_number=i + 1, previous_hash=prev, current_hash=curr,
            merkle_leaf_hash=leaf, sealed=True, created_at=_ts(10 - i),
            sealed_at=_ts(10 - i), verification_status="verified",
        ))
        prev = curr
    db.flush()
    print(f"  ✅ Seeded {len(records_data)} proof vault records")


# ──────────── Policy Documents ────────────
def seed_policies(db, org, user):
    from app.models.policy import PolicyDocument, PolicyVersion

    if db.query(PolicyDocument).filter(PolicyDocument.organization_id == org.id).count() > 0:
        print("  ℹ️  Policies exist — skip")
        return

    docs = [
        ("Privacy Policy",             "privacy"),
        ("Data Retention Policy",       "retention"),
        ("Incident Response Plan",      "incident"),
        ("Acceptable Use Policy",       "aup"),
    ]

    for title, ptype in docs:
        doc = PolicyDocument(organization_id=org.id, title=title, policy_type=ptype)
        db.add(doc)
        db.flush()
        ver = PolicyVersion(
            policy_id=doc.id, version_number=1, status="live",
            content=f"# {title}\n\nThis document was auto-generated for the ZeroShield demo environment.",
            summary=f"Initial version of {title}.",
            published_at=_ts(30), published_by_user_id=user.id,
        )
        db.add(ver)
        db.flush()
        doc.current_live_version_id = ver.id
    db.flush()
    print(f"  ✅ Seeded {len(docs)} policy documents")


# ──────────── Masking Rules ────────────
def seed_masking(db, org):
    from app.models.masking import MaskingRule

    if db.query(MaskingRule).filter(MaskingRule.organization_id == org.id).count() > 0:
        print("  ℹ️  Masking rules exist — skip")
        return

    rules = [
        MaskingRule(organization_id=org.id, pii_category="aadhaar",      strategy="mask",   params={"mask_char": "X", "visible": 4}, enabled=True),
        MaskingRule(organization_id=org.id, pii_category="email",        strategy="mask",   params={"mask_char": "*", "visible": 3}, enabled=True),
        MaskingRule(organization_id=org.id, pii_category="phone",        strategy="redact", params={"mask_char": "X"}, enabled=True),
    ]
    db.add_all(rules)
    db.flush()
    print(f"  ✅ Seeded {len(rules)} masking rules")


# ──────────── Governance Dashboards ────────────
def seed_governance_dashboards(db, org, user):
    from app.models.governance_dashboard import GovernanceDashboard, GovernanceWidget

    if db.query(GovernanceDashboard).filter(GovernanceDashboard.organization_id == org.id).count() > 0:
        print("  ℹ️  Governance dashboards exist — skip")
        return

    dash = GovernanceDashboard(
        organization_id=org.id, name="DPDPA Compliance Overview",
        description="Real-time compliance posture dashboard for DPDPA.",
        owner_user_id=user.id, visibility="organization", slug="dpdpa-compliance-overview",
    )
    db.add(dash)
    db.flush()

    widgets = [
        GovernanceWidget(dashboard_id=dash.id, widget_type="compliance_card",   data_source="compliance_score", title="Overall Compliance Score",  sort_order=0, config_json={"target": 85}),
        GovernanceWidget(dashboard_id=dash.id, widget_type="kpi_card",          data_source="rights",           title="DSAR Request Tracker",      sort_order=1, config_json={}),
        GovernanceWidget(dashboard_id=dash.id, widget_type="incident_timeline", data_source="breach",           title="Breach Incident Timeline",  sort_order=2, config_json={}),
        GovernanceWidget(dashboard_id=dash.id, widget_type="donut_chart",       data_source="consent",          title="Consent Collection Rate",   sort_order=3, config_json={}),
    ]
    db.add_all(widgets)
    db.flush()
    print(f"  ✅ Seeded governance dashboard with {len(widgets)} widgets")


# ──────────── MASTER RUNNER ────────────
def main(email: str = None, password: str = None):
    global ADMIN_EMAIL, ADMIN_PASSWORD
    if email:
        ADMIN_EMAIL = email
    if password:
        ADMIN_PASSWORD = password

    print("=" * 60)
    print("🚀 ZeroShield Production Seed Script")
    print(f"   Admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print("=" * 60)

    db = SessionLocal()
    try:
        # 1. Org + User
        org, user = seed_org_and_user(db)
        db.commit()

        # 2. Data Sources
        sources = seed_data_sources(db, org)
        db.commit()
        # Refresh sources if they were already there
        if not sources:
            from app.models.data_source import DataSource
            sources = db.query(DataSource).filter(DataSource.organization_id == org.id).all()

        # 3. Data Inventory
        seed_data_inventory(db, org, sources)
        db.commit()

        # 4. PII Scanner
        seed_pii(db, org)
        db.commit()

        # 5. Retention
        seed_retention(db, org)
        db.commit()

        # 6. DSAR
        seed_dsar(db, org, user)
        db.commit()

        # 7. Anonymisation
        seed_anonymisation(db, org, user)
        db.commit()

        # 8. Child Data
        seed_child_data(db, org)
        db.commit()

        # 9. Compliance (breach, audit, security controls)
        seed_compliance(db, org, user)
        db.commit()

        # 10. Data Processors / Vendors
        seed_vendors(db, org)
        db.commit()

        # 11. Consent Demo (purposes + notice)
        print("  Seeding Consent Purposes & Notices...")
        from app.scripts.seed_consent_demo import seed_consent_demo
        try:
            seed_consent_demo()
        except Exception as e:
            print(f"  ⚠️  Consent seed: {e}")

        # 12. Integration Properties, Banners, Containers
        seed_integrations(db, org)
        db.commit()

        # 13. Notice Delivery Campaigns
        print("  Seeding Notice Campaigns...")
        from app.scripts.seed_notice_campaigns import seed_notice_campaigns
        try:
            seed_notice_campaigns()
        except Exception as e:
            print(f"  ⚠️  Notice campaigns seed: {e}")

        # 14. RoPA
        print("  Seeding RoPA...")
        from app.scripts.seed_ropa import seed_ropa
        try:
            seed_ropa()
        except Exception as e:
            print(f"  ⚠️  RoPA seed: {e}")

        # 15. CISO Command Center
        print("  Seeding CISO Command Center...")
        from app.scripts.seed_ciso import seed_ciso
        try:
            seed_ciso()
        except Exception as e:
            print(f"  ⚠️  CISO seed: {e}")

        # 16. DPIA Templates & Controls
        print("  Seeding DPIA Templates...")
        from app.scripts.seed_dpia import main as seed_dpia_main
        try:
            seed_dpia_main()
        except Exception as e:
            print(f"  ⚠️  DPIA seed: {e}")

        # 17. DPDP Obligations
        print("  Seeding DPDP Obligations...")
        from app.scripts.seed_dpdp_obligations import main as seed_dpdp_main
        try:
            seed_dpdp_main()
        except Exception as e:
            print(f"  ⚠️  DPDP obligations seed: {e}")

        # 18. Proof Vault
        seed_proof_vault(db, org, user)
        db.commit()

        # 19. Policy Documents
        seed_policies(db, org, user)
        db.commit()

        # 20. Masking Rules
        seed_masking(db, org)
        db.commit()

        # 21. Governance Dashboards
        seed_governance_dashboards(db, org, user)
        db.commit()

        # 22. Compliance Map (statute sections)
        print("  Seeding Compliance Map...")
        from app.scripts.seed_compliance_map import STATUTE_SECTIONS, DEFAULT_SECTION_FEATURES
        from app.models.compliance import DpdpaStatuteSection, DpdpaFeatureMapping, SectionCoverageStatus
        if db.query(DpdpaStatuteSection).count() == 0:
            for i, row in enumerate(STATUTE_SECTIONS):
                key, ch, ch_title, sec_num, title, feat_count, cov, penalty = row
                sect = DpdpaStatuteSection(
                    section_key=key, chapter=ch, chapter_title=ch_title,
                    section_number=sec_num, title=title,
                    feature_count=feat_count,
                    coverage_status=SectionCoverageStatus(cov),
                    penalty_crores=penalty, sort_order=i,
                )
                db.add(sect)
                db.flush()
                features = DEFAULT_SECTION_FEATURES.get(key, [])
                for j, (fname, froute) in enumerate(features):
                    db.add(DpdpaFeatureMapping(
                        section_id=sect.id, section_key=key,
                        name=fname, route=froute, sort_order=j,
                    ))
            db.commit()
            print(f"  ✅ Seeded {len(STATUTE_SECTIONS)} statute sections")
        else:
            print("  ℹ️  Compliance map exists — skip")

        print()
        print("=" * 60)
        print("✅ ALL SEEDING COMPLETED SUCCESSFULLY")
        print(f"   Login: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"\n❌ SEEDING FAILED: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
