import { apiFetch, getApiBaseUrl } from './client';
import { getAccessToken } from '@/lib/auth/storage';

export interface ConsentReceiptDetail {
  id: string;
  property_id: string;
  organization_id: string;
  session_id: string;
  consented_purposes: Record<string, boolean>;
  ip_hash: string;
  user_agent: string | null;
  language: string;
  banner_snapshot: Record<string, any>;
  signature: string;
  created_at: string;
}

export interface ProofVaultRecord {
  id: string;
  organization_id: string;
  consent_receipt_id: string | null;
  block_number: number;
  previous_hash: string;
  current_hash: string;
  merkle_leaf_hash: string;
  payload_version: number;
  proof_hash: string | null;
  notice_version_id: string | null;
  language: string | null;
  journey_key: string | null;
  customer_ref_fingerprint: string | null;
  identifier_types: string[] | null;
  receipt_signature: string | null;
  event_type: string;
  action: string;
  purposes: string;
  channel: string;
  source: string;
  created_at: string;
  sealed_at: string;
  sealed: boolean;
  verification_status: string;
  consent_receipt?: ConsentReceiptDetail | null;
}

export interface ProofVaultDisputePack {
  record_id: string;
  block_number: number;
  proof_hash: string | null;
  current_hash: string;
  payload_version: number;
  proof_payload: Record<string, unknown> | null;
  payload_integrity_ok: boolean;
  chain_integrity_ok: boolean;
  notice_version_id: string | null;
  language: string | null;
  journey_key: string | null;
  customer_ref_fingerprint: string | null;
  identifier_types: string[] | null;
  receipt_signature: string | null;
  consent_receipt_id: string | null;
  receipt_created_at: string | null;
  dpdpa_data_minimization: boolean;
  sealed_at: string;
}

export interface ProofVaultSummary {
  total_records: number;
  verified_records: number;
  chain_length: number;
  tampering_attempts: number;
  current_merkle_root: string | null;
  last_sealed_block: string | null;
  last_verified_at: string | null;
}

export interface ProofVaultVerification {
  id: string;
  organization_id: string;
  verified_at: string;
  verified_by_user_id: string | null;
  merkle_root: string;
  records_checked: number;
  integrity_ok: boolean;
  errors: string | null;
}

export interface ProofVaultVerifyResult {
  success: boolean;
  verified_count: number;
  failed_count: number;
  checked_at: string;
  errors: string[];
}

export interface ProofVaultChainVerifyResult {
  valid: boolean;
  blocks_checked: number;
  invalid_blocks: number;
  errors: string[];
}

export async function fetchProofVaultSummary(orgId?: string): Promise<ProofVaultSummary> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProofVaultSummary>(`/proof-vault/summary${qs}`);
}

export async function fetchProofVaultRecords(
  query?: string,
  startDate?: string,
  endDate?: string,
  orgId?: string
): Promise<ProofVaultRecord[]> {
  const params = new URLSearchParams();
  if (query) params.append('query', query);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (orgId) params.append('org_id', orgId);

  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<ProofVaultRecord[]>(`/proof-vault/records${qs}`);
}

export async function fetchProofVaultVerifications(
  orgId?: string,
  limit: number = 5
): Promise<ProofVaultVerification[]> {
  const params = new URLSearchParams();
  params.append('limit', String(limit));
  if (orgId) params.append('org_id', orgId);

  return apiFetch<ProofVaultVerification[]>(`/proof-vault/verifications?${params.toString()}`);
}

export async function fetchProofVaultRecord(
  recordId: string,
  orgId?: string
): Promise<ProofVaultRecord> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProofVaultRecord>(`/proof-vault/records/${recordId}${qs}`);
}

export async function verifyProofVaultIntegrity(orgId?: string): Promise<ProofVaultVerifyResult> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProofVaultVerifyResult>(`/proof-vault/verify${qs}`, {
    method: 'POST',
  });
}

export async function verifyProofVaultChain(orgId?: string): Promise<ProofVaultChainVerifyResult> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProofVaultChainVerifyResult>(`/proof-vault/verify-chain${qs}`, {
    method: 'POST',
  });
}

export async function fetchProofDisputePack(
  recordId: string,
  orgId?: string
): Promise<ProofVaultDisputePack> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProofVaultDisputePack>(`/proof-vault/records/${recordId}/dispute-pack${qs}`);
}

export async function fetchProofRecordsForReceipt(
  receiptId: string,
  orgId?: string
): Promise<ProofVaultRecord[]> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProofVaultRecord[]>(`/proof-vault/records/by-receipt/${receiptId}${qs}`);
}

export async function downloadProofPack(orgId?: string): Promise<void> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const qs = orgId ? `?org_id=${orgId}` : '';
  const response = await fetch(`${getApiBaseUrl()}/proof-vault/export${qs}`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'Failed to export proof pack';
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = errJson.detail;
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proof_pack_${orgId || 'org'}_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
