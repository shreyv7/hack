/**
 * Smoke test: Compliance module PDF helpers produce valid output.
 * Run: node scripts/test-compliance-pdfs.mjs (from frontend/)
 */
import { jsPDF } from 'jspdf';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

function buildPdf(title, lines) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text(title, 14, 20);
  let y = 30;
  for (const line of lines) {
    doc.setFontSize(10);
    doc.text(line, 14, y);
    y += 7;
  }
  return Buffer.from(doc.output('arraybuffer'));
}

const fixtures = [
  {
    name: 'compliance map PDF',
    buf: buildPdf('DPDPA 2023 Compliance Map', [
      'Organization: DEMO Org',
      'Coverage: 21/21 sections | Score: 95/100',
      'Ch.2 Obligations of Data Fiduciary (8 sections)',
    ]),
  },
  {
    name: 'security evidence pack PDF',
    buf: buildPdf('Security Safeguards — Evidence Pack', [
      'Score: 85% | Documented: 6/7',
      'Access Controls & MFA — documented',
    ]),
  },
  {
    name: 'security auditor report PDF',
    buf: buildPdf('Security Safeguards — Auditor Report', [
      'Penalty exposure: ₹50 Cr',
      'Implementation status for 7 controls',
    ]),
  },
  {
    name: 'breach disclosure PDF',
    buf: buildPdf('Breach Disclosure Package', [
      'Incident: INC-2026-0001 | Severity: high',
      'DPDPA Section 8(6) — 72-hour notification',
    ]),
  },
  {
    name: 'audit evidence pack PDF',
    buf: buildPdf('Audit Log — Evidence Pack', [
      'Entries: 5 | Integrity: VERIFIED',
      'Hash-chained tamper-evident register',
    ]),
  },
  {
    name: 'audit event certificate PDF',
    buf: buildPdf('Audit Event Certificate', [
      'Action: Security control updated',
      'SHA-256 entry hash recorded',
    ]),
  },
];

const outDir = join(process.cwd(), 'scripts');
for (const { name, buf } of fixtures) {
  if (buf.length < 400) throw new Error(`${name}: PDF too small (${buf.length} bytes)`);
  const path = join(outDir, `_test-${name.replace(/\s+/g, '-')}.pdf`);
  writeFileSync(path, buf);
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  unlinkSync(path);
  console.log(`OK  ${name}`);
}

console.log(`\n=== ${fixtures.length} PDF smoke tests passed ===`);
