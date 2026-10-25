"""Seed database with CISO Command Center frameworks, requirements, controls, and sample data."""

import uuid
from datetime import date, datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User
from app.models.ciso import (
    CisoFramework,
    CisoRequirement,
    CisoControl,
    CisoScoreSettings,
    CisoRisk,
    CisoRemediationTask,
    CisoEvidence,
    CisoException,
    CisoControlComment,
    CisoControlReview,
    CisoControlVersion,
    CisoActivity,
)
from app.models.compliance import BreachIncident, BreachIncidentStatus, AuditLogEntry, AuditEventType, AuditSeverity
from app.models.proof_vault import ProofVaultRecord
from app.models.data_processor import DataProcessor, DpaStatus
from app.models.dpia import Dpia
from app.models.ropa import ProcessingActivity, BusinessUnit

# Seed frameworks and requirements definitions
FRAMEWORKS_DATA = [
    {
        "code": "DPDPA",
        "name": "Digital Personal Data Protection Act (DPDPA 2023)",
        "description": "India's premier data privacy legislation detailing obligations for Data Fiduciaries and rights of Data Principals.",
        "requirements": [
            {"req_key": "DPDPA.Sec.5", "domain": "Notice", "title": "Section 5 - Notice for consent", "description": "Obtain consent after giving a notice detailing personal data processed and purpose."},
            {"req_key": "DPDPA.Sec.6", "domain": "Consent", "title": "Section 6 - Consent validation", "description": "Consent must be free, specific, informed, unconditional, and unambiguous."},
            {"req_key": "DPDPA.Sec.8.1", "domain": "Data Security", "title": "Section 8(1) - General Obligations", "description": "Ensure processing complies with the provisions of this Act."},
            {"req_key": "DPDPA.Sec.8.5", "domain": "Data Security", "title": "Section 8(5) - Safeguards", "description": "Protect personal data in its possession by taking reasonable security safeguards to prevent breach."},
            {"req_key": "DPDPA.Sec.9", "domain": "Children Data", "title": "Section 9 - Children's Personal Data", "description": "Obtain parental/guardian consent before processing personal data of children."},
            {"req_key": "DPDPA.Sec.11", "domain": "Rights Management", "title": "Section 11 - Right to access details", "description": "Allow Data Principals to access summary of data, identity of fiduciaries, etc."},
        ]
    },
    {
        "code": "ISO27001",
        "name": "ISO/IEC 27001:2022",
        "description": "International standard for Information Security Management Systems (ISMS).",
        "requirements": [
            {"req_key": "ISO.A.5.1", "domain": "Policies", "title": "A.5.1 - Policies for information security", "description": "Information security policy must be defined and approved by management."},
            {"req_key": "ISO.A.8.1", "domain": "Asset Management", "title": "A.8.1 - Inventory of assets", "description": "Maintain an inventory of assets associated with information and information processing facilities."},
            {"req_key": "ISO.A.9.1", "domain": "Access Control", "title": "A.9.1 - Access control policy", "description": "An access control policy must be established, documented, and reviewed."},
            {"req_key": "ISO.A.10.1", "domain": "Cryptography", "title": "A.10.1 - Policy on use of cryptographic controls", "description": "Establish a policy on the use of cryptographic controls for protection of information."},
            {"req_key": "ISO.A.12.1", "domain": "Operations Security", "title": "A.12.1 - Operational procedures and responsibilities", "description": "Document and maintain operational procedures."},
        ]
    },
    {
        "code": "CIS",
        "name": "CIS Critical Security Controls v8",
        "description": "Prioritized set of actions that collectively form a defense-in-depth set of best practices.",
        "requirements": [
            {"req_key": "CIS.1.1", "domain": "Asset Inventory", "title": "CIS 1.1 - Establish and Maintain Asset Inventory", "description": "Establish and maintain an accurate, detailed, and up-to-date inventory of all enterprise assets."},
            {"req_key": "CIS.3.1", "domain": "Data Protection", "title": "CIS 3.1 - Establish and Maintain Data Management Process", "description": "Establish and maintain a data management process, including data inventory, sensitivity, and retention."},
            {"req_key": "CIS.4.1", "domain": "Vulnerability Management", "title": "CIS 4.1 - Establish and Maintain Vulnerability Management", "description": "Establish and maintain a vulnerability management process for enterprise assets."},
            {"req_key": "CIS.6.1", "domain": "Access Control", "title": "CIS 6.1 - Establish and Maintain Access Control", "description": "Establish and maintain an access control process for administrative and user privileges."},
        ]
    },
    {
        "code": "NIST",
        "name": "NIST Cybersecurity Framework 2.0",
        "description": "Guidance to industry, government agencies, and organizations to manage cybersecurity risks.",
        "requirements": [
            {"req_key": "NIST.ID.AM-1", "domain": "Asset Management", "title": "NIST ID.AM-1 - Asset Inventory", "description": "Physical devices and systems within the organization are inventoried."},
            {"req_key": "NIST.PR.AC-1", "domain": "Access Control", "title": "NIST PR.AC-1 - Identity & Access Control", "description": "Identities and credentials are managed for authorized users, services, and assets."},
            {"req_key": "NIST.PR.DS-1", "domain": "Data Security", "title": "NIST PR.DS-1 - Data Protection at Rest/Transit", "description": "Data-at-rest and data-in-transit are protected using cryptography and secure protocols."},
            {"req_key": "NIST.DE.CM-1", "domain": "Monitoring", "title": "NIST DE.CM-1 - Continuous Monitoring", "description": "The network and physical environment are monitored to detect cybersecurity events."},
        ]
    }
]

# The 19 preset CIS Controls
CONTROLS_DATA = [
    {
        "control_key": "CIS-1",
        "title": "Inventory and Control of Enterprise Assets",
        "description": "Actively manage all enterprise assets (physical, virtual, and cloud) to ensure only authorized devices are given access.",
        "tech_explanation": "Scan VPC networks and internal subnets. Maintain a centralized CMDB synchronized with cloud endpoints.",
        "business_explanation": "Prevents rogue hardware from connecting to corporate infrastructure and stealing confidential data.",
        "why_required": "CIS Control 1.1 / ISO A.8.1 / NIST ID.AM-1",
        "penalty_if_absent": "Significant liability under DPDPA Section 8(5) if unauthorized devices compromise data platforms.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Asset Inventory", "Hardware", "Infrastructure"],
    },
    {
        "control_key": "CIS-2",
        "title": "Inventory and Control of Software Assets",
        "description": "Maintain an inventory of all authorized software to prevent unauthorized programs from running on enterprise assets.",
        "tech_explanation": "Enforce application whitelisting and MDM software configuration profiles. Run automated daily software scans.",
        "business_explanation": "Reduces malware threat vector by blocking unauthorized or unpatched software installations.",
        "why_required": "CIS Control 2.1 / ISO A.8.1 / NIST ID.AM-1",
        "penalty_if_absent": "Ransomware risks and direct DPDPA accountability for unpatched systems.",
        "category": "Technical",
        "maturity": "Managed",
        "tags": ["Software Inventory", "Applications", "Security"],
    },
    {
        "control_key": "CIS-3",
        "title": "Data Protection",
        "description": "Develop processes and technical controls to identify, classify, securely handle, retain, and dispose of data.",
        "tech_explanation": "Implement column-level database encryption, dynamic masking rules, and automated retention cleanup scripts.",
        "business_explanation": "Ensures personal data is handled appropriately based on its sensitivity, and deleted when no longer required.",
        "why_required": "CIS Control 3.1 / ISO A.10.1 / NIST PR.DS-1 / DPDPA Sec.8.5",
        "penalty_if_absent": "Up to ₹250 Crore for failing to secure storage of personal data.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Data Protection", "Encryption", "Privacy"],
    },
    {
        "control_key": "CIS-4",
        "title": "Secure Configuration of Enterprise Assets and Software",
        "description": "Establish and maintain the secure configuration of enterprise assets (servers, cloud, network devices, endpoints).",
        "tech_explanation": "Automate server configuration baselines using Terraform and Ansible. Enforce CIS benchmarks.",
        "business_explanation": "Hardens systems to close unnecessary ports, services, and default configurations.",
        "why_required": "CIS Control 4.1 / ISO A.12.1 / NIST PR.DS-1",
        "penalty_if_absent": "Vulnerability to automated exploits resulting in data leaks and penalties.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Hardening", "DevOps", "Infrastructure"],
    },
    {
        "control_key": "CIS-5",
        "title": "Account Management",
        "description": "Establish and maintain processes for control of administrative credentials and general user privileges.",
        "tech_explanation": "Centralize IAM via corporate SSO. Enforce strict password complexity and session timeouts.",
        "business_explanation": "Assures identity uniqueness and prevents credential recycling/abuse.",
        "why_required": "CIS Control 6.1 / ISO A.9.1 / NIST PR.AC-1",
        "penalty_if_absent": "Credential theft fines under general privacy obligations.",
        "category": "Administrative",
        "maturity": "Defined",
        "tags": ["Access Control", "IAM", "Users"],
    },
    {
        "control_key": "CIS-6",
        "title": "Access Control Management",
        "description": "Configure access control boundaries based on the principles of least privilege and need-to-know.",
        "tech_explanation": "Implement role-based access controls (RBAC) and MFA on all critical production access channels.",
        "business_explanation": "Ensures users only have permissions required to complete their business roles, minimizing internal breach blast radius.",
        "why_required": "CIS Control 6.1 / ISO A.9.1 / NIST PR.AC-1 / DPDPA Sec.8.5",
        "penalty_if_absent": "Up to ₹250 Crore for failing to prevent unauthorized internal data exposure.",
        "category": "Technical",
        "maturity": "Managed",
        "tags": ["Access Control", "SSO", "Security"],
    },
    {
        "control_key": "CIS-7",
        "title": "Continuous Vulnerability Management",
        "description": "Continuously assess and track vulnerabilities on all enterprise assets to minimize window of opportunity for attackers.",
        "tech_explanation": "Establish automated weekly vulnerability scanning using AWS Inspector and Dependabot.",
        "business_explanation": "Ensures code updates and infrastructure dependencies are scanned for known exploits.",
        "why_required": "CIS Control 4.1 / ISO A.12.1 / NIST DE.CM-1",
        "penalty_if_absent": "Significant liability for data breaches caused by unpatched public-facing vulnerabilities.",
        "category": "Technical",
        "maturity": "Repeatable",
        "tags": ["Vulnerabilities", "Monitoring", "Scanning"],
    },
    {
        "control_key": "CIS-8",
        "title": "Audit Log Management",
        "description": "Collect, alert, review, and retain audit logs of events that could help detect, understand, or recover from attacks.",
        "tech_explanation": "Enforce central, write-once immutable syslog streams to a secured cloud repository.",
        "business_explanation": "Guarantees that security events are recorded for audit compliance and incident investigations.",
        "why_required": "CIS Control 8.1 / ISO A.12.1 / NIST DE.CM-1",
        "penalty_if_absent": "Failing to document security incidents triggers compliance breach liability.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Logs", "Auditing", "Compliance"],
    },
    {
        "control_key": "CIS-9",
        "title": "Email and Web Browser Defenses",
        "description": "Improve email and web browser defenses to minimize the threat vector from web-based exploits.",
        "tech_explanation": "Enforce SPF, DKIM, and DMARC verification records. Implement content filtering on DNS gateways.",
        "business_explanation": "Protects employee mailboxes from spoofing, phishing, and drive-by web browser exploits.",
        "why_required": "CIS Control 9.1 / ISO A.12.1 / NIST PR.DS-1",
        "penalty_if_absent": "Fines if phishing leads to database compromises.",
        "category": "Technical",
        "maturity": "Initial",
        "tags": ["Email", "Browser", "Phishing"],
    },
    {
        "control_key": "CIS-10",
        "title": "Malware Defenses",
        "description": "Prevent or control the installation, spread, and execution of malicious applications on enterprise assets.",
        "tech_explanation": "Deploy endpoint detection and response (EDR) software. Scan container registries for malware.",
        "business_explanation": "Detects and neutralizes viruses and malicious code on endpoints and servers.",
        "why_required": "CIS Control 10.1 / ISO A.12.1 / NIST PR.DS-1",
        "penalty_if_absent": "System compromise leading to major breach penalties.",
        "category": "Technical",
        "maturity": "Managed",
        "tags": ["Malware", "Antivirus", "Security"],
    },
    {
        "control_key": "CIS-11",
        "title": "Data Recovery",
        "description": "Establish and maintain data recovery practices sufficient to restore corporate services and data integrity.",
        "tech_explanation": "Schedule daily database backups with encryption. Run quarterly recovery simulation tests.",
        "business_explanation": "Ensures business continuity and database restoration during system failures or ransomware incidents.",
        "why_required": "CIS Control 11.1 / ISO A.12.1 / NIST PR.DS-1 / DPDPA Sec.8.5",
        "penalty_if_absent": "Severe impact on data availability leads to regulatory notices.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Backups", "Disaster Recovery", "Business Continuity"],
    },
    {
        "control_key": "CIS-12",
        "title": "Network Infrastructure Management",
        "description": "Establish, implement, and actively manage network devices to prevent unauthorized traffic access.",
        "tech_explanation": "Enforce network zoning, stateful firewalls, and micro-segmentation inside AWS Security Groups.",
        "business_explanation": "Restricts external traffic only to authorized endpoints (e.g., HTTPS).",
        "why_required": "CIS Control 12.1 / ISO A.12.1 / NIST PR.DS-1",
        "penalty_if_absent": "Open database ports leading directly to public breaches.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Network", "Firewall", "Security"],
    },
    {
        "control_key": "CIS-13",
        "title": "Network Monitoring and Defense",
        "description": "Operate network monitoring tools to rapidly identify anomalies and defend against traffic-based threats.",
        "tech_explanation": "Deploy cloud VPC Flow Logs connected to SIEM analysis tools.",
        "business_explanation": "Detects intrusion attempts and suspicious data exfiltration attempts dynamically.",
        "why_required": "CIS Control 13.1 / ISO A.12.1 / NIST DE.CM-1",
        "penalty_if_absent": "Undetected data exfiltration compounding breach liability.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Monitoring", "SIEM", "Traffic"],
    },
    {
        "control_key": "CIS-14",
        "title": "Security Awareness and Skills Training",
        "description": "Conduct regular training campaigns to improve employee cybersecurity hygiene and data protection awareness.",
        "tech_explanation": "Establish onboarding security webinars and run mock phishing simulation exercises.",
        "business_explanation": "Harnesses human defense capabilities to recognize and report suspicious activity.",
        "why_required": "CIS Control 14.1 / ISO A.6.1 / NIST PR.AC-1 / DPDPA Sec.8.1",
        "penalty_if_absent": "Deductions on compliance readiness for lack of employee training.",
        "category": "Administrative",
        "maturity": "Repeatable",
        "tags": ["Training", "Awareness", "Employees"],
    },
    {
        "control_key": "CIS-15",
        "title": "Service Provider Management",
        "description": "Establish processes to evaluate service providers holding sensitive data and verify signed DPA agreements.",
        "tech_explanation": "Store signed Data Processing Addendums (DPAs) and track security postures of external processors.",
        "business_explanation": "Controls third-party risks and makes sure external contractors treat data in compliance with DPDPA rules.",
        "why_required": "CIS Control 15.1 / ISO A.5.1 / NIST PR.DS-1 / DPDPA Sec.8.1",
        "penalty_if_absent": "Up to ₹150 Crore for delegating processing obligations without valid DPAs.",
        "category": "Administrative",
        "maturity": "Defined",
        "tags": ["Vendors", "Contracts", "Third Party"],
    },
    {
        "control_key": "CIS-16",
        "title": "Application Software Security",
        "description": "Manage the security lifecycle of in-house developed and acquired software to prevent code vulnerabilities.",
        "tech_explanation": "Run automated static application security testing (SAST) on git commits and pull requests.",
        "business_explanation": "Prevents injection, cross-site scripting (XSS), and logic flaws from deploying to production code.",
        "why_required": "CIS Control 16.1 / ISO A.12.1 / NIST PR.DS-1",
        "penalty_if_absent": "Application layer breaches triggering major compliance notices.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Application Security", "SAST", "CI-CD"],
    },
    {
        "control_key": "CIS-17",
        "title": "Incident Response Management",
        "description": "Establish an incident response program (playbooks, roles, and workflows) to quickly contain and resolve breaches.",
        "tech_explanation": "Deploy an incident response wizard inside Vajra to guide CISO notifications and containment timelines.",
        "business_explanation": "Ensures the DPO initiates containment and notifies authorities within statutory timelines (e.g. 72 hours).",
        "why_required": "CIS Control 17.1 / ISO A.5.1 / NIST DE.CM-1 / DPDPA Sec.8.5",
        "penalty_if_absent": "Strict penalties for failure to notify data breaches under DPDPA rules.",
        "category": "Administrative",
        "maturity": "Managed",
        "tags": ["Incidents", "Incident Response", "Breach"],
    },
    {
        "control_key": "CIS-18",
        "title": "Penetration Testing",
        "description": "Conduct regular external and internal penetration tests to discover security flaws not found in scanner logs.",
        "tech_explanation": "Coordinate annual penetration testing with certified external security firms.",
        "business_explanation": "Provides adversarial simulation to verify the strength of defensive access boundaries.",
        "why_required": "CIS Control 18.1 / ISO A.12.1 / NIST DE.CM-1",
        "penalty_if_absent": "Significant audit score deductions for lack of validation testing.",
        "category": "Technical",
        "maturity": "Defined",
        "tags": ["Penetration Testing", "Audit", "Verification"],
    }
]

# Map requirements to controls (preset mapping rules)
MAPPING_RULES = {
    "CIS-1": ["CIS.1.1", "ISO.A.8.1", "NIST.ID.AM-1", "DPDPA.Sec.8.1"],
    "CIS-2": ["CIS.1.1", "ISO.A.8.1", "NIST.ID.AM-1", "DPDPA.Sec.8.1"],
    "CIS-3": ["CIS.3.1", "ISO.A.10.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-4": ["CIS.3.1", "ISO.A.12.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-5": ["CIS.6.1", "ISO.A.9.1", "NIST.PR.AC-1", "DPDPA.Sec.8.1"],
    "CIS-6": ["CIS.6.1", "ISO.A.9.1", "NIST.PR.AC-1", "DPDPA.Sec.8.5"],
    "CIS-7": ["CIS.4.1", "ISO.A.12.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-8": ["CIS.6.1", "ISO.A.12.1", "NIST.DE.CM-1", "DPDPA.Sec.8.5"],
    "CIS-9": ["CIS.4.1", "ISO.A.12.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-10": ["CIS.4.1", "ISO.A.12.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-11": ["CIS.3.1", "ISO.A.12.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-12": ["CIS.4.1", "ISO.A.12.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-13": ["CIS.4.1", "ISO.A.12.1", "NIST.DE.CM-1", "DPDPA.Sec.8.5"],
    "CIS-14": ["CIS.6.1", "ISO.A.5.1", "NIST.PR.AC-1", "DPDPA.Sec.8.1"],
    "CIS-15": ["CIS.3.1", "ISO.A.5.1", "NIST.PR.DS-1", "DPDPA.Sec.8.1"],
    "CIS-16": ["CIS.4.1", "ISO.A.12.1", "NIST.PR.DS-1", "DPDPA.Sec.8.5"],
    "CIS-17": ["CIS.6.1", "ISO.A.12.1", "NIST.DE.CM-1", "DPDPA.Sec.8.5"],
    "CIS-18": ["CIS.4.1", "ISO.A.12.1", "NIST.DE.CM-1", "DPDPA.Sec.8.5"],
}


def seed_ciso_for_single_org(db: Session, org_id: UUID) -> None:
    """Auto-seed framework requirements and the 19 preset CIS Controls for a specific organization."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        return

    user = (
        db.query(User)
        .filter(User.organization_id == org.id)
        .order_by(User.created_at)
        .first()
    )
    user_id = user.id if user else None

    # 1. Seed Frameworks and Requirements
    requirement_instances = {}
    for f_data in FRAMEWORKS_DATA:
        code = f_data["code"]
        framework = db.query(CisoFramework).filter(CisoFramework.code == code).first()
        if not framework:
            framework = CisoFramework(
                name=f_data["name"],
                code=code,
                description=f_data["description"]
            )
            db.add(framework)
            db.flush()

        for r_data in f_data["requirements"]:
            req_key = r_data["req_key"]
            req = (
                db.query(CisoRequirement)
                .filter(
                    CisoRequirement.framework_id == framework.id,
                    CisoRequirement.req_key == req_key
                )
                .first()
            )
            if not req:
                req = CisoRequirement(
                    framework_id=framework.id,
                    domain=r_data["domain"],
                    req_key=req_key,
                    title=r_data["title"],
                    description=r_data["description"]
                )
                db.add(req)
                db.flush()
            requirement_instances[req_key] = req

    # 2. Seed Score Settings
    score_settings = db.query(CisoScoreSettings).filter(CisoScoreSettings.organization_id == org.id).first()
    if not score_settings:
        score_settings = CisoScoreSettings(
            organization_id=org.id,
            controls_weight=0.30,
            evidence_weight=0.20,
            risks_weight=0.15,
            policies_weight=0.15,
            vendors_weight=0.10,
            incidents_weight=0.10,
            thresholds={"healthy": 80, "warning": 50}
        )
        db.add(score_settings)
        db.flush()

    # 3. Seed 19 Security Controls
    for c_data in CONTROLS_DATA:
        key = c_data["control_key"]
        control = (
            db.query(CisoControl)
            .filter(
                CisoControl.organization_id == org.id,
                CisoControl.control_key == key
            )
            .first()
        )

        if not control:
            control = CisoControl(
                organization_id=org.id,
                control_key=key,
                title=c_data["title"],
                description=c_data["description"],
                tech_explanation=c_data["tech_explanation"],
                business_explanation=c_data["business_explanation"],
                why_required=c_data["why_required"],
                penalty_if_absent=c_data["penalty_if_absent"],
                status="not_configured",
                priority="low",
                category=c_data["category"],
                maturity=c_data["maturity"],
                tags=c_data["tags"],
                owner_user_id=user_id,
            )
            db.add(control)
            db.flush()

            # Link requirements
            req_keys = MAPPING_RULES.get(key, [])
            for rk in req_keys:
                if rk in requirement_instances:
                    req_obj = requirement_instances[rk]
                    if req_obj not in control.requirements:
                        control.requirements.append(req_obj)
            db.flush()

    db.commit()


def seed_ciso() -> None:
    db = SessionLocal()
    try:
        print("Starting CISO Command Center seeding...")

        # Resolve organizations
        orgs = db.query(Organization).all()
        if not orgs:
            print("No active organization found to seed CISO data!")
            return

        for org in orgs:
            print(f"Seeding governance data for Organization: {org.name} ({org.id})")
            seed_ciso_for_single_org(db, org.id)

        print("CISO Command Center seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error during CISO seeding: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_ciso()

