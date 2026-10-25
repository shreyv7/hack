"""Seed 200 verified DSAR requests across all six right types for SLA tracker UI testing.

Run:
    cd backend
    .venv\\Scripts\\python.exe -m app.scripts.seed_dsar_tracker_test

Optional:
    .venv\\Scripts\\python.exe -m app.scripts.seed_dsar_tracker_test --org-slug vajra-sandbox-org
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.models.dsar import (
    DataRightType,
    DataRightsRequest,
    DataRightsRequestStatus,
    VerificationStatus,
)
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import OrganizationSettings
from app.services.dsar_sla_config import load_dsar_sla_config

TOTAL = 200
TRACKING_PREFIX = "REQ-2026-TST-"

RIGHT_TYPES: list[DataRightType] = [
    DataRightType.access,
    DataRightType.correction,
    DataRightType.erasure,
    DataRightType.nomination,
    DataRightType.grievance,
    DataRightType.withdraw_consent,
]

QUEUE_STATUSES: list[DataRightsRequestStatus] = [
    DataRightsRequestStatus.received,
    DataRightsRequestStatus.in_review,
    DataRightsRequestStatus.response_ready,
    DataRightsRequestStatus.completed,
]

FIRST_NAMES = (
    "Ananya", "Rajesh", "Priya", "Vikram", "Kavya", "Arjun", "Meera", "Rohan",
    "Sneha", "Aditya", "Divya", "Karan", "Neha", "Suresh", "Pooja", "Amit",
    "Lakshmi", "Deepak", "Isha", "Manish",
)
LAST_NAMES = (
    "Sharma", "Kumar", "Patel", "Singh", "Reddy", "Nair", "Gupta", "Iyer",
    "Menon", "Das", "Verma", "Joshi", "Rao", "Pillai", "Chatterjee", "Bose",
)

REQUEST_DETAILS: dict[DataRightType, str] = {
    DataRightType.access: "Please provide a copy of all personal data you hold about me.",
    DataRightType.correction: "My contact details are incorrect and need to be updated.",
    DataRightType.erasure: "Please delete my personal data from your systems.",
    DataRightType.nomination: "I nominate a representative to exercise my data rights on my behalf.",
    DataRightType.grievance: "My previous data rights request was not handled correctly.",
    DataRightType.withdraw_consent: "I withdraw consent for processing of my personal data.",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def seed_dsar_tracker_test(*, org_slug: str | None = None) -> None:
    db = SessionLocal()
    try:
        q = db.query(Organization).filter(Organization.status == OrganizationStatus.active)
        if org_slug:
            q = q.filter(Organization.slug == org_slug)
        org = q.order_by(Organization.created_at).first()
        if org is None:
            print("No active organization found — abort")
            return

        existing_test = (
            db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == org.id,
                DataRightsRequest.tracking_id.like(f"{TRACKING_PREFIX}%"),
            )
            .count()
        )
        if existing_test >= TOTAL:
            print(f"Org {org.slug} already has {existing_test} test DSAR rows — skip")
            return

        settings = (
            db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org.id)
            .first()
        )
        sla = load_dsar_sla_config(settings)
        now = _utcnow()

        rows: list[DataRightsRequest] = []
        for i in range(TOTAL):
            seq = i + 1
            tracking_id = f"{TRACKING_PREFIX}{seq:04d}"
            if (
                db.query(DataRightsRequest.id)
                .filter(DataRightsRequest.tracking_id == tracking_id)
                .first()
            ):
                continue

            right_type = RIGHT_TYPES[i % len(RIGHT_TYPES)]
            status = QUEUE_STATUSES[i % len(QUEUE_STATUSES)]
            first = FIRST_NAMES[i % len(FIRST_NAMES)]
            last = LAST_NAMES[(i // len(FIRST_NAMES)) % len(LAST_NAMES)]
            received_at = now - timedelta(days=(i % 45) + 1, hours=i % 12)

            due_at = sla.response_due_at(right_type, received_at)
            ack_due_at = sla.grievance_ack_due_at(received_at) if right_type == DataRightType.grievance else None
            acknowledged_at = (
                received_at + timedelta(hours=2)
                if right_type == DataRightType.grievance and status != DataRightsRequestStatus.received
                else None
            )

            resolved_at = None
            closure_text = None
            if status == DataRightsRequestStatus.completed:
                resolved_at = min(now, received_at + timedelta(days=5 + (i % 10)))
                closure_text = "Your request has been completed in accordance with DPDPA 2023."

            rows.append(
                DataRightsRequest(
                    organization_id=org.id,
                    tracking_id=tracking_id,
                    right_type=right_type,
                    requester_name=f"{first} {last}",
                    requester_email=f"{first.lower()}.{last.lower()}{seq}@example.com",
                    requester_phone=f"+91{9800000000 + seq}",
                    request_details=REQUEST_DETAILS[right_type],
                    verification_status=VerificationStatus.verified,
                    status=status,
                    received_at=received_at,
                    due_at=due_at,
                    ack_due_at=ack_due_at,
                    acknowledged_at=acknowledged_at,
                    resolved_at=resolved_at,
                    closure_text=closure_text,
                )
            )

        db.add_all(rows)
        db.commit()

        counts: dict[str, int] = {rt.value: 0 for rt in RIGHT_TYPES}
        for row in rows:
            counts[row.right_type.value] += 1
        print(f"Seeded {len(rows)} DSAR test requests for org {org.slug}")
        for rt in RIGHT_TYPES:
            print(f"  {rt.value}: {counts[rt.value]}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed DSAR SLA tracker test data")
    parser.add_argument("--org-slug", default=None, help="Target organization slug")
    args = parser.parse_args()
    seed_dsar_tracker_test(org_slug=args.org_slug)


if __name__ == "__main__":
    main()
