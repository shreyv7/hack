import type { ReactElement } from 'react';
import { useState } from 'react';
import { Download, Search, Shield, X } from 'lucide-react';
import { TablePager } from '@/app/components/common/TablePager';
import { cn } from '@/lib/utils';
import { notify } from '@/app/utils/notify';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  downloadAuditEventCertificatePdf,
  downloadAuditEvidencePackPdf,
} from '@/lib/compliance/auditLogPdf';
import type { AuditEvent, AuditEventType } from '@/types/compliance';

function eventTypeClass(type: AuditEventType): string {
  if (type === 'Configuration') return 'bg-[var(--status-info-bg)] text-[var(--status-info)]';
  if (type === 'Deletion') return 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]';
  if (type === 'Consent') return 'bg-[var(--status-success-bg)] text-[var(--status-success)]';
  if (type === 'Breach') return 'bg-red-100 text-red-700';
  return 'bg-[var(--status-ai-bg)] text-[var(--status-ai)]';
}

function moduleLabel(resourceType?: string | null): string {
  if (!resourceType) return 'Platform';
  const labels: Record<string, string> = {
    breach_incident: 'Breach',
    dsar_request: 'Data Rights',
    dsar_portal_form: 'Data Rights Portal',
    consent_notice: 'Consent Notices',
    consent_purpose: 'Consent Purposes',
    notice_campaign: 'Notice Delivery',
    processing_activity: 'RoPA',
    security_control: 'Security Safeguards',
    compliance_map: 'Compliance Map',
    dpia: 'DPIA',
    audit_log: 'Audit Log',
    legitimate_use_record: 'Legitimate Use',
    regulatory_proceeding: 'Regulatory Proceedings',
  };
  return labels[resourceType] ?? resourceType.replace(/_/g, ' ');
}

/**
 * Immutable tamper-evident audit log with cryptographic integrity verification.
 */
export function AuditLog(): ReactElement {
  const {
    events,
    summary,
    loading,
    error,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    orgName,
    filters,
    setFilters,
    verify,
    reload,
  } = useAuditLog();
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [lastVerify, setLastVerify] = useState<Awaited<ReturnType<typeof verify>> | null>(null);

  const rows = events?.items ?? [];
  const total = events?.total ?? 0;
  const pageSize = events?.page_size ?? filters.page_size;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleVerify = async () => {
    const result = await verify();
    setLastVerify(result);
    notify(
      result.integrity_ok
        ? `Integrity verified — ${result.entry_count} entries`
        : 'Integrity check failed'
    );
  };

  const handleExportPack = async () => {
    if (!summary || !events) return;
    const fn = downloadAuditEvidencePackPdf(events.items, summary, lastVerify, orgName);
    notify(`Evidence pack saved as ${fn}`);
  };

  return (
    <ConsentManagementGate
      title="Audit Log"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="p-8 max-w-[1280px] mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="mb-2">Audit Log</h1>
              <div className="flex items-center gap-3">
                <DPDPAChip
                  sections={{
                    chapter: 2,
                    section: 8,
                    subsection: 5,
                    name: 'Security safeguards',
                    url: '/dpdpa2023/chapter-2/section8.html',
                    excerpt: 'Maintain audit trail of processing activities...',
                  }}
                  size="detailed"
                />
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500 text-white">
                  Evidence tool
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleVerify()}
                className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] flex items-center gap-2 cursor-pointer"
              >
                <Shield className="size-4" />
                Verify integrity
              </button>
              <button
                type="button"
                onClick={() => void handleExportPack()}
                disabled={!summary}
                className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="size-4" />
                Export evidence pack
              </button>
            </div>
          </div>
          <SectionReference section="DPDPA — Immutable tamper-evident audit trail" />
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-lg p-4 mb-6">
          <div className="text-sm text-blue-900 dark:text-blue-200">
            <strong>Cryptographic Integrity:</strong> Merkle root{' '}
            <code className="text-xs">{summary?.merkle_root?.slice(0, 24)}…</code> —{' '}
            {summary?.entry_count ?? 0} entries across all platform modules
          </div>
        </div>

        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4 mb-6 text-[var(--text-primary)]">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search audit log..."
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
                className="w-full pl-10 pr-4 py-2 border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)] text-[var(--text-primary)]"
              />
            </div>
            <select
              value={filters.event_type}
              onChange={(e) => setFilters((f) => ({ ...f, event_type: e.target.value, page: 1 }))}
              className="px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)] text-sm"
            >
              <option value="">All types</option>
              <option value="Configuration">Configuration</option>
              <option value="Consent">Consent</option>
              <option value="Deletion">Deletion</option>
              <option value="Access">Access</option>
              <option value="Rights">Rights</option>
              <option value="Breach">Breach</option>
            </select>
            <button
              type="button"
              onClick={() => void reload()}
              className="px-3 py-2 text-sm border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)]"
            >
              Apply filters
            </button>
          </div>
        </div>

        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                <th className="text-left py-3 px-4 font-medium text-[var(--text-secondary)]">Time</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-secondary)]">Actor</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-secondary)]">Action</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-secondary)]">Module</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-secondary)]">Type</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--text-secondary)]">Severity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer"
                >
                  <td className="py-3 px-4 font-mono text-xs">
                    {new Date(event.time).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-4">{event.actor}</td>
                  <td className="py-3 px-4">{event.action}</td>
                  <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                    {moduleLabel(event.resource_type)}
                  </td>
                  <td className="py-3 px-4">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', eventTypeClass(event.type))}>
                      {event.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 capitalize">{event.severity}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--text-secondary)]">
                    No audit events yet. Actions across Breach, Consent, Data Rights, RoPA, DPIA, Security, and Notice Delivery will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > pageSize ? (
          <TablePager
            page={filters.page - 1}
            pageCount={totalPages}
            total={total}
            pageSize={pageSize}
            onPage={(nextPage) => setFilters((f) => ({ ...f, page: nextPage + 1 }))}
          />
        ) : null}

        {selectedEvent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] max-w-lg w-full p-6 text-[var(--text-primary)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Event Details</h3>
                <button type="button" onClick={() => setSelectedEvent(null)}>
                  <X className="size-5" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <p><strong>Module:</strong> {moduleLabel(selectedEvent.resource_type)}</p>
                {selectedEvent.resource_id ? (
                  <p><strong>Resource:</strong> <code className="text-xs">{selectedEvent.resource_id}</code></p>
                ) : null}
                <p><strong>Action:</strong> {selectedEvent.action}</p>
                <p><strong>Details:</strong> {selectedEvent.details || '—'}</p>
                <p><strong>Hash:</strong> <code className="text-xs break-all">{selectedEvent.entry_hash}</code></p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const fn = downloadAuditEventCertificatePdf(selectedEvent, orgName);
                  notify(`Certificate saved as ${fn}`);
                }}
                className="mt-4 px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white"
              >
                Export Event Certificate (PDF)
              </button>
            </div>
          </div>
        )}
      </div>
    </ConsentManagementGate>
  );
}
