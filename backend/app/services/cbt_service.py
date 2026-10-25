import io
import os
from datetime import datetime, date
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.cross_border_transfer import (
    CbtTransfer,
    CbtContract,
    CbtContractVersion,
    CbtSdfAssessment,
    CbtActivity,
    TransferStatus,
    ContractStatus,
)
from app.models.organization_settings import OrganizationSettings
from app.models.data_processor import DataProcessor
from app.models.user import User
from app.models.consent import ConsentNotice
from app.models.notice_delivery import NoticeCampaign, RetryPolicy
from app.schemas.cross_border_transfer import (
    CbtTransferCreate,
    CbtTransferUpdate,
    CbtContractCreate,
    CbtSdfAssessmentCreate,
    CbtDashboardKpis,
)

# ReportLab imports for PDF generation
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY

import jinja2

RESTRICTED_COUNTRIES = {"PRK", "SYR", "IRN", "CUB"}


class CbtService:
    def __init__(self, db: Session):
        self.db = db

    def _get_org_settings(self, org_id: UUID) -> OrganizationSettings | None:
        return self.db.query(OrganizationSettings).filter(
            OrganizationSettings.organization_id == org_id
        ).first()

    def get_dashboard_kpis(self, org_id: UUID) -> CbtDashboardKpis:
        transfers = self.db.query(CbtTransfer).filter(CbtTransfer.organization_id == org_id).all()
        total = len(transfers)
        active = sum(1 for t in transfers if t.status == TransferStatus.active)
        
        signed_contracts = (
            self.db.query(CbtContract)
            .filter(
                CbtContract.organization_id == org_id,
                CbtContract.status == ContractStatus.signed,
            )
            .count()
        )
        
        pending_sdf = (
            self.db.query(CbtSdfAssessment)
            .filter(
                CbtSdfAssessment.organization_id == org_id,
                CbtSdfAssessment.status == "pending",
            )
            .count()
        )

        restricted_alerts = sum(1 for t in transfers if t.country_code.upper() in RESTRICTED_COUNTRIES)

        return CbtDashboardKpis(
            total_transfers=total,
            active_transfers=active,
            signed_contracts=signed_contracts,
            pending_sdf_assessments=pending_sdf,
            restricted_countries_alert_count=restricted_alerts,
        )

    def list_transfers(self, org_id: UUID) -> list[CbtTransfer]:
        return self.db.query(CbtTransfer).filter(CbtTransfer.organization_id == org_id).all()

    def get_transfer(self, org_id: UUID, transfer_id: UUID) -> CbtTransfer:
        transfer = self.db.query(CbtTransfer).filter(
            CbtTransfer.organization_id == org_id,
            CbtTransfer.id == transfer_id,
        ).first()
        if not transfer:
            raise HTTPException(status_code=404, detail="Cross Border Transfer not found")
        return transfer

    def create_transfer(self, org_id: UUID, user: User, payload: CbtTransferCreate) -> CbtTransfer:
        org_settings = self._get_org_settings(org_id)
        is_sdf = org_settings.is_significant_data_fiduciary if org_settings else False

        # Validate country code
        if payload.country_code.upper() in RESTRICTED_COUNTRIES:
            # We allow creating a draft but with a warning, or block active transfers
            if payload.status == TransferStatus.active:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot activate transfer. Country code '{payload.country_code}' is in the restricted list.",
                )

        transfer = CbtTransfer(
            organization_id=org_id,
            data_processor_id=payload.data_processor_id,
            name=payload.name,
            destination_country=payload.destination_country,
            country_code=payload.country_code.upper(),
            destination_entity=payload.destination_entity,
            transfer_purpose=payload.transfer_purpose,
            legal_basis=payload.legal_basis,
            adequacy_status=payload.adequacy_status,
            safeguard_mechanism=payload.safeguard_mechanism,
            status=payload.status,
            is_sdf_transfer=is_sdf,
            dpia_required=is_sdf or payload.dpia_required,
            dpia_completed_at=payload.dpia_completed_at,
            next_review_date=payload.next_review_date,
            created_by_user_id=user.id,
            dpia_id=payload.dpia_id,
        )
        self.db.add(transfer)
        self.db.flush()

        self._log_activity(
            org_id=org_id,
            transfer_id=transfer.id,
            action="transfer.created",
            transfer_name=transfer.name,
            user_name=user.full_name,
            details={"destination": transfer.destination_country, "status": transfer.status},
        )

        # If DPDPA SDF enhanced requirements are met, generate a baseline pending assessment
        if transfer.dpia_required and not transfer.dpia_completed_at:
            assessment = CbtSdfAssessment(
                organization_id=org_id,
                transfer_id=transfer.id,
                assessor_name="System Baseline",
                risk_level="high" if is_sdf else "medium",
                findings="Baseline assessment created automatically for SDF transfer compliance.",
                mitigation_measures="DPIA completion required.",
                status="pending",
            )
            self.db.add(assessment)

        self.db.commit()
        return transfer

    def update_transfer(self, org_id: UUID, user: User, transfer_id: UUID, payload: CbtTransferUpdate) -> CbtTransfer:
        transfer = self.get_transfer(org_id, transfer_id)
        
        # Check restricted country if status is being set to active
        target_status = payload.status if payload.status is not None else transfer.status
        target_country_code = payload.country_code if payload.country_code is not None else transfer.country_code
        if target_status == TransferStatus.active and target_country_code.upper() in RESTRICTED_COUNTRIES:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot activate transfer. Destination country code '{target_country_code}' is restricted.",
            )

        update_data = payload.model_dump(exclude_unset=True)
        for key, val in update_data.items():
            if key == "country_code" and val is not None:
                val = val.upper()
            setattr(transfer, key, val)

        self._log_activity(
            org_id=org_id,
            transfer_id=transfer.id,
            action="transfer.updated",
            transfer_name=transfer.name,
            user_name=user.full_name,
            details=payload.model_dump(mode="json", exclude_unset=True),
        )
        self.db.commit()
        return transfer

    def delete_transfer(self, org_id: UUID, user: User, transfer_id: UUID) -> None:
        transfer = self.get_transfer(org_id, transfer_id)
        self._log_activity(
            org_id=org_id,
            transfer_id=transfer.id,
            action="transfer.deleted",
            transfer_name=transfer.name,
            user_name=user.full_name,
            details={},
        )
        self.db.delete(transfer)
        self.db.commit()

    def _log_activity(self, org_id: UUID, transfer_id: UUID | None, action: str, transfer_name: str, user_name: str, details: dict):
        act = CbtActivity(
            organization_id=org_id,
            transfer_id=transfer_id,
            action=action,
            transfer_name=transfer_name,
            user_name=user_name,
            details=details,
        )
        self.db.add(act)

    def list_activities(self, org_id: UUID, transfer_id: UUID | None = None) -> list[CbtActivity]:
        query = self.db.query(CbtActivity).filter(CbtActivity.organization_id == org_id)
        if transfer_id:
            query = query.filter(CbtActivity.transfer_id == transfer_id)
        return query.order_by(CbtActivity.created_at.desc()).all()

    # --- Contract templates & PDF Generation ---

    def render_dpa_template(self, org_id: UUID, transfer: CbtTransfer) -> str:
        template_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "templates", "cbt_dpa_template.md"
        )
        
        # Fallback raw string if template file doesn't exist
        template_content = ""
        if os.path.exists(template_path):
            with open(template_path, "r", encoding="utf-8") as f:
                template_content = f.read()
        else:
            template_content = """# DATA PROCESSING AGREEMENT & CROSS-BORDER TRANSFER CONTRACT

This Data Processing Agreement ("DPA") is entered into by and between:
1. **{{ organization_name }}** (the "Data Fiduciary")
2. **{{ destination_entity }}** (the "Offshore Data Processor")

### 1. Scope and Purpose of Transfer
The Data Fiduciary is transferring personal data of Indian Data Principals to the Offshore Data Processor in {{ destination_country }} ({{ country_code }}).
- **Purpose of processing:** {{ transfer_purpose }}
- **Legal Basis under DPDPA:** {{ legal_basis }}
- **Safeguard Mechanisms:** {{ safeguard_mechanism }}

### 2. DPDPA 2023 Section 8 Compliance Obligations
The Offshore Data Processor agrees to:
- Process the personal data only on documented instructions from the Data Fiduciary.
- Implement technical and organizational security measures to prevent unauthorized data breaches.
- Promptly notify the Data Fiduciary of any security incident or breach.
- Ensure that sub-processors are bound by equivalent data protection obligations.
- Erase personal data upon target fulfillment or termination of agreement (Section 8(7)).

{% if is_sdf %}
### 3. Significant Data Fiduciary (SDF) Enhanced Auditing Clause
As the Data Fiduciary is registered as an SDF, the Offshore Data Processor agrees to submit to periodic independent compliance audits.
{% endif %}
"""
        
        org_settings = self._get_org_settings(org_id)
        org_name = org_settings.organization.name if (org_settings and org_settings.organization) else "The Organization"
        
        t = jinja2.Template(template_content)
        return t.render(
            organization_name=org_name,
            destination_entity=transfer.destination_entity,
            destination_country=transfer.destination_country,
            country_code=transfer.country_code,
            transfer_purpose=transfer.transfer_purpose or "N/A",
            legal_basis=transfer.legal_basis.upper(),
            safeguard_mechanism=transfer.safeguard_mechanism or "Standard contractual clauses",
            is_sdf=transfer.is_sdf_transfer,
        )

    def create_contract(self, org_id: UUID, user: User, transfer_id: UUID, payload: CbtContractCreate) -> CbtContract:
        transfer = self.get_transfer(org_id, transfer_id)
        
        contract = CbtContract(
            organization_id=org_id,
            transfer_id=transfer_id,
            title=payload.title,
            status=ContractStatus.draft,
        )
        self.db.add(contract)
        self.db.flush()

        version = CbtContractVersion(
            contract_id=contract.id,
            version_number=1,
            status=ContractStatus.draft,
            content=payload.content or self.render_dpa_template(org_id, transfer),
            summary=payload.summary,
            published_by_user_id=user.id,
        )
        self.db.add(version)
        self.db.flush()
        
        contract.current_live_version_id = version.id
        
        self._log_activity(
            org_id=org_id,
            transfer_id=transfer_id,
            action="contract.created",
            transfer_name=transfer.name,
            user_name=user.full_name,
            details={"contract_title": contract.title},
        )
        self.db.commit()
        return contract

    def list_contracts(self, org_id: UUID, transfer_id: UUID) -> list[CbtContract]:
        return self.db.query(CbtContract).filter(
            CbtContract.organization_id == org_id,
            CbtContract.transfer_id == transfer_id,
        ).all()

    def get_contract(self, org_id: UUID, contract_id: UUID) -> CbtContract:
        contract = self.db.query(CbtContract).filter(
            CbtContract.organization_id == org_id,
            CbtContract.id == contract_id,
        ).first()
        if not contract:
            raise HTTPException(status_code=404, detail="DPA Contract not found")
        return contract

    def add_contract_version(self, org_id: UUID, user: User, contract_id: UUID, content: str, summary: str | None = None) -> CbtContractVersion:
        contract = self.get_contract(org_id, contract_id)
        
        last_version = (
            self.db.query(CbtContractVersion)
            .filter(CbtContractVersion.contract_id == contract_id)
            .order_by(CbtContractVersion.version_number.desc())
            .first()
        )
        next_num = (last_version.version_number + 1) if last_version else 1
        
        version = CbtContractVersion(
            contract_id=contract_id,
            version_number=next_num,
            status=ContractStatus.draft,
            content=content,
            summary=summary,
            published_by_user_id=user.id,
        )
        self.db.add(version)
        self.db.flush()
        
        self._log_activity(
            org_id=org_id,
            transfer_id=contract.transfer_id,
            action="contract.version_added",
            transfer_name=contract.transfer.name,
            user_name=user.full_name,
            details={"contract_title": contract.title, "version": next_num},
        )
        self.db.commit()
        return version

    def sign_contract(self, org_id: UUID, user: User, contract_id: UUID, version_id: UUID) -> CbtContract:
        contract = self.get_contract(org_id, contract_id)
        version = self.db.query(CbtContractVersion).filter(
            CbtContractVersion.contract_id == contract_id,
            CbtContractVersion.id == version_id,
        ).first()
        if not version:
            raise HTTPException(status_code=404, detail="Contract version not found")

        version.status = ContractStatus.signed
        version.published_at = datetime.utcnow()
        contract.status = ContractStatus.signed
        contract.current_live_version_id = version.id

        self._log_activity(
            org_id=org_id,
            transfer_id=contract.transfer_id,
            action="contract.signed",
            transfer_name=contract.transfer.name,
            user_name=user.full_name,
            details={"contract_title": contract.title, "version": version.version_number},
        )
        self.db.commit()
        return contract

    def export_contract_to_pdf(self, org_id: UUID, contract_id: UUID, version_id: UUID) -> io.BytesIO:
        contract = self.get_contract(org_id, contract_id)
        version = self.db.query(CbtContractVersion).filter(
            CbtContractVersion.contract_id == contract_id,
            CbtContractVersion.id == version_id,
        ).first()
        if not version:
            raise HTTPException(status_code=404, detail="Contract version not found")

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=54,
            leftMargin=54,
            topMargin=54,
            bottomMargin=54,
        )

        styles = getSampleStyleSheet()
        
        # Custom styles matching our design system
        title_style = ParagraphStyle(
            name="DpaTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#1E1B4B"),  # Deep indigo
            fontSize=18,
            leading=22,
        )
        
        h2_style = ParagraphStyle(
            name="DpaHeading2",
            parent=styles["Heading2"],
            textColor=colors.HexColor("#312E81"),
            fontSize=13,
            leading=16,
            spaceBefore=12,
            spaceAfter=6,
        )

        h3_style = ParagraphStyle(
            name="DpaHeading3",
            parent=styles["Heading3"],
            textColor=colors.HexColor("#4338CA"),
            fontSize=11,
            leading=14,
            spaceBefore=8,
            spaceAfter=4,
        )

        body_style = ParagraphStyle(
            name="DpaBody",
            parent=styles["Normal"],
            alignment=TA_JUSTIFY,
            fontSize=9.5,
            leading=13.5,
            spaceAfter=6,
        )

        bullet_style = ParagraphStyle(
            name="DpaBullet",
            parent=styles["Normal"],
            leftIndent=15,
            fontSize=9.5,
            leading=13.5,
            spaceAfter=4,
        )

        story = []
        
        # Header banner
        story.append(Paragraph("DIGITAL PERSONAL DATA PROTECTION ACT (DPDPA) COMPLIANCE", ParagraphStyle(
            name="TopBanner",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#4F46E5"),
            fontSize=8,
            leading=10,
        )))
        story.append(Spacer(1, 10))

        # Split markdown lines and construct ReportLab elements
        lines = version.content.split("\n")
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            if line_str.startswith("# "):
                # Document Title
                text = line_str[2:].replace("**", "").replace("*", "")
                story.append(Paragraph(text, title_style))
                story.append(Spacer(1, 15))
            elif line_str.startswith("## "):
                # Heading 2
                text = line_str[3:].replace("**", "").replace("*", "")
                story.append(Paragraph(text, h2_style))
            elif line_str.startswith("### "):
                # Heading 3
                text = line_str[4:].replace("**", "").replace("*", "")
                story.append(Paragraph(text, h3_style))
            elif line_str.startswith("- ") or line_str.startswith("* "):
                # Bullet list item
                text = line_str[2:]
                # Inline bold replacement **bold** -> <b>bold</b>
                while "**" in text:
                    text = text.replace("**", "<b>", 1).replace("**", "</b>", 1)
                story.append(Paragraph(f"&bull; {text}", bullet_style))
            else:
                # Normal paragraph
                text = line_str
                while "**" in text:
                    text = text.replace("**", "<b>", 1).replace("**", "</b>", 1)
                story.append(Paragraph(text, body_style))

        # Certificate seal
        story.append(Spacer(1, 30))
        cert_data = [
            [
                Paragraph(
                    f"<b>Document Status:</b> {version.status.upper()}<br/>"
                    f"<b>Executed By:</b> Vajra Legal Engine<br/>"
                    f"<b>Verification Hash:</b> {hash(version.content)}",
                    body_style,
                )
            ]
        ]
        cert_table = Table(cert_data, colWidths=[doc.width])
        cert_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF2F6")),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#CBD5E1")),
                    ("PADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(cert_table)

        doc.build(story)
        buffer.seek(0)
        return buffer

    # --- Notice Campaign dispatching integration ---

    def trigger_notice_campaign(self, org_id: UUID, user: User, transfer_id: UUID) -> NoticeCampaign:
        transfer = self.get_transfer(org_id, transfer_id)
        
        # 1. Look for first active Consent Notice of this organization
        consent_notice = (
            self.db.query(ConsentNotice)
            .filter(ConsentNotice.organization_id == org_id)
            .first()
        )
        if not consent_notice:
            # Create a placeholder notice if none exists
            consent_notice = ConsentNotice(
                organization_id=org_id,
                name="Global Consent Notice",
                description="Seeded consent notice for CBT disclosures.",
            )
            self.db.add(consent_notice)
            self.db.flush()

        # 2. Create the NoticeCampaign
        campaign_name = f"Cross-Border Transfer Disclosure - {transfer.name}"
        
        # Check if identical running/scheduled campaign already exists to avoid duplication
        existing = (
            self.db.query(NoticeCampaign)
            .filter(
                NoticeCampaign.organization_id == org_id,
                NoticeCampaign.name == campaign_name,
                NoticeCampaign.status.in_(["scheduled", "running"]),
            )
            .first()
        )
        if existing:
            return existing

        campaign = NoticeCampaign(
            organization_id=org_id,
            name=campaign_name,
            notice_id=consent_notice.id,
            status="scheduled",
            delivery_strategy="smart" if transfer.is_sdf_transfer else "email_only",
            fallback_chain=["email", "sms"],
            recipient_segment="all",
            schedule_type="immediate",
            schedule_config={},
            created_by_user_id=user.id,
        )
        self.db.add(campaign)
        self.db.flush()

        # Set default RetryPolicy
        policy = RetryPolicy(
            campaign_id=campaign.id,
            max_attempts=3,
            backoff_seconds=300,
            timeout_seconds=30,
        )
        self.db.add(policy)

        self._log_activity(
            org_id=org_id,
            transfer_id=transfer_id,
            action="transfer.notice_campaign_triggered",
            transfer_name=transfer.name,
            user_name=user.full_name,
            details={"campaign_id": str(campaign.id), "campaign_name": campaign.name},
        )
        self.db.commit()
        return campaign

    # --- SDF Compliance checks & Assessments ---

    def create_sdf_assessment(self, org_id: UUID, user: User, transfer_id: UUID, payload: CbtSdfAssessmentCreate) -> CbtSdfAssessment:
        transfer = self.get_transfer(org_id, transfer_id)
        
        # Resolve any existing pending assessments
        pending = (
            self.db.query(CbtSdfAssessment)
            .filter(
                CbtSdfAssessment.organization_id == org_id,
                CbtSdfAssessment.transfer_id == transfer_id,
                CbtSdfAssessment.status == "pending",
            )
            .all()
        )
        for p in pending:
            p.status = "completed"

        assessment = CbtSdfAssessment(
            organization_id=org_id,
            transfer_id=transfer_id,
            assessor_name=payload.assessor_name,
            risk_level=payload.risk_level,
            findings=payload.findings,
            mitigation_measures=payload.mitigation_measures,
            status="completed",
        )
        self.db.add(assessment)
        
        # If successfully assessed, update transfer state
        transfer.dpia_completed_at = datetime.utcnow()
        
        self._log_activity(
            org_id=org_id,
            transfer_id=transfer_id,
            action="sdf.assessment_completed",
            transfer_name=transfer.name,
            user_name=user.full_name,
            details={"assessor": assessment.assessor_name, "risk": assessment.risk_level},
        )
        self.db.commit()
        return assessment

    def list_sdf_assessments(self, org_id: UUID, transfer_id: UUID) -> list[CbtSdfAssessment]:
        return self.db.query(CbtSdfAssessment).filter(
            CbtSdfAssessment.organization_id == org_id,
            CbtSdfAssessment.transfer_id == transfer_id,
        ).all()
