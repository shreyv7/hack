import type { ReactElement } from 'react';
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScanJobDetail } from '@/types/piiScan';

interface ScanDetailDrawerProps {
  job: ScanJobDetail | null;
  loading: boolean;
  sourceName: string;
  onClose: () => void;
  onRetry: () => void;
  retrying: boolean;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString();
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start) return '\u2014';
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const secs = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

export function ScanDetailDrawer({
  job,
  loading,
  sourceName,
  onClose,
  onRetry,
  retrying,
}: ScanDetailDrawerProps): ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl flex flex-col bg-[var(--surface-card)] border-l border-[var(--border-default)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="scan-detail-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] flex items-start justify-between gap-4">
          <div>
            <h2 id="scan-detail-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Scan detail
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{sourceName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
            aria-label="Close scan detail"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {loading || !job ? (
            <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading&hellip;
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Status</div>
                  <div
                    className={cn(
                      'font-medium mt-0.5',
                      job.status === 'completed' && 'text-[var(--status-success)]',
                      job.status === 'failed' && 'text-[var(--status-danger)]',
                      job.status === 'running' && 'text-[var(--status-info)]',
                    )}
                  >
                    {job.status === 'completed' ? 'Complete' : job.status === 'failed' ? 'Failed' : 'Running'}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Duration</div>
                  <div className="font-medium mt-0.5 text-[var(--text-primary)]">
                    {durationLabel(job.started_at, job.finished_at)}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Triggered by</div>
                  <div className="font-medium mt-0.5 text-[var(--text-primary)] truncate" title={job.triggered_by ?? undefined}>
                    {job.triggered_by ?? '\u2014'}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Sample size</div>
                  <div className="font-medium mt-0.5 text-[var(--text-primary)]">{job.sample_size} rows/table</div>
                </div>
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Started</div>
                  <div className="font-medium mt-0.5 text-[var(--text-primary)]">{formatDateTime(job.started_at)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Finished</div>
                  <div className="font-medium mt-0.5 text-[var(--text-primary)]">{formatDateTime(job.finished_at)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Tables scanned</div>
                  <div className="font-medium mt-0.5 text-[var(--text-primary)]">{job.tables_scanned}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Fields flagged</div>
                  <div className="font-medium mt-0.5 text-[var(--text-primary)]">{job.fields_flagged}</div>
                </div>
              </div>

              {job.status === 'failed' && (
                <div className="rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-bg)] p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--status-danger)]">
                    <AlertTriangle className="size-4" /> Scan failed
                  </div>
                  <p className="text-xs text-[var(--status-danger)] mt-1 break-words">
                    {job.error ?? 'Unknown error.'}
                  </p>
                  <button
                    onClick={onRetry}
                    disabled={retrying}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-[var(--status-danger)] hover:opacity-90 disabled:opacity-50"
                  >
                    {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Retry scan
                  </button>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                  Findings ({job.findings.length})
                </h3>
                {job.findings.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">No PII detected in this scan.</p>
                ) : (
                  <div className="space-y-2">
                    {job.findings.map((f) => (
                      <div key={f.id} className="rounded-lg border border-[var(--border-default)] p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-[var(--text-primary)]">
                            {f.table_name}.{f.column_name}
                          </span>
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-xs',
                              f.classification === 'sensitive'
                                ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                                : 'bg-[var(--status-info-bg)] text-[var(--status-info)]',
                            )}
                          >
                            {f.pii_category}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {!f.has_purpose_mapping && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
                              No purpose link
                            </span>
                          )}
                          {!f.has_retention_policy && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
                              No retention rule
                            </span>
                          )}
                          {f.is_child_data && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
                              Children's data
                            </span>
                          )}
                          {f.cross_border_transfer && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
                              Cross-border
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
