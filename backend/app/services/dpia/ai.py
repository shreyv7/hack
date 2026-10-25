import json
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.dpia import Dpia, DpiaVersion
from app.services import shield_ai_service

from app.services.shield_ai_service import ShieldAIError

class DpiaAiService:
    @staticmethod
    def _build_context(db: Session, dpia_id: UUID) -> str:
        dpia = db.query(Dpia).filter(Dpia.id == dpia_id).first()
        if not dpia or not dpia.current_version_id:
            return "DPIA not found or has no active version."

        version = db.query(DpiaVersion).filter(DpiaVersion.id == dpia.current_version_id).first()
        if not version:
            return "Active version not found."

        # Compile answers
        answers_by_step = {}
        for ans in version.step_answers:
            if ans.step_key not in answers_by_step:
                answers_by_step[ans.step_key] = []
            answers_by_step[ans.step_key].append(
                f"Question Key: {ans.question_key}\nAnswer: {ans.answer_text}"
            )
        
        context_parts = [f"DPIA Title: {dpia.title}", f"Description: {dpia.description or 'N/A'}\n"]
        
        for step, qa_list in answers_by_step.items():
            context_parts.append(f"--- Step: {step} ---")
            context_parts.extend(qa_list)
            context_parts.append("")

        return "\n".join(context_parts)

    @staticmethod
    def _get_answers_dict(db: Session, dpia_id: UUID) -> dict:
        dpia = db.query(Dpia).filter(Dpia.id == dpia_id).first()
        if not dpia or not dpia.current_version_id:
            return {}
        version = db.query(DpiaVersion).filter(DpiaVersion.id == dpia.current_version_id).first()
        if not version:
            return {}
        return {ans.question_key: ans.answer_text for ans in version.step_answers}

    @staticmethod
    def analyze_dpia(db: Session, dpia_id: UUID) -> str:
        """Run a full gap analysis against Indian Data Localization and DPDPA Rules."""
        context = DpiaAiService._build_context(db, dpia_id)
        
        task = (
            "Analyze the following DPIA assessment answers specifically against the "
            "Digital Personal Data Protection Act, 2023 (DPDPA) and Indian data localization regulations. "
            "Identify any major compliance gaps, especially concerning cross-border data transfers, "
            "consent, and data minimization. Return your analysis in markdown format."
        )
        
        try:
            return shield_ai_service.generate(task=task, context=context, max_tokens=1500)
        except ShieldAIError:
            # Fallback mock compliance evaluation against DPDPA data localization rules
            answers = DpiaAiService._get_answers_dict(db, dpia_id)
            
            cross_border = answers.get("cross_border", "No")
            child_data = answers.get("child_data", "No")
            parental_consent = answers.get("parental_consent_flow", "N/A")
            retention = answers.get("retention", "Fixed duration")
            third_party = answers.get("third_party_sharing", "No")
            ai_profiling = answers.get("ai_profiling", "No")
            activity_name = answers.get("activity_name", "Processing Activity")
            business_purpose = answers.get("business_purpose", "Not specified")

            report_md = f"""### 🛡️ DPDPA Shield AI Compliance Analysis (Simulated Mode)

*Note: AWS Bedrock is currently offline or unconfigured. Showing a simulated compliance analysis powered by the local DPDPA Risk Engine.*

---

#### 1. Executive Summary
- **Processing Activity**: {activity_name}
- **Primary Business Purpose**: {business_purpose}
- **Target Jurisdiction**: Republic of India (DPDPA, 2023)

Based on the initial processing attributes, we evaluated the compliance posture of this activity against the provisions of the **Digital Personal Data Protection Act, 2023**.

---

#### 2. Compliance Gaps & Risks Detected
"""
            gaps_count = 0
            if cross_border == "Yes":
                gaps_count += 1
                report_md += """
##### ❌ GAP-01: Cross-Border Data Transfer Limitations (DPDPA Sec. 10(4))
- **Status**: **HIGH RISK**
- **Findings**: The system transfers personal data outside territorial boundaries of India. Under DPDPA, cross-border transfers are subject to restricting notifications issued by the Central Government.
- **Recommended Action**: Implement **Standard Contractual Clauses (SCC)** immediately with external data fiduciaries/processors. Ensure no transfers occur to restricted/blacklisted jurisdictions.
"""
            
            if child_data == "Yes" and parental_consent != "Yes":
                gaps_count += 1
                report_md += """
##### ❌ GAP-02: Children's Consent Workflow Deficiency (DPDPA Sec. 9)
- **Status**: **CRITICAL RISK**
- **Findings**: The activity processes personal data of minors under 18 years of age without a verified parental consent workflow. Section 9 of the DPDPA strictly prohibits processing minors' data without verifiable consent of their parent or lawful guardian.
- **Recommended Action**: Integrate age-gating verification mechanisms and introduce a **Parent/Guardian Authorization Sequence** prior to data collection.
"""

            if retention in ["Long term", "Indefinite"]:
                gaps_count += 1
                report_md += f"""
##### ❌ GAP-03: Indefinite/Long-term Storage and Retention (DPDPA Sec. 8(10))
- **Status**: **MEDIUM RISK**
- **Findings**: Retention is set to '{retention}'. Under DPDPA, data fiduciaries must erase personal data once the purpose for collection is satisfied, or when the data principal withdraws consent.
- **Recommended Action**: Transition to a **Fixed duration** retention policy. Implement automated data purging workflows triggered immediately upon expiration of the compliance holding period.
"""

            if third_party == "Yes":
                gaps_count += 1
                report_md += """
##### ❌ GAP-04: Third-Party Processor Contracts (DPDPA Sec. 8(1))
- **Status**: **MEDIUM RISK**
- **Findings**: Personal data is shared with external processors. Section 8(1) requires a binding agreement outlining technical and organizational security measures to protect the personal data.
- **Recommended Action**: Review vendor onboarding guidelines and execute custom Data Processing Agreements (DPAs) incorporating technical safeguards.
"""

            if ai_profiling == "Yes":
                gaps_count += 1
                report_md += """
##### ⚠️ GAP-05: Algorithmic Profiling & Automated Decisioning (DPDPA Sec. 6 & Sec. 8)
- **Status**: **LOW RISK**
- **Findings**: Algorithmic decisioning/sorting models are employed. This requires higher standards of notice delivery to explain the logic of processing to data principals.
- **Recommended Action**: Update the privacy Notice to explicitly outline the parameters of automated profiling and user rights.
"""

            if gaps_count == 0:
                report_md += """
##### ✅ No Critical Gaps Identified
- **Status**: **COMPLIANT**
- **Findings**: Basic screening indicates that the data processing inputs provided align with foundational DPDPA controls. Ensure continuous monitoring of operational practices.
"""

            report_md += """
---

#### 3. Standard DPDPA Notice & Consent Check
- **Notice Delivery**: Under Section 5(1), every request for consent must be accompanied or preceded by a notice containing details of data processed, purpose, and grievance redressal options.
- **Consent Properties**: Under Section 6, consent must be free, specific, informed, unconditional, and unambiguous.

*Reminder: This automated analysis does not constitute legal counsel. Please verify final notice language and operational architecture with a qualified Data Protection Officer (DPO).*
"""
            return report_md

    @staticmethod
    def get_recommendations(db: Session, dpia_id: UUID, count: int = 4) -> list[str]:
        """Fetch actionable recommendations for the DPIA."""
        context = DpiaAiService._build_context(db, dpia_id)
        
        try:
            return shield_ai_service.recommendations(
                topic="DPDPA compliance mitigation recommendations",
                context=context,
                count=count
            )
        except ShieldAIError:
            # Fallback mock recommendations based on answers
            answers = DpiaAiService._get_answers_dict(db, dpia_id)
            recs = []
            
            if answers.get("cross_border") == "Yes":
                recs.append("Execute Standard Contractual Clauses (SCC) restricting data usage by overseas recipients.")
                recs.append("Restrict cross-border processing locations to sovereign regions white-listed by India.")
            if answers.get("child_data") == "Yes":
                recs.append("Implement verified parent/guardian age-consent flows to comply with DPDPA Section 9.")
            if answers.get("retention") in ["Long term", "Indefinite"]:
                recs.append("Establish automatic purging routines for user profiles past their retention threshold.")
            if answers.get("third_party_sharing") == "Yes":
                recs.append("Sign standard-conforming Data Processing Agreements (DPAs) with third-party vendors.")
            if answers.get("ai_profiling") == "Yes":
                recs.append("Disclose criteria for automated profiling clearly in the user notice document.")
                
            # Default recommendations if we need more or have none
            recs.extend([
                "Maintain clear contact details for the grievance officer in the privacy notice.",
                "Conduct annual independent security audits on core storage assets.",
                "Implement field-level encryption for biometric or financial identifiers.",
                "Establish a 72-hour internal protocol for security breach notifications."
            ])
            return recs[:count]

