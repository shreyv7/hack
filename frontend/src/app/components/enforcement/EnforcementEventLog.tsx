import type { ReactElement } from 'react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import type { EnforcementEvent } from '@/types/enforcement';
import type { Purpose } from '@/types/consent';
import { enforcementModeBadge, ENFORCEMENT_MODE_LABELS } from '@/app/components/enforcement/enforcementLabels';
import type { EnforcementMode } from '@/types/enforcement';

interface EnforcementEventLogProps {
  events: EnforcementEvent[];
  purposes: Purpose[];
  loading?: boolean;
}

function truncateFingerprint(fp: string): string {
  if (fp.length <= 16) return fp;
  return `${fp.slice(0, 8)}…${fp.slice(-6)}`;
}

export function EnforcementEventLog({
  events,
  purposes,
  loading,
}: EnforcementEventLogProps): ReactElement {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const purposeMap = useMemo(() => new Map(purposes.map((p) => [p.id, p.name])), [purposes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const purposeName = e.purpose_id ? purposeMap.get(e.purpose_id) ?? '' : '';
      return (
        e.principal_fingerprint.toLowerCase().includes(q) ||
        e.decision.toLowerCase().includes(q) ||
        (e.collection_point ?? '').toLowerCase().includes(q) ||
        purposeName.toLowerCase().includes(q)
      );
    });
  }, [events, query, purposeMap]);

  const eventsPager = useClientPagination(filtered);

  useEffect(() => {
    eventsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fingerprint, decision, collection point…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
          />
        </div>
        <span className="text-xs text-[var(--text-secondary)]">{filtered.length} events</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left py-3 px-4 font-medium">Time</th>
              <th className="text-left py-3 px-4 font-medium">Purpose</th>
              <th className="text-left py-3 px-4 font-medium">Decision</th>
              <th className="text-left py-3 px-4 font-medium">Mode</th>
              <th className="text-left py-3 px-4 font-medium">Fingerprint</th>
              <th className="text-left py-3 px-4 font-medium">Latency</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--text-secondary)]">
                  Loading events…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--text-secondary)]">
                  No enforcement events yet. Enable shadow mode to start collecting observations.
                </td>
              </tr>
            )}
            {!loading &&
              eventsPager.slice.map((e) => (
                <Fragment key={e.id}>
                  <tr
                    className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {new Date(e.occurred_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      {e.purpose_id ? purposeMap.get(e.purpose_id) ?? e.purpose_id.slice(0, 8) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          e.decision === 'allowed'
                            ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                            : 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                        }`}
                      >
                        {e.decision}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${enforcementModeBadge(e.effective_mode as EnforcementMode)}`}
                      >
                        {ENFORCEMENT_MODE_LABELS[e.effective_mode as EnforcementMode] ?? e.effective_mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs" title={e.principal_fingerprint}>
                      {truncateFingerprint(e.principal_fingerprint)}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {e.latency_ms != null ? `${e.latency_ms} ms` : '—'}
                    </td>
                  </tr>
                  {expandedId === e.id && (
                    <tr className="border-t border-[var(--border)] bg-[var(--surface)]">
                      <td colSpan={6} className="px-4 py-4 space-y-2 text-xs">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <div className="text-[var(--text-secondary)]">Legal basis</div>
                            <div className="font-medium">{e.legal_basis}</div>
                          </div>
                          <div>
                            <div className="text-[var(--text-secondary)]">Collection point</div>
                            <div className="font-medium">{e.collection_point ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-[var(--text-secondary)]">Receipt</div>
                            <div className="font-mono">{e.receipt_id?.slice(0, 8) ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-[var(--text-secondary)]">Property</div>
                            <div className="font-mono">{e.property_id?.slice(0, 8) ?? '—'}</div>
                          </div>
                        </div>
                        <p className="text-[var(--text-tertiary)]">
                          Raw identifiers are never stored — only principal fingerprints appear in this log.
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
      <TablePager
        page={eventsPager.page}
        pageCount={eventsPager.pageCount}
        total={eventsPager.total}
        pageSize={eventsPager.pageSize}
        onPage={eventsPager.setPage}
      />
    </div>
  );
}
