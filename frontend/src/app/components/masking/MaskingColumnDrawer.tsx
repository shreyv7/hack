import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { Link } from 'react-router';
import { fetchAssetUsage } from '@/lib/api/dataInventory';
import { previewField } from '@/lib/api/masking';
import type { AssetUsageMap } from '@/types/dataInventory';
import type { FieldPreviewResult, MaskingStrategy, PiiColumnTarget } from '@/types/masking';
import { STRATEGY_META } from '@/types/masking';

interface MaskingColumnDrawerProps {
  column: PiiColumnTarget;
  strategy: MaskingStrategy;
  orgId?: string;
  onClose: () => void;
  onApply: () => void;
  canApply: boolean;
}

export function MaskingColumnDrawer({
  column,
  strategy,
  orgId,
  onClose,
  onApply,
  canApply,
}: MaskingColumnDrawerProps): ReactElement {
  const [usage, setUsage] = useState<AssetUsageMap | null>(null);
  const [preview, setPreview] = useState<FieldPreviewResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAssetUsage(column.asset_id, orgId),
      column.data_source_id && column.can_apply
        ? previewField(column.data_source_id, column.table, column.column, strategy, orgId)
        : Promise.resolve(null),
    ])
      .then(([u, p]) => {
        setUsage(u);
        setPreview(p);
      })
      .catch(() => {
        setUsage(null);
        setPreview(null);
      })
      .finally(() => setLoading(false));
  }, [column, strategy, orgId]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-lg flex flex-col bg-[var(--surface-card)] border-l border-[var(--border-default)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] font-mono">
              {column.table}.{column.column}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {column.data_source_name ?? 'No source'} · {column.pii_category ?? 'unknown category'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-raised)]">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-sm">
          <section className="grid grid-cols-2 gap-3">
            <Meta label="Environment" value={column.environment ?? '—'} />
            <Meta label="Integration" value={column.integration_mode ?? '—'} />
            <Meta label="Classification" value={column.classification} />
            <Meta label="Safeguard tag" value={column.security_safeguard ?? 'none'} />
            <Meta label="Purposes linked" value={String(column.purpose_count)} />
            <Meta
              label="Last applied"
              value={column.last_applied_at ? new Date(column.last_applied_at).toLocaleString() : 'Never'}
            />
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">
              Active strategy
            </h3>
            <div className="rounded-lg border border-[var(--border-default)] p-3">
              <div className="font-medium text-[var(--text-primary)]">{STRATEGY_META[strategy].label}</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">{STRATEGY_META[strategy].dpdpaHint}</div>
            </div>
          </section>

          {loading ? (
            <div className="flex items-center gap-2 text-[var(--text-secondary)] py-4">
              <Loader2 className="size-4 animate-spin" /> Loading usage map…
            </div>
          ) : (
            usage && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                  Where this data is used
                </h3>
                {usage.purposes.length === 0 ? (
                  <p className="text-[var(--text-tertiary)] text-xs">
                    No consent purposes mapped — configure in{' '}
                    <Link to="/consent/enforcement" className="text-[var(--brand-primary)] hover:underline">
                      Consent Enforcement
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {usage.purposes.map((p) => (
                      <li
                        key={p.purpose_id}
                        className="rounded-md border border-[var(--border-default)] px-3 py-2 flex justify-between gap-2"
                      >
                        <span className="font-medium">{p.purpose_name}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">{p.legal_basis}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {usage.processors.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-[var(--text-secondary)] mb-1">Processors ({usage.processor_count})</div>
                    <ul className="text-xs text-[var(--text-tertiary)] space-y-1">
                      {usage.processors.map((p) => (
                        <li key={p.processor_id}>{p.processor_name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )
          )}

          {preview && preview.samples.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">
                Sample preview
              </h3>
              <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs">
                {preview.samples.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[var(--text-tertiary)] truncate flex-1">{s.before}</span>
                    <span>→</span>
                    <span className="text-[var(--status-success)] truncate flex-1">{s.after}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {column.apply_note && !column.can_apply && (
            <p className="text-xs text-[var(--status-warning)]">{column.apply_note}</p>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-[var(--border-default)] flex gap-2 justify-end">
          <Link
            to={`/data/inventory?asset=${column.asset_id}`}
            className="px-3 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] inline-flex items-center gap-1"
          >
            <ExternalLink className="size-3.5" /> Inventory
          </Link>
          {canApply && (
            <button
              type="button"
              onClick={onApply}
              className="px-4 py-2 text-sm rounded-md border border-[var(--status-danger)] text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
            >
              Apply masking
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg bg-[var(--surface-raised)] p-2.5">
      <div className="text-[10px] text-[var(--text-tertiary)]">{label}</div>
      <div className="text-sm font-medium text-[var(--text-primary)] capitalize">{value}</div>
    </div>
  );
}
