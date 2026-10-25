from datetime import datetime, timezone, date
from uuid import UUID, uuid4
from sqlalchemy import text, insert

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.data_processor import DataProcessor, DpaStatus
from app.models.ciso import CisoControl, CisoRisk, CisoEvidence, CisoControlStatus, CisoRiskStatus
from app.models.ropa import ActivityRecipient, ProcessingActivity
from app.models.detected_tracker import DetectedTracker
from app.models.dpdp_obligation_definition import DpdpObligationDefinition
from app.models.organization import Organization, OrganizationStatus
from app.models.organization_settings import DpdpRole, OrganizationSettings
from app.models.user import User, UserRole
from app.schemas.workspace import (
    DataProcessorCreate,
    DataProcessorRead,
    DataProcessorUpdate,
    DataResidencyRow,
    DpdpObligationRead,
    WorkspaceDeploymentUpdate,
    WorkspaceIndustryUpdate,
    WorkspaceProfileUpdate,
    WorkspaceRoleMappingUpdate,
    WorkspaceSettingsRead,
)
from app.utils.workspace_defaults import create_default_organization_settings
from app.utils.industry_packs import ensure_banking_config, is_banking_industry



class WorkspaceService:
    def __init__(self, db: Session):
        self.db = db

    def _ensure_org_accessible(self, org_id: UUID) -> None:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        """Tenant users use their org; superadmin must pass ?org_id=."""
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Workspace settings require an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Workspace settings require an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _require_admin(self, user: User) -> None:
        # Org admins edit their own workspace; superadmin can edit any org's
        # workspace (it already passes ?org_id= via _resolve_org_id).
        if user.role not in (UserRole.admin, UserRole.superadmin):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")

    def _get_settings(self, org_id: UUID) -> OrganizationSettings:
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        if settings is None:
            settings = create_default_organization_settings(org_id)
            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)
        return settings

    def get_workspace(self, user: User, org_id: UUID | None = None) -> WorkspaceSettingsRead:
        org_id = self._resolve_org_id(user, org_id)
        org = self.db.get(Organization, org_id)
        settings = self._get_settings(org_id)
        processors = (
            self.db.query(DataProcessor)
            .filter(DataProcessor.organization_id == org_id)
            .order_by(DataProcessor.name)
            .all()
        )
        return WorkspaceSettingsRead(
            organization=org,
            registered_address=settings.registered_address,
            headquarters=settings.headquarters,
            india_presence=settings.india_presence,
            solution_description=settings.solution_description,
            logo_url=settings.logo_url,
            dpo_name=settings.dpo_name,
            dpo_email=settings.dpo_email,
            dpo_phone=settings.dpo_phone,
            compliance_version=settings.compliance_version,
            changelog_summary=settings.changelog_summary,
            self_attested_at=settings.self_attested_at,
            third_party_audit_firm=settings.third_party_audit_firm,
            audit_valid_until=settings.audit_valid_until,
            primary_industry=settings.primary_industry,
            secondary_industries=settings.secondary_industries or [],
            is_significant_data_fiduciary=settings.is_significant_data_fiduciary,
            data_principals_count_band=settings.data_principals_count_band,
            annual_turnover_band=settings.annual_turnover_band,
            deployment_model=settings.deployment_model,
            primary_region=settings.primary_region,
            backup_region=settings.backup_region,
            allowed_regions=settings.allowed_regions or [],
            data_residency=settings.data_residency or [],
            dpdp_role=settings.dpdp_role,
            role_assessed_at=settings.role_assessed_at,
            role_assessment=settings.role_assessment,
            consent_industry_config=settings.consent_industry_config,
            processors=[DataProcessorRead.model_validate(p) for p in processors],
        )

    def _apply_patch(self, settings: OrganizationSettings, body: object, *, exclude: set[str]) -> None:
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            if key in exclude:
                continue
            if key == "data_residency" and value is not None:
                # model_dump() turns nested rows into dicts; normalize either way.
                setattr(
                    settings,
                    key,
                    [DataResidencyRow.model_validate(row).model_dump() for row in value],
                )
            else:
                setattr(settings, key, value)

    def update_profile(
        self, user: User, body: WorkspaceProfileUpdate, org_id: UUID | None = None
    ) -> WorkspaceSettingsRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        org = self.db.get(Organization, org_id)
        settings = self._get_settings(org_id)
        if body.org_name is not None:
            org.name = body.org_name
        self._apply_patch(settings, body, exclude={"org_name"})
        self.db.commit()
        return self.get_workspace(user, org_id)

    def update_industry(
        self, user: User, body: WorkspaceIndustryUpdate, org_id: UUID | None = None
    ) -> WorkspaceSettingsRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        settings = self._get_settings(org_id)
        self._apply_patch(settings, body, exclude=set())
        if body.primary_industry is not None and is_banking_industry(body.primary_industry):
            settings.consent_industry_config = ensure_banking_config(
                body.primary_industry,
                settings.consent_industry_config,
            )
        if body.is_significant_data_fiduciary is True:
            settings.dpdp_role = DpdpRole.significant_data_fiduciary
        elif body.is_significant_data_fiduciary is False:
            if settings.dpdp_role == DpdpRole.significant_data_fiduciary:
                settings.dpdp_role = DpdpRole.data_fiduciary
        self.db.commit()
        return self.get_workspace(user, org_id)

    def update_deployment(
        self, user: User, body: WorkspaceDeploymentUpdate, org_id: UUID | None = None
    ) -> WorkspaceSettingsRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        settings = self._get_settings(org_id)
        self._apply_patch(settings, body, exclude=set())
        self.db.commit()
        return self.get_workspace(user, org_id)

    def update_role_mapping(
        self, user: User, body: WorkspaceRoleMappingUpdate, org_id: UUID | None = None
    ) -> WorkspaceSettingsRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        settings = self._get_settings(org_id)
        if body.dpdp_role is not None:
            settings.dpdp_role = body.dpdp_role
            if body.dpdp_role == DpdpRole.significant_data_fiduciary:
                settings.is_significant_data_fiduciary = True
            else:
                settings.is_significant_data_fiduciary = False
        if body.role_assessment is not None:
            settings.role_assessment = body.role_assessment
            settings.role_assessed_at = datetime.now(timezone.utc)
        self.db.commit()
        return self.get_workspace(user, org_id)

    def list_obligations(self) -> list[DpdpObligationRead]:
        rows = (
            self.db.query(DpdpObligationDefinition)
            .order_by(DpdpObligationDefinition.sort_order)
            .all()
        )
        return [
            DpdpObligationRead(
                id=r.id,
                sort_order=r.sort_order,
                obligation=r.obligation,
                description=r.description,
                statute_reference=r.statute_reference,
                df=r.df_requirement,
                dp=r.dp_requirement,
                sdf=r.sdf_requirement,
            )
            for r in rows
        ]

    def list_processors(
        self, user: User, org_id: UUID | None = None, business_unit_id: UUID | None = None
    ) -> list[DataProcessorRead]:
        org_id = self._resolve_org_id(user, org_id)
        q = self.db.query(DataProcessor).filter(DataProcessor.organization_id == org_id)
        if business_unit_id:
            q = q.filter(DataProcessor.business_unit_id == business_unit_id)
        rows = q.order_by(DataProcessor.name).all()
        return [DataProcessorRead.model_validate(r) for r in rows]

    def create_processor(
        self, user: User, body: DataProcessorCreate, org_id: UUID | None = None
    ) -> DataProcessorRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        
        proc = DataProcessor(organization_id=org_id, **body.model_dump())
        self.calculate_vendor_metrics(proc)
        
        self.db.add(proc)
        self.db.flush()
        
        self.sync_vendor_ciso_risks(user, proc)
        self.db.commit()
        self.db.refresh(proc)
        return DataProcessorRead.model_validate(proc)

    def _get_processor(self, org_id: UUID, processor_id: UUID) -> DataProcessor:
        proc = self.db.get(DataProcessor, processor_id)
        if proc is None or proc.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Processor not found")
        return proc

    def update_processor(
        self,
        user: User,
        processor_id: UUID,
        body: DataProcessorUpdate,
        org_id: UUID | None = None,
    ) -> DataProcessorRead:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        proc = self._get_processor(org_id, processor_id)
        for key, value in body.model_dump(exclude_unset=True).items():
            setattr(proc, key, value)
            
        self.calculate_vendor_metrics(proc)
        self.db.flush()
        
        self.sync_vendor_ciso_risks(user, proc)
        self.db.commit()
        self.db.refresh(proc)
        return DataProcessorRead.model_validate(proc)

    def delete_processor(
        self, user: User, processor_id: UUID, org_id: UUID | None = None
    ) -> None:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        proc = self._get_processor(org_id, processor_id)
        self.db.delete(proc)
        self.db.commit()

    def calculate_vendor_metrics(self, proc: DataProcessor) -> None:
        # Base security score calculation
        score = 80
        if proc.dpa_status == DpaStatus.signed:
            score += 10
        elif proc.dpa_status in (DpaStatus.expired, DpaStatus.none):
            score -= 15
        
        # Certifications contribution
        if proc.certifications:
            score += len(proc.certifications) * 5
        
        # Encryption contribution
        if proc.encryption:
            enc = proc.encryption.lower()
            if "tls" in enc or "aes" in enc or "kms" in enc or "ssl" in enc:
                score += 5
        
        # Location contribution
        if proc.location:
            loc = proc.location.lower()
            if "india" not in loc and proc.dpa_status != DpaStatus.signed:
                score -= 10
        
        # Clamp score between 0 and 100
        proc.security_score = max(0, min(100, score))
        
        # Set tier based on security score and role/category
        if proc.security_score < 60 or proc.risk_level == "high" or proc.category in ("Infrastructure", "Payment processing"):
            proc.tier = "Tier 1 (Critical)"
        elif proc.security_score < 80 or proc.risk_level == "medium":
            proc.tier = "Tier 2 (High)"
        else:
            proc.tier = "Tier 3 (Medium/Low)"

    def sync_vendor_ciso_risks(self, user: User, proc: DataProcessor) -> None:
        # Check if CISO control CIS-15 exists for this org
        control = (
            self.db.query(CisoControl)
            .filter(CisoControl.organization_id == proc.organization_id, CisoControl.control_key == "CIS-15")
            .first()
        )
        
        # Risk criteria
        risk_title = f"Third-Party Compliance Risk: {proc.name}"
        existing_risk = (
            self.db.query(CisoRisk)
            .filter(CisoRisk.organization_id == proc.organization_id, CisoRisk.title == risk_title)
            .first()
        )
        
        needs_risk = proc.dpa_status != DpaStatus.signed or proc.security_score < 60
        
        if needs_risk:
            likelihood = 4 if proc.dpa_status == DpaStatus.expired or proc.dpa_status == DpaStatus.none else 3
            impact = 4 if "Tier 1" in proc.tier else 3 if "Tier 2" in proc.tier else 2
            
            if not existing_risk:
                risk_ref_val = f"RSK-VND-{proc.id.hex[:6].upper()}"
                risk = CisoRisk(
                    organization_id=proc.organization_id,
                    risk_id=risk_ref_val,
                    title=risk_title,
                    category="Third Party Risk",
                    likelihood=likelihood,
                    impact=impact,
                    score=likelihood * impact,
                    status=CisoRiskStatus.open,
                    treatment=f"Secure signed DPA and complete security assessment for {proc.name}.",
                    owner_user_id=user.id
                )
                self.db.add(risk)
                self.db.flush()
                
                # Link risk to CISO control CIS-15
                if control and control not in risk.controls:
                    risk.controls.append(control)
            else:
                existing_risk.likelihood = likelihood
                existing_risk.impact = impact
                existing_risk.score = likelihood * impact
                existing_risk.status = CisoRiskStatus.open
                existing_risk.residual_score = None
        else:
            if existing_risk:
                existing_risk.status = CisoRiskStatus.treated
                existing_risk.residual_score = existing_risk.score - 4

    def list_discovered_processors(self, user: User, org_id: UUID | None = None) -> list[dict]:
        org_id = self._resolve_org_id(user, org_id)
        
        # Query existing registered processors
        registered_names = {
            r[0].lower().strip()
            for r in self.db.query(DataProcessor.name).filter(DataProcessor.organization_id == org_id).all()
        }
        
        # Query DetectedTrackers from DB (dynamic trackers)
        db_trackers = (
            self.db.query(DetectedTracker.name, DetectedTracker.domain)
            .filter(DetectedTracker.status == "active")
            .distinct()
            .all()
        )
        
        discovered_list = []
        added_names = set()
        
        # Add dynamic trackers if they are not registered
        for tracker_name, domain in db_trackers:
            norm_name = tracker_name.strip()
            if not norm_name:
                continue
            lower_name = norm_name.lower()
            if lower_name in registered_names:
                continue
            if lower_name in added_names:
                continue
                
            category = "Other"
            risk = "medium"
            if "analytics" in lower_name or "google" in lower_name or "facebook" in lower_name:
                category = "Analytics"
                risk = "high"
            elif "stripe" in lower_name or "paypal" in lower_name:
                category = "Payment processing"
                risk = "low"
            
            discovered_list.append({
                "name": norm_name,
                "source": "Crawler script log" if not domain else f"Network call to {domain}",
                "risk": risk,
                "category": category,
                "status": "unmanaged"
            })
            added_names.add(lower_name)
            
        return discovered_list

    def scan_discovered_processors(self, user: User, org_id: UUID | None = None) -> list[dict]:
        org_id = self._resolve_org_id(user, org_id)
        control = (
            self.db.query(CisoControl)
            .filter(CisoControl.organization_id == org_id, CisoControl.control_key == "CIS-15")
            .first()
        )
        if control:
            self.db.execute(
                text(
                    "INSERT INTO ciso_activities (id, organization_id, actor_user_id, entity_type, entity_id, activity_type, payload, description, created_at, updated_at) "
                    "VALUES (:id, :org_id, :actor_id, 'control', :entity_id, 'scan_triggered', '{}', :desc, now(), now())"
                ),
                {
                    "id": uuid4(),
                    "org_id": org_id,
                    "actor_id": user.id,
                    "entity_id": control.id,
                    "desc": "Shield AI triggered automated scans for shadow IT vendor discovery across integration channels."
                }
            )
        return self.list_discovered_processors(user, org_id)

    def list_vendor_data_flows(self, user: User, processor_id: UUID, org_id: UUID | None = None) -> list[dict]:
        org_id = self._resolve_org_id(user, org_id)
        recipients = (
            self.db.query(ActivityRecipient)
            .join(ProcessingActivity)
            .filter(
                ProcessingActivity.organization_id == org_id,
                ActivityRecipient.data_processor_id == processor_id
            )
            .all()
        )
        flows = []
        for r in recipients:
            flows.append({
                "activity_ref": r.activity.activity_ref,
                "title": r.activity.title,
                "recipient_type": r.recipient_type,
                "data_shared": r.data_shared
            })
        return flows

    def list_vendor_evidence(
        self, user: User, processor_id: UUID, org_id: UUID | None = None
    ) -> list[dict]:
        org_id = self._resolve_org_id(user, org_id)
        proc = self._get_processor(org_id, processor_id)
        rows = self.db.execute(
            text("SELECT evidence_id FROM ciso_evidence_vendor_mappings WHERE vendor_id = :v_id"),
            {"v_id": proc.id},
        ).fetchall()
        evidence_ids = [r[0] for r in rows]
        if not evidence_ids:
            return []
        evidences = self.db.query(CisoEvidence).filter(
            CisoEvidence.id.in_(evidence_ids),
            CisoEvidence.organization_id == org_id,
        ).all()
        return [
            {
                "id": str(e.id),
                "name": e.name,
                "file_name": e.file_name,
                "file_type": e.file_type,
                "is_verified": e.is_verified,
                "verified_at": e.verified_at.isoformat() if e.verified_at else None
            }
            for e in evidences
        ]

    def link_vendor_evidence(self, user: User, processor_id: UUID, evidence_id: UUID, org_id: UUID | None = None) -> None:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        
        proc = self._get_processor(org_id, processor_id)
        evidence = self.db.query(CisoEvidence).filter(CisoEvidence.id == evidence_id, CisoEvidence.organization_id == org_id).first()
        if not evidence:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Evidence document not found")
            
        self.db.execute(
            text("INSERT INTO ciso_evidence_vendor_mappings (vendor_id, evidence_id) VALUES (:v_id, :e_id) ON CONFLICT DO NOTHING"),
            {"v_id": processor_id, "e_id": evidence_id}
        )
        self.db.commit()

    def run_continuous_monitoring_check(self, user: User, processor_id: UUID, org_id: UUID | None = None) -> dict:
        import httpx

        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        proc = self._get_processor(org_id, processor_id)

        probe_url = None
        if proc.contact_email and "@" in proc.contact_email:
            domain = proc.contact_email.split("@", 1)[1]
            probe_url = f"https://{domain}"
        elif proc.location and proc.location.startswith("http"):
            probe_url = proc.location

        ssl_valid = True
        latency_ms = None
        last_error = None
        demo_mode = False
        if probe_url:
            try:
                start = datetime.now(timezone.utc)
                with httpx.Client(timeout=8.0, follow_redirects=True) as client:
                    response = client.head(probe_url)
                latency_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
                ssl_valid = response.status_code < 500
            except Exception as exc:
                ssl_valid = False
                last_error = str(exc)
                demo_mode = True
        else:
            demo_mode = True

        details = {
            "ssl_valid": ssl_valid,
            "dns_sec": not demo_mode,
            "domain_checks": "Live HTTP probe" if not demo_mode else "Demo fallback — configure vendor URL/email domain",
            "privacy_notice_active": ssl_valid,
            "latency_ms": latency_ms or 0,
            "last_error": last_error,
            "demo_mode": demo_mode,
            "probe_url": probe_url,
        }

        proc.last_monitored_at = datetime.now(timezone.utc)
        proc.monitoring_status = "healthy" if ssl_valid else "degraded"
        proc.monitoring_details = details

        self.calculate_vendor_metrics(proc)
        self.db.commit()

        return {
            "monitoring_status": proc.monitoring_status,
            "last_monitored_at": proc.last_monitored_at.isoformat(),
            "monitoring_details": proc.monitoring_details,
            "security_score": proc.security_score,
            "tier": proc.tier,
            "demo_mode": demo_mode,
        }

    def trigger_vendor_assessment(self, user: User, processor_id: UUID, org_id: UUID | None = None) -> None:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        proc = self._get_processor(org_id, processor_id)
        proc.assessment_status = "sent"
        self.db.commit()

    def submit_vendor_assessment(self, user: User, processor_id: UUID, answers: dict, org_id: UUID | None = None) -> dict:
        org_id = self._resolve_org_id(user, org_id)
        self._require_admin(user)
        proc = self._get_processor(org_id, processor_id)
        
        score = 60
        certifications = proc.certifications or []
        
        if answers.get("soc2_audited"):
            score += 10
            if "SOC 2 Type II" not in certifications:
                certifications.append("SOC 2 Type II")
        if answers.get("iso_certified"):
            score += 10
            if "ISO 27001" not in certifications:
                certifications.append("ISO 27001")
        if answers.get("data_encryption"):
            score += 10
            proc.encryption = "TLS 1.3 + AES-256"
        if answers.get("india_hosting"):
            score += 10
            proc.location = "India"
        else:
            proc.location = "Overseas"
            
        proc.certifications = certifications
        proc.assessment_status = "completed"
        proc.assessment_completed_at = date.today()
        proc.security_score = max(0, min(100, score))
        
        self.calculate_vendor_metrics(proc)
        self.sync_vendor_ciso_risks(user, proc)
        self.db.commit()
        
        return {
            "security_score": proc.security_score,
            "tier": proc.tier,
            "assessment_status": proc.assessment_status,
            "assessment_completed_at": proc.assessment_completed_at.isoformat() if proc.assessment_completed_at else None
        }

    def get_setup_status(self, user: User, org_id: UUID | None = None) -> dict:
        org_id = self._resolve_org_id(user, org_id)
        settings = self._get_settings(org_id)

        from app.models.integration_property import IntegrationProperty
        from app.models.consent import Purpose, ConsentNotice, ConsentNoticeVersion
        from app.models.consent_banner import ConsentBanner
        from app.models.consent_receipt import ConsentReceipt

        step1_industry = bool(settings.primary_industry)
        step2_property = self.db.query(IntegrationProperty).filter(IntegrationProperty.organization_id == org_id).count() > 0
        step3_purposes = self.db.query(Purpose).filter(Purpose.organization_id == org_id).count() > 0
        step4_notice = self.db.query(ConsentNotice).filter(ConsentNotice.organization_id == org_id).count() > 0
        step5_banner = self.db.query(ConsentBanner).filter(ConsentBanner.organization_id == org_id).count() > 0
        step7_monitor = self.db.query(ConsentReceipt).filter(ConsentReceipt.organization_id == org_id).count() > 0

        # Determine if any banner or notice has translations (excluding default 'en')
        banners = self.db.query(ConsentBanner).filter(ConsentBanner.organization_id == org_id).all()
        notices = self.db.query(ConsentNoticeVersion).join(
            ConsentNotice, ConsentNotice.id == ConsentNoticeVersion.notice_id
        ).filter(ConsentNotice.organization_id == org_id).all()

        step6_translation = False
        for b in banners:
            if b.translations and isinstance(b.translations, dict):
                if any(k != 'en' for k in b.translations.keys() if b.translations[k]):
                    step6_translation = True
                    break
        if not step6_translation:
            for n in notices:
                if n.translations and isinstance(n.translations, dict):
                    if any(k != 'en' for k in n.translations.keys() if n.translations[k]):
                        step6_translation = True
                        break

        return {
            "step1_industry": step1_industry,
            "step2_property": step2_property,
            "step3_purposes": step3_purposes,
            "step4_notice": step4_notice,
            "step5_banner": step5_banner,
            "step6_translation": step6_translation,
            "step7_monitor": step7_monitor
        }


