import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  RefreshCw,
  Rocket,
  ShieldCheck,
} from 'lucide-react';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { ConsentModuleHeader } from '@/app/components/pages/ConsentModuleHeader';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { TablePager } from '@/app/components/common/TablePager';
import { EnforcementEventLog } from '@/app/components/enforcement/EnforcementEventLog';
import { EnforcementPlaybook } from '@/app/components/enforcement/EnforcementPlaybook';
import { EnforcementSetupWizard } from '@/app/components/enforcement/EnforcementSetupWizard';
import { RemediationQueue } from '@/app/components/enforcement/RemediationQueue';
import {
  ENFORCEMENT_MODE_LABELS,
  enforcementModeBadge,
  p95LatencyMs,
} from '@/app/components/enforcement/enforcementLabels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { notify } from '@/app/utils/notify';
import { useConsentManagement } from '@/hooks/useConsentManagement';
import { ApiError } from '@/lib/api/client';
import { fetchPurposes } from '@/lib/api/consent';
import { fetchAssets, fetchAsset } from '@/lib/api/dataInventory';
import {
  fetchEnforcementEvents,
  fetchPropertyEnforcement,
  fetchPurposeDataMappings,
  fetchPurposeEnforcementConfigs,
  fetchRemediationSummary,
  fetchRemediationTasks,
  updatePropertyEnforcement,
} from '@/lib/api/enforcement';
import { integrationsApi } from '@/lib/api/integrations';
import type { Purpose } from '@/types/consent';
import type {
  CollectionPointRow,
  EnforcementEvent,
  EnforcementMode,
  PurposeDataMapping,
  PurposeEnforcementConfig,
  WithdrawalRemediationSummary,
  WithdrawalRemediationTask,
} from '@/types/enforcement';
import { getPublicApiBaseUrl } from '@/lib/integrationUrls';
import type { Property } from '@/types/integrations';

const PAGE_SIZE = 10;

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function buildCollectionPoints(
  purposes: Purpose[],
  configs: PurposeEnforcementConfig[],
  mappings: PurposeDataMapping[],
  events: EnforcementEvent[],
  propertyMode: EnforcementMode,
  propertyLabel: string,
): CollectionPointRow[] {
  const configByPurpose = new Map(configs.map((c) => [c.purpose_id, c]));
  const mappingCountByPurpose = new Map<string, number>();
  for (const m of mappings) {
    mappingCountByPurpose.set(m.purpose_id, (mappingCountByPurpose.get(m.purpose_id) ?? 0) + 1);
  }

  const lastEventByPurpose = new Map<string, EnforcementEvent>();
  for (const e of events) {
    if (!e.purpose_id) continue;
    const prev = lastEventByPurpose.get(e.purpose_id);
    if (!prev || new Date(e.occurred_at) > new Date(prev.occurred_at)) {
      lastEventByPurpose.set(e.purpose_id, e);
    }
  }

  return purposes
    .filter((p) => p.legal_basis === 'consent' && !p.archived_at)
    .map((p) => {
      const cfg = configByPurpose.get(p.id);
      const purposeMode = cfg?.mode ?? 'disabled';
      const mapped = (mappingCountByPurpose.get(p.id) ?? 0) > 0;
      const last = lastEventByPurpose.get(p.id);
      let status: CollectionPointRow['status'] = 'disabled';
      if (!mapped) status = 'unmapped';
      else if (
        purposeMode === 'enforced' &&
        propertyMode === 'enforced' &&
        last?.decision === 'denied'
      ) {
        status = 'blocked';
      } else if (purposeMode !== 'disabled' && propertyMode !== 'disabled' && mapped) {
        status = 'protected';
      } else if (!mapped && purposeMode === 'enforced') {
        status = 'unmapped';
      }

      return {
        id: p.id,
        label: p.name,
        purposeId: p.id,
        purposeName: p.name,
        propertyLabel,
        purposeMode,
        propertyMode,
        mapped,
        status,
        collectionPoint: last?.collection_point ?? null,
        lastDecision: last?.decision ?? null,
        lastOccurredAt: last?.occurred_at ?? null,
      };
    });
}

export function ConsentEnforcement(): ReactElement {
  const {
    loading: orgLoading,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
  } = useConsentManagement();

  const orgIdParam = isSuperadmin ? selectedOrgId || undefined : undefined;

  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [propertyMode, setPropertyMode] = useState<EnforcementMode>('disabled');
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [configs, setConfigs] = useState<PurposeEnforcementConfig[]>([]);
  const [mappings, setMappings] = useState<PurposeDataMapping[]>([]);
  const [events, setEvents] = useState<EnforcementEvent[]>([]);
  const [remediationSummary, setRemediationSummary] = useState<WithdrawalRemediationSummary | null>(
    null,
  );
  const [remediationTasks, setRemediationTasks] = useState<WithdrawalRemediationTask[]>([]);
  const [fieldLabels, setFieldLabels] = useState<Map<string, string>>(new Map());
  const [collectionPage, setCollectionPage] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    if (!hasOrg) return;
    setLoading(true);
    try {
      const [props, purps, cfgs, maps, evts, rSummary, rTasks] = await Promise.all([
        integrationsApi.listProperties(orgIdParam),
        fetchPurposes(orgIdParam),
        fetchPurposeEnforcementConfigs(orgIdParam),
        fetchPurposeDataMappings(orgIdParam),
        fetchEnforcementEvents(orgIdParam, selectedPropertyId || undefined, 200),
        fetchRemediationSummary(orgIdParam),
        fetchRemediationTasks(orgIdParam),
      ]);

      const activeProps = props.filter((p) => p.status !== 'archived');
      setProperties(activeProps);
      setPurposes(purps);
      setConfigs(cfgs);
      setMappings(maps);
      setEvents(evts);
      setRemediationSummary(rSummary);
      setRemediationTasks(rTasks);

      const propId = selectedPropertyId || activeProps[0]?.id || '';
      if (!selectedPropertyId && activeProps[0]) {
        setSelectedPropertyId(activeProps[0].id);
      }
      if (propId) {
        const pe = await fetchPropertyEnforcement(propId, orgIdParam);
        setPropertyMode(pe.enforcement_mode);
      }

      const assets = await fetchAssets(orgIdParam);
      const labelMap = new Map<string, string>();
      const assetDetails = await Promise.all(
        assets.slice(0, 25).map((a) => fetchAsset(a.id, orgIdParam).catch(() => null)),
      );
      for (const asset of assetDetails) {
        if (!asset) continue;
        for (const f of asset.fields) {
          labelMap.set(f.id, `${asset.name} · ${f.name}`);
        }
      }
      setFieldLabels(labelMap);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to load enforcement dashboard');
    } finally {
      setLoading(false);
    }
  }, [hasOrg, orgIdParam, selectedPropertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const propertyLabel = selectedProperty?.display_name || selectedProperty?.domain || '—';

  const collectionPoints = useMemo(
    () =>
      buildCollectionPoints(
        purposes,
        configs,
        mappings,
        events,
        propertyMode,
        propertyLabel,
      ),
    [purposes, configs, mappings, events, propertyMode, propertyLabel],
  );

  const consentPurposeCount = purposes.filter((p) => p.legal_basis === 'consent' && !p.archived_at).length;
  const mappedConsentCount = collectionPoints.filter((c) => c.mapped).length;
  const coveragePct =
    consentPurposeCount > 0 ? Math.round((mappedConsentCount / consentPurposeCount) * 100) : 0;
  const protectedCount = collectionPoints.filter((c) => c.status === 'protected').length;
  const deniedToday = events.filter(
    (e) =>
      isToday(e.occurred_at) &&
      (e.decision === 'denied' || e.decision === 'shadow_would_deny'),
  ).length;
  const suppressedToday = deniedToday;
  const suppressionCheckUrl = selectedPropertyId
    ? `${getPublicApiBaseUrl()}/integrations/${selectedPropertyId}/consent/suppression-check`
    : null;
  const latencyP95 = p95LatencyMs(events.map((e) => e.latency_ms ?? NaN).filter((n) => !Number.isNaN(n)));

  const collectionPageCount = Math.max(1, Math.ceil(collectionPoints.length / PAGE_SIZE));
  const pagedCollection = collectionPoints.slice(
    collectionPage * PAGE_SIZE,
    (collectionPage + 1) * PAGE_SIZE,
  );

  const handlePropertyChange = async (id: string) => {
    setSelectedPropertyId(id);
    setCollectionPage(0);
    try {
      const pe = await fetchPropertyEnforcement(id, orgIdParam);
      setPropertyMode(pe.enforcement_mode);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to load property enforcement');
    }
  };

  const promoteProperty = async (mode: EnforcementMode) => {
    if (!selectedPropertyId || !canEdit) return;
    setPromoting(true);
    try {
      await updatePropertyEnforcement(selectedPropertyId, mode, orgIdParam);
      setPropertyMode(mode);
      notify(`Property mode set to ${ENFORCEMENT_MODE_LABELS[mode]}`);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to update property mode');
    } finally {
      setPromoting(false);
    }
  };

  const statusBadge = (row: CollectionPointRow) => {
    if (row.status === 'protected') {
      return (
        <span className="px-2.5 py-1 rounded text-xs font-bold bg-[var(--status-success-bg)] text-[var(--status-success)]">
          PROTECTED
        </span>
      );
    }
    if (row.status === 'blocked') {
      return (
        <span className="px-2.5 py-1 rounded text-xs font-bold bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
          BLOCKED
        </span>
      );
    }
    if (row.status === 'unmapped') {
      return (
        <span className="px-2.5 py-1 rounded bg-[var(--status-warning-bg)] text-xs font-semibold text-[var(--status-warning)] flex items-center gap-1 w-max">
          <AlertTriangle className="w-3.5 h-3.5" /> Unmapped
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded text-xs text-[var(--text-secondary)] bg-[var(--surface-raised)]">
        Disabled
      </span>
    );
  };

  return (
    <ConsentManagementGate
      title="Consent Enforcement"
      loading={orgLoading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="p-8 max-w-[1280px] mx-auto">
        <ConsentModuleHeader
          title="Consent Enforcement"
          sectionReference="DPDPA Section 6 — Consent before processing"
          chips={
            <>
              <DPDPAChip
                sections={{
                  chapter: 2,
                  section: 6,
                  name: 'Consent before processing',
                  url: '/dpdpa2023/chapter-2/section6.html',
                  excerpt: 'Consent must be free, specific, informed, and unambiguous.',
                }}
              />
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface-raised)] border border-[var(--border-default)]">
                <ShieldCheck className="size-3.5" />
                Decision API + tokens
              </span>
            </>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowPlaybook(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
              >
                <BookOpen className="size-4" />
                Playbook
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowWizard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Rocket className="size-4" />
                  Setup wizard
                </button>
              )}
            </>
          }
        />

        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Integration property</label>
            <div className="relative">
              <select
                value={selectedPropertyId}
                onChange={(e) => void handlePropertyChange(e.target.value)}
                className="appearance-none min-w-[240px] rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 pr-8 text-sm"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.domain}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 pointer-events-none text-[var(--text-tertiary)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Property enforcement</label>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${enforcementModeBadge(propertyMode)}`}>
                {ENFORCEMENT_MODE_LABELS[propertyMode]}
              </span>
              {canEdit && propertyMode === 'disabled' && (
                <button
                  type="button"
                  disabled={promoting}
                  onClick={() => void promoteProperty('shadow')}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Promote to shadow
                </button>
              )}
              {canEdit && propertyMode === 'shadow' && (
                <>
                  <button
                    type="button"
                    disabled={promoting}
                    onClick={() => void promoteProperty('enforced')}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Promote to enforced
                  </button>
                  <button
                    type="button"
                    disabled={promoting}
                    onClick={() => void promoteProperty('disabled')}
                    className="text-xs text-[var(--text-secondary)] hover:underline"
                  >
                    Demote
                  </button>
                </>
              )}
              {canEdit && propertyMode === 'enforced' && (
                <button
                  type="button"
                  disabled={promoting}
                  onClick={() => void promoteProperty('shadow')}
                  className="text-xs text-[var(--text-secondary)] hover:underline"
                >
                  Demote to shadow
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Coverage', value: `${coveragePct}%` },
            {
              label: 'Protected endpoints',
              value: `${protectedCount} / ${consentPurposeCount}`,
            },
            { label: 'Denied today', value: deniedToday },
            {
              label: 'Suppressed today',
              value: suppressedToday,
            },
            {
              label: 'Pending remediations',
              value: remediationSummary?.pending_tasks ?? 0,
            },
            {
              label: 'Decision API p95',
              value: latencyP95 != null ? `${latencyP95} ms` : '—',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)]"
            >
              <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">
                {item.label}
              </div>
              <div className="text-2xl font-semibold mt-1">{item.value}</div>
            </div>
          ))}
        </div>

        {suppressionCheckUrl && (
          <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-sm">
            <div className="font-medium mb-1">Marketing send filter (bulk suppression check)</div>
            <p className="text-[var(--text-secondary)] text-xs mb-2">
              Before a campaign send, POST a batch of emails/phones to filter out principals who denied
              consent for a purpose. Use <code className="px-1 rounded bg-[var(--surface-card)]">vajra.filter_consented()</code> or call directly:
            </p>
            <code className="block text-xs p-2 rounded bg-[var(--surface-card)] border overflow-x-auto">
              POST {suppressionCheckUrl}
            </code>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-[var(--surface-raised)]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Event log</TabsTrigger>
            <TabsTrigger value="remediation">
              Remediation
              {(remediationSummary?.pending_tasks ?? 0) > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px]">
                  {remediationSummary?.pending_tasks}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <h3 className="font-medium">Collection points</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Consent-based purposes registered for enforcement on {propertyLabel}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-raised)] text-xs text-[var(--text-secondary)] uppercase">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium">Purpose</th>
                      <th className="text-left py-3 px-4 font-medium">Purpose mode</th>
                      <th className="text-left py-3 px-4 font-medium">Mapping</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Last decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
                          Loading…
                        </td>
                      </tr>
                    )}
                    {!loading && pagedCollection.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
                          No consent purposes yet. Add purposes in the Purpose Registry.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      pagedCollection.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)]"
                        >
                          <td className="py-3 px-4 font-medium">{row.purposeName}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${enforcementModeBadge(row.purposeMode)}`}
                            >
                              {ENFORCEMENT_MODE_LABELS[row.purposeMode]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">
                            {row.mapped ? 'Mapped' : '—'}
                          </td>
                          <td className="py-3 px-4">{statusBadge(row)}</td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">
                            {row.lastDecision ?? '—'}
                            {row.lastOccurredAt && (
                              <div className="text-[10px] text-[var(--text-tertiary)]">
                                {new Date(row.lastOccurredAt).toLocaleString()}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <TablePager
                page={collectionPage}
                pageCount={collectionPageCount}
                total={collectionPoints.length}
                pageSize={PAGE_SIZE}
                onPage={setCollectionPage}
              />
            </div>
          </TabsContent>

          <TabsContent value="events">
            <EnforcementEventLog events={events} purposes={purposes} loading={loading} />
          </TabsContent>

          <TabsContent value="remediation" className="space-y-4">
            {remediationSummary && (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Pending tasks', value: remediationSummary.pending_tasks },
                  { label: 'Overdue', value: remediationSummary.overdue_tasks },
                  { label: 'Retention obligations', value: remediationSummary.obligations_from_withdrawal },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border border-[var(--border)] p-3 bg-[var(--surface)]"
                  >
                    <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
                    <div className="text-xl font-semibold">{s.value}</div>
                  </div>
                ))}
              </div>
            )}
            <RemediationQueue
              tasks={remediationTasks}
              purposes={purposes}
              fieldLabels={fieldLabels}
              loading={loading}
            />
          </TabsContent>
        </Tabs>
      </div>

      {showPlaybook && (
        <EnforcementPlaybook
          onClose={() => setShowPlaybook(false)}
          onOpenWizard={canEdit ? () => setShowWizard(true) : undefined}
        />
      )}

      {showWizard && (
        <EnforcementSetupWizard
          orgId={orgIdParam}
          initialPropertyId={selectedPropertyId}
          onClose={() => setShowWizard(false)}
          onComplete={() => void load()}
        />
      )}
    </ConsentManagementGate>
  );
}
