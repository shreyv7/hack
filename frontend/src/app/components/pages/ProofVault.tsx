import type { ReactElement } from 'react';
import { useCallback, useEffect, useState, Fragment as FragmentComponent } from 'react';
import {
  Shield,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { Link } from 'react-router';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import {
  fetchProofVaultSummary,
  fetchProofVaultRecords,
  verifyProofVaultIntegrity,
  verifyProofVaultChain,
  downloadProofPack,
  fetchProofDisputePack,
  type ProofVaultRecord,
  type ProofVaultSummary,
} from '@/lib/api/proofVault';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';
import { cn } from '@/lib/utils';

export function ProofVault(): ReactElement {
  const org = useComplianceOrg();
  const [summary, setSummary] = useState<ProofVaultSummary | null>(null);
  const [records, setRecords] = useState<ProofVaultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org.hasOrg) return;
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        fetchProofVaultSummary(org.orgIdParam),
        fetchProofVaultRecords(undefined, undefined, undefined, org.orgIdParam),
      ]);
      setSummary(s);
      setRecords(r);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load Proof Vault');
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const recordsPager = useClientPagination(records);

  const handleSearch = async () => {
    if (!org.hasOrg) return;
    recordsPager.resetPage();
    setLoading(true);
    try {
      const r = await fetchProofVaultRecords(query || undefined, undefined, undefined, org.orgIdParam);
      setRecords(r);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!org.hasOrg) return;
    setVerifying(true);
    try {
      const [integrity, chain] = await Promise.all([
        verifyProofVaultIntegrity(org.orgIdParam),
        verifyProofVaultChain(org.orgIdParam),
      ]);
      if (integrity.success && chain.valid) {
        notify(`Chain verified — ${integrity.verified_count} blocks OK`);
      } else {
        notify(`Verification issues: ${[...integrity.errors, ...chain.errors].slice(0, 2).join('; ')}`);
      }
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const copyHash = (id: string, hash: string) => {
    void navigator.clipboard.writeText(hash);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <ConsentManagementGate
      title="Proof Vault"
      loading={org.loading}
      error={org.error}
      hasOrg={org.hasOrg}
      isSuperadmin={org.isSuperadmin}
      organizations={org.organizations}
      selectedOrgId={org.selectedOrgId}
      onSelectOrg={org.setSelectedOrgId}
    >
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Shield className="h-7 w-7 text-[var(--accent)]" />
              Proof Vault
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
              DPDPA-compliant tamper-evident consent audit chain. Proof payloads bind notice version,
              language, journey, and identifier fingerprints only — never raw CIF or mobile numbers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              disabled={verifying}
              onClick={() => void handleVerify()}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-[var(--accent)] text-white rounded-lg disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Verify chain
            </button>
            <button
              type="button"
              onClick={() => void downloadProofPack(org.orgIdParam).catch((e) => notify(String(e)))}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
            >
              <Download className="h-4 w-4" />
              Export pack
            </button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total records', value: summary.total_records },
              { label: 'Verified', value: summary.verified_records },
              { label: 'Chain length', value: summary.chain_length },
              { label: 'Tamper alerts', value: summary.tampering_attempts },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)]">
                <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">{item.label}</div>
                <div className="text-2xl font-semibold mt-1">{item.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              placeholder="Search hash, journey, channel, fingerprint…"
              className="w-full pl-10 pr-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)]"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSearch()}
            className="px-4 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg"
          >
            Search
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-hover)] text-left text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3 font-medium">Block</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">v2 proof</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sealed</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                    No proof records yet. Consent captures seal automatically on receipt.
                  </td>
                </tr>
              )}
              {!loading &&
                recordsPager.slice.map((r) => (
                  <FragmentComponent key={r.id}>
                    <tr
                      className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] cursor-pointer"
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">#{r.block_number}</td>
                      <td className="px-4 py-3">{r.action}</td>
                      <td className="px-4 py-3">{r.channel}</td>
                      <td className="px-4 py-3">
                        {r.payload_version >= 2 ? (
                          <span className="text-xs text-green-600">v{r.payload_version}</span>
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)]">v1</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.verification_status === 'verified' ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="h-3 w-3" /> verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                            <AlertTriangle className="h-3 w-3" /> {r.verification_status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                        {new Date(r.sealed_at).toLocaleString()}
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr className="border-t border-[var(--border)] bg-[var(--surface)]">
                        <td colSpan={6} className="px-4 py-4 space-y-3 text-xs">
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <div className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">
                                Proof hash
                              </div>
                              <div className="font-mono break-all flex items-start gap-2">
                                {r.proof_hash || '— (v1 legacy)'}
                                {r.proof_hash && (
                                  <button type="button" onClick={() => copyHash(r.id, r.proof_hash!)}>
                                    {copiedId === r.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">
                                Chain hash
                              </div>
                              <div className="font-mono break-all">{r.current_hash}</div>
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">
                                Notice version
                              </div>
                              <div className="font-mono">{r.notice_version_id || '—'}</div>
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">
                                Customer ref fingerprint
                              </div>
                              <div className="font-mono break-all">{r.customer_ref_fingerprint || '—'}</div>
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">
                                Journey / language
                              </div>
                              <div>
                                {r.journey_key || '—'} · {r.language || '—'}
                              </div>
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">
                                Identifier types
                              </div>
                              <div>{r.identifier_types?.join(', ') || '—'}</div>
                            </div>
                          </div>
                          {r.consent_receipt_id && (
                            <Link
                              to="/consent/received"
                              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                            >
                              <Link2 className="h-3 w-3" />
                              View consent receipt {r.consent_receipt_id}
                            </Link>
                          )}
                          <button
                            type="button"
                            className="text-[var(--accent)] hover:underline"
                            onClick={() =>
                              void fetchProofDisputePack(r.id, org.orgIdParam)
                                .then((pack) =>
                                  notify(
                                    pack.payload_integrity_ok && pack.chain_integrity_ok
                                      ? 'Dispute pack integrity OK'
                                      : 'Dispute pack has integrity issues',
                                  ),
                                )
                                .catch((e) => notify(String(e)))
                            }
                          >
                            Validate dispute pack
                          </button>
                        </td>
                      </tr>
                    )}
                  </FragmentComponent>
                ))}
            </tbody>
          </table>
          <TablePager
            page={recordsPager.page}
            pageCount={recordsPager.pageCount}
            total={recordsPager.total}
            pageSize={recordsPager.pageSize}
            onPage={recordsPager.setPage}
          />
        </div>

        {summary?.current_merkle_root && (
          <p className="text-xs text-[var(--text-secondary)] font-mono break-all">
            Merkle root: {summary.current_merkle_root}
          </p>
        )}
      </div>
    </ConsentManagementGate>
  );
}
