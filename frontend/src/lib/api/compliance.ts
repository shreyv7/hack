import { apiFetch } from '@/lib/api/client';
import type {
  AuditEvent,
  AuditLogSummary,
  AuditVerifyResult,
  BreachAffectedVerifyResult,
  BreachIncident,
  BreachWizardData,
  ComplianceMapChapter,
  ComplianceMapSectionDetail,
  ComplianceMapSummary,
  PaginatedAuditEvents,
  SecurityControl,
  SecuritySafeguardsData,
  SecuritySafeguardsSummary,
} from '@/types/compliance';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

// Map
export function fetchComplianceMapSummary(orgId?: string): Promise<ComplianceMapSummary> {
  return apiFetch(withOrgQuery('/compliance/map/summary', orgId));
}

export function fetchComplianceMapChapters(orgId?: string): Promise<ComplianceMapChapter[]> {
  return apiFetch(withOrgQuery('/compliance/map/chapters', orgId));
}

export function fetchComplianceMapSection(
  sectionKey: string,
  orgId?: string
): Promise<ComplianceMapSectionDetail> {
  return apiFetch(withOrgQuery(`/compliance/map/sections/${encodeURIComponent(sectionKey)}`, orgId));
}

export interface FrameworkCrosswalkSection {
  section_key: string;
  title: string;
  dpdpa_section: string;
  controls: string[];
  evidence_count: number;
  feature_count: number;
}

export interface FrameworkCrosswalkResponse {
  framework: string;
  framework_label: string;
  primary_framework: string;
  sections: FrameworkCrosswalkSection[];
}

export function fetchComplianceMapCrosswalk(
  framework: 'rbi' | 'iso27001' | 'nist',
  orgId?: string
): Promise<FrameworkCrosswalkResponse> {
  return apiFetch(withOrgQuery(`/compliance/map/crosswalk?framework=${encodeURIComponent(framework)}`, orgId));
}

export function updateComplianceMapReview(
  reviewedBy?: string,
  orgId?: string
): Promise<ComplianceMapSummary> {
  return apiFetch(withOrgQuery('/compliance/map/review', orgId), {
    method: 'PATCH',
    body: JSON.stringify({ reviewed_by: reviewedBy ?? null }),
  });
}

// Safeguards
export function fetchSecuritySafeguards(orgId?: string): Promise<SecuritySafeguardsData> {
  return apiFetch(withOrgQuery('/compliance/safeguards', orgId));
}

export function fetchSecuritySafeguardsSummary(orgId?: string): Promise<SecuritySafeguardsSummary> {
  return apiFetch(withOrgQuery('/compliance/safeguards/summary', orgId));
}

export function updateSecurityControl(
  controlId: string,
  body: { status?: string; items_completed?: number; evidence_label?: string | null },
  orgId?: string
): Promise<SecurityControl> {
  return apiFetch(withOrgQuery(`/compliance/safeguards/controls/${controlId}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// Breach
export function listBreachIncidents(orgId?: string): Promise<BreachIncident[]> {
  return apiFetch(withOrgQuery('/compliance/breaches', orgId));
}

export function fetchBreachIncident(incidentId: string, orgId?: string): Promise<BreachIncident> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}`, orgId));
}

export function fetchActiveBreachDraft(orgId?: string): Promise<BreachIncident | null> {
  return apiFetch(withOrgQuery('/compliance/breaches/active-draft', orgId));
}

export function createBreachIncident(
  body?: { severity?: string; wizard_data?: BreachWizardData; discovered_at?: string },
  orgId?: string
): Promise<BreachIncident> {
  return apiFetch(withOrgQuery('/compliance/breaches', orgId), {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export function updateBreachIncident(
  incidentId: string,
  body: { current_step?: number; severity?: string; wizard_data?: BreachWizardData },
  orgId?: string
): Promise<BreachIncident> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function submitBreachIncident(incidentId: string, orgId?: string): Promise<BreachIncident> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}/submit`, orgId), {
    method: 'POST',
  });
}

export function assignBreachIncident(
  incidentId: string,
  assignedToUserId: string,
  orgId?: string
): Promise<BreachIncident> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}/assign`, orgId), {
    method: 'POST',
    body: JSON.stringify({ assigned_to_user_id: assignedToUserId }),
  });
}

export function escalateBreachIncident(
  incidentId: string,
  escalatedToUserId: string | null,
  orgId?: string
): Promise<BreachIncident> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}/escalate`, orgId), {
    method: 'POST',
    body: JSON.stringify({ escalated_to_user_id: escalatedToUserId }),
  });
}

export function closeBreachIncident(incidentId: string, orgId?: string): Promise<BreachIncident> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}/close`, orgId), {
    method: 'POST',
  });
}

export function notifyBreachDpb(incidentId: string, orgId?: string): Promise<{ message: string }> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}/notify-dpb`, orgId), {
    method: 'POST',
  });
}

export function notifyBreachPrincipals(
  incidentId: string,
  orgId?: string
): Promise<{ message: string }> {
  return apiFetch(withOrgQuery(`/compliance/breaches/${incidentId}/notify-principals`, orgId), {
    method: 'POST',
  });
}

export function verifyBreachAffectedFromLogs(
  body: {
    incident_id?: string;
    severity?: string;
    incident_summary?: string;
  },
  orgId?: string
): Promise<BreachAffectedVerifyResult> {
  return apiFetch(withOrgQuery('/compliance/breaches/verify-affected-principals', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Audit
export function fetchAuditEvents(
  params: {
    orgId?: string;
    q?: string;
    event_type?: string;
    actor?: string;
    resource_type?: string;
    page?: number;
    page_size?: number;
  } = {}
): Promise<PaginatedAuditEvents> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.event_type) search.set('event_type', params.event_type);
  if (params.actor) search.set('actor', params.actor);
  if (params.resource_type) search.set('resource_type', params.resource_type);
  if (params.page) search.set('page', String(params.page));
  if (params.page_size) search.set('page_size', String(params.page_size));
  const qs = search.toString();
  const path = `/compliance/audit/events${qs ? `?${qs}` : ''}`;
  return apiFetch(withOrgQuery(path, params.orgId));
}

export function fetchAuditEvent(eventId: string, orgId?: string): Promise<AuditEvent> {
  return apiFetch(withOrgQuery(`/compliance/audit/events/${eventId}`, orgId));
}

export function verifyAuditLog(orgId?: string): Promise<AuditVerifyResult> {
  return apiFetch(withOrgQuery('/compliance/audit/verify', orgId), { method: 'POST' });
}

export function fetchAuditSummary(orgId?: string): Promise<AuditLogSummary> {
  return apiFetch(withOrgQuery('/compliance/audit/summary', orgId));
}
