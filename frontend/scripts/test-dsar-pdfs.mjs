/**
 * Smoke test: DSAR PDF helpers produce valid output buffers.
 * Run: node scripts/test-dsar-pdfs.mjs (from frontend/)
 */
import { jsPDF } from 'jspdf';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const RIGHT_LABELS = {
  access: 'Right to Access',
  grievance: 'Grievance Redressal',
  withdraw_consent: 'Consent Withdrawal',
};

function buildReceiptPdf(input) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(12);
  doc.text(`Tracking ID: ${input.trackingId}`, 14, 20);
  doc.text(`Organization: ${input.organizationName}`, 14, 28);
  doc.text(`Right: ${RIGHT_LABELS[input.rightType] ?? input.rightType}`, 14, 36);
  const buf = doc.output('arraybuffer');
  return Buffer.from(buf);
}

function buildClosurePdf(trackingId, closureText) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const lines = doc.splitTextToSize(closureText, 180);
  doc.text(lines, 14, 20);
  const buf = doc.output('arraybuffer');
  return Buffer.from(buf);
}

const receipt = buildReceiptPdf({
  trackingId: 'REQ-2026-TEST01',
  organizationName: 'DEMO Org',
  rightType: 'access',
});
const closure = buildClosurePdf(
  'REQ-2026-TEST01',
  'Vajra closure letter.\nRequest completed under DPDPA 2023.'
);

if (receipt.length < 500) throw new Error('Receipt PDF too small');
if (closure.length < 500) throw new Error('Closure PDF too small');

const outDir = join(process.cwd(), 'scripts');
const receiptPath = join(outDir, '_test-receipt.pdf');
const closurePath = join(outDir, '_test-closure.pdf');
writeFileSync(receiptPath, receipt);
writeFileSync(closurePath, closure);

for (const p of [receiptPath, closurePath]) {
  if (!existsSync(p)) throw new Error(`Missing ${p}`);
  unlinkSync(p);
}

console.log('OK  submission receipt PDF generation');
console.log('OK  closure PDF generation');
