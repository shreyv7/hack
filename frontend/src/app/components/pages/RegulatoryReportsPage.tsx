import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { SectionReference } from '@/app/components/common/SectionReference';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { fetchBusinessUnits, type BusinessUnit } from '@/lib/api/ropa';
import { fetchPurposes } from '@/lib/api/consent';
import type { Purpose } from '@/types/consent';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchBankingEnabled, fetchBankingConfig } from '@/lib/api/consentBanking';
import type { JourneyConfig } from '@/types/consentBanking';
import type { Property } from '@/types/integrations';
import {
  downloadRegulatoryReport,
  fetchRegulatoryReportCatalog,
  generateRegulatoryReport,
  type RegulatoryReportCatalogItem,
  type ReportFilters,
  type ReportFormat,
  type ReportKey,
} from '@/lib/api/regulatoryReports';
import { notify } from '@/app/utils/notify';

const TIME_FILTERS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '6 months' },
  { value: '365d', label: '1 year' },
];

export function RegulatoryReportsPage(): ReactElement {
  const navigate = useNavigate();
  const org = useComplianceOrg();
  const [catalog, setCatalog] = useState<RegulatoryReportCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({ time_range: '90d' });
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [journeys, setJourneys] = useState<JourneyConfig[]>([]);
  const [bankingEnabled, setBankingEnabled] = useState(false);

  useEffect(() => {
    void fetchRegulatoryReportCatalog().then(setCatalog).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!org.hasOrg) return;
    void Promise.all([
      fetchBusinessUnits(org.orgIdParam ?? undefined),
      fetchPurposes(org.orgIdParam ?? undefined),
      integrationsApi.listProperties(org.orgIdParam ?? undefined),
      fetchBankingEnabled(org.orgIdParam ?? undefined).catch(() => ({ enabled: false })),
    ]).then(([bu, purp, props, banking]) => {
      setBusinessUnits(bu);
      setPurposes(purp);
      setProperties(props);
      setBankingEnabled(banking.enabled);
      if (banking.enabled) {
        void fetchBankingConfig(org.orgIdParam ?? undefined).then((cfg) => {
          setJourneys(cfg.journeys ?? []);
        });
      }
    });
  }, [org.hasOrg, org.orgIdParam]);

  const handleGenerate = async (reportKey: ReportKey, format: ReportFormat) => {
    setGenerating(`${reportKey}:${format}`);
    try {
      const response = await generateRegulatoryReport(
        { report_key: reportKey, format, filters },
        org.orgIdParam ?? undefined
      );
      downloadRegulatoryReport(response);
      notify(`Downloaded ${response.filename}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Report generation failed');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <ConsentManagementGate
      title="Regulatory Reports"
      loading={loading}
      error={null}
      hasOrg={org.hasOrg}
      isSuperadmin={org.isSuperadmin}
      organizations={org.organizations}
      selectedOrgId={org.selectedOrgId}
      onSelectOrg={org.setSelectedOrgId}
    >
      <div className="p-4 md:p-8 max-w-[1200px] mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1>Regulatory Reports</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              DPDPA-anchored report packs for regulator filing and internal audit
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/compliance/dashboards')}
            className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
          >
            Back to Dashboards
          </button>
        </div>
        <SectionReference section="DPDPA — Regulatory Reporting (Req 9)" />

        <div className="flex flex-wrap gap-3 mb-6 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]">
          <select
            value={filters.time_range ?? '90d'}
            onChange={(e) => setFilters({ ...filters, time_range: e.target.value })}
            className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
          >
            {TIME_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            value={filters.business_unit_id ?? ''}
            onChange={(e) => setFilters({ ...filters, business_unit_id: e.target.value || null })}
            className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
          >
            <option value="">All business units</option>
            {businessUnits.map((bu) => (
              <option key={bu.id} value={bu.id}>{bu.name}</option>
            ))}
          </select>
          <select
            value={filters.property_id ?? ''}
            onChange={(e) => setFilters({ ...filters, property_id: e.target.value || null })}
            className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
          >
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name || p.domain}</option>
            ))}
          </select>
          <select
            value={filters.purpose_id ?? ''}
            onChange={(e) => setFilters({ ...filters, purpose_id: e.target.value || null })}
            className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
          >
            <option value="">All purposes</option>
            {purposes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {bankingEnabled && (
            <>
              <select
                value={filters.channel ?? ''}
                onChange={(e) => setFilters({ ...filters, channel: e.target.value || null })}
                className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
              >
                <option value="">All channels</option>
                {journeys.map((j) => (
                  <option key={j.channel} value={j.channel}>{j.label || j.channel}</option>
                ))}
              </select>
              <select
                value={filters.journey_key ?? ''}
                onChange={(e) => setFilters({ ...filters, journey_key: e.target.value || null })}
                className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
              >
                <option value="">All journeys</option>
                {journeys.map((j) => (
                  <option key={j.key} value={j.key}>{j.label || j.key}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="size-4 animate-spin" /> Loading report catalog…
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {catalog.map((item) => (
              <div
                key={item.key}
                className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/50"
              >
                <div className="flex items-start gap-3 mb-3">
                  <FileText className="size-5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium">{item.name}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{item.description}</p>
                    {item.dpdpa_sections.length > 0 && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-2">
                        DPDPA: {item.dpdpa_sections.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.formats.map((fmt) => {
                    const busy = generating === `${item.key}:${fmt}`;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        disabled={busy}
                        onClick={() => void handleGenerate(item.key, fmt)}
                        className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-card)] flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                        {fmt.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ConsentManagementGate>
  );
}
