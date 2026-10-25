import { extractLinkedDsarIds } from '@/lib/compliance/dsarBreachIncident';
import type { BreachIncident } from '@/types/compliance';
import { RIGHT_TYPE_LABELS } from '@/types/dsar';
import type { DataRightsRequest } from '@/types/dsar';

export type UnifiedStatFilter = 'active' | 'critical_high' | 'overdue_notify' | 'resolved';

export type UnifiedBreachRow =
  | { kind: 'incident'; incident: BreachIncident; isNotified: boolean }
  | { kind: 'dsar_sla'; request: DataRightsRequest };

function isResolvedIncident(incident: BreachIncident): boolean {
  return incident.status === 'closed';
}

function isActiveIncident(incident: BreachIncident): boolean {
  return incident.status === 'draft' || incident.status === 'submitted';
}

function isCriticalHighIncident(incident: BreachIncident): boolean {
  const severity = incident.severity.toLowerCase();
  return severity === 'high' || severity === 'critical';
}

function isOverdueNotifyIncident(incident: BreachIncident): boolean {
  return incident.status === 'draft' && incident.deadline_remaining_seconds <= 0;
}

export function isIncidentNotified(incident: BreachIncident): boolean {
  return incident.status === 'submitted' || incident.status === 'closed';
}

export function isUnifiedRowNotified(row: UnifiedBreachRow): boolean {
  if (row.kind === 'dsar_sla') return false;
  return isIncidentNotified(row.incident);
}

export function buildUnifiedBreachRows(
  incidents: BreachIncident[],
  dsarSlaBreaches: DataRightsRequest[],
): UnifiedBreachRow[] {
  const linkedDsarIds = extractLinkedDsarIds(incidents);
  const rows: UnifiedBreachRow[] = incidents.map((incident) => ({
    kind: 'incident',
    incident,
    isNotified: isIncidentNotified(incident),
  }));

  for (const request of dsarSlaBreaches) {
    if (!linkedDsarIds.has(request.id)) {
      rows.push({ kind: 'dsar_sla', request });
    }
  }

  rows.sort((a, b) => unifiedRowTimestamp(b) - unifiedRowTimestamp(a));
  return rows;
}

function unifiedRowTimestamp(row: UnifiedBreachRow): number {
  if (row.kind === 'incident') {
    return new Date(row.incident.discovered_at).getTime();
  }
  const received = row.request.received_at ?? row.request.created_at;
  return new Date(received).getTime();
}

export function unifiedRowRef(row: UnifiedBreachRow): string {
  if (row.kind === 'incident') return row.incident.incident_ref;
  return row.request.tracking_id;
}

export function unifiedRowTitle(row: UnifiedBreachRow): string {
  if (row.kind === 'incident') {
    return row.incident.wizard_data.incident_summary?.trim() || 'Untitled breach incident';
  }
  return `${RIGHT_TYPE_LABELS[row.request.right_type]} — ${row.request.requester_name}`;
}

export function unifiedRowCategory(row: UnifiedBreachRow): string {
  if (row.kind === 'incident') {
    return row.incident.wizard_data.category?.trim() || 'Data breach';
  }
  return 'DSAR SLA';
}

export function unifiedRowSeverity(row: UnifiedBreachRow): string {
  if (row.kind === 'incident') return row.incident.severity;
  return 'high';
}

export function unifiedRowStatusLabel(row: UnifiedBreachRow): string {
  if (row.kind === 'dsar_sla') return 'unnotified';
  if (isResolvedIncident(row.incident)) return 'resolved';
  if (row.incident.status === 'submitted') return 'submitted';
  if (row.incident.status === 'draft') return 'unnotified';
  return row.incident.status;
}

export function unifiedRowDiscoveredAt(row: UnifiedBreachRow): string | null {
  if (row.kind === 'incident') return row.incident.discovered_at;
  return row.request.received_at ?? row.request.created_at;
}

export function unifiedRowSearchHaystack(row: UnifiedBreachRow): string {
  if (row.kind === 'incident') {
    return [
      row.incident.incident_ref,
      unifiedRowTitle(row),
      unifiedRowCategory(row),
      row.incident.severity,
      row.incident.status,
    ]
      .join(' ')
      .toLowerCase();
  }
  return [
    row.request.tracking_id,
    unifiedRowTitle(row),
    unifiedRowCategory(row),
    RIGHT_TYPE_LABELS[row.request.right_type],
    row.request.requester_name,
    'unnotified',
    'high',
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesUnifiedStatFilter(
  row: UnifiedBreachRow,
  filter: UnifiedStatFilter | null,
): boolean {
  if (!filter) return true;

  if (filter === 'active') {
    if (row.kind === 'dsar_sla') return true;
    return isActiveIncident(row.incident);
  }
  if (filter === 'critical_high') {
    if (row.kind === 'dsar_sla') return true;
    return isCriticalHighIncident(row.incident);
  }
  if (filter === 'overdue_notify') {
    if (row.kind === 'dsar_sla') return true;
    return isOverdueNotifyIncident(row.incident);
  }
  if (row.kind === 'dsar_sla') return false;
  return isResolvedIncident(row.incident);
}

export function countUnifiedStats(rows: UnifiedBreachRow[]): Record<UnifiedStatFilter, number> {
  return {
    active: rows.filter((row) => matchesUnifiedStatFilter(row, 'active')).length,
    critical_high: rows.filter((row) => matchesUnifiedStatFilter(row, 'critical_high')).length,
    overdue_notify: rows.filter((row) => matchesUnifiedStatFilter(row, 'overdue_notify')).length,
    resolved: rows.filter((row) => matchesUnifiedStatFilter(row, 'resolved')).length,
  };
}
