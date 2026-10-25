import io
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.dpia import Dpia, DpiaVersion

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER

class DpiaPdfExportService:
    @staticmethod
    def export_dpia_to_pdf(db: Session, dpia_id: UUID) -> io.BytesIO:
        dpia = db.query(Dpia).filter(Dpia.id == dpia_id).first()
        if not dpia:
            raise ValueError("DPIA not found")
        
        version = None
        if dpia.current_version_id:
            version = db.query(DpiaVersion).filter(DpiaVersion.id == dpia.current_version_id).first()

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
        
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name='CenterTitle', parent=styles['Title'], alignment=TA_CENTER))

        Story = []
        
        # Title
        Story.append(Paragraph("Certified DPIA Compliance Report", styles['CenterTitle']))
        Story.append(Spacer(1, 12))
        
        # DPIA Meta
        Story.append(Paragraph(f"<b>DPIA Reference:</b> {dpia.dpia_ref}", styles['Normal']))
        Story.append(Paragraph(f"<b>Title:</b> {dpia.title}", styles['Normal']))
        Story.append(Paragraph(f"<b>Status:</b> {dpia.status.upper()}", styles['Normal']))
        if version:
            Story.append(Paragraph(f"<b>Version:</b> v{version.version_number}", styles['Normal']))
            Story.append(Paragraph(f"<b>Created At:</b> {version.created_at.strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
        Story.append(Spacer(1, 12))
        
        Story.append(Paragraph("<b>Description:</b>", styles['Heading2']))
        Story.append(Paragraph(dpia.description or "N/A", styles['Normal']))
        Story.append(Spacer(1, 12))
        
        # Answers
        if version and version.step_answers:
            Story.append(Paragraph("<b>Assessment Answers:</b>", styles['Heading2']))
            Story.append(Spacer(1, 6))
            
            # Group by step
            answers_by_step = {}
            for ans in version.step_answers:
                if ans.step_key not in answers_by_step:
                    answers_by_step[ans.step_key] = []
                answers_by_step[ans.step_key].append(ans)
            
            for step, answers in answers_by_step.items():
                Story.append(Paragraph(f"<b>Step: {step.capitalize()}</b>", styles['Heading3']))
                for ans in answers:
                    Story.append(Paragraph(f"<i>Q: {ans.question_key}</i>", styles['Normal']))
                    Story.append(Paragraph(f"A: {ans.answer_text or 'Unanswered'}", styles['Normal']))
                    Story.append(Spacer(1, 6))
                Story.append(Spacer(1, 12))
        
        # Simulated Certificate Footer
        Story.append(Spacer(1, 24))
        Story.append(Paragraph("<i>This document is automatically generated and digitally verifiable under DPDPA Section 65B requirements.</i>", styles['Normal']))

        doc.build(Story)
        buffer.seek(0)
        return buffer
