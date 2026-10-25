import type { ReactElement } from 'react';
import { useEffect, useState, useRef } from 'react';
import {
  ClipboardList,
  Download,
  Search,
  Copy,
  Check,
  RefreshCw,
  Globe,
  Mail,
  Phone,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE } from '@/app/hooks/useClientPagination';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchConsentReceipts, downloadConsentReceiptsXlsx, fetchPurposes } from '@/lib/api/consent';
import type { Property } from '@/types/integrations';
import type { ConsentReceiptDetail } from '@/lib/api/consent';
import { notify } from '@/app/utils/notify';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { cn } from '@/lib/utils';

export function ReceivedConsents(): ReactElement {
  const org = useComplianceOrg();

  // State variables
  const [properties, setProperties] = useState<Property[]>([]);
  const [receipts, setReceipts] = useState<ConsentReceiptDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter and pagination state
  const [search, setSearch] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Copy indicator state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  // Purpose names lookup state
  const [purposeNames, setPurposeNames] = useState<Record<string, string>>({});

  // Expanded row state
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Reset expanded row on filter/page changes
  useEffect(() => {
    setExpandedRowId(null);
  }, [selectedPropertyId, search, page]);

  // Load properties for filtering
  useEffect(() => {
    if (!org.hasOrg) return;

    let active = true;
    void integrationsApi.listProperties(org.orgIdParam)
      .then((props) => {
        if (active) {
          setProperties(props);
        }
      })
      .catch((err) => {
        console.error('Failed to load properties:', err);
      });

    return () => {
      active = false;
    };
  }, [org.orgIdParam, org.hasOrg]);

  // Load purposes to resolve their human-readable names
  useEffect(() => {
    if (!org.hasOrg) return;
    let active = true;
    void fetchPurposes(org.orgIdParam)
      .then((purps) => {
        if (active) {
          const mapping: Record<string, string> = {};
          purps.forEach((p) => {
            mapping[p.id] = p.name;
          });
          setPurposeNames(mapping);
        }
      })
      .catch((err) => {
        console.error('Failed to load purposes:', err);
      });
    return () => {
      active = false;
    };
  }, [org.orgIdParam, org.hasOrg]);

  // Fetch receipts on filter/pagination change
  const loadReceipts = async () => {
    if (!org.hasOrg) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchConsentReceipts(org.orgIdParam, {
        property_id: selectedPropertyId || undefined,
        page,
        limit: TABLE_PAGE_SIZE,
        search: search.trim() || undefined,
      });
      setReceipts(data.items);
      setTotal(data.total);
    } catch (err: any) {
      console.error('Failed to fetch receipts:', err);
      setError(err?.message || 'Failed to load consent receipts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReceipts();
  }, [org.orgIdParam, org.hasOrg, selectedPropertyId, page]);

  // Search submit/enter handler
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setPage(1);
      void loadReceipts();
    }
  };

  const triggerSearch = () => {
    setPage(1);
    void loadReceipts();
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // Export to Excel handler
  const handleExportXlsx = async () => {
    try {
      setExporting(true);
      await downloadConsentReceiptsXlsx(org.orgIdParam, {
        property_id: selectedPropertyId || undefined,
        search: search.trim() || undefined,
      });
      notify('Consent receipts Excel sheet downloaded successfully!');
    } catch (err: any) {
      console.error('Export failed:', err);
      notify('Failed to export consent receipts.');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));

  return (
    <ConsentManagementGate
      title="Received Consents"
      loading={org.loading}
      error={org.error}
      hasOrg={org.hasOrg}
      isSuperadmin={org.isSuperadmin}
      organizations={org.organizations}
      selectedOrgId={org.selectedOrgId}
      onSelectOrg={org.setSelectedOrgId}
    >
      <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
        {/* Header Title Section */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Received Consents</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              View and audit consent records, email submissions, and choices logged by active properties.
            </p>
          </div>
          <button
            onClick={handleExportXlsx}
            disabled={exporting || loading || receipts.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out shrink-0 bg-[var(--surface-card)]"
          >
            {exporting ? (
              <RefreshCw className="size-4 animate-spin text-[var(--text-secondary)]" />
            ) : (
              <Download className="size-4 text-[var(--text-secondary)]" />
            )}
            Export to Excel
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg p-4 mb-6 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="size-4 text-[var(--text-secondary)]" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyPress}
                placeholder="Search by Session ID, Email, IP Hash, or Bank Customer Ref..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-active)]"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch('');
                    setPage(1);
                    setTimeout(() => void loadReceipts(), 0);
                  }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Property Filter */}
            <select
              value={selectedPropertyId}
              onChange={(e) => {
                setSelectedPropertyId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-active)]"
            >
              <option value="">All Website/App Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || p.domain} ({p.domain})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={triggerSearch}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--border-active)] text-white hover:bg-[var(--border-active)] hover:brightness-110 transition duration-150 ease-in-out shrink-0"
          >
            Apply Filters
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 mb-6 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <AlertCircle className="size-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Data Table */}
        <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] font-medium">
                  <th className="py-3 px-4 font-semibold">Receipt ID</th>
                  <th className="py-3 px-4 font-semibold">Property</th>
                  <th className="py-3 px-4 font-semibold">Channel</th>
                  <th className="py-3 px-4 font-semibold">Session ID</th>
                  <th className="py-3 px-4 font-semibold">Principal Email</th>
                  <th className="py-3 px-4 font-semibold">Consented Purposes</th>
                  <th className="py-3 px-4 font-semibold">Lang</th>
                  <th className="py-3 px-4 font-semibold">IP Hash</th>
                  <th className="py-3 px-4 font-semibold">Created At</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Shimmer Skeleton loading
                  Array.from({ length: TABLE_PAGE_SIZE }).map((_, idx) => (
                    <tr key={idx} className="border-b border-[var(--border-default)] animate-pulse">
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-16" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-32" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-20" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-24" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-36" /></td>
                      <td className="py-4 px-4">
                        <div className="flex gap-2">
                          <div className="h-5 bg-[var(--surface-raised)] rounded-full w-12" />
                          <div className="h-5 bg-[var(--surface-raised)] rounded-full w-16" />
                        </div>
                      </td>
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-8" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-20" /></td>
                      <td className="py-4 px-4"><div className="h-4 bg-[var(--surface-raised)] rounded w-28" /></td>
                    </tr>
                  ))
                ) : receipts.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan={9} className="py-12 px-4 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div className="p-3 bg-[var(--surface-raised)] rounded-full mb-4 border border-[var(--border-default)]">
                          <ClipboardList className="size-6 text-[var(--text-secondary)]" />
                        </div>
                        <h3 className="text-base font-semibold mb-1">No consent receipts found</h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Try searching for a different term, clearing the filters, or trigger some consent choices on your deployed site/app.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  receipts.flatMap((r) => {
                    const isExpanded = expandedRowId === r.id;
                    return [
                      <tr
                        key={r.id}
                        onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                        className={cn(
                          "border-b border-[var(--border-default)] cursor-pointer hover:bg-[var(--surface-raised)]/30 transition duration-150 ease-in-out select-none",
                          isExpanded && "bg-[var(--surface-raised)]/40"
                        )}
                      >
                        {/* Receipt ID */}
                        <td className="py-3.5 px-4 font-mono text-xs">
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="truncate max-w-[80px]" title={r.id}>
                              {r.id.split('-')[0]}...
                            </span>
                            <button
                              onClick={() => handleCopy(r.id, `id-${r.id}`)}
                              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)] transition"
                              title="Copy full Receipt ID"
                            >
                              {copiedId === `id-${r.id}` ? (
                                <Check className="size-3.5 text-green-500" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Property Domain */}
                        <td className="py-3.5 px-4 font-medium max-w-[150px] truncate" title={r.property_domain || ''}>
                          {r.property_domain || (
                            <span className="text-[var(--text-secondary)] italic text-xs">Unknown Property</span>
                          )}
                        </td>

                        {/* Capture channel / journey */}
                        <td className="py-3.5 px-4 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span>{r.capture_channel || 'web'}</span>
                            {r.journey_key && (
                              <span className="text-[var(--text-tertiary)] font-mono">{r.journey_key}</span>
                            )}
                          </div>
                        </td>

                        {/* Session ID */}
                        <td className="py-3.5 px-4 font-mono text-xs">
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="truncate max-w-[100px]" title={r.session_id}>
                              {r.session_id}
                            </span>
                            <button
                              onClick={() => handleCopy(r.session_id, `sess-${r.id}`)}
                              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)] transition"
                              title="Copy Session ID"
                            >
                              {copiedId === `sess-${r.id}` ? (
                                <Check className="size-3.5 text-green-500" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Principal Identity (Email & Phone) */}
                        <td className="py-3.5 px-4 max-w-[180px]">
                          <div className="flex flex-direction flex-col gap-1">
                            {r.principal_email ? (
                              <div className="flex items-center gap-1.5" title={`Email: ${r.principal_email}`}>
                                <Mail className="size-3.5 text-[var(--text-secondary)] shrink-0" />
                                <span className="truncate text-xs">{r.principal_email}</span>
                              </div>
                            ) : null}
                            {r.principal_phone ? (
                              <div className="flex items-center gap-1.5" title={`Phone: ${r.principal_phone}`}>
                                <Phone className="size-3.5 text-indigo-400 shrink-0" />
                                <span className="truncate text-xs font-mono">{r.principal_phone}</span>
                              </div>
                            ) : null}
                            {!r.principal_email && !r.principal_phone && !r.bank_customer_ref && (
                              <span className="text-[var(--text-secondary)]/50 italic text-xs">Not Provided</span>
                            )}
                            {r.bank_customer_ref && (
                              <div className="flex items-center gap-1.5" title={`Bank customer ref: ${r.bank_customer_ref}`}>
                                <Building2 className="size-3.5 text-[var(--text-secondary)] shrink-0" />
                                <span className="truncate text-xs font-mono">{r.bank_customer_ref}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Consented Purposes */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-[280px]">
                            {Object.entries(r.consented_purposes).map(([purpose, isConsented]) => (
                              <span
                                key={purpose}
                                className={cn(
                                  'px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 border',
                                  isConsented
                                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                    : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                                )}
                              >
                                {purposeNames[purpose] || (purpose === 'necessary' ? 'Strictly Necessary' : purpose)}: {isConsented ? 'Yes' : 'No'}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Language */}
                        <td className="py-3.5 px-4 font-medium text-xs">
                          <div className="flex items-center gap-1">
                            <Globe className="size-3 text-[var(--text-secondary)] shrink-0" />
                            <span>{r.language}</span>
                          </div>
                        </td>

                        {/* IP Hash */}
                        <td className="py-3.5 px-4 font-mono text-xs max-w-[90px] truncate" title={r.ip_hash}>
                          {r.ip_hash.substring(0, 12)}...
                        </td>

                        {/* Created At */}
                        <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString(undefined, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                      </tr>,
                      isExpanded && (
                        <tr key={`${r.id}-detail`} className="bg-[var(--surface-raised)]/20">
                          <td colSpan={9} className="p-0 border-b border-[var(--border-default)]">
                            <div className="p-5 text-sm text-[var(--text-secondary)] border-l-2 border-[var(--border-active)] bg-[var(--surface-card)]/50 grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                              {/* Left column details */}
                              <div className="space-y-3">
                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Receipt ID (Full)
                                  </span>
                                  <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                                    <span className="font-mono text-xs text-[var(--text-primary)] select-all">
                                      {r.id}
                                    </span>
                                    <button
                                      onClick={() => handleCopy(r.id, `id-full-${r.id}`)}
                                      className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)] transition"
                                      title="Copy full Receipt ID"
                                    >
                                      {copiedId === `id-full-${r.id}` ? (
                                        <Check className="size-3.5 text-green-500" />
                                      ) : (
                                        <Copy className="size-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Session ID (Full)
                                  </span>
                                  <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                                    <span className="font-mono text-xs text-[var(--text-primary)] select-all">
                                      {r.session_id}
                                    </span>
                                    <button
                                      onClick={() => handleCopy(r.session_id, `sess-full-${r.id}`)}
                                      className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)] transition"
                                      title="Copy Session ID"
                                    >
                                      {copiedId === `sess-full-${r.id}` ? (
                                        <Check className="size-3.5 text-green-500" />
                                      ) : (
                                        <Copy className="size-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Property & Domain
                                  </span>
                                  <span className="block text-sm text-[var(--text-primary)] mt-1">
                                    {r.property_domain || "Unknown Website"}
                                  </span>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Banking capture context
                                  </span>
                                  <div className="mt-1 text-sm text-[var(--text-primary)] space-y-1">
                                    <div>Channel: {r.capture_channel || 'web'}</div>
                                    <div>Journey: {r.journey_key || '—'}</div>
                                    <div className="font-mono text-xs">
                                      Customer ref: {r.bank_customer_ref || '—'}
                                    </div>
                                    {r.identifier_snapshot && r.identifier_snapshot.length > 0 && (
                                      <div className="text-xs text-[var(--text-secondary)]">
                                        Identifiers: {r.identifier_snapshot.map((i) => i.type).join(', ')}
                                      </div>
                                    )}
                                    {r.proof_vault_record_id && (
                                      <div className="text-xs font-mono">
                                        Proof: {r.proof_vault_record_id}
                                        {r.proof_seal_status && (
                                          <span className="ml-2 text-[var(--text-secondary)]">
                                            ({r.proof_seal_status})
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {r.assisted_capture_metadata && (
                                      <div className="text-xs text-[var(--text-secondary)]">
                                        Staff: {JSON.stringify(r.assisted_capture_metadata)}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Principal Email Address
                                  </span>
                                  <span className="block text-sm text-[var(--text-primary)] mt-1">
                                    {r.principal_email || (
                                      <span className="text-[var(--text-secondary)] italic text-xs">
                                        No email requested/provided
                                      </span>
                                    )}
                                  </span>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Principal Phone Number (SMS Receipt)
                                  </span>
                                  <span className="block text-sm text-[var(--text-primary)] mt-1 font-mono">
                                    {r.principal_phone ? (
                                      <div className="flex items-center gap-2">
                                        <span>{r.principal_phone}</span>
                                        {r.portal_sms_status && (
                                          <span className="px-2 py-0.5 text-[10px] font-sans rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                            SMS: {r.portal_sms_status}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[var(--text-secondary)] italic text-xs font-sans">
                                        No phone requested/provided
                                      </span>
                                    )}
                                  </span>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Consented Purposes Status
                                  </span>
                                  <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                    {Object.entries(r.consented_purposes).map(([purpose, isConsented]) => (
                                      <div key={purpose} className="flex items-center gap-2 text-xs">
                                        <span className={cn(
                                          "size-2 rounded-full shrink-0",
                                          isConsented ? "bg-green-500" : "bg-gray-400"
                                        )} />
                                        <span className="font-medium text-[var(--text-primary)]">
                                          {purposeNames[purpose] || (purpose === 'necessary' ? 'Strictly Necessary' : purpose)}
                                        </span>
                                        <span className="text-[var(--text-secondary)]">
                                          ({isConsented ? 'Consented' : 'Skipped/Rejected'})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Right column details */}
                              <div className="space-y-3">
                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Hashed Client IP address
                                  </span>
                                  <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                                    <span className="font-mono text-xs text-[var(--text-primary)] select-all">
                                      {r.ip_hash}
                                    </span>
                                    <button
                                      onClick={() => handleCopy(r.ip_hash, `ip-${r.id}`)}
                                      className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)] transition"
                                      title="Copy IP Hash"
                                    >
                                      {copiedId === `ip-${r.id}` ? (
                                        <Check className="size-3.5 text-green-500" />
                                      ) : (
                                        <Copy className="size-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    User Agent string
                                  </span>
                                  <span className="block text-xs text-[var(--text-primary)] mt-1 font-mono leading-relaxed bg-[var(--surface-raised)] p-2.5 rounded border border-[var(--border-default)] select-all">
                                    {r.user_agent || "Not Captured"}
                                  </span>
                                </div>

                                <div>
                                  <span className="block text-[11px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                                    Receipt Timestamp
                                  </span>
                                  <span className="block text-sm text-[var(--text-primary)] mt-1">
                                    {new Date(r.created_at).toUTCString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    ];
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePager
            page={page - 1}
            pageCount={totalPages}
            total={total}
            pageSize={TABLE_PAGE_SIZE}
            onPage={(nextPage) => setPage(nextPage + 1)}
          />
        </div>
      </div>
    </ConsentManagementGate>
  );
}
