import { jsPDF } from 'jspdf';

export function downloadClosurePdf(
  trackingId: string,
  closureText: string,
  organizationName: string
): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const width = 182;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Vajra — Closure Letter', margin, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(closureText, width) as string[];
  let y = 30;
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 5;
  }
  const slug = organizationName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const filename = `dsar-closure-${trackingId}-${slug}.pdf`;
  doc.save(filename);
  return filename;
}
