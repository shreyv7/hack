import type { ReactElement } from 'react';
import { AlertTriangle, Check, Download, FileText, History, Loader2, X } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { techniqueClassLabel, isTrueAnonymisation } from '@/lib/anonymisation/techniqueTaxonomy';
import type { AnonymisationJob } from '@/types/anonymisation';
import { SCHEDULE_LABELS, TECHNIQUE_LABELS, TREATMENT_LABELS } from '@/types/anonymisation';

interface AnonymisationJobDrawerProps {
  job: AnonymisationJob;
  onClose: () => void;
  isAdmin: boolean;
  onDownload: (job: AnonymisationJob) => void;
  onEvidence: (job: AnonymisationJob) => void;
  onHistory: (job: AnonymisationJob) => void;
  downloadingId: string | null;
  evidenceId: string | null;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AnonymisationJobDrawer({
  job,
  onClose,
  isAdmin,
  onDownload,
  onEvidence,
  onHistory,
  downloadingId,
  evidenceId,
}: AnonymisationJobDrawerProps): ReactElement {
  const drift = job.monitor_status === 'drift';
  const trueAnon = isTrueAnonymisation(job.technique);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-lg flex flex-col bg-[var(--surface-card)] border-l border-[var(--border-default)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{job.name}</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {job.dataset_name ?? '—'}
              {job.source_label ? ` · ${job.source_label}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-raised)]">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-sm">
          {job.status === 'failed' && job.error && (
            <div className="rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-bg)] p-3">
              <div className="font-medium text-[var(--status-danger)] flex items-center gap-2">
                <AlertTriangle className="size-4" /> Job failed
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">{job.error}</p>
            </div>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">
              Governance
            </h3>
            <dl className="space-y-2">
              <Row label="Business purpose" value={job.business_purpose ?? '—'} />
              <Row label="Requested by" value={job.requested_by_email ?? '—'} />
              <Row label="Output recipient" value={job.output_recipient ?? '—'} />
              <Row label="External sharing" value={job.external_sharing ? 'Yes' : 'No'} />
              <Row label="Cross-border" value={job.cross_border_expected ? 'Expected' : 'No'} />
              {job.proof_vault_record_id && (
                <Row
                  label="Proof Vault"
                  value={
                    <Link to="/consent/proof-vault" className="text-[var(--brand-primary)] hover:underline">
                      Sealed record
                    </Link>
                  }
                />
              )}
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">
              Technique & risk
            </h3>
            <dl className="space-y-2">
              <Row label="Technique" value={TECHNIQUE_LABELS[job.technique]} />
              <Row
                label="Class"
                value={
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-xs',
                      trueAnon
                        ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                        : 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
                    )}
                  >
                    {techniqueClassLabel(job.technique)}
                  </span>
                }
              />
              <Row label="k achieved / target" value={`${job.k_value ?? '—'} / ${job.k_threshold}`} />
              <Row
                label="Re-ID risk"
                value={job.risk_percent != null ? `${job.risk_percent}% (${job.risk_level})` : '—'}
              />
              <Row label="Records" value={`${fmtCount(job.records_processed)} processed, ${fmtCount(job.records_suppressed)} suppressed`} />
              <Row label="Schedule" value={SCHEDULE_LABELS[job.schedule]} />
              <Row label="Destination" value={job.output_destination === 's3' ? 'AWS S3' : 'Download (CSV)'} />
            </dl>
          </section>

          {job.status === 'completed' && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">
                Drift monitor
              </h3>
              <div
                className={cn(
                  'rounded-lg border p-3 flex items-center gap-3',
                  drift
                    ? 'border-[var(--status-warning)] bg-[var(--status-warning-bg)]'
                    : 'border-[var(--border-default)] bg-[var(--status-success-bg)]',
                )}
              >
                {drift ? <AlertTriangle className="size-5 text-[var(--status-warning)]" /> : <Check className="size-5 text-[var(--status-success)]" />}
                <div>
                  <div className="font-medium">{drift ? 'Re-anonymise recommended' : 'Risk within threshold'}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Monitor k={job.monitor_k ?? '—'}
                    {job.monitor_risk_percent != null ? ` · ${job.monitor_risk_percent}%` : ''}
                  </div>
                </div>
              </div>
            </section>
          )}

          {job.field_rules.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">
                Field plan ({job.field_rules.length})
              </h3>
              <div className="rounded-lg border border-[var(--border-default)] divide-y max-h-48 overflow-y-auto text-xs">
                {job.field_rules.map((r) => (
                  <div key={r.field} className="px-3 py-2 flex justify-between gap-2">
                    <span className="font-mono truncate">{r.field}</span>
                    <span className="text-[var(--text-tertiary)] shrink-0">
                      {r.role} · {TREATMENT_LABELS[r.treatment] ?? r.treatment}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {job.status === 'completed' && isAdmin && (
          <div className="shrink-0 px-6 py-4 border-t border-[var(--border-default)] flex flex-wrap gap-2">
            {job.output_filename && (
              <button
                type="button"
                onClick={() => onDownload(job)}
                disabled={downloadingId === job.id}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm bg-[var(--brand-primary)] text-white disabled:opacity-50"
              >
                {downloadingId === job.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download data
              </button>
            )}
            <button
              type="button"
              onClick={() => onEvidence(job)}
              disabled={evidenceId === job.id}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border border-[var(--border-default)] disabled:opacity-50"
            >
              {evidenceId === job.id ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Evidence PDF
            </button>
            <button
              type="button"
              onClick={() => onHistory(job)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border border-[var(--border-default)]"
            >
              <History className="size-4" /> Download log
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): ReactElement {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--text-tertiary)] shrink-0">{label}</dt>
      <dd className="text-[var(--text-primary)] text-right">{value}</dd>
    </div>
  );
}
