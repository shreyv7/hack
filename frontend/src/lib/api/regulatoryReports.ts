import { apiFetch } from '@/lib/api/client';

function withOrg(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export type ReportKey =
  | 'consent_proof'
  | 'consent_status'
  | 'data_rights'
  | 'ropa_register'
  | 'dpia_portfolio'
  | 'retention_actions'
  | 'compliance_gaps'
  | 'fino_regulatory_pack';

export type ReportFormat = 'pdf' | 'xlsx' | 'json' | 'zip';

export interface ReportFilters {
  time_range?: string;
  business_unit_id?: string | null;
  property_id?: string | null;
  purpose_id?: string | null;
  channel?: string | null;
  journey_key?: string | null;
}

export interface RegulatoryReportCatalogItem {
  key: ReportKey;
  name: string;
  description: string;
  formats: ReportFormat[];
  dpdpa_sections: string[];
}

export interface RegulatoryReportResponse {
  report_key: string;
  format: string;
  filename: string;
  content_type: string;
  data_base64: string;
}

export function fetchRegulatoryReportCatalog(): Promise<RegulatoryReportCatalogItem[]> {
  return apiFetch('/regulatory-reports/catalog');
}

export function generateRegulatoryReport(
  body: { report_key: ReportKey; format: ReportFormat; filters?: ReportFilters },
  orgId?: string
): Promise<RegulatoryReportResponse> {
  return apiFetch(withOrg('/regulatory-reports/generate', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function downloadRegulatoryReport(response: RegulatoryReportResponse): void {
  const binary = atob(response.data_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: response.content_type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = response.filename;
  a.click();
  URL.revokeObjectURL(url);
}
