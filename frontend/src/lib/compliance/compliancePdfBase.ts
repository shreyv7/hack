import { jsPDF } from 'jspdf';

export const MARGIN = 14;
export const PAGE_BOTTOM = 283;
export const CONTENT_WIDTH = 182;

const BRAND = { r: 79, g: 70, b: 229 };
const MUTED = { r: 100, g: 100, b: 100 };
const SUCCESS = { r: 22, g: 163, b: 74 };
const WARNING = { r: 217, g: 119, b: 6 };
const DANGER = { r: 220, g: 38, b: 38 };

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  return String(value);
}

function scoreColor(score: number): { r: number; g: number; b: number } {
  if (score >= 80) return SUCCESS;
  if (score >= 60) return WARNING;
  return DANGER;
}

function riskLevelColor(level: string): { r: number; g: number; b: number } {
  if (level === 'low') return SUCCESS;
  if (level === 'medium') return WARNING;
  return DANGER;
}

export class CompliancePdf {
  doc: jsPDF;
  y = MARGIN;
  private pageNumber = 1;

  constructor(title?: string) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4' });
    if (title) this.heading(title);
  }

  ensure(mm: number): void {
    if (this.y + mm > PAGE_BOTTOM) {
      this.addPage();
    }
  }

  addPage(): void {
    this.drawFooter();
    this.doc.addPage();
    this.pageNumber += 1;
    this.y = MARGIN;
  }

  private drawFooter(): void {
    const footerY = 290;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    this.doc.text('Vajra Vajra · Confidential', MARGIN, footerY);
    this.doc.text(`Page ${this.pageNumber}`, MARGIN + CONTENT_WIDTH, footerY, { align: 'right' });
    this.doc.setTextColor(0, 0, 0);
  }

  brandHeader(subtitle: string): void {
    this.doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    this.doc.rect(0, 0, 210, 28, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text('Vajra', MARGIN, 12);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.text(subtitle, MARGIN, 20);
    this.doc.setTextColor(0, 0, 0);
    this.y = 36;
  }

  reportTitle(title: string): void {
    this.ensure(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(18);
    this.doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    this.doc.text(title, MARGIN, this.y);
    this.y += 10;
    this.doc.setTextColor(0, 0, 0);
  }

  metaRow(label: string, value: string): void {
    this.ensure(6);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    this.doc.text(`${label}: `, MARGIN, this.y);
    const labelWidth = this.doc.getTextWidth(`${label}: `);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(value, MARGIN + labelWidth, this.y);
    this.y += 5;
  }

  heading(text: string): void {
    this.ensure(12);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    this.doc.text(text, MARGIN, this.y);
    this.y += 8;
    this.doc.setTextColor(0, 0, 0);
  }

  subheading(text: string): void {
    this.ensure(8);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text(text, MARGIN, this.y);
    this.y += 6;
  }

  paragraph(text: string, fontSize = 10): void {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(fontSize);
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (const l of lines) {
      this.ensure(5);
      this.doc.text(l, MARGIN, this.y);
      this.y += 5;
    }
    this.y += 2;
  }

  field(label: string, value: unknown): void {
    const text = display(value);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.ensure(6);
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    this.doc.text(label, MARGIN, this.y);
    this.y += 4;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(0, 0, 0);
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (const line of lines) {
      this.ensure(5);
      this.doc.text(line, MARGIN + 2, this.y);
      this.y += 5;
    }
    this.y += 2;
  }

  divider(): void {
    this.y += 2;
    this.doc.setDrawColor(220, 220, 220);
    this.doc.line(MARGIN, this.y, MARGIN + CONTENT_WIDTH, this.y);
    this.y += 6;
  }

  line(text: string, fontSize = 10): void {
    this.paragraph(text, fontSize);
  }

  scoreHero(score: number, statusLabel: string, deltaWeek: number | null): void {
    this.ensure(42);
    const color = scoreColor(score);
    this.doc.setFillColor(color.r, color.g, color.b);
    this.doc.roundedRect(MARGIN, this.y, 50, 32, 3, 3, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(22);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text(`${score}`, MARGIN + 25, this.y + 16, { align: 'center' });
    this.doc.setFontSize(8);
    this.doc.text('SCORE', MARGIN + 25, this.y + 24, { align: 'center' });

    const textX = MARGIN + 58;
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.text(statusLabel, textX, this.y + 10);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    if (deltaWeek != null) {
      const sign = deltaWeek > 0 ? '+' : '';
      const deltaColor = deltaWeek > 0 ? SUCCESS : deltaWeek < 0 ? DANGER : MUTED;
      this.doc.setTextColor(deltaColor.r, deltaColor.g, deltaColor.b);
      this.doc.text(`${sign}${deltaWeek} pts this week`, textX, this.y + 18);
    }
    this.doc.setTextColor(0, 0, 0);
    this.y += 38;
  }

  kpiGrid(items: Array<{ label: string; value: string; hint?: string | null }>, cols = 2): void {
    const colWidth = CONTENT_WIDTH / cols;
    const rowHeight = 18;
    const rows = Math.ceil(items.length / cols);
    this.ensure(rows * rowHeight + 4);

    items.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = MARGIN + col * colWidth;
      const y = this.y + row * rowHeight;

      this.doc.setDrawColor(230, 230, 230);
      this.doc.setFillColor(248, 248, 252);
      this.doc.roundedRect(x, y, colWidth - 4, rowHeight - 2, 2, 2, 'FD');

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      this.doc.text(item.label.toUpperCase(), x + 3, y + 6);

      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(12);
      this.doc.setTextColor(0, 0, 0);
      this.doc.text(item.value, x + 3, y + 13);

      if (item.hint) {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(7);
        this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        const hintLines = this.doc.splitTextToSize(item.hint, colWidth - 8) as string[];
        if (hintLines[0]) {
          this.doc.text(hintLines[0], x + 3, y + 17);
        }
      }
    });

    this.y += rows * rowHeight + 4;
    this.doc.setTextColor(0, 0, 0);
  }

  table(headers: string[], rows: string[][], colWidths?: number[]): void {
    const widths = colWidths ?? headers.map(() => CONTENT_WIDTH / headers.length);
    const rowHeight = 7;
    this.ensure(rowHeight + 4);

    let x = MARGIN;
    this.doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    this.doc.rect(MARGIN, this.y - 4, CONTENT_WIDTH, rowHeight, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(255, 255, 255);
    headers.forEach((header, i) => {
      this.doc.text(header, x + 2, this.y);
      x += widths[i];
    });
    this.y += rowHeight;
    this.doc.setTextColor(0, 0, 0);

    rows.forEach((row, rowIndex) => {
      this.ensure(rowHeight);
      if (rowIndex % 2 === 0) {
        this.doc.setFillColor(248, 248, 252);
        this.doc.rect(MARGIN, this.y - 4, CONTENT_WIDTH, rowHeight, 'F');
      }
      x = MARGIN;
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      row.forEach((cell, i) => {
        const clipped = this.doc.splitTextToSize(cell, widths[i] - 4)[0] as string;
        this.doc.text(clipped, x + 2, this.y);
        x += widths[i];
      });
      this.y += rowHeight;
    });
    this.y += 4;
  }

  progressBar(label: string, score: number, detail?: string): void {
    this.ensure(12);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.text(label, MARGIN, this.y);
    if (detail) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      this.doc.text(detail, MARGIN + CONTENT_WIDTH, this.y, { align: 'right' });
      this.doc.setTextColor(0, 0, 0);
    }
    this.y += 4;

    const barY = this.y;
    this.doc.setFillColor(230, 230, 230);
    this.doc.roundedRect(MARGIN, barY, CONTENT_WIDTH, 4, 1, 1, 'F');
    const color = scoreColor(score);
    const fillWidth = Math.max(2, (CONTENT_WIDTH * score) / 100);
    this.doc.setFillColor(color.r, color.g, color.b);
    this.doc.roundedRect(MARGIN, barY, fillWidth, 4, 1, 1, 'F');
    this.y += 8;
  }

  gapItem(severity: string, label: string, section?: string): void {
    this.ensure(10);
    const color = riskLevelColor(severity === 'critical' || severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low');
    this.doc.setFillColor(color.r, color.g, color.b);
    this.doc.roundedRect(MARGIN, this.y - 3, 18, 5, 1, 1, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text(severity.toUpperCase(), MARGIN + 9, this.y, { align: 'center' });

    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    const textX = MARGIN + 22;
    const lines = this.doc.splitTextToSize(label, CONTENT_WIDTH - 24) as string[];
    this.doc.text(lines[0], textX, this.y);
    if (section) {
      this.doc.setFontSize(7);
      this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      this.doc.text(section, textX, this.y + 4);
      this.y += 4;
    }
    this.y += 6;
  }

  bulletItem(text: string): void {
    this.ensure(6);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.text('•', MARGIN + 2, this.y);
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH - 8) as string[];
    lines.forEach((line, i) => {
      if (i > 0) this.ensure(5);
      this.doc.text(line, MARGIN + 6, this.y);
      this.y += 5;
    });
    this.y += 1;
  }

  save(filename: string): string {
    this.drawFooter();
    this.doc.save(filename);
    return filename;
  }
}

export { scoreColor, riskLevelColor, display };
