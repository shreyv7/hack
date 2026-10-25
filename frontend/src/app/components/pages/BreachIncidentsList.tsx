import { notify } from '@/app/utils/notify';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { TablePager } from '@/app/components/common/TablePager';
import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { Search, RefreshCw, Shield, AlertTriangle, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { Button } from '@/app/components/ui/Button';
import { useBreachIncidents } from '@/hooks/useBreachIncidents';
import {
  clearLocalBreachWizardDraft,
  newLocalBreachWizardDraft,
  saveLocalBreachWizardDraft,
} from '@/lib/compliance/breachWizardDraft';
import {
  buildWizardDataFromDsarRequest,
  dsarSlaStatusLabel,
  findIncidentForDsarRequest,
} from '@/lib/compliance/dsarBreachIncident';
import {
  buildUnifiedBreachRows,
  countUnifiedStats,
  isUnifiedRowNotified,
  matchesUnifiedStatFilter,
  unifiedRowCategory,
  unifiedRowDiscoveredAt,
  unifiedRowRef,
  unifiedRowSearchHaystack,
  unifiedRowSeverity,
  unifiedRowStatusLabel,
  unifiedRowTitle,
  type UnifiedBreachRow,
  type UnifiedStatFilter,
} from '@/lib/compliance/unifiedBreachList';
import type { BreachIncident } from '@/types/compliance';
import { ApiError } from '@/lib/api/client';
import * as complianceApi from '@/lib/api/compliance';
import { fetchDsarRequest } from '@/lib/api/dsar';
import { useAuth } from '@/contexts/AuthContext';
import { canCloseBreach, canTriageBreach } from '@/lib/auth/permissions';

interface StatItem {
  key: UnifiedStatFilter;
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName: string;
}

interface DpbStatusDisplay {
  text: string;
  className: string;
  pill?: boolean;
}

function formatSeverity(severity: string): string {
  return severity.toUpperCase();
}

function severityBadgeClass(severity: string): string {
  const normalized = severity.toLowerCase();
  if (normalized === 'high' || normalized === 'critical') {
    return 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]';
  }
  if (normalized === 'medium') return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
  return 'bg-[var(--surface-raised)] text-[var(--text-secondary)]';
}

function statusBadgeClass(row: UnifiedBreachRow): string {
  const label = unifiedRowStatusLabel(row);
  if (label === 'resolved') return 'bg-[var(--status-success-bg)] text-[var(--status-success)]';
  if (label === 'submitted') return 'bg-[var(--status-info-bg)] text-[var(--status-info)]';
  if (label === 'unnotified') return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
  return 'bg-[var(--surface-raised)] text-[var(--text-secondary)]';
}

function getIncidentDpbStatus(incident: BreachIncident): DpbStatusDisplay {
  if (incident.status === 'submitted' || incident.status === 'closed') {
    return { text: '✓ Notified', className: 'text-[var(--status-success)]' };
  }
  if (incident.status === 'draft' && incident.deadline_remaining_seconds <= 0) {
    return {
      text: 'OVERDUE',
      className: 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
      pill: true,
    };
  }
  const hours = Math.floor(incident.deadline_remaining_seconds / 3600);
  const minutes = Math.floor((incident.deadline_remaining_seconds % 3600) / 60);
  if (hours <= 0 && minutes <= 0) {
    return {
      text: 'OVERDUE',
      className: 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
      pill: true,
    };
  }
  return { text: `${hours}h remaining`, className: 'text-[var(--status-warning)]' };
}

function getUnifiedDpbStatus(row: UnifiedBreachRow): DpbStatusDisplay {
  if (row.kind === 'dsar_sla') {
    return {
      text: dsarSlaStatusLabel(row.request).toUpperCase(),
      className: 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
      pill: true,
    };
  }
  return getIncidentDpbStatus(row.incident);
}

function formatRowDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Breach incidents list with 72-hour DPB notification tracking and severity filters.
 */
export function BreachIncidentsList(): ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canTriage = canTriageBreach(user);
  const canClose = canCloseBreach(user);
  const {
    incidents,
    dsarSlaBreaches,
    safeguardsSummary,
    loading,
    error,
    reload,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    canEdit,
    orgIdParam,
  } = useBreachIncidents();

  const [statFilter, setStatFilter] = useState<UnifiedStatFilter | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const unifiedRows = useMemo(
    () => buildUnifiedBreachRows(incidents, dsarSlaBreaches),
    [incidents, dsarSlaBreaches],
  );

  const statCounts = useMemo(() => countUnifiedStats(unifiedRows), [unifiedRows]);

  const stats: StatItem[] = useMemo(
    () => [
      {
        key: 'active',
        label: 'Active',
        value: String(statCounts.active),
        icon: Shield,
        iconClassName: 'text-[var(--brand-primary)]',
      },
      {
        key: 'critical_high',
        label: 'Critical/High',
        value: String(statCounts.critical_high),
        icon: AlertTriangle,
        iconClassName: 'text-[var(--status-danger)]',
      },
      {
        key: 'overdue_notify',
        label: 'Overdue Notify',
        value: String(statCounts.overdue_notify),
        icon: Check,
        iconClassName: 'text-[var(--status-success)]',
      },
      {
        key: 'resolved',
        label: 'Resolved',
        value: String(statCounts.resolved),
        icon: Check,
        iconClassName: 'text-[var(--status-success)]',
      },
    ],
    [statCounts],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedRows.filter((row) => {
      if (!matchesUnifiedStatFilter(row, statFilter)) return false;
      if (!q) return true;
      return unifiedRowSearchHaystack(row).includes(q);
    });
  }, [unifiedRows, statFilter, searchQuery]);

  const incidentsPager = useClientPagination(filteredRows);

  useEffect(() => {
    incidentsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statFilter, searchQuery, filteredRows.length]);

  const controlsCompleted = safeguardsSummary?.documented_count ?? 0;
  const controlsTotal = safeguardsSummary?.total_controls ?? 7;

  const handleNewIncident = (): void => {
    if (!canEdit) {
      notify('You do not have permission to create breach incidents');
      return;
    }
    clearLocalBreachWizardDraft(orgIdParam);
    saveLocalBreachWizardDraft(newLocalBreachWizardDraft(), orgIdParam);
    navigate('/breach/new/wizard');
  };

  const handleNotifiedRowClick = (row: UnifiedBreachRow): void => {
    if (row.kind !== 'incident') return;
    navigate(`/breach/${row.incident.id}`);
  };

  const handleUnnotifiedAction = async (row: UnifiedBreachRow): Promise<void> => {
    if (!canEdit) {
      notify('You do not have permission to manage breach incidents');
      return;
    }

    if (row.kind === 'incident') {
      navigate(`/breach/${row.incident.id}/wizard`);
      return;
    }

    const rowKey = row.request.id;
    setActionLoadingId(rowKey);
    try {
      const existing = findIncidentForDsarRequest(incidents, row.request.id);
      if (existing) {
        navigate(`/breach/${existing.id}/wizard`);
        return;
      }

      const fresh = await fetchDsarRequest(row.request.id, orgIdParam);
      const wizardData = buildWizardDataFromDsarRequest(fresh);
      const created = await complianceApi.createBreachIncident(
        {
          severity: 'high',
          wizard_data: wizardData,
          discovered_at: fresh.received_at ?? fresh.created_at,
        },
        orgIdParam,
      );
      navigate(`/breach/${created.id}/wizard`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to start incident from breach');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEscalateBreach = async (incident: BreachIncident): Promise<void> => {
    if (!canTriage) {
      notify('Security Analyst access required to escalate');
      return;
    }
    setActionLoadingId(incident.id);
    try {
      await complianceApi.escalateBreachIncident(incident.id, null, orgIdParam);
      notify('Escalated to CISO.');
      await reload();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to escalate incident');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCloseBreach = async (incident: BreachIncident): Promise<void> => {
    if (!canClose) {
      notify('CISO approval required to close incident');
      return;
    }
    setActionLoadingId(incident.id);
    try {
      await complianceApi.closeBreachIncident(incident.id, orgIdParam);
      notify('Incident closed.');
      await reload();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to close incident');
    } finally {
      setActionLoadingId(null);
    }
  };

  const toggleStatFilter = (filter: UnifiedStatFilter): void => {
    setStatFilter((prev) => (prev === filter ? null : filter));
  };

  return (
    <ConsentManagementGate
      title="Breach Incidents"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="min-h-full">
        <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold mb-2 text-[var(--text-primary)]">Breach Incidents</h1>
              <p className="text-sm mb-3 text-[var(--text-secondary)]">
                DPDPA — 72-hour regulator notification obligation
              </p>
              <div className="flex items-center gap-3">
                <DPDPAChip
                  sections={{
                    chapter: 2,
                    section: 8,
                    subsection: 6,
                    name: 'Breach intimation',
                    url: '/dpdpa2023/chapter-2/section8.html',
                    excerpt: 'Notify DPB and affected data principals within 72 hours...',
                  }}
                  size="detailed"
                />
                <PenaltyChip amount={250} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" size="md" onClick={() => void reload()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <button
                type="button"
                onClick={handleNewIncident}
                disabled={!canEdit}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-[var(--border-default)] text-[var(--status-danger)] hover:bg-[var(--surface-raised)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                + New Incident
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/security/safeguards')}
            className="w-full p-4 rounded-xl flex items-center gap-4 bg-[var(--status-warning-bg)] border border-[var(--status-warning)] hover:opacity-95 transition-opacity text-left cursor-pointer"
          >
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  Security Safeguards — DPDPA Rule 6 (S.8(5) —
                </span>
                <PenaltyChip amount={250} />
                <span className="text-sm text-[var(--text-primary)]">
                  penalty) — Document your security controls. This directly affects your Compliance Score.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
                {controlsCompleted}/{controlsTotal} controls
              </span>
              <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)]" />
            </div>
          </button>

          <div className="grid grid-cols-4 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              const isSelected = statFilter === stat.key;
              return (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => toggleStatFilter(stat.key)}
                  className={cn(
                    'p-4 rounded-lg flex items-center gap-4 text-left transition-colors cursor-pointer',
                    'bg-[var(--surface-card)] border',
                    isSelected
                      ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/20'
                      : 'border-[var(--border-default)] hover:bg-[var(--surface-raised)]',
                  )}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--surface-raised)]">
                    <Icon className={cn('w-5 h-5', stat.iconClassName)} />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-[var(--text-primary)]">{stat.value}</div>
                    <div className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">{stat.label}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search incidents..."
                className="w-full pl-10 pr-4 py-2 rounded-lg text-sm bg-[var(--surface-card)] border border-[var(--border-default)] text-[var(--text-primary)]"
              />
            </div>
            {['All Statuses', 'All Severities', 'Date range'].map((label) => (
              <button
                key={label}
                type="button"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--surface-card)] border border-[var(--border-default)] text-[var(--text-primary)]"
              >
                {label}
                <ChevronDown className="w-4 h-4" />
              </button>
            ))}
          </div>

          <div className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium border-b bg-[var(--surface-raised)] text-[var(--text-tertiary)] border-[var(--border-default)]">
              <div className="col-span-3">REF / TITLE</div>
              <div className="col-span-1">SEVERITY</div>
              <div className="col-span-2">CATEGORY</div>
              <div className="col-span-1">STATUS</div>
              <div className="col-span-2">DISCOVERED</div>
              <div className="col-span-2">72H DPB</div>
              <div className="col-span-1">ACTION</div>
            </div>

            <div>
              {filteredRows.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">
                  {unifiedRows.length === 0
                    ? 'No breach incidents yet. Click "+ New Incident" to report one.'
                    : 'No incidents match the current filter.'}
                </div>
              ) : (
                incidentsPager.slice.map((row) => {
                  const dpbStatus = getUnifiedDpbStatus(row);
                  const isNotified = isUnifiedRowNotified(row);
                  const rowKey = row.kind === 'incident' ? row.incident.id : row.request.id;
                  const isLoading = actionLoadingId === rowKey;

                  return (
                    <div
                      key={rowKey}
                      className={cn(
                        'w-full grid grid-cols-12 gap-4 px-6 py-4 border-b border-[var(--border-default)] text-left',
                        isNotified && 'hover:bg-black/5 cursor-pointer',
                      )}
                      onClick={isNotified ? () => handleNotifiedRowClick(row) : undefined}
                      onKeyDown={
                        isNotified
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleNotifiedRowClick(row);
                              }
                            }
                          : undefined
                      }
                      role={isNotified ? 'button' : undefined}
                      tabIndex={isNotified ? 0 : undefined}
                    >
                      <div className="col-span-3">
                        <div className="font-mono text-xs mb-1 text-[var(--text-tertiary)]">
                          {unifiedRowRef(row)}
                        </div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {unifiedRowTitle(row)}
                        </div>
                      </div>

                      <div className="col-span-1">
                        <span
                          className={cn(
                            'inline-flex px-2 py-1 rounded text-xs font-semibold',
                            severityBadgeClass(unifiedRowSeverity(row)),
                          )}
                        >
                          {formatSeverity(unifiedRowSeverity(row))}
                        </span>
                      </div>

                      <div className="col-span-2 text-sm text-[var(--text-secondary)]">
                        {unifiedRowCategory(row)}
                      </div>

                      <div className="col-span-1">
                        <span
                          className={cn(
                            'inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize',
                            statusBadgeClass(row),
                          )}
                        >
                          {unifiedRowStatusLabel(row)}
                        </span>
                      </div>

                      <div className="col-span-2 text-sm text-[var(--text-secondary)]">
                        {formatRowDate(unifiedRowDiscoveredAt(row))}
                      </div>

                      <div className="col-span-2">
                        {dpbStatus.pill ? (
                          <span
                            className={cn(
                              'inline-flex px-2.5 py-1 rounded-full text-xs font-semibold',
                              dpbStatus.className,
                            )}
                          >
                            {dpbStatus.text}
                          </span>
                        ) : (
                          <span className={cn('text-sm font-medium', dpbStatus.className)}>
                            {dpbStatus.text}
                          </span>
                        )}
                      </div>

                      <div className="col-span-1 flex items-center gap-1">
                        {isNotified ? (
                          <>
                            {row.kind === 'incident' &&
                              row.incident.status !== 'closed' &&
                              canTriage && (
                                <button
                                  type="button"
                                  title="Escalate to CISO"
                                  disabled={isLoading}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleEscalateBreach(row.incident);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                                >
                                  CISO
                                </button>
                              )}
                            {row.kind === 'incident' &&
                              row.incident.status !== 'closed' &&
                              canClose && (
                                <button
                                  type="button"
                                  title="Close incident"
                                  disabled={isLoading}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleCloseBreach(row.incident);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--status-success)] hover:bg-[var(--surface-raised)]"
                                >
                                  Close
                                </button>
                              )}
                            <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)]" />
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleUnnotifiedAction(row);
                            }}
                            className="inline-flex items-center justify-center rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] disabled:opacity-50 cursor-pointer"
                            aria-label="Start incident workflow"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <TablePager
              page={incidentsPager.page}
              pageCount={incidentsPager.pageCount}
              total={incidentsPager.total}
              pageSize={incidentsPager.pageSize}
              onPage={incidentsPager.setPage}
            />
          </div>
        </div>
      </div>
    </ConsentManagementGate>
  );
}
