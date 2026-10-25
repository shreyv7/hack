import { notify } from '@/app/utils/notify';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Shield, Check, ChevronDown, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import { PenaltyChip } from '@/app/components/ui/PenaltyChip';
import { ApiError } from '@/lib/api/client';
import * as complianceApi from '@/lib/api/compliance';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { downloadBreachDisclosurePdf } from '@/lib/compliance/breachDisclosurePdf';
import type { AuditEvent, BreachIncident } from '@/types/compliance';

interface IncidentDetailProps {
  incidentId: string;
  onBack: () => void;
  onOpenWizard?: () => void;
}

interface TimelineEvent {
  at: string;
  date: string;
  event: string;
  dotClassName: string;
}

function formatIncidentDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function severityBadgeClass(severity: string): string {
  const normalized = severity.toLowerCase();
  if (normalized === 'critical' || normalized === 'high') {
    return 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]';
  }
  if (normalized === 'medium') return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
  return 'bg-[var(--surface-raised)] text-[var(--text-secondary)]';
}

function statusBadge(incident: BreachIncident): { label: string; className: string } {
  if (incident.status === 'closed') {
    return { label: 'Resolved', className: 'bg-[var(--status-success-bg)] text-[var(--status-success)]' };
  }
  if (incident.status === 'submitted') {
    return { label: 'Submitted', className: 'bg-[var(--status-info-bg)] text-[var(--status-info)]' };
  }
  return { label: 'Active', className: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]' };
}

function incidentTitle(incident: BreachIncident): string {
  const summary = incident.wizard_data.incident_summary?.trim();
  if (!summary) return incident.incident_ref;
  const firstLine = summary.split('\n')[0]?.trim();
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

function categoryLabel(incident: BreachIncident): string {
  const categories = incident.wizard_data.special_categories ?? [];
  if (categories.length > 0) return categories.join(', ');
  return 'Data breach';
}

function buildTimeline(incident: BreachIncident, auditEvents: AuditEvent[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      at: incident.discovered_at,
      date: formatShortDate(incident.discovered_at),
      event: 'Discovered & reported',
      dotClassName: 'bg-[var(--status-danger)]',
    },
  ];

  if (incident.submitted_at) {
    events.push({
      at: incident.submitted_at,
      date: formatShortDate(incident.submitted_at),
      event: 'Breach disclosure package submitted',
      dotClassName: 'bg-[var(--text-tertiary)]',
    });
    events.push({
      at: incident.submitted_at,
      date: formatShortDate(incident.submitted_at),
      event: `DPB notified (Ref: ${incident.incident_ref})`,
      dotClassName: 'bg-[var(--text-tertiary)]',
    });
    events.push({
      at: incident.submitted_at,
      date: formatShortDate(incident.submitted_at),
      event: 'Data principal notifications dispatched',
      dotClassName: 'bg-[var(--text-tertiary)]',
    });
  }

  for (const entry of auditEvents) {
    if (entry.type !== 'Breach') continue;
    if (!entry.action.toLowerCase().includes(incident.incident_ref.toLowerCase())) continue;
    const duplicate = events.some((item) => item.event === entry.action);
    if (duplicate) continue;
    events.push({
      at: entry.time,
      date: formatShortDate(entry.time),
      event: entry.action,
      dotClassName: 'bg-[var(--text-tertiary)]',
    });
  }

  if (incident.status === 'closed') {
    events.push({
      at: incident.submitted_at ?? incident.discovered_at,
      date: formatShortDate(incident.submitted_at ?? incident.discovered_at),
      event: 'Marked resolved',
      dotClassName: 'bg-[var(--status-success)]',
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function regulatorNotifiedOnTime(incident: BreachIncident): boolean {
  if (!incident.submitted_at) return false;
  return new Date(incident.submitted_at).getTime() <= new Date(incident.deadline_at).getTime();
}

/**
 * Detailed breach incident view backed by compliance API data.
 */
export function IncidentDetail({ incidentId, onBack, onOpenWizard }: IncidentDetailProps): ReactElement {
  const org = useComplianceOrg();
  const [incident, setIncident] = useState<BreachIncident | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rootCauseExpanded, setRootCauseExpanded] = useState(true);
  const [auditExpanded, setAuditExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!org.hasOrg || !incidentId) {
      setIncident(null);
      setAuditEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await complianceApi.fetchBreachIncident(incidentId, org.orgIdParam);
      setIncident(row);
      const audit = await complianceApi
        .fetchAuditEvents({
          orgId: org.orgIdParam,
          q: row.incident_ref,
          event_type: 'Breach',
          page_size: 50,
        })
        .catch(() => ({ items: [], total: 0, page: 1, page_size: 50 }));
      setAuditEvents(audit.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load breach incident');
      setIncident(null);
      setAuditEvents([]);
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam, incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(
    () => (incident ? buildTimeline(incident, auditEvents) : []),
    [incident, auditEvents],
  );

  const auditPager = useClientPagination(auditEvents);

  const metadata = useMemo(() => {
    if (!incident) return [];
    const affected = incident.wizard_data.affected_count?.trim() || '—';
    const dpStatus =
      incident.status === 'submitted' || incident.status === 'closed'
        ? `${affected !== '—' ? affected : 'Notice'} dispatched`
        : 'Pending';
    return [
      { label: 'Discovered', value: formatIncidentDate(incident.discovered_at) },
      { label: '72h Deadline', value: formatIncidentDate(incident.deadline_at) },
      { label: 'Incident Ref', value: incident.incident_ref },
      { label: 'Est. Affected', value: affected },
      { label: 'Current Step', value: `Step ${incident.current_step} of 5` },
      { label: 'DP Notifications', value: dpStatus },
    ];
  }, [incident]);

  const handleDownloadPdf = () => {
    if (!incident) return;
    downloadBreachDisclosurePdf(incident, org.orgName);
    notify('Breach disclosure PDF downloaded');
  };

  const status = incident ? statusBadge(incident) : null;
  const onTime = incident ? regulatorNotifiedOnTime(incident) : false;
  const dataTypes = incident?.wizard_data.data_types ?? [];
  const mitigation = incident?.wizard_data.mitigation_actions?.trim();
  const remediation = incident?.wizard_data.remediation_steps?.trim();

  return (
    <ConsentManagementGate
      title="Breach Incident"
      loading={loading}
      error={error}
      hasOrg={org.hasOrg}
      isSuperadmin={org.isSuperadmin}
      organizations={org.organizations}
      selectedOrgId={org.selectedOrgId}
      onSelectOrg={org.setSelectedOrgId}
    >
      <div className="h-full overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          <div className="mb-6">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-medium hover:underline text-[var(--brand-primary)]"
            >
              <ArrowLeft className="w-4 h-4" />
              Incidents / {incident?.incident_ref ?? incidentId}
            </button>
          </div>

          {!incident ? (
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
              {loading ? 'Loading incident…' : 'Breach incident not found.'}
            </div>
          ) : (
            <div className="grid grid-cols-10 gap-8">
              <div className="col-span-7 space-y-8">
                <div className="flex items-center gap-2 flex-wrap">
                  {status ? (
                    <span className={cn('px-3 py-1 rounded-full text-sm font-medium', status.className)}>
                      {status.label}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-semibold',
                      severityBadgeClass(incident.severity),
                    )}
                  >
                    {incident.severity.toUpperCase()}
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                    {categoryLabel(incident)}
                  </span>
                  <Shield className="w-5 h-5 ml-2 text-[var(--text-tertiary)]" />
                </div>

                <div>
                  <h1 className="text-3xl font-semibold mb-2 text-[var(--text-primary)]">
                    {incidentTitle(incident)}
                  </h1>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {org.orgName} · Discovered {formatIncidentDate(incident.discovered_at)}
                    {incident.submitted_at
                      ? ` · Submitted ${formatIncidentDate(incident.submitted_at)}`
                      : ''}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {metadata.map((item) => (
                    <div
                      key={item.label}
                      className="p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]"
                    >
                      <div className="text-xs font-medium mb-1 uppercase tracking-wide text-[var(--text-tertiary)]">
                        {item.label}
                      </div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{item.value}</div>
                    </div>
                  ))}
                </div>

                <section>
                  <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">Description</h2>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                    {incident.wizard_data.incident_summary?.trim() ||
                      'No incident summary recorded. Open the disclosure wizard to add details.'}
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Scope</h2>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium mb-2 text-[var(--text-secondary)]">Data Types</div>
                      {dataTypes.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {dataTypes.map((type) => (
                            <span
                              key={type}
                              className="px-3 py-1 rounded-lg text-sm font-mono bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-tertiary)]">—</p>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2 text-[var(--text-secondary)]">
                        Special Categories
                      </div>
                      {(incident.wizard_data.special_categories ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {(incident.wizard_data.special_categories ?? []).map((category) => (
                            <span
                              key={category}
                              className="px-3 py-1 rounded-lg text-sm bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                            >
                              {category}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-tertiary)]">—</p>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2 text-[var(--text-secondary)]">
                        Notification Channels
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(incident.wizard_data.dp_channels ?? ['email']).map((channel) => (
                          <span
                            key={channel}
                            className="px-3 py-1 rounded-lg text-sm bg-[var(--surface-raised)] text-[var(--text-secondary)] capitalize"
                          >
                            {channel.replace('-', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <button
                    type="button"
                    onClick={() => setRootCauseExpanded(!rootCauseExpanded)}
                    className="w-full flex items-center justify-between p-4 rounded-lg mb-2 bg-[var(--surface-card)] border border-[var(--border-default)]"
                  >
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Mitigation & Remediation</h2>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 transition-transform text-[var(--text-tertiary)]',
                        rootCauseExpanded && 'rotate-180',
                      )}
                    />
                  </button>
                  {rootCauseExpanded && (
                    <div className="p-6 rounded-lg space-y-4 bg-[var(--surface-card)] border border-[var(--border-default)]">
                      <div>
                        <div className="text-sm font-semibold mb-2 text-[var(--text-primary)]">
                          Mitigation actions taken
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                          {mitigation || '—'}
                        </p>
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2 text-[var(--text-primary)]">Remediation</div>
                        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                          {remediation || '—'}
                        </p>
                      </div>
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Timeline</h2>
                  {timeline.length > 0 ? (
                    <div className="space-y-4">
                      {timeline.map((event, index) => (
                        <div key={`${event.at}-${event.event}`} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className={cn('w-3 h-3 rounded-full flex-shrink-0', event.dotClassName)} />
                            {index < timeline.length - 1 && (
                              <div className="w-px flex-1 mt-2 bg-[var(--border-default)]" />
                            )}
                          </div>
                          <div className="flex-1 pb-6">
                            <div className="text-xs font-mono mb-1 text-[var(--text-tertiary)]">{event.date}</div>
                            <div className="text-sm text-[var(--text-primary)]">{event.event}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-tertiary)]">No timeline events yet.</p>
                  )}
                </section>

                <section>
                  <button
                    type="button"
                    onClick={() => setAuditExpanded(!auditExpanded)}
                    className="w-full flex items-center justify-between p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]"
                  >
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                      Audit Trail <span className="text-[var(--text-tertiary)]">({auditEvents.length} entries)</span>
                    </h2>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 transition-transform text-[var(--text-tertiary)]',
                        auditExpanded && 'rotate-180',
                      )}
                    />
                  </button>
                  {auditExpanded && (
                    <div className="mt-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] divide-y divide-[var(--border-default)]">
                      {auditEvents.length === 0 ? (
                        <p className="p-4 text-sm text-[var(--text-tertiary)]">No breach audit entries found.</p>
                      ) : (
                        <>
                          {auditPager.slice.map((entry) => (
                            <div key={entry.id} className="p-4 text-sm">
                              <div className="text-xs font-mono text-[var(--text-tertiary)] mb-1">
                                {formatIncidentDate(entry.time)} · {entry.actor}
                              </div>
                              <div className="font-medium text-[var(--text-primary)]">{entry.action}</div>
                              {entry.details ? (
                                <div className="text-[var(--text-secondary)] mt-1">{entry.details}</div>
                              ) : null}
                            </div>
                          ))}
                          <TablePager
                            page={auditPager.page}
                            pageCount={auditPager.pageCount}
                            total={auditPager.total}
                            pageSize={auditPager.pageSize}
                            onPage={auditPager.setPage}
                          />
                        </>
                      )}
                    </div>
                  )}
                </section>
              </div>

              <div className="col-span-3">
                <div className="sticky top-8 space-y-4">
                  {incident.status === 'submitted' || incident.status === 'closed' ? (
                    <div
                      className={cn(
                        'p-4 rounded-lg border',
                        onTime
                          ? 'bg-[var(--status-success-bg)] border-[var(--status-success)]'
                          : 'bg-[var(--status-danger-bg)] border-[var(--status-danger)]',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Check
                          className={cn(
                            'w-5 h-5',
                            onTime ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]',
                          )}
                        />
                        <span
                          className={cn(
                            'font-semibold text-sm',
                            onTime ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]',
                          )}
                        >
                          {onTime ? 'Regulator Notified' : 'Late Submission'}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {onTime
                          ? '72-hour obligation fulfilled'
                          : 'Submitted after the 72-hour deadline'}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-[var(--status-warning-bg)] border border-[var(--status-warning)]">
                      <div className="font-semibold text-sm text-[var(--status-warning)] mb-1">
                        72-hour clock active
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {Math.floor(incident.deadline_remaining_seconds / 3600)}h{' '}
                        {Math.floor((incident.deadline_remaining_seconds % 3600) / 60)}m remaining
                      </p>
                    </div>
                  )}

                  <div className="p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]">
                    <div className="text-xs font-medium mb-2 uppercase tracking-wide text-[var(--text-tertiary)]">
                      DPB NOTIFIED
                    </div>
                    {incident.submitted_at ? (
                      <>
                        <div className="text-sm font-semibold mb-1 text-[var(--text-primary)]">
                          {formatIncidentDate(incident.submitted_at)}
                        </div>
                        <div className="text-xs font-mono text-[var(--text-tertiary)]">
                          Ref: {incident.incident_ref}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-[var(--text-tertiary)]">Not yet submitted</div>
                    )}
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]">
                    <div className="text-xs font-medium mb-2 uppercase tracking-wide text-[var(--text-tertiary)]">
                      STATUS
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] capitalize">
                      {incident.status}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]">
                    <div className="text-xs font-medium mb-3 uppercase tracking-wide text-[var(--text-tertiary)]">
                      PENALTY EXPOSURE
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={onTime ? 'line-through opacity-50' : ''}>
                        <PenaltyChip amount="250" />
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-lg font-semibold',
                        onTime || incident.status === 'draft'
                          ? 'text-[var(--status-success)]'
                          : 'text-[var(--status-danger)]',
                      )}
                    >
                      {incident.status === 'draft'
                        ? 'Pending submission'
                        : onTime
                          ? '₹0 actual'
                          : 'At risk'}
                    </div>
                    <p className="text-xs mt-2 text-[var(--text-tertiary)]">
                      {incident.status === 'draft'
                        ? 'Submit within 72 hours to avoid exposure'
                        : onTime
                          ? 'Avoided'
                          : 'Review required'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {onOpenWizard ? (
                      <Button variant="primary" size="md" onClick={onOpenWizard}>
                        {incident.status === 'draft' ? 'Continue Disclosure Wizard' : 'Open Disclosure Wizard'}
                      </Button>
                    ) : null}
                    <Button variant="secondary" size="md" onClick={handleDownloadPdf}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Report (PDF)
                    </Button>
                    {incident.status === 'draft' ? (
                      <p className="text-xs text-[var(--text-tertiary)] px-1">
                        Complete and submit the wizard to notify the DPB and data principals.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ConsentManagementGate>
  );
}
