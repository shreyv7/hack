import re
from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from app.models.ropa import (
    BusinessUnit,
    Department,
    Team,
    ProcessingActivity,
    ActivityVersion,
    ActivityOwner,
    ActivityPurpose,
    ActivityDataCategory,
    ActivityDataPrincipal,
    ActivityLawfulBasis,
    ActivitySystem,
    ActivityRecipient,
    ActivityCrossBorderTransfer,
    ActivityRetentionPolicy,
    ActivityDataSource,
    ActivitySecurityMeasure,
    ActivityDpiaLink,
    ActivityApproval,
    ActivityEvent,
    RopaDiscoverySuggestion,
)
from app.models.user import User
from app.models.consent import Purpose, ConsentNotice, ConsentNoticeVersion, PurposeVersion
from app.models.dpia import Dpia
from app.models.retention import RetentionPolicy
from app.models.data_source import DataSource
from app.models.integration_property import IntegrationProperty
from app.models.organization_settings import OrganizationSettings
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
    ActivityDataSourceCreate,
    RopaBankingContext,
    RopaDashboardKPIs,
    RopaBankingPresetsRead,
    CreateDpiaFromActivityRead,
)
from app.services.compliance_base import ComplianceBaseService
from app.utils.industry_packs import (
    default_banking_consent_config,
    default_ropa_banking_presets,
    ensure_banking_config,
    is_banking_industry,
    validate_ropa_banking_context,
)


class RopaService(ComplianceBaseService):
    def __init__(self, db: Session):
        super().__init__(db)

    def _is_banking_org(self, org_id: UUID) -> bool:
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        return bool(settings and is_banking_industry(settings.primary_industry))

    def _banking_config_for_org(self, org_id: UUID) -> dict | None:
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        if not settings or not is_banking_industry(settings.primary_industry):
            return None
        return ensure_banking_config(settings.primary_industry, settings.consent_industry_config)

    def _validate_banking_context_for_org(
        self, org_id: UUID, banking_context: RopaBankingContext | dict | None
    ) -> dict | None:
        if banking_context is None:
            return None
        if not self._is_banking_org(org_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="banking_context is only allowed for banking organizations",
            )
        ctx = banking_context.model_dump() if isinstance(banking_context, RopaBankingContext) else dict(banking_context)
        validate_ropa_banking_context(ctx, self._banking_config_for_org(org_id))
        return ctx

    def _verify_property_ids(self, org_id: UUID, property_ids: list[UUID]) -> None:
        if not property_ids:
            return
        found = (
            self.db.query(IntegrationProperty.id)
            .filter(
                IntegrationProperty.organization_id == org_id,
                IntegrationProperty.id.in_(property_ids),
            )
            .all()
        )
        if len(found) != len(set(property_ids)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration property not found")

    def _verify_data_source_ids(self, org_id: UUID, data_source_ids: list[UUID]) -> None:
        if not data_source_ids:
            return
        found = (
            self.db.query(DataSource.id)
            .filter(
                DataSource.organization_id == org_id,
                DataSource.id.in_(data_source_ids),
            )
            .all()
        )
        if len(found) != len(set(data_source_ids)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")

    def _verify_retention_policy_ids(self, org_id: UUID, policy_ids: list[UUID]) -> None:
        if not policy_ids:
            return
        found = (
            self.db.query(RetentionPolicy.id)
            .filter(
                RetentionPolicy.organization_id == org_id,
                RetentionPolicy.id.in_(policy_ids),
            )
            .all()
        )
        if len(found) != len(set(policy_ids)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retention policy not found")

    def get_banking_presets(self, user: User, org_id: UUID | None = None) -> RopaBankingPresetsRead:
        resolved_org_id = self._resolve_org_id(user, org_id)
        if not self._is_banking_org(resolved_org_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banking pack not enabled")
        cfg = self._banking_config_for_org(resolved_org_id) or default_banking_consent_config()
        return RopaBankingPresetsRead(
            presets=default_ropa_banking_presets(),
            identifier_types=cfg.get("identifier_types", []),
            journeys=cfg.get("journeys", []),
        )

    def _format_retention_period(self, policy: RetentionPolicy) -> str:
        unit = policy.period_unit.value if hasattr(policy.period_unit, "value") else str(policy.period_unit)
        return f"{policy.period_value} {unit}"

    def _denormalize_retention_row(self, row: ActivityRetentionPolicy) -> dict[str, str | None]:
        linked = row.retention_policy
        if not linked:
            return {
                "linked_policy_name": None,
                "effective_retention_period": row.retention_period,
                "effective_trigger_event": row.trigger_event,
                "effective_legal_basis": row.legal_basis,
            }
        trigger = linked.trigger_event.value if hasattr(linked.trigger_event, "value") else str(linked.trigger_event)
        return {
            "linked_policy_name": linked.name,
            "effective_retention_period": self._format_retention_period(linked),
            "effective_trigger_event": trigger,
            "effective_legal_basis": linked.legal_basis or row.legal_basis,
        }

    def get_linked_consent_notices(self, org_id: UUID, purpose_ids: list[UUID]) -> list[dict]:
        if not purpose_ids:
            return []
        notices: list[dict] = []
        seen: set[tuple] = set()
        versions = (
            self.db.query(ConsentNoticeVersion)
            .join(ConsentNoticeVersion.purposes)
            .join(ConsentNotice, ConsentNoticeVersion.notice_id == ConsentNotice.id)
            .filter(
                ConsentNotice.organization_id == org_id,
                PurposeVersion.purpose_id.in_(purpose_ids),
            )
            .all()
        )
        for version in versions:
            key = (version.notice_id, version.id)
            if key in seen:
                continue
            seen.add(key)
            purpose_names = [
                pv.name for pv in version.purposes if pv.purpose_id in purpose_ids
            ]
            notices.append(
                {
                    "notice_id": version.notice_id,
                    "notice_name": version.notice.internal_name if version.notice else "Consent Notice",
                    "version_id": version.id,
                    "version_status": version.status.value if hasattr(version.status, "value") else str(version.status),
                    "purpose_names": purpose_names,
                }
            )
        return notices

    # --- Hierarchy Operations ---

    def create_business_unit(self, user: User, payload: BusinessUnitCreate, org_id: UUID | None = None) -> BusinessUnit:
        resolved_org_id = self._resolve_org_id(user, org_id)
        
        # Check uniqueness
        existing = self.db.query(BusinessUnit).filter(
            BusinessUnit.organization_id == resolved_org_id,
            BusinessUnit.name == payload.name
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Business Unit with this name already exists")

        bu = BusinessUnit(
            organization_id=resolved_org_id,
            name=payload.name,
            code=payload.code,
            head_user_id=payload.head_user_id
        )
        self.db.add(bu)
        self.db.commit()
        self.db.refresh(bu)
        return bu

    def list_business_units(self, user: User, org_id: UUID | None = None) -> list[BusinessUnit]:
        resolved_org_id = self._resolve_org_id(user, org_id)
        return self.db.query(BusinessUnit).filter(
            BusinessUnit.organization_id == resolved_org_id
        ).all()

    def create_department(self, user: User, payload: DepartmentCreate, org_id: UUID | None = None) -> Department:
        resolved_org_id = self._resolve_org_id(user, org_id)
        
        # Verify Business Unit
        bu = self.db.query(BusinessUnit).filter(
            BusinessUnit.id == payload.business_unit_id,
            BusinessUnit.organization_id == resolved_org_id
        ).first()
        if not bu:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business Unit not found")

        # Check uniqueness
        existing = self.db.query(Department).filter(
            Department.organization_id == resolved_org_id,
            Department.name == payload.name
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department with this name already exists")

        dept = Department(
            business_unit_id=payload.business_unit_id,
            organization_id=resolved_org_id,
            name=payload.name,
            code=payload.code,
            head_user_id=payload.head_user_id
        )
        self.db.add(dept)
        self.db.commit()
        self.db.refresh(dept)
        return dept

    def list_departments(self, user: User, org_id: UUID | None = None) -> list[Department]:
        resolved_org_id = self._resolve_org_id(user, org_id)
        return self.db.query(Department).filter(
            Department.organization_id == resolved_org_id
        ).all()

    def create_team(self, user: User, payload: TeamCreate, org_id: UUID | None = None) -> Team:
        resolved_org_id = self._resolve_org_id(user, org_id)
        
        # Verify Department
        dept = self.db.query(Department).filter(
            Department.id == payload.department_id,
            Department.organization_id == resolved_org_id
        ).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

        # Check uniqueness
        existing = self.db.query(Team).filter(
            Team.organization_id == resolved_org_id,
            Team.name == payload.name
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team with this name already exists")

        team = Team(
            department_id=payload.department_id,
            organization_id=resolved_org_id,
            name=payload.name,
            code=payload.code,
            head_user_id=payload.head_user_id
        )
        self.db.add(team)
        self.db.commit()
        self.db.refresh(team)
        return team

    def list_teams(self, user: User, org_id: UUID | None = None) -> list[Team]:
        resolved_org_id = self._resolve_org_id(user, org_id)
        return self.db.query(Team).filter(
            Team.organization_id == resolved_org_id
        ).all()

    # --- Processing Activity CRUD ---

    def _generate_next_ref(self, org_id: UUID) -> str:
        refs = self.db.query(ProcessingActivity.activity_ref).filter(
            ProcessingActivity.organization_id == org_id,
            ProcessingActivity.activity_ref.like("ZS-ROPA-%")
        ).all()
        max_num = 0
        for r in refs:
            match = re.search(r"ZS-ROPA-(\d+)", r[0])
            if match:
                max_num = max(max_num, int(match.group(1)))
        return f"ZS-ROPA-{(max_num + 1):05d}"

    def create_activity(self, user: User, payload: ProcessingActivityCreate, org_id: UUID | None = None) -> ProcessingActivity:
        resolved_org_id = self._resolve_org_id(user, org_id)

        # Verify organizational hierarchy links
        bu = self.db.query(BusinessUnit).filter(
            BusinessUnit.id == payload.business_unit_id,
            BusinessUnit.organization_id == resolved_org_id
        ).first()
        if not bu:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business Unit not found")

        if payload.department_id:
            dept = self.db.query(Department).filter(
                Department.id == payload.department_id,
                Department.organization_id == resolved_org_id
            ).first()
            if not dept:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

        if payload.team_id:
            team = self.db.query(Team).filter(
                Team.id == payload.team_id,
                Team.organization_id == resolved_org_id
            ).first()
            if not team:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

        ref = self._generate_next_ref(resolved_org_id)

        banking_ctx = self._validate_banking_context_for_org(resolved_org_id, payload.banking_context)

        property_ids = [s.property_id for s in payload.systems if s.property_id]
        self._verify_property_ids(resolved_org_id, property_ids)
        data_source_ids = [ds.data_source_id for ds in payload.data_sources]
        self._verify_data_source_ids(resolved_org_id, data_source_ids)
        retention_ids = [rp.retention_policy_id for rp in payload.retention_policies if rp.retention_policy_id]
        self._verify_retention_policy_ids(resolved_org_id, retention_ids)

        activity = ProcessingActivity(
            organization_id=resolved_org_id,
            activity_ref=ref,
            title=payload.title,
            description=payload.description,
            status="draft",
            risk_score=0,
            risk_level="low",
            business_unit_id=payload.business_unit_id,
            department_id=payload.department_id,
            team_id=payload.team_id,
            banking_context=banking_ctx,
        )
        self.db.add(activity)
        self.db.flush()

        # Add owners
        for owner in payload.owners:
            self.db.add(ActivityOwner(activity_id=activity.id, user_id=owner.user_id, owner_role=owner.owner_role))

        # Add purposes
        for sort_idx, p_id in enumerate(payload.purposes):
            self.db.add(ActivityPurpose(activity_id=activity.id, purpose_id=p_id, sort_order=sort_idx))

        # Add data categories
        for cat in payload.data_categories:
            self.db.add(ActivityDataCategory(
                activity_id=activity.id,
                category_name=cat.category_name,
                is_special=cat.is_special,
                sensitivity=cat.sensitivity
            ))

        # Add data principals
        for princ in payload.data_principals:
            self.db.add(ActivityDataPrincipal(
                activity_id=activity.id,
                category_name=princ.category_name,
                description=princ.description,
                includes_children=princ.includes_children
            ))

        # Add lawful bases
        for lb in payload.lawful_bases:
            self.db.add(ActivityLawfulBasis(
                activity_id=activity.id,
                basis_type=lb.basis_type,
                justification=lb.justification,
                dpdpa_section=lb.dpdpa_section,
                lia_documented=lb.lia_documented,
                lia_summary=lb.lia_summary,
                lia_last_reviewed_at=lb.lia_last_reviewed_at
            ))

        # Add systems
        for sys in payload.systems:
            self.db.add(ActivitySystem(
                activity_id=activity.id,
                system_name=sys.system_name,
                system_type=sys.system_type,
                location=sys.location,
                description=sys.description,
                property_id=sys.property_id,
                channel=sys.channel,
            ))

        # Add recipients
        for rec in payload.recipients:
            self.db.add(ActivityRecipient(
                activity_id=activity.id,
                recipient_type=rec.recipient_type,
                name=rec.name,
                data_shared=rec.data_shared,
                data_processor_id=rec.data_processor_id
            ))

        # Add cross-border transfers
        for cb in payload.cross_border_transfers:
            self.db.add(ActivityCrossBorderTransfer(
                activity_id=activity.id,
                destination_country=cb.destination_country,
                destination_entity=cb.destination_entity,
                adequacy_status=cb.adequacy_status,
                safeguard_mechanism=cb.safeguard_mechanism,
                legal_basis=cb.legal_basis
            ))

        # Add retention policies
        for ret in payload.retention_policies:
            self.db.add(ActivityRetentionPolicy(
                activity_id=activity.id,
                retention_period=ret.retention_period,
                trigger_event=ret.trigger_event,
                legal_basis=ret.legal_basis,
                auto_delete=ret.auto_delete,
                retention_policy_id=ret.retention_policy_id,
            ))

        # Add data source links
        for ds in payload.data_sources:
            self.db.add(ActivityDataSource(
                activity_id=activity.id,
                data_source_id=ds.data_source_id,
                role=ds.role,
                notes=ds.notes,
            ))

        # Add security measures
        for sec in payload.security_measures:
            self.db.add(ActivitySecurityMeasure(
                activity_id=activity.id,
                measure_type=sec.measure_type,
                description=sec.description,
                status=sec.status
            ))

        self.db.flush()

        # Create Version 1 snapshot
        snapshot = self._create_snapshot_dict(activity)
        version = ActivityVersion(
            activity_id=activity.id,
            version_number=1,
            status="draft",
            snapshot_json=snapshot,
            changelog="Initial creation",
            created_by_id=user.id
        )
        self.db.add(version)
        self.db.flush()

        activity.current_version_id = version.id
        
        # Calculate risk score initially
        self._recalculate_risk(activity, actor_id=user.id)

        self.db.commit()
        self.db.refresh(activity)
        return activity

    def get_activity(self, user: User, activity_id: UUID, org_id: UUID | None = None) -> ProcessingActivity:
        resolved_org_id = self._resolve_org_id(user, org_id)
        activity = (
            self.db.query(ProcessingActivity)
            .filter(
                ProcessingActivity.id == activity_id,
                ProcessingActivity.organization_id == resolved_org_id,
                ProcessingActivity.is_deleted == False
            )
            .options(
                joinedload(ProcessingActivity.versions),
                joinedload(ProcessingActivity.owners).joinedload(ActivityOwner.user),
                joinedload(ProcessingActivity.purposes).joinedload(ActivityPurpose.purpose),
                joinedload(ProcessingActivity.data_categories),
                joinedload(ProcessingActivity.data_principals),
                joinedload(ProcessingActivity.lawful_bases),
                joinedload(ProcessingActivity.systems).joinedload(ActivitySystem.property),
                joinedload(ProcessingActivity.recipients).joinedload(ActivityRecipient.data_processor),
                joinedload(ProcessingActivity.cross_border_transfers),
                joinedload(ProcessingActivity.retention_policies).joinedload(ActivityRetentionPolicy.retention_policy),
                joinedload(ProcessingActivity.data_sources).joinedload(ActivityDataSource.data_source),
                joinedload(ProcessingActivity.security_measures),
                joinedload(ProcessingActivity.dpia_links).joinedload(ActivityDpiaLink.dpia),
                joinedload(ProcessingActivity.approvals).joinedload(ActivityApproval.approver),
            )
            .first()
        )
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")
        return activity

    def list_activities(
        self,
        user: User,
        org_id: UUID | None = None,
        search: str | None = None,
        department_id: UUID | None = None,
        owner_id: UUID | None = None,
        status_filter: str | None = None,
        risk_level: str | None = None,
        destination_country: str | None = None,
        purpose_id: UUID | None = None,
        vendor_id: UUID | None = None,
        lawful_basis: str | None = None,
        retention_period: str | None = None,
        system_name: str | None = None,
    ) -> list[ProcessingActivity]:
        resolved_org_id = self._resolve_org_id(user, org_id)

        query = self.db.query(ProcessingActivity).filter(
            ProcessingActivity.organization_id == resolved_org_id,
            ProcessingActivity.is_deleted == False
        )

        if search:
            query = query.filter(
                or_(
                    ProcessingActivity.title.ilike(f"%{search}%"),
                    ProcessingActivity.description.ilike(f"%{search}%"),
                    ProcessingActivity.activity_ref.ilike(f"%{search}%")
                )
            )

        if department_id:
            query = query.filter(ProcessingActivity.department_id == department_id)

        if owner_id:
            query = query.join(ActivityOwner).filter(ActivityOwner.user_id == owner_id)

        if status_filter:
            query = query.filter(ProcessingActivity.status == status_filter)

        if risk_level:
            query = query.filter(ProcessingActivity.risk_level == risk_level)

        if destination_country:
            query = query.join(ActivityCrossBorderTransfer).filter(
                ActivityCrossBorderTransfer.destination_country.ilike(f"%{destination_country}%")
            )

        if purpose_id:
            query = query.join(ActivityPurpose).filter(ActivityPurpose.purpose_id == purpose_id)

        if vendor_id:
            query = query.join(ActivityRecipient).filter(
                ActivityRecipient.data_processor_id == vendor_id
            )

        if lawful_basis:
            query = query.join(ActivityLawfulBasis).filter(
                ActivityLawfulBasis.basis_type == lawful_basis
            )

        if retention_period:
            query = query.join(ActivityRetentionPolicy).filter(
                ActivityRetentionPolicy.retention_period.ilike(f"%{retention_period}%")
            )

        if system_name:
            query = query.join(ActivitySystem).filter(
                ActivitySystem.system_name.ilike(f"%{system_name}%")
            )

        # Dynamic name lookups
        activities = query.options(
            joinedload(ProcessingActivity.business_unit),
            joinedload(ProcessingActivity.department),
            joinedload(ProcessingActivity.team),
        ).all()

        return activities

    def update_activity(
        self, user: User, activity_id: UUID, payload: ProcessingActivityUpdate, org_id: UUID | None = None
    ) -> ProcessingActivity:
        resolved_org_id = self._resolve_org_id(user, org_id)
        activity = self.get_activity(user, activity_id, org_id=resolved_org_id)

        # Check if the user is authorized to edit
        # Basic ownership / role check
        if activity.status == "published":
            # An edit to a published activity requires creating a new version in draft status
            # We will handle this in Workflow Service. For now, CRUD updates are allowed in draft.
            pass

        # Update flat fields
        if payload.title is not None:
            activity.title = payload.title
        if payload.description is not None:
            activity.description = payload.description
        if payload.business_unit_id is not None:
            # Verify Business Unit
            bu = self.db.query(BusinessUnit).filter(
                BusinessUnit.id == payload.business_unit_id,
                BusinessUnit.organization_id == resolved_org_id
            ).first()
            if not bu:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business Unit not found")
            activity.business_unit_id = payload.business_unit_id
        if payload.department_id is not None:
            dept = self.db.query(Department).filter(
                Department.id == payload.department_id,
                Department.organization_id == resolved_org_id
            ).first()
            if not dept:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
            activity.department_id = payload.department_id
        if payload.team_id is not None:
            team = self.db.query(Team).filter(
                Team.id == payload.team_id,
                Team.organization_id == resolved_org_id
            ).first()
            if not team:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
            activity.team_id = payload.team_id
        if payload.status is not None:
            activity.status = payload.status

        if payload.banking_context is not None:
            activity.banking_context = self._validate_banking_context_for_org(
                resolved_org_id, payload.banking_context
            )

        # If sub-relations are specified, overwrite them
        if payload.owners is not None:
            self.db.query(ActivityOwner).filter(ActivityOwner.activity_id == activity.id).delete()
            for owner in payload.owners:
                self.db.add(ActivityOwner(activity_id=activity.id, user_id=owner.user_id, owner_role=owner.owner_role))

        if payload.purposes is not None:
            self.db.query(ActivityPurpose).filter(ActivityPurpose.activity_id == activity.id).delete()
            for sort_idx, p_id in enumerate(payload.purposes):
                self.db.add(ActivityPurpose(activity_id=activity.id, purpose_id=p_id, sort_order=sort_idx))

        if payload.data_categories is not None:
            self.db.query(ActivityDataCategory).filter(ActivityDataCategory.activity_id == activity.id).delete()
            for cat in payload.data_categories:
                self.db.add(ActivityDataCategory(
                    activity_id=activity.id,
                    category_name=cat.category_name,
                    is_special=cat.is_special,
                    sensitivity=cat.sensitivity
                ))

        if payload.data_principals is not None:
            self.db.query(ActivityDataPrincipal).filter(ActivityDataPrincipal.activity_id == activity.id).delete()
            for princ in payload.data_principals:
                self.db.add(ActivityDataPrincipal(
                    activity_id=activity.id,
                    category_name=princ.category_name,
                    description=princ.description,
                    includes_children=princ.includes_children
                ))

        if payload.lawful_bases is not None:
            self.db.query(ActivityLawfulBasis).filter(ActivityLawfulBasis.activity_id == activity.id).delete()
            for lb in payload.lawful_bases:
                self.db.add(ActivityLawfulBasis(
                    activity_id=activity.id,
                    basis_type=lb.basis_type,
                    justification=lb.justification,
                    dpdpa_section=lb.dpdpa_section,
                    lia_documented=lb.lia_documented,
                    lia_summary=lb.lia_summary,
                    lia_last_reviewed_at=lb.lia_last_reviewed_at
                ))

        if payload.systems is not None:
            property_ids = [s.property_id for s in payload.systems if s.property_id]
            self._verify_property_ids(resolved_org_id, property_ids)
            self.db.query(ActivitySystem).filter(ActivitySystem.activity_id == activity.id).delete()
            for sys in payload.systems:
                self.db.add(ActivitySystem(
                    activity_id=activity.id,
                    system_name=sys.system_name,
                    system_type=sys.system_type,
                    location=sys.location,
                    description=sys.description,
                    property_id=sys.property_id,
                    channel=sys.channel,
                ))

        if payload.recipients is not None:
            self.db.query(ActivityRecipient).filter(ActivityRecipient.activity_id == activity.id).delete()
            for rec in payload.recipients:
                self.db.add(ActivityRecipient(
                    activity_id=activity.id,
                    recipient_type=rec.recipient_type,
                    name=rec.name,
                    data_shared=rec.data_shared,
                    data_processor_id=rec.data_processor_id
                ))

        if payload.cross_border_transfers is not None:
            self.db.query(ActivityCrossBorderTransfer).filter(ActivityCrossBorderTransfer.activity_id == activity.id).delete()
            for cb in payload.cross_border_transfers:
                self.db.add(ActivityCrossBorderTransfer(
                    activity_id=activity.id,
                    destination_country=cb.destination_country,
                    destination_entity=cb.destination_entity,
                    adequacy_status=cb.adequacy_status,
                    safeguard_mechanism=cb.safeguard_mechanism,
                    legal_basis=cb.legal_basis
                ))

        if payload.retention_policies is not None:
            retention_ids = [rp.retention_policy_id for rp in payload.retention_policies if rp.retention_policy_id]
            self._verify_retention_policy_ids(resolved_org_id, retention_ids)
            self.db.query(ActivityRetentionPolicy).filter(ActivityRetentionPolicy.activity_id == activity.id).delete()
            for ret in payload.retention_policies:
                self.db.add(ActivityRetentionPolicy(
                    activity_id=activity.id,
                    retention_period=ret.retention_period,
                    trigger_event=ret.trigger_event,
                    legal_basis=ret.legal_basis,
                    auto_delete=ret.auto_delete,
                    retention_policy_id=ret.retention_policy_id,
                ))

        if payload.data_sources is not None:
            data_source_ids = [ds.data_source_id for ds in payload.data_sources]
            self._verify_data_source_ids(resolved_org_id, data_source_ids)
            self.db.query(ActivityDataSource).filter(ActivityDataSource.activity_id == activity.id).delete()
            for ds in payload.data_sources:
                self.db.add(ActivityDataSource(
                    activity_id=activity.id,
                    data_source_id=ds.data_source_id,
                    role=ds.role,
                    notes=ds.notes,
                ))

        if payload.security_measures is not None:
            self.db.query(ActivitySecurityMeasure).filter(ActivitySecurityMeasure.activity_id == activity.id).delete()
            for sec in payload.security_measures:
                self.db.add(ActivitySecurityMeasure(
                    activity_id=activity.id,
                    measure_type=sec.measure_type,
                    description=sec.description,
                    status=sec.status
                ))

        self.db.flush()
        self.db.expire(activity, [
            "data_categories",
            "data_principals",
            "cross_border_transfers",
            "recipients",
            "security_measures",
            "dpia_links"
        ])

        # Recalculate risk score
        self._recalculate_risk(activity, actor_id=user.id)

        # Update snapshot JSON on the current draft version
        if activity.current_version_id:
            curr_version = self.db.get(ActivityVersion, activity.current_version_id)
            if curr_version and curr_version.status == "draft":
                curr_version.snapshot_json = self._create_snapshot_dict(activity)
                curr_version.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        return self.get_activity(user, activity_id, org_id=resolved_org_id)

    def soft_delete_activity(self, user: User, activity_id: UUID, org_id: UUID | None = None) -> None:
        resolved_org_id = self._resolve_org_id(user, org_id)
        activity = self.db.query(ProcessingActivity).filter(
            ProcessingActivity.id == activity_id,
            ProcessingActivity.organization_id == resolved_org_id,
            ProcessingActivity.is_deleted == False
        ).first()
        if not activity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing activity not found")

        activity.is_deleted = True
        activity.deleted_at = datetime.now(timezone.utc)
        self.db.commit()

    # --- Utility Methods ---

    def _create_snapshot_dict(self, activity: ProcessingActivity) -> dict:
        return {
            "title": activity.title,
            "description": activity.description,
            "risk_score": activity.risk_score,
            "risk_level": activity.risk_level,
            "business_unit_id": str(activity.business_unit_id) if activity.business_unit_id else None,
            "department_id": str(activity.department_id) if activity.department_id else None,
            "team_id": str(activity.team_id) if activity.team_id else None,
            "banking_context": activity.banking_context,
            "owners": [
                {"user_id": str(o.user_id), "owner_role": o.owner_role}
                for o in activity.owners
            ],
            "purposes": [str(p.purpose_id) for p in activity.purposes],
            "data_categories": [
                {"category_name": c.category_name, "is_special": c.is_special, "sensitivity": c.sensitivity}
                for c in activity.data_categories
            ],
            "data_principals": [
                {"category_name": p.category_name, "description": p.description, "includes_children": p.includes_children}
                for p in activity.data_principals
            ],
            "lawful_bases": [
                {"basis_type": l.basis_type, "justification": l.justification, "dpdpa_section": l.dpdpa_section}
                for l in activity.lawful_bases
            ],
            "systems": [
                {
                    "system_name": s.system_name,
                    "system_type": s.system_type,
                    "location": s.location,
                    "description": s.description,
                    "property_id": str(s.property_id) if s.property_id else None,
                    "channel": s.channel,
                }
                for s in activity.systems
            ],
            "recipients": [
                {"recipient_type": r.recipient_type, "name": r.name, "data_shared": r.data_shared, "data_processor_id": str(r.data_processor_id) if r.data_processor_id else None}
                for r in activity.recipients
            ],
            "cross_border_transfers": [
                {"destination_country": c.destination_country, "destination_entity": c.destination_entity, "adequacy_status": c.adequacy_status, "safeguard_mechanism": c.safeguard_mechanism, "legal_basis": c.legal_basis}
                for c in activity.cross_border_transfers
            ],
            "retention_policies": [
                {
                    "retention_period": rp.retention_period,
                    "trigger_event": rp.trigger_event,
                    "legal_basis": rp.legal_basis,
                    "auto_delete": rp.auto_delete,
                    "retention_policy_id": str(rp.retention_policy_id) if rp.retention_policy_id else None,
                }
                for rp in activity.retention_policies
            ],
            "data_sources": [
                {
                    "data_source_id": str(ds.data_source_id),
                    "role": ds.role,
                    "notes": ds.notes,
                }
                for ds in activity.data_sources
            ],
            "security_measures": [
                {"measure_type": sm.measure_type, "description": sm.description, "status": sm.status}
                for sm in activity.security_measures
            ],
        }

    def _recalculate_risk(self, activity: ProcessingActivity, actor_id: UUID | None = None) -> None:
        """Calculate dynamic numeric risk score 0-100 and map to risk level."""
        score = 10  # Base Score

        # 1. Data Sensitivity (+25 if special categories exist)
        has_special = any(c.is_special for c in activity.data_categories)
        if has_special:
            score += 25

        # 2. Scale of Processing (+15 if processing children's data or high sensitivity)
        has_children = any(p.includes_children for p in activity.data_principals)
        if has_children:
            score += 15

        # 3. Cross-border transfers (+10 if transfers present)
        if len(activity.cross_border_transfers) > 0:
            score += 10

        # 4. External Vendors / Processors involved (+10)
        has_vendors = any(r.recipient_type == "vendor" for r in activity.recipients)
        if has_vendors:
            score += 10

        # 5. Security Safeguards (If no security measures exist, +20 penalty)
        if len(activity.security_measures) == 0:
            score += 20

        # 6. DPIA missing requirement (+10 if special/sensitive data and no DPIA linked)
        # We check this dynamic rule:
        if has_special and len(activity.dpia_links) == 0:
            score += 10
            if actor_id:
                self.auto_create_dpia(activity, actor_id)

        # Cap score between 0 and 100
        score = min(100, max(0, score))
        activity.risk_score = score

        # Map to Risk Level
        if score <= 30:
            activity.risk_level = "low"
        elif score <= 60:
            activity.risk_level = "medium"
        elif score <= 80:
            activity.risk_level = "high"
        else:
            activity.risk_level = "critical"

    def auto_create_dpia(self, activity: ProcessingActivity, actor_id: UUID) -> Dpia | None:
        return self._create_dpia_for_activity(activity, actor_id, auto_triggered=True)

    def create_dpia_from_activity(
        self, user: User, activity_id: UUID, org_id: UUID | None = None
    ) -> CreateDpiaFromActivityRead:
        resolved_org_id = self._resolve_org_id(user, org_id)
        activity = self.get_activity(user, activity_id, org_id=resolved_org_id)
        existing_link = self.db.query(ActivityDpiaLink).filter(ActivityDpiaLink.activity_id == activity.id).first()
        if existing_link:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Activity already has a linked DPIA")
        dpia = self._create_dpia_for_activity(activity, user.id, auto_triggered=False)
        if not dpia:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create DPIA")
        link = self.db.query(ActivityDpiaLink).filter(ActivityDpiaLink.activity_id == activity.id).first()
        self.db.commit()
        return CreateDpiaFromActivityRead(
            dpia_id=dpia.id,
            dpia_ref=dpia.dpia_ref,
            title=dpia.title,
            link_id=link.id if link else dpia.id,
        )

    def _create_dpia_for_activity(
        self, activity: ProcessingActivity, actor_id: UUID, *, auto_triggered: bool
    ) -> Dpia | None:
        existing_link = self.db.query(ActivityDpiaLink).filter(ActivityDpiaLink.activity_id == activity.id).first()
        if existing_link:
            return None

        from app.services.dpia.governance import DpiaGovernanceService
        from app.schemas.dpia import DpiaCreate

        categories = ", ".join(c.category_name for c in activity.data_categories) or "Not specified"
        banking_note = ""
        if activity.banking_context:
            ctx = activity.banking_context
            channels = ", ".join(ctx.get("channels") or [])
            identifiers = ", ".join(ctx.get("identifier_types") or [])
            journeys = ", ".join(ctx.get("consent_journey_keys") or [])
            banking_note = (
                f"\n\nBanking context — Channels: {channels or 'N/A'}; "
                f"Identifiers: {identifiers or 'N/A'}; Journeys: {journeys or 'N/A'}."
            )

        trigger = "Auto-triggered" if auto_triggered else "Created from RoPA activity"
        payload = DpiaCreate(
            title=f"DPIA: {activity.title}",
            description=(
                f"{trigger} assessment for {activity.activity_ref}.\n\n"
                f"Data categories: {categories}.{banking_note}"
            ),
            business_unit_id=activity.business_unit_id,
        )

        try:
            dpia = DpiaGovernanceService().create_dpia(self.db, activity.organization_id, payload, actor_id)
            link = ActivityDpiaLink(
                activity_id=activity.id,
                dpia_id=dpia.id,
                link_type="primary",
            )
            self.db.add(link)
            self.db.flush()

            from app.services.ropa_workflow_service import RopaWorkflowService
            RopaWorkflowService.record_event(
                db=self.db,
                activity_id=activity.id,
                event_type="activity.dpia_created",
                actor_id=actor_id,
                details={"dpia_id": str(dpia.id), "dpia_ref": dpia.dpia_ref, "auto_triggered": auto_triggered},
            )
            return dpia
        except Exception as e:
            print(f"Error creating DPIA: {e}")
            return None

    def get_dashboard_kpis(
        self, user: User, org_id: UUID | None = None, business_unit_id: UUID | None = None
    ) -> RopaDashboardKPIs:
        resolved_org_id = self._resolve_org_id(user, org_id)

        # Retrieve all activities
        activity_q = self.db.query(ProcessingActivity).filter(
            ProcessingActivity.organization_id == resolved_org_id,
            ProcessingActivity.is_deleted == False,
        )
        if business_unit_id:
            activity_q = activity_q.filter(ProcessingActivity.business_unit_id == business_unit_id)
        activities = (
            activity_q
            .options(
                joinedload(ProcessingActivity.data_categories),
                joinedload(ProcessingActivity.owners),
                joinedload(ProcessingActivity.purposes),
                joinedload(ProcessingActivity.retention_policies),
                joinedload(ProcessingActivity.recipients),
                joinedload(ProcessingActivity.cross_border_transfers),
                joinedload(ProcessingActivity.dpia_links),
                joinedload(ProcessingActivity.data_sources),
                joinedload(ProcessingActivity.systems),
            )
            .all()
        )

        banking_enabled = self._is_banking_org(resolved_org_id)
        without_channel = 0
        without_data_source = 0
        without_retention_link = 0
        by_channel: dict[str, int] = {}

        if banking_enabled:
            for a in activities:
                if a.status == "archived":
                    continue
                ctx = a.banking_context or {}
                has_channel = bool(ctx.get("channels")) or any(s.channel for s in a.systems)
                if not has_channel:
                    without_channel += 1
                if len(a.data_sources) == 0:
                    without_data_source += 1
                if len(a.retention_policies) == 0 or all(
                    rp.retention_policy_id is None for rp in a.retention_policies
                ):
                    without_retention_link += 1
                for ch in ctx.get("channels") or []:
                    by_channel[ch] = by_channel.get(ch, 0) + 1

        total = sum(1 for a in activities if a.status != "archived")
        published = sum(1 for a in activities if a.status == "published")
        draft = sum(1 for a in activities if a.status == "draft")
        pending = sum(1 for a in activities if a.status == "pending_review")

        high_risk = sum(1 for a in activities if a.risk_score >= 61 and a.risk_score <= 80 and a.status != "archived")
        critical = sum(1 for a in activities if a.risk_score >= 81 and a.status != "archived")

        without_dpia = sum(
            1 for a in activities 
            if any(c.is_special for c in a.data_categories) and len(a.dpia_links) == 0 and a.status != "archived"
        )
        without_owner = sum(1 for a in activities if len(a.owners) == 0 and a.status != "archived")
        without_retention = sum(1 for a in activities if len(a.retention_policies) == 0 and a.status != "archived")
        without_purpose = sum(1 for a in activities if len(a.purposes) == 0 and a.status != "archived")
        
        without_vendor = sum(
            1 for a in activities 
            if any(r.recipient_type == "vendor" and r.data_processor_id is None for r in a.recipients) and a.status != "archived"
        )
        
        cross_border = sum(1 for a in activities if len(a.cross_border_transfers) > 0 and a.status != "archived")

        ai_discovered = (
            self.db.query(RopaDiscoverySuggestion)
            .filter(
                RopaDiscoverySuggestion.organization_id == resolved_org_id,
                RopaDiscoverySuggestion.status == "pending",
            )
            .count()
        )

        # Get overall DPDPA compliance score
        from app.services.compliance_map_service import ComplianceMapService
        compliance_percentage = ComplianceMapService(self.db).get_summary(user, org_id=resolved_org_id).compliance_score

        return RopaDashboardKPIs(
            total=total,
            published=published,
            draft=draft,
            pending=pending,
            high_risk=high_risk,
            critical=critical,
            without_dpia=without_dpia,
            without_owner=without_owner,
            without_retention=without_retention,
            without_purpose=without_purpose,
            without_vendor=without_vendor,
            cross_border=cross_border,
            ai_discovered=ai_discovered,
            compliance_percentage=compliance_percentage,
            banking_enabled=banking_enabled,
            without_channel=without_channel,
            without_data_source=without_data_source,
            without_retention_link=without_retention_link,
            by_channel=by_channel,
        )

    def get_lia_gaps(self, user: User, org_id: UUID | None = None) -> list[dict]:
        """Return ROPA activities using legitimate use without documented LIA."""
        resolved_org_id = self._resolve_org_id(user, org_id)
        from app.models.ropa import ProcessingActivity, ActivityLawfulBasis
        gaps = (
            self.db.query(ProcessingActivity)
            .join(ActivityLawfulBasis, ActivityLawfulBasis.activity_id == ProcessingActivity.id)
            .filter(
                ProcessingActivity.organization_id == resolved_org_id,
                ProcessingActivity.status != "archived",
                ActivityLawfulBasis.basis_type.ilike("%legitimate%"),
                ActivityLawfulBasis.lia_documented == False,
            )
            .all()
        )
        return [
            {
                "activity_id": a.id,
                "activity_name": a.name,
                "status": a.status,
            }
            for a in gaps
        ]

    def export_register_bytes(
        self,
        user: User,
        *,
        org_id: UUID | None = None,
        fmt: str = "json",
        purpose_id: UUID | None = None,
        channel: str | None = None,
        business_unit_id: UUID | None = None,
    ) -> tuple[bytes, str]:
        resolved_org_id = self._resolve_org_id(user, org_id)
        query = self.db.query(ProcessingActivity).filter(
            ProcessingActivity.organization_id == resolved_org_id,
            ProcessingActivity.is_deleted == False,
        )
        if purpose_id:
            query = query.join(ActivityPurpose).filter(ActivityPurpose.purpose_id == purpose_id)
        if business_unit_id:
            query = query.filter(ProcessingActivity.business_unit_id == business_unit_id)
        activities = query.options(
            joinedload(ProcessingActivity.lawful_bases),
            joinedload(ProcessingActivity.data_sources).joinedload(ActivityDataSource.data_source),
            joinedload(ProcessingActivity.retention_policies).joinedload(ActivityRetentionPolicy.retention_policy),
            joinedload(ProcessingActivity.purposes).joinedload(ActivityPurpose.purpose),
            joinedload(ProcessingActivity.dpia_links),
            joinedload(ProcessingActivity.systems),
        ).all()
        if channel:
            activities = [
                a for a in activities
                if channel in (a.banking_context or {}).get("channels", [])
                or any(s.channel == channel for s in a.systems)
            ]

        rows: list[dict] = []
        banking_enabled = self._is_banking_org(self._resolve_org_id(user, org_id))
        for activity in activities:
            if activity.status == "archived":
                continue
            lawful = [
                {"basis": lb.basis_type, "dpdpa_section": lb.dpdpa_section}
                for lb in activity.lawful_bases
            ]
            retention = []
            for rp in activity.retention_policies:
                denorm = self._denormalize_retention_row(rp)
                retention.append(
                    {
                        "period": denorm["effective_retention_period"],
                        "trigger": denorm["effective_trigger_event"],
                        "legal_basis": denorm["effective_legal_basis"],
                        "linked_policy": denorm["linked_policy_name"],
                    }
                )
            rows.append(
                {
                    "activity_ref": activity.activity_ref,
                    "title": activity.title,
                    "status": activity.status,
                    "risk_level": activity.risk_level,
                    "risk_score": activity.risk_score,
                    "lawful_bases": lawful,
                    "banking_context": activity.banking_context if banking_enabled else None,
                    "data_sources": [
                        {"name": ds.data_source.name if ds.data_source else None, "role": ds.role}
                        for ds in activity.data_sources
                    ],
                    "retention": retention,
                    "dpia_links": len(activity.dpia_links),
                    "purposes": [p.purpose.name if p.purpose else None for p in activity.purposes],
                }
            )

        payload = {"activities": rows, "total": len(rows), "exported_at": datetime.now(timezone.utc).isoformat()}

        if fmt == "json":
            import json
            return json.dumps(payload, default=str, indent=2).encode(), "application/json"

        if fmt == "xlsx":
            import io
            import json as json_mod
            from openpyxl import Workbook

            wb = Workbook()
            ws = wb.active
            ws.title = "RoPA Register"
            ws.append([
                "activity_ref", "title", "status", "risk_level", "lawful_bases",
                "banking_context", "data_sources", "retention", "dpia_links", "purposes",
            ])
            for row in rows:
                ws.append([
                    row["activity_ref"],
                    row["title"],
                    row["status"],
                    row["risk_level"],
                    json_mod.dumps(row["lawful_bases"]),
                    json_mod.dumps(row["banking_context"]),
                    json_mod.dumps(row["data_sources"]),
                    json_mod.dumps(row["retention"]),
                    row["dpia_links"],
                    json_mod.dumps(row["purposes"]),
                ])
            buffer = io.BytesIO()
            wb.save(buffer)
            buffer.seek(0)
            return buffer.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        if fmt == "pdf":
            import io
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib.units import inch
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=48, leftMargin=48, topMargin=48, bottomMargin=36)
            styles = getSampleStyleSheet()
            story = [Paragraph("RoPA Register Export", styles["Title"]), Spacer(1, 12)]
            table_rows = [["Ref", "Title", "Status", "Risk"]]
            for row in rows[:200]:
                table_rows.append([row["activity_ref"], row["title"][:40], row["status"], row["risk_level"]])
            table = Table(table_rows, colWidths=[1.2 * inch, 3.0 * inch, 1.0 * inch, 0.8 * inch])
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ]
                )
            )
            story.append(table)
            doc.build(story)
            buffer.seek(0)
            return buffer.read(), "application/pdf"

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported format: {fmt}")
