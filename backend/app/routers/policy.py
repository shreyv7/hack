from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.policy import (
    PolicyCreate,
    PolicyDetailRead,
    PolicySummaryRead,
    PolicyUpdate,
    PolicyVersionCreate,
    PolicyVersionRead,
    PolicyVersionUpdate,
    AcknowledgementSummaryRead,
    PolicyActivityRead,
    PolicyStatsRead,
    SendReminderRequest,
    PolicyGenerateFromRopaRequest,
    PolicyGenerateFromRopaResponse,
)
from app.services.policy_service import PolicyService
from app.services.policy_ai_service import PolicyAiService

router = APIRouter(prefix="/policy", tags=["policy"])


@router.get("/stats", response_model=PolicyStatsRead)
def get_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyStatsRead:
    return PolicyService(db).get_stats(current_user, org_id=org_id)


@router.get("/policies", response_model=list[PolicySummaryRead])
def list_policies(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    include_archived: bool = Query(default=False),
) -> list[PolicySummaryRead]:
    return PolicyService(db).list_policies(
        current_user, org_id=org_id, include_archived=include_archived
    )


@router.post(
    "/policies",
    response_model=PolicyDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_policy(
    body: PolicyCreate,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyDetailRead:
    return PolicyService(db).create_policy(current_user, body, org_id=org_id)


@router.get("/policies/{policy_id}", response_model=PolicyDetailRead)
def get_policy(
    policy_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyDetailRead:
    return PolicyService(db).get_policy(current_user, policy_id, org_id=org_id)


@router.patch("/policies/{policy_id}", response_model=PolicyDetailRead)
def update_policy(
    policy_id: UUID,
    body: PolicyUpdate,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyDetailRead:
    return PolicyService(db).update_policy(
        current_user, policy_id, body, org_id=org_id
    )


@router.post("/policies/{policy_id}/archive", response_model=PolicyDetailRead)
def archive_policy(
    policy_id: UUID,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyDetailRead:
    return PolicyService(db).archive_policy(current_user, policy_id, org_id=org_id)


@router.post("/policies/{policy_id}/unarchive", response_model=PolicyDetailRead)
def unarchive_policy(
    policy_id: UUID,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyDetailRead:
    return PolicyService(db).unarchive_policy(
        current_user, policy_id, org_id=org_id
    )


@router.post(
    "/policies/{policy_id}/versions",
    response_model=PolicyVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_new_version(
    policy_id: UUID,
    body: PolicyVersionCreate,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyVersionRead:
    return PolicyService(db).create_new_version(
        current_user, policy_id, body, org_id=org_id
    )


@router.patch(
    "/policies/{policy_id}/versions/{version_id}",
    response_model=PolicyVersionRead,
)
def update_version(
    policy_id: UUID,
    version_id: UUID,
    body: PolicyVersionUpdate,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyVersionRead:
    return PolicyService(db).update_version(
        current_user, policy_id, version_id, body, org_id=org_id
    )


@router.get(
    "/policies/{policy_id}/versions/{version_id}",
    response_model=PolicyVersionRead,
)
def get_version(
    policy_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyVersionRead:
    return PolicyService(db).get_version(
        current_user, policy_id, version_id, org_id=org_id
    )


@router.post(
    "/policies/{policy_id}/versions/{version_id}/submit-review",
    response_model=PolicyVersionRead,
)
def submit_for_review(
    policy_id: UUID,
    version_id: UUID,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyVersionRead:
    return PolicyService(db).submit_for_review(
        current_user, policy_id, version_id, org_id=org_id
    )


@router.post(
    "/policies/{policy_id}/versions/{version_id}/approve",
    response_model=PolicyVersionRead,
)
def approve_version(
    policy_id: UUID,
    version_id: UUID,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyVersionRead:
    return PolicyService(db).approve_version(
        current_user, policy_id, version_id, org_id=org_id
    )


@router.post(
    "/policies/{policy_id}/versions/{version_id}/publish",
    response_model=PolicyVersionRead,
)
def publish_version(
    policy_id: UUID,
    version_id: UUID,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyVersionRead:
    return PolicyService(db).publish_version(
        current_user, policy_id, version_id, org_id=org_id
    )


@router.get("/acknowledgements", response_model=list[AcknowledgementSummaryRead])
def list_acknowledgements(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[AcknowledgementSummaryRead]:
    return PolicyService(db).get_acknowledgement_summary(current_user, org_id=org_id)


@router.post("/acknowledgements/send-reminder")
def send_reminder(
    body: SendReminderRequest,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    return PolicyService(db).send_reminders(
        current_user,
        policy_id=body.policy_id,
        version_id=body.version_id,
        channel=body.channel,
        org_id=org_id,
    )


@router.get("/activities", response_model=list[PolicyActivityRead])
def list_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[PolicyActivityRead]:
    return PolicyService(db).list_activities(current_user, org_id=org_id)


@router.post(
    "/generate-from-ropa",
    response_model=PolicyGenerateFromRopaResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_policy_from_ropa(
    body: PolicyGenerateFromRopaRequest,
    current_user: Annotated[
        User, Depends(require_role(UserRole.admin, UserRole.superadmin))
    ],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyGenerateFromRopaResponse:
    detail, meta = PolicyAiService(db).generate_from_ropa(
        current_user,
        org_id=org_id,
        policy_type=body.policy_type,
    )
    return PolicyGenerateFromRopaResponse(
        policy=detail,
        source=meta.get("source", "rule_based"),
        model_id=meta.get("model_id"),
        is_new_policy=meta.get("is_new_policy", True),
    )
