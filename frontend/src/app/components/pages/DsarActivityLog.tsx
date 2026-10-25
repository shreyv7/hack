import type { ReactElement } from 'react';
import { Search } from 'lucide-react';
import { TablePager } from '@/app/components/common/TablePager';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { useDsarActivityLog } from '@/hooks/useDsarActivityLog';
import {
  ACTIVITY_ACTION_LABELS,
  RIGHT_TYPE_LABELS,
  STATUS_LABELS,
  type DsarActivityAction,
  type DataRightType,
} from '@/types/dsar';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function actionBadgeClass(action: DsarActivityAction): string {
  if (action === 'resolved') return 'bg-[var(--status-success-bg)] text-[var(--status-success)]';
  if (action === 'assigned' || action === 'unassigned') {
    return 'bg-[var(--status-info-bg)] text-[var(--status-info)]';
  }
  if (action === 'status_changed') return 'bg-[var(--status-ai-bg)] text-[var(--status-ai)]';
  if (action === 'grievance_acknowledged') {
    return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
  }
  return 'bg-[var(--surface-raised)] text-[var(--text-secondary)]';
}

function EmptyLogMessage({
  hasActiveFilters,
  hasLoaded,
}: {
  hasActiveFilters: boolean;
  hasLoaded: boolean;
}): ReactElement {
  if (hasActiveFilters) {
    return (
      <div className="py-10 px-4 text-center">
        <p className="text-[var(--text-primary)] font-medium mb-1">No matching activity</p>
        <p className="text-sm text-[var(--text-secondary)]">
          Try clearing filters or broadening your search.
        </p>
      </div>
    );
  }

  if (!hasLoaded) {
    return (
      <p className="py-8 px-4 text-center text-[var(--text-secondary)]">Loading activity…</p>
    );
  }

  return (
    <div className="py-10 px-4 text-center max-w-lg mx-auto">
      <p className="text-[var(--text-primary)] font-medium mb-2">No activity recorded yet</p>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        This log is populated live from the Rights Portal and DSAR SLA Tracker. New submissions,
        verifications, assignments, and status changes appear here automatically.
      </p>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-3">
        Requests and actions handled before activity logging was enabled are not available in this
        view and cannot be reconstructed.
      </p>
    </div>
  );
}

export function DsarActivityLog(): ReactElement {
  const {
    log,
    loading,
    hasLoaded,
    hasActiveFilters,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    filters,
    setFilters,
    pageSize,
  } = useDsarActivityLog();

  const rows = log?.items ?? [];
  const total = log?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!canEdit && !loading) {
    return (
      <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
        <h1 className="mb-2">DSAR Activity Log</h1>
        <p className="text-[var(--text-secondary)]">
          This page is available to organization administrators and superadmins only.
        </p>
      </div>
    );
  }

  return (
    <ConsentManagementGate
      title="DSAR Activity Log"
      loading={loading && !hasLoaded}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="p-8 max-w-[1280px] mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="mb-2">DSAR Activity Log</h1>
              <div className="flex items-center gap-3">
                <DPDPAChip
                  sections={{
                    chapter: 3,
                    section: 11,
                    name: 'Rights of Data Principal',
                    url: '/dpdpa2023/chapter-3/section11.html',
                    excerpt: 'Track requests, assignments, and actions taken on data rights requests.',
                  }}
                  size="detailed"
                />
              </div>
            </div>
          </div>
          <SectionReference section="DPDPA Sections 11–14 — Data principal rights request audit trail" />
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            Live audit trail from the Rights Portal and DSAR SLA Tracker — every submission,
            assignment, and workflow action in your organization.
          </p>
          {hasLoaded && total > 0 ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {total} event{total === 1 ? '' : 's'} loaded from the server.
            </p>
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Request ID
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-[var(--text-secondary)]" />
              <input
                type="search"
                value={filters.tracking_id}
                onChange={(e) => setFilters((f) => ({ ...f, tracking_id: e.target.value, page: 1 }))}
                placeholder="Search tracking ID…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Action
            </label>
            <select
              value={filters.action}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  action: e.target.value as DsarActivityAction | '',
                  page: 1,
                }))
              }
              className="px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)]"
            >
              <option value="">All actions</option>
              {(Object.keys(ACTIVITY_ACTION_LABELS) as DsarActivityAction[]).map((key) => (
                <option key={key} value={key}>
                  {ACTIVITY_ACTION_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Right type
            </label>
            <select
              value={filters.right_type}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  right_type: e.target.value as DataRightType | '',
                  page: 1,
                }))
              }
              className="px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)]"
            >
              <option value="">All rights</option>
              {(Object.keys(RIGHT_TYPE_LABELS) as DataRightType[]).map((key) => (
                <option key={key} value={key}>
                  {RIGHT_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Actor
            </label>
            <input
              type="search"
              value={filters.actor}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value, page: 1 }))}
              placeholder="Name or email…"
              className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div
          className={`rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] overflow-hidden transition-opacity ${loading && hasLoaded ? 'opacity-60' : ''}`}
        >
          {loading && hasLoaded ? (
            <p className="px-4 py-2 text-xs text-[var(--text-secondary)] border-b border-[var(--border-default)]">
              Updating…
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                  <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">When</th>
                  <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">Request</th>
                  <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">Right</th>
                  <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">Action</th>
                  <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">Actor</th>
                  <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">Assignee</th>
                  <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyLogMessage hasActiveFilters={hasActiveFilters} hasLoaded={hasLoaded} />
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--surface-raised)]/50"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-[var(--text-secondary)]">
                        {formatWhen(row.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs">{row.tracking_id}</div>
                        {row.requester_name ? (
                          <div className="text-xs text-[var(--text-secondary)]">{row.requester_name}</div>
                        ) : null}
                        {row.current_status ? (
                          <div className="text-xs text-[var(--text-secondary)]">
                            Status: {STATUS_LABELS[row.current_status]}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">
                        {RIGHT_TYPE_LABELS[row.right_type]}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${actionBadgeClass(row.action)}`}
                        >
                          {ACTIVITY_ACTION_LABELS[row.action]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">{row.actor_name}</td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">
                        {row.assignee_name ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] max-w-xs">
                        {row.message}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePager
            page={filters.page - 1}
            pageCount={totalPages}
            total={total}
            pageSize={pageSize}
            onPage={(nextPage) => setFilters((f) => ({ ...f, page: nextPage + 1 }))}
          />
        </div>
      </div>
    </ConsentManagementGate>
  );
}
