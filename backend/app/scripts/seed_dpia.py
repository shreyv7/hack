from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.dpia import DpiaControlLibrary, DpiaTemplate


CONTROLS_SEED = [
    {
        "control_code": "CTRL-ENC-001",
        "title": "Encryption at Rest and in Transit",
        "description": "AES-256 field-level encryption for database columns storing sensitive keys, and TLS 1.2+ for network channels.",
        "control_type": "technical",
        "mitigation_weight": 0.35,
        "standards_mapping": {"ISO27001": "A.12.6.1", "DPDPA": "Sec 8(5)"}
    },
    {
        "control_code": "CTRL-MASK-001",
        "title": "Data Masking and Pseudonymization",
        "description": "Dynamic masking of customer identifiers in non-production environments and user-facing dashboards.",
        "control_type": "technical",
        "mitigation_weight": 0.25,
        "standards_mapping": {"ISO27001": "A.12.6.2", "DPDPA": "Sec 8(5)"}
    },
    {
        "control_code": "CTRL-RBAC-001",
        "title": "Role-Based Access Controls",
        "description": "Granular user permissions mapped through identity provider groups and audited quarterly.",
        "control_type": "organizational",
        "mitigation_weight": 0.20,
        "standards_mapping": {"ISO27001": "A.9.2.1", "DPDPA": "Sec 8(5)"}
    },
    {
        "control_code": "CTRL-CON-005",
        "title": "Verified Parental Consent Workflow",
        "description": "Age verification mechanics coupled with verified parent/guardian authorization sequences.",
        "control_type": "organizational",
        "mitigation_weight": 0.40,
        "standards_mapping": {"DPDPA": "Sec 9(1)"}
    },
    {
        "control_code": "CTRL-LEG-002",
        "title": "Standard Contractual Clauses (SCC)",
        "description": "Binding legal agreements restricting processing actions by external transfers and third parties.",
        "control_type": "legal",
        "mitigation_weight": 0.30,
        "standards_mapping": {"DPDPA": "Sec 10(4)"}
    },
    {
        "control_code": "CTRL-LOG-001",
        "title": "Access Logging & SIEM Monitoring",
        "description": "Immutable audit events captured centrally and connected to automated threat alerts.",
        "control_type": "technical",
        "mitigation_weight": 0.20,
        "standards_mapping": {"ISO27001": "A.12.4.1", "DPDPA": "Sec 8(5)"}
    }
]

TEMPLATE_SEED = {
    "key": "standard_v1",
    "name": "Standard Data Protection Impact Assessment (DPIA)",
    "schema_definition": {
        "steps": [
          {
            "key": "project",
            "title": "Project Description",
            "questions": [
              { "key": "activity_name", "label": "Processing Activity Name", "type": "text", "required": True },
              { "key": "business_purpose", "label": "Business Justification / Purpose", "type": "textarea", "required": True }
            ]
          },
          {
            "key": "processing",
            "title": "Processing Description",
            "questions": [
              { "key": "child_data", "label": "Processes data of minors under 18?", "type": "choice", "options": ["Yes", "No"], "required": True },
              { "key": "parental_consent_flow", "label": "If yes, is verified parental consent flow implemented?", "type": "choice", "options": ["Yes", "No", "N/A"], "required": False },
              { "key": "cross_border", "label": "Transfers data outside territorial boundaries of India?", "type": "choice", "options": ["Yes", "No"], "required": True },
              { "key": "ai_profiling", "label": "Employs algorithmic sorting/decisioning/predictive models?", "type": "choice", "options": ["Yes", "No"], "required": True },
              { "key": "volume", "label": "Data subject count range", "type": "choice", "options": ["<10k", "10k-100k", "100k-1m", "1m+"], "required": True },
              { "key": "retention", "label": "Data retention limits", "type": "choice", "options": ["Fixed duration", "Long term", "Indefinite"], "required": True },
              { "key": "sensitive_type", "label": "Processes sensitive categories (biometric, health, etc.)?", "type": "text", "required": False },
              { "key": "third_party_sharing", "label": "Shares data with external processors?", "type": "choice", "options": ["Yes", "No"], "required": True },
              { "key": "notice_delivery", "label": "How is Notice delivery handled?", "type": "textarea", "required": True },
              { "key": "consent_mechanism", "label": "Specify consent collection mechanism details", "type": "textarea", "required": True }
            ]
          }
        ]
    }
}


def main():
    db = SessionLocal()
    try:
        # Seed Control Library
        seeded_ctrls = 0
        for ctrl in CONTROLS_SEED:
            existing = db.query(DpiaControlLibrary).filter(DpiaControlLibrary.control_code == ctrl["control_code"]).first()
            if not existing:
                c = DpiaControlLibrary(
                    control_code=ctrl["control_code"],
                    title=ctrl["title"],
                    description=ctrl["description"],
                    control_type=ctrl["control_type"],
                    mitigation_weight=ctrl["mitigation_weight"],
                    standards_mapping=ctrl["standards_mapping"]
                )
                db.add(c)
                seeded_ctrls += 1
        
        # Seed Template
        seeded_temps = 0
        existing_temp = db.query(DpiaTemplate).filter(DpiaTemplate.key == TEMPLATE_SEED["key"]).first()
        if not existing_temp:
            t = DpiaTemplate(
                key=TEMPLATE_SEED["key"],
                name=TEMPLATE_SEED["name"],
                schema_definition=TEMPLATE_SEED["schema_definition"],
                is_active=True
            )
            db.add(t)
            seeded_temps += 1

        db.commit()
        print(f"Seeded {seeded_ctrls} control library definitions.")
        print(f"Seeded {seeded_temps} DPIA templates.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
