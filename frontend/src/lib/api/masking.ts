import { apiFetch } from '@/lib/api/client';
import type {
  AnonymizeTextResult,
  ApplyMaskingResult,
  FieldPreviewResult,
  MaskingCapabilities,
  MaskingRule,
  MaskingRuleUpsert,
  MaskingRun,
  MaskingStrategy,
  MaskingSummary,
  PiiColumnTarget,
  PreviewResult,
} from '@/types/masking';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchMaskingCapabilities(): Promise<MaskingCapabilities> {
  return apiFetch<MaskingCapabilities>('/masking/capabilities');
}

export function fetchMaskingRules(orgId?: string): Promise<MaskingRule[]> {
  return apiFetch<MaskingRule[]>(withOrgQuery('/masking/rules', orgId));
}

export function fetchMaskingSummary(orgId?: string): Promise<MaskingSummary> {
  return apiFetch<MaskingSummary>(withOrgQuery('/masking/summary', orgId));
}

export function fetchMaskingRuns(orgId?: string, limit = 50, offset = 0): Promise<MaskingRun[]> {
  return apiFetch<MaskingRun[]>(
    withOrgQuery(`/masking/runs?limit=${limit}&offset=${offset}`, orgId)
  );
}

export function fetchPiiColumns(orgId?: string): Promise<PiiColumnTarget[]> {
  return apiFetch<PiiColumnTarget[]>(withOrgQuery('/masking/pii-columns', orgId));
}

export function upsertMaskingRule(body: MaskingRuleUpsert, orgId?: string): Promise<MaskingRule> {
  return apiFetch<MaskingRule>(withOrgQuery('/masking/rules', orgId), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function previewMask(
  value: string,
  strategy: MaskingStrategy,
  params: Record<string, unknown> = {}
): Promise<PreviewResult> {
  return apiFetch<PreviewResult>('/masking/preview', {
    method: 'POST',
    body: JSON.stringify({ value, strategy, params }),
  });
}

export function previewField(
  dataSourceId: string,
  table: string,
  column: string,
  strategy: MaskingStrategy | null,
  orgId?: string
): Promise<FieldPreviewResult> {
  return apiFetch<FieldPreviewResult>(withOrgQuery('/masking/preview-field', orgId), {
    method: 'POST',
    body: JSON.stringify({ data_source_id: dataSourceId, table, column, strategy, limit: 10 }),
  });
}

export function applyMaskingToColumn(
  dataSourceId: string,
  table: string,
  column: string,
  strategy: MaskingStrategy | null,
  orgId?: string,
  opts?: { assetId?: string; fieldId?: string }
): Promise<ApplyMaskingResult> {
  return apiFetch<ApplyMaskingResult>(withOrgQuery('/masking/apply', orgId), {
    method: 'POST',
    body: JSON.stringify({
      data_source_id: dataSourceId,
      table,
      column,
      strategy,
      asset_id: opts?.assetId ?? null,
      inventory_field_id: opts?.fieldId ?? null,
      confirm: true,
    }),
  });
}

export function anonymizeText(text: string): Promise<AnonymizeTextResult> {
  return apiFetch<AnonymizeTextResult>('/masking/anonymize-text', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
