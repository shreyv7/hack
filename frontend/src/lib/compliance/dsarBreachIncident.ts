import type { BreachIncident, BreachWizardData } from '@/types/compliance';
import type { DataRightsRequest } from '@/types/dsar';
import { RIGHT_TYPE_LABELS } from '@/types/dsar';

export function dsarSlaStatusLabel(req: DataRightsRequest): string {
  if (req.sla_bucket === 'ack_breached') {
    return 'Grievance ack overdue';
  }
  return 'Response deadline breached';
}

export function extractLinkedDsarIds(incidents: BreachIncident[]): Set<string> {
  const linked = new Set<string>();
  for (const incident of incidents) {
    const sourceId = incident.wizard_data.source_dsar_request_id;
    if (sourceId) linked.add(sourceId);
  }
  return linked;
}

export function findIncidentForDsarRequest(
  incidents: BreachIncident[],
  dsarRequestId: string,
): BreachIncident | undefined {
  return incidents.find(
    (incident) => incident.wizard_data.source_dsar_request_id === dsarRequestId,
  );
}

export function buildWizardDataFromDsarRequest(req: DataRightsRequest): BreachWizardData {
  const rightLabel = RIGHT_TYPE_LABELS[req.right_type];
  const slaIssue = dsarSlaStatusLabel(req);
  const dataTypes: string[] = [];
  if (req.requester_name) dataTypes.push('Name');
  if (req.requester_email) dataTypes.push('Email');
  if (req.requester_phone) dataTypes.push('Phone');

  return {
    source_type: 'dsar_sla',
    source_dsar_request_id: req.id,
    source_tracking_id: req.tracking_id,
    category: 'DSAR SLA',
    incident_summary: [
      `${rightLabel} — DSAR ${req.tracking_id}`,
      '',
      `Requester: ${req.requester_name}`,
      slaIssue,
      '',
      req.request_details,
    ].join('\n'),
    affected_count: '1',
    data_types: dataTypes,
    mitigation_actions: `Expedite resolution of DSAR ${req.tracking_id} and issue formal closure to the data principal.`,
    remediation_steps: `Complete ${rightLabel.toLowerCase()} workflow for ${req.requester_name} (tracking ${req.tracking_id}).`,
    dp_contact: req.requester_email ?? '',
    dp_recipient_phone: req.requester_phone ?? '',
    dp_channels: req.requester_email ? ['email'] : req.requester_phone ? ['sms'] : ['in-app'],
    dp_email_subject: `Update on your ${rightLabel} request (${req.tracking_id})`,
    dp_message_body: [
      `Dear ${req.requester_name},`,
      '',
      `We acknowledge that your ${rightLabel.toLowerCase()} request (${req.tracking_id}) exceeded the regulatory response timeline. We are prioritising your case.`,
      '',
      req.request_details,
    ].join('\n'),
    public_disclosure_required: false,
  };
}
