"""Generate GTM custom template JSON for ZeroShield consent integration."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.consent import Purpose


class GtmTemplateService:
    def __init__(self, db: Session):
        self.db = db

    def generate_template(self, organization_id: UUID, property_id: UUID | None = None) -> dict:
        purposes = (
            self.db.query(Purpose)
            .filter(Purpose.organization_id == organization_id, Purpose.archived_at.is_(None))
            .order_by(Purpose.name.asc())
            .all()
        )
        if not purposes:
            purposes = [
                type("P", (), {"name": "Necessary", "id": None})(),
                type("P", (), {"name": "Analytics", "id": None})(),
                type("P", (), {"name": "Marketing", "id": None})(),
                type("P", (), {"name": "Functional", "id": None})(),
            ]

        purpose_vars = []
        for purpose in purposes:
            slug = purpose.name.lower().replace(" ", "_")
            purpose_vars.append(
                {
                    "name": f"ZeroShield - {purpose.name} Status",
                    "type": "variable",
                    "parameter": [
                        {"type": "template", "key": "purposeName", "value": purpose.name},
                    ],
                    "sandboxScript": (
                        "const getWindowProperty = require('getWindowProperty');\n"
                        "const purposeName = data.purposeName;\n"
                        "const zeroShield = getWindowProperty('ZeroShield');\n"
                        f"if (zeroShield && zeroShield.consent && zeroShield.consent[purposeName] === true) {{\n"
                        "  return true;\n"
                        "}\n"
                        "return false;"
                    ),
                    "slug": f"zeroshield_{slug}_status",
                }
            )

        return {
            "exportFormatVersion": 2,
            "exportTime": "2026-06-30T00:00:00.000Z",
            "containerVersion": {
                "path": "accounts/0/containers/0/versions/0",
                "accountId": "0",
                "containerId": "0",
                "name": "ZeroShield DPDPA Consent Integration",
                "description": (
                    "Auto-generated ZeroShield consent variables and triggers. "
                    "Import into GTM and map to your tag firing conditions."
                ),
                "fingerprint": "zeroshield-dpdpa",
                "tag": [],
                "trigger": [
                    {
                        "name": "ZeroShield - Consent Init",
                        "type": "customEvent",
                        "customEventFilter": [
                            {
                                "type": "equals",
                                "parameter": [
                                    {"type": "template", "key": "arg0", "value": "{{_event}}"},
                                    {"type": "template", "key": "arg1", "value": "zeroshield_consent_init"},
                                ],
                            }
                        ],
                    },
                    {
                        "name": "ZeroShield - Consent Update",
                        "type": "customEvent",
                        "customEventFilter": [
                            {
                                "type": "equals",
                                "parameter": [
                                    {"type": "template", "key": "arg0", "value": "{{_event}}"},
                                    {"type": "template", "key": "arg1", "value": "zeroshield_consent_update"},
                                ],
                            }
                        ],
                    },
                ],
                "variable": purpose_vars,
                "builtInVariable": [],
            },
            "metadata": {
                "property_id": str(property_id) if property_id else None,
                "organization_id": str(organization_id),
                "purpose_count": len(purpose_vars),
                "datalayer_events": ["zeroshield_consent_init", "zeroshield_consent_update"],
            },
        }
