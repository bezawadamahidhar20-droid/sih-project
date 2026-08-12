import io
import json
from pathlib import Path
from typing import Optional
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage

def generate_prediction_pdf(
    prediction_id: int,
    scan_id: int,
    predicted_class: str,
    confidence: float,
    all_probabilities: dict,
    explanation: Optional[str],
    is_flagged: bool,
    anonymized_patient_id: Optional[str],
    modality: Optional[str],
    body_part: Optional[str],
    original_image_path: Optional[Path],
    gradcam_image_path: Optional[Path],
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0F5C8C'),
        fontName='Helvetica-Bold',
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=13,
        textColor=colors.HexColor('#475569'),
    )
    section_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#0F2430'),
        fontName='Helvetica-Bold',
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        'BodyText',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#1E293B'),
    )

    story = []

    # Header
    story.append(Paragraph("🩻 MediScan AI — Clinical Radiology Report", title_style))
    story.append(Paragraph("AI-Assisted Diagnostic Decision Support Document | Confidential & Anonymized", subtitle_style))
    story.append(Spacer(1, 10))

    # Patient & Study Details Table
    patient_info = [
        [
            Paragraph(f"<b>Scan ID:</b> #{scan_id}", body_style),
            Paragraph(f"<b>Patient ID:</b> {anonymized_patient_id or 'ANON_PATIENT'}", body_style),
        ],
        [
            Paragraph(f"<b>Modality:</b> {modality or 'Chest X-Ray'}", body_style),
            Paragraph(f"<b>Body Part:</b> {body_part or 'CHEST'}", body_style),
        ],
        [
            Paragraph(f"<b>Prediction ID:</b> #{prediction_id}", body_style),
            Paragraph(f"<b>Review Status:</b> {'🚩 Flagged for Review' if is_flagged else 'Verified Clean'} ", body_style),
        ],
    ]
    t_info = Table(patient_info, colWidths=[270, 270])
    t_info.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
    ]))
    story.append(t_info)
    story.append(Spacer(1, 12))

    # Diagnostic Verdict Box
    story.append(Paragraph("Primary AI Diagnostic Verdict", section_style))
    conf_pct = int(confidence * 100)
    verdict_text = f"<b>Primary Finding:</b> <font color='#0F5C8C' size=12><b>{predicted_class}</b></font> ({conf_pct}% Confidence)"
    
    verdict_table = Table([[Paragraph(verdict_text, body_style)]], colWidths=[540])
    verdict_bg = colors.HexColor('#FEF2F2') if 'Pneumonia' in predicted_class or confidence < 0.7 else colors.HexColor('#F0FDF4')
    verdict_border = colors.HexColor('#FCA5A5') if 'Pneumonia' in predicted_class or confidence < 0.7 else colors.HexColor('#86EFAC')
    
    verdict_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), verdict_bg),
        ('BOX', (0, 0), (-1, -1), 1, verdict_border),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(verdict_table)
    story.append(Spacer(1, 10))

    # Multi-label findings table
    if all_probabilities:
        story.append(Paragraph("Multi-Label Findings & Probabilities", section_style))
        findings_rows = [[Paragraph("<b>Condition / Finding</b>", body_style), Paragraph("<b>Probability Score</b>", body_style), Paragraph("<b>Status</b>", body_style)]]
        for cond, prob in all_probabilities.items():
            p_val = int(prob * 100)
            status_str = "Detected (High Risk)" if p_val >= 75 else "Detected" if p_val >= 40 else "Negative"
            findings_rows.append([
                Paragraph(cond, body_style),
                Paragraph(f"{p_val}%", body_style),
                Paragraph(status_str, body_style),
            ])
        t_findings = Table(findings_rows, colWidths=[200, 170, 170])
        t_findings.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F5C8C')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('PADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ]))
        story.append(t_findings)
        story.append(Spacer(1, 10))

    # Natural Language Explainability
    if explanation:
        story.append(Paragraph("Natural-Language XAI Clinical Explanation", section_style))
        exp_table = Table([[Paragraph(f"<i>“{explanation}”</i>", body_style)]], colWidths=[540])
        exp_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(exp_table)
        story.append(Spacer(1, 12))

    # Images (Original Scan + Grad-CAM Heatmap side by side)
    img_cells = []
    if original_image_path and original_image_path.exists():
        try:
            img_cells.append(RLImage(str(original_image_path), width=240, height=240))
        except Exception:
            img_cells.append(Paragraph("Patient Scan Image", body_style))
    else:
        img_cells.append(Paragraph("Patient Scan Image", body_style))

    if gradcam_image_path and gradcam_image_path.exists():
        try:
            img_cells.append(RLImage(str(gradcam_image_path), width=240, height=240))
        except Exception:
            img_cells.append(Paragraph("Grad-CAM Heatmap Image", body_style))
    else:
        img_cells.append(Paragraph("Grad-CAM Heatmap Image", body_style))

    if len(img_cells) == 2:
        story.append(Paragraph("Radiological Images (Original Scan vs Grad-CAM Attention Map)", section_style))
        img_table = Table([[img_cells[0], img_cells[1]]], colWidths=[270, 270])
        img_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(img_table)

    doc.build(story)
    return buffer.getvalue()
