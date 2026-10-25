"""Seed data for dpdp_obligation_definitions (also used by Alembic migration)."""

OBLIGATION_ROWS = [
    {
        "sort_order": 1,
        "obligation": "Issue consent notices",
        "df": "required",
        "dp": "no",
        "sdf": "required",
        "description": (
            "Organizations must issue clear and comprehensive consent notices to data "
            "principals before processing their personal data."
        ),
        "statute_reference": "DPDPA Section 6",
    },
    {
        "sort_order": 2,
        "obligation": "Process on lawful basis",
        "df": "required",
        "dp": "required",
        "sdf": "required",
        "description": (
            "All processing must be based on a lawful ground such as consent, "
            "legitimate use, or statutory obligation."
        ),
        "statute_reference": "DPDPA Section 7",
    },
    {
        "sort_order": 3,
        "obligation": "Honour data principal rights",
        "df": "required",
        "dp": "no",
        "sdf": "required",
        "description": (
            "Must respond to requests for access, correction, erasure, and data "
            "portability within prescribed timelines."
        ),
        "statute_reference": "DPDPA Sections 11-14",
    },
    {
        "sort_order": 4,
        "obligation": "Implement security safeguards",
        "df": "required",
        "dp": "required",
        "sdf": "required",
        "description": (
            "Technical and organizational measures to protect personal data from "
            "unauthorized access, disclosure, or breach."
        ),
        "statute_reference": "DPDPA Section 8",
    },
    {
        "sort_order": 5,
        "obligation": "72-hour DPB breach notification",
        "df": "required",
        "dp": "no",
        "sdf": "required",
        "description": (
            "Must notify the Data Protection Board within 72 hours of becoming "
            "aware of a personal data breach."
        ),
        "statute_reference": "DPDPA Section 8(6)",
    },
    {
        "sort_order": 6,
        "obligation": "Appoint Data Protection Officer",
        "df": "recommended",
        "dp": "no",
        "sdf": "mandatory",
        "description": (
            "Designated individual responsible for monitoring compliance with DPDPA "
            "and serving as point of contact."
        ),
        "statute_reference": "DPDPA Section 10(2)(a)",
    },
    {
        "sort_order": 7,
        "obligation": "Conduct DPIA",
        "df": "recommended",
        "dp": "no",
        "sdf": "mandatory-high-risk",
        "description": (
            "Data Protection Impact Assessment for high-risk processing activities "
            "to identify and mitigate privacy risks."
        ),
        "statute_reference": "DPDPA Section 10(2)(b)",
    },
    {
        "sort_order": 8,
        "obligation": "Independent data auditor",
        "df": "no",
        "dp": "no",
        "sdf": "mandatory",
        "description": (
            "Annual audit by an independent data auditor to assess compliance with "
            "DPDPA provisions."
        ),
        "statute_reference": "DPDPA Section 10(2)(c)",
    },
    {
        "sort_order": 9,
        "obligation": "Maintain RoPA",
        "df": "recommended",
        "dp": "recommended",
        "sdf": "mandatory",
        "description": (
            "Record of Processing Activities documenting all data processing "
            "operations, purposes, and retention periods."
        ),
        "statute_reference": "DPDPA Section 10(2)(d)",
    },
]


def main() -> None:
    from sqlalchemy.orm import Session

    from app.core.database import SessionLocal
    from app.models.dpdp_obligation_definition import DpdpObligationDefinition, RoleRequirement

    db: Session = SessionLocal()
    try:
        if db.query(DpdpObligationDefinition).count() > 0:
            print("Obligations already seeded; skipping.")
            return
        for row in OBLIGATION_ROWS:
            db.add(
                DpdpObligationDefinition(
                    sort_order=row["sort_order"],
                    obligation=row["obligation"],
                    description=row["description"],
                    statute_reference=row["statute_reference"],
                    df_requirement=RoleRequirement(row["df"]),
                    dp_requirement=RoleRequirement(row["dp"]),
                    sdf_requirement=RoleRequirement(row["sdf"]),
                )
            )
        db.commit()
        print(f"Seeded {len(OBLIGATION_ROWS)} obligation definitions.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
