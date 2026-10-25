import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CalendarClock, Loader2, Lock, RotateCcw, Search, Shield, Sparkles, X } from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { Button } from '@/app/components/ui/Button';
import { TablePager } from '@/app/components/common/TablePager';
import { PiiScanPlaybook } from '@/app/components/pii-scanner/PiiScanPlaybook';
import { ScanDetailDrawer } from '@/app/components/pii-scanner/ScanDetailDrawer';
import { ScheduleManager } from '@/app/components/pii-scanner/ScheduleManager';
import { cn } from '@/lib/utils';
import {
  bulkDismissFindings,
  dismissFinding,
  fetchFindings,
  fetchPiiSummary,
  fetchScan,
  fetchScans,
  retryScan,
  startPiiScan,
} from '@/lib/api/piiScan';
import { fetchDataSources } from '@/lib/api/dataSources';
import type { PiiFinding, PiiScanSummary, ScanJob, ScanJobDetail } from '@/types/piiScan';
import type { DataSource } from '@/types/dataSource';
import { isPiiScannableSource } from '@/types/dataSource';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

const CATEGORY_COLORS = ['#EF4444', '#F97316', '#DC2626', '#F59E0B', '#FBBF24', '#8B5CF6', '#6366F1'];


function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function SignalStat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number | string;
  hint: string;
  warn?: boolean;
}): ReactElement {
  const showWarn = warn && typeof value === 'number' && value > 0;
  return (
    <div className="rounded-lg border border-[var(--border-default)] p-3 bg-[var(--surface-raised)]">
      <div className={showWarn ? 'text-xl font-semibold text-[var(--status-danger)]' : 'text-xl font-semibold text-[var(--text-primary)]'}>
        {value}
      </div>
      <div className="text-xs font-medium text-[var(--text-primary)] mt-0.5">{label}</div>
      <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{hint}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: number;
  valueClass?: string;
  icon?: ReactElement;
}): ReactElement {
  return (
    <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
        {icon}
      </div>
      <div className={cn('text-3xl font-semibold', valueClass ?? 'text-[var(--text-primary)]')}>{value}</div>
    </div>
  );
}

/**
 * PII Scanner dashboard — wired to /pii-scanner. Runs value-level scans against a
 * data source, shows findings, and lets a reviewer dismiss false positives.
 */
export function PIIScannerDashboard(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const [summary, setSummary] = useState<PiiScanSummary | null>(null);
  const [scans, setScans] = useState<ScanJob[]>([]);
  const [findings, setFindings] = useState<PiiFinding[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState('');
  const [sampleSize, setSampleSize] = useState('100');
  const [scanning, setScanning] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<ScanJobDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Findings review: filters + multi-select bulk dismiss.
  const [findingSourceFilter, setFindingSourceFilter] = useState('all');
  const [findingCategoryFilter, setFindingCategoryFilter] = useState('all');
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [bulkDismissing, setBulkDismissing] = useState(false);
  const [findingsPage, setFindingsPage] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [s, j, f] = await Promise.all([
        fetchPiiSummary(orgId),
        fetchScans(orgId),
        fetchFindings(orgId, 'detected'),
      ]);
      setSummary(s);
      setScans(j);
      setFindings(f);
    } catch (error) {
      notify(`Failed to load PII data: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    fetchDataSources(orgId).then(setSources).catch(() => setSources([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCat = useMemo(
    () => (summary?.by_category ?? []).reduce((sum, c) => sum + c.count, 0),
    [summary],
  );

  const sourceName = (id: string | null): string =>
    sources.find((s) => s.id === id)?.name ?? '—';

  const runScan = async () => {
    if (!selectedSource) {
      notify('Select a data source to scan.');
      return;
    }
    setScanning(true);
    try {
      const started = await startPiiScan(selectedSource, Number(sampleSize) || 100, orgId);
      setShowModal(false);
      notify('Scan started — running in the background…');
      await load(); // shows the running row immediately
      // Poll until the background job finishes (max ~3 min).
      let final = started;
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        final = await fetchScan(started.id, orgId);
        if (final.status !== 'running') break;
      }
      if (final.status === 'completed') {
        notify(`Scan complete: ${final.fields_flagged} PII column(s) across ${final.tables_scanned} tables.`);
      } else if (final.status === 'failed') {
        notify(`Scan failed: ${final.error ?? 'unknown error'}`);
      } else {
        notify('Scan still running — check back shortly.');
      }
      await load();
    } catch (error) {
      notify(`Scan failed: ${(error as Error).message}`);
    } finally {
      setScanning(false);
    }
  };

  const handleDismiss = async (f: PiiFinding) => {
    setDismissingId(f.id);
    try {
      await dismissFinding(f.id, orgId);
      notify(`Dismissed ${f.column_name} — inventory classification reverted.`);
      await load();
    } catch (error) {
      notify(`Dismiss failed: ${(error as Error).message}`);
    } finally {
      setDismissingId(null);
    }
  };

  const openScanDetail = async (jobId: string) => {
    setSelectedJobId(jobId);
    setLoadingDetail(true);
    try {
      const detail = await fetchScan(jobId, orgId);
      setSelectedJobDetail(detail);
    } catch (error) {
      notify(`Failed to load scan detail: ${(error as Error).message}`);
      setSelectedJobId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      const started = await retryScan(jobId, orgId);
      notify('Retry started — running in the background\u2026');
      await load();
      setSelectedJobId(started.id);
      setLoadingDetail(true);
      const detail = await fetchScan(started.id, orgId);
      setSelectedJobDetail(detail);
      setLoadingDetail(false);
    } catch (error) {
      notify(`Retry failed: ${(error as Error).message}`);
    } finally {
      setRetryingId(null);
    }
  };

  // Sources / categories present in the current findings, for the filter dropdowns.
  const findingSources = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of findings) {
      if (f.data_source_id) map.set(f.data_source_id, f.data_source_name ?? f.data_source_id);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [findings]);

  const findingCategories = useMemo(
    () => Array.from(new Set(findings.map((f) => f.pii_category))).sort(),
    [findings],
  );

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (findingSourceFilter !== 'all' && f.data_source_id !== findingSourceFilter) return false;
      if (findingCategoryFilter !== 'all' && f.pii_category !== findingCategoryFilter) return false;
      return true;
    });
  }, [findings, findingSourceFilter, findingCategoryFilter]);

  const FINDINGS_PAGE_SIZE = 10;
  useEffect(() => {
    setFindingsPage(0);
  }, [findingSourceFilter, findingCategoryFilter]);
  const findingsPageCount = Math.max(1, Math.ceil(filteredFindings.length / FINDINGS_PAGE_SIZE));
  const findingsSafePage = Math.min(findingsPage, findingsPageCount - 1);
  const pagedFindings = filteredFindings.slice(
    findingsSafePage * FINDINGS_PAGE_SIZE,
    (findingsSafePage + 1) * FINDINGS_PAGE_SIZE,
  );

  // Keep the selection to what's currently visible.
  useEffect(() => {
    const visible = new Set(filteredFindings.map((f) => f.id));
    setSelectedFindingIds((prev) => new Set([...prev].filter((id) => visible.has(id))));
  }, [filteredFindings]);

  const allVisibleSelected =
    filteredFindings.length > 0 && filteredFindings.every((f) => selectedFindingIds.has(f.id));

  const toggleSelectAll = () => {
    setSelectedFindingIds(allVisibleSelected ? new Set() : new Set(filteredFindings.map((f) => f.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDismissSelected = async () => {
    if (selectedFindingIds.size === 0) return;
    setBulkDismissing(true);
    try {
      const res = await bulkDismissFindings({ finding_ids: [...selectedFindingIds] }, orgId);
      notify(res.message);
      setSelectedFindingIds(new Set());
      await load();
    } catch (error) {
      notify(`Bulk dismiss failed: ${(error as Error).message}`);
    } finally {
      setBulkDismissing(false);
    }
  };

  const handleDismissAllMatching = async () => {
    const label =
      findingSourceFilter === 'all' && findingCategoryFilter === 'all'
        ? 'ALL findings'
        : 'all findings matching the current filters';
    if (!window.confirm(`Dismiss ${label}? This reverts their inventory classification.`)) return;
    setBulkDismissing(true);
    try {
      const res = await bulkDismissFindings(
        {
          data_source_id: findingSourceFilter === 'all' ? undefined : findingSourceFilter,
          pii_category: findingCategoryFilter === 'all' ? undefined : findingCategoryFilter,
        },
        orgId,
      );
      notify(res.message);
      setSelectedFindingIds(new Set());
      await load();
    } catch (error) {
      notify(`Bulk dismiss failed: ${(error as Error).message}`);
    } finally {
      setBulkDismissing(false);
    }
  };

  return (
    <div className="min-h-full">
      <div className="px-8 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2 text-[var(--text-primary)]">PII Scanner</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Sample real column values to detect PII and upgrade your Data Inventory classifications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setShowSchedules(true)}>
              <CalendarClock className="w-4 h-4 mr-2" />
              Schedules
            </Button>
            <Button variant="secondary" size="md" onClick={() => setShowPlaybook(true)}>
              <BookOpen className="w-4 h-4 mr-2" />
              Playbook
            </Button>
            <Button variant="primary" size="md" onClick={() => setShowModal(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              New Scan
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-6">
          <Metric label="Total Scans" value={summary?.total_scans ?? 0} icon={<Search className="w-5 h-5 text-[var(--brand-primary)]" />} />
          <Metric label="PII Columns Found" value={summary?.total_findings ?? 0} valueClass="text-[var(--status-danger)]" />
          <Metric label="Sensitive Columns" value={summary?.sensitive_findings ?? 0} valueClass="text-[var(--status-danger)]" icon={<Shield className="w-5 h-5 text-[var(--status-danger)]" />} />
          <Metric label="Inventory Fields Flagged" value={summary?.fields_flagged ?? 0} icon={<Lock className="w-5 h-5 text-[var(--status-success)]" />} />
        </div>

        {/* DPDPA accountability signals: source coverage + purpose/retention/children/cross-border gaps */}
        <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Compliance signals</h2>
            <button
              type="button"
              onClick={() => setShowPlaybook(true)}
              className="text-xs text-[var(--brand-primary)] hover:underline"
            >
              What do these mean?
            </button>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <SignalStat
              label="Source coverage"
              value={
                summary && summary.sources_scannable > 0
                  ? `${summary.sources_scanned}/${summary.sources_scannable}`
                  : '0/0'
              }
              hint="Sources ever scanned"
            />
            <SignalStat
              label="No purpose link"
              value={summary?.findings_without_purpose ?? 0}
              hint="Sec 4/5 purpose limitation"
              warn={(summary?.findings_without_purpose ?? 0) > 0}
            />
            <SignalStat
              label="No retention rule"
              value={summary?.findings_without_retention ?? 0}
              hint="Sec 8(7) storage limitation"
              warn={(summary?.findings_without_retention ?? 0) > 0}
            />
            <SignalStat
              label="Children's data"
              value={summary?.children_data_findings ?? 0}
              hint="Sec 9 — extra consent"
              warn={(summary?.children_data_findings ?? 0) > 0}
            />
            <SignalStat
              label="Cross-border"
              value={summary?.cross_border_findings ?? 0}
              hint="Sec 16 transfer check"
              warn={(summary?.cross_border_findings ?? 0) > 0}
            />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-6">
          {/* Recent scans */}
          <div className="col-span-3">
            <div className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]">
              <div className="px-6 py-4 border-b border-[var(--border-default)]">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recent Scans</h2>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
              ) : scans.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">
                  No scans yet. Click “New Scan” and pick a PostgreSQL source.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium border-b bg-[var(--surface-raised)] text-[var(--text-tertiary)] border-[var(--border-default)]">
                    <div className="col-span-3">SOURCE</div>
                    <div className="col-span-2">STATUS</div>
                    <div className="col-span-1">TABLES</div>
                    <div className="col-span-2">PII COLS</div>
                    <div className="col-span-2">TRIGGERED BY</div>
                    <div className="col-span-2">STARTED</div>
                  </div>
                  {scans.map((scan) => (
                    <div
                      key={scan.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openScanDetail(scan.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') openScanDetail(scan.id);
                      }}
                      className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-[var(--border-default)] cursor-pointer hover:bg-[var(--surface-raised)] transition-colors"
                    >
                      <div className="col-span-3 text-sm text-[var(--text-primary)] truncate">{sourceName(scan.data_source_id)}</div>
                      <div className="col-span-2 text-sm flex items-center gap-1.5">
                        {scan.status === 'completed' ? (
                          <span className="text-[var(--status-success)]">✓ Complete</span>
                        ) : scan.status === 'failed' ? (
                          <>
                            <span className="text-[var(--status-danger)] inline-flex items-center gap-1" title={scan.error ?? ''}>
                              <AlertTriangle className="w-3.5 h-3.5" /> Failed
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRetry(scan.id);
                              }}
                              className="p-1 rounded hover:bg-[var(--surface-card)] text-[var(--text-tertiary)]"
                              aria-label="Retry scan"
                            >
                              {retryingId === scan.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="text-[var(--status-info)]">⏳ Running</span>
                        )}
                      </div>
                      <div className="col-span-1 text-sm text-[var(--text-secondary)]">{scan.tables_scanned}</div>
                      <div className="col-span-2 text-sm font-medium text-[var(--text-primary)]">{scan.fields_flagged}</div>
                      <div className="col-span-2 text-xs text-[var(--text-tertiary)] truncate" title={scan.triggered_by ?? undefined}>
                        {scan.triggered_by ?? '\u2014'}
                      </div>
                      <div className="col-span-2 text-sm text-[var(--text-tertiary)]">{timeAgo(scan.started_at)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Category breakdown */}
          <div className="col-span-2">
            <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
              <h2 className="text-lg font-semibold mb-6 text-[var(--text-primary)]">PII Types Detected</h2>
              {totalCat === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">No PII detected yet.</p>
              ) : (
                <>
                  <div className="relative mb-6 h-[180px]">
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      <circle cx="100" cy="100" r="80" fill="none" stroke="var(--surface-raised)" strokeWidth="30" />
                      {(summary?.by_category ?? []).map((category, index) => {
                        const startAngle = (summary?.by_category ?? [])
                          .slice(0, index)
                          .reduce((sum, c) => sum + (c.count / totalCat) * 360, 0);
                        const angle = (category.count / totalCat) * 360;
                        const start = ((startAngle - 90) * Math.PI) / 180;
                        const end = ((startAngle + angle - 90) * Math.PI) / 180;
                        const largeArc = angle > 180 ? 1 : 0;
                        const x1 = 100 + 80 * Math.cos(start);
                        const y1 = 100 + 80 * Math.sin(start);
                        const x2 = 100 + 80 * Math.cos(end);
                        const y2 = 100 + 80 * Math.sin(end);
                        return (
                          <path
                            key={category.category}
                            d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                            opacity="0.9"
                          />
                        );
                      })}
                      <circle cx="100" cy="100" r="50" fill="var(--surface-card)" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-2xl font-semibold text-[var(--text-primary)]">{totalCat}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">columns</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(summary?.by_category ?? []).map((category, index) => (
                      <div key={category.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                          <span className="text-[var(--text-primary)]">{category.label}</span>
                        </div>
                        <span className="font-semibold text-[var(--text-primary)]">{category.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Findings review */}
        <div className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]">
          <div className="px-6 py-4 border-b border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Findings to Review</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Each finding has updated the matching Data Inventory field. Dismiss false positives to revert.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={findingSourceFilter}
                onChange={(e) => setFindingSourceFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
              >
                <option value="all">All sources</option>
                {findingSources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={findingCategoryFilter}
                onChange={(e) => setFindingCategoryFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
              >
                <option value="all">All categories</option>
                {findingCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk action bar */}
          {filteredFindings.length > 0 && (
            <div className="px-6 py-2.5 border-b border-[var(--border-default)] bg-[var(--surface-raised)] flex flex-wrap items-center gap-3 text-sm">
              <span className="text-[var(--text-secondary)]">
                {selectedFindingIds.size > 0
                  ? `${selectedFindingIds.size} selected`
                  : `${filteredFindings.length} finding(s)`}
              </span>
              <button
                onClick={handleBulkDismissSelected}
                disabled={selectedFindingIds.size === 0 || bulkDismissing}
                className="px-3 py-1 rounded text-xs border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-base)] text-[var(--text-primary)] disabled:opacity-40 inline-flex items-center gap-1"
              >
                {bulkDismissing && <Loader2 className="w-3 h-3 animate-spin" />}
                Dismiss selected
              </button>
              <button
                onClick={handleDismissAllMatching}
                disabled={bulkDismissing}
                className="px-3 py-1 rounded text-xs border border-[var(--border-default)] hover:bg-[var(--surface-card)] text-[var(--text-secondary)] disabled:opacity-40"
              >
                Dismiss all matching filter
              </button>
            </div>
          )}

          {filteredFindings.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">
              {findings.length === 0 ? 'No findings to review.' : 'No findings match the current filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)] text-xs text-[var(--text-tertiary)]">
                    <th className="text-left py-3 px-4 font-medium w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all findings"
                      />
                    </th>
                    {['Source', 'Table', 'Column', 'Category', 'Class', 'Confidence', 'Example', 'Gaps', ''].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedFindings.map((f) => (
                    <tr key={f.id} className="border-b border-[var(--border-default)] text-sm">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedFindingIds.has(f.id)}
                          onChange={() => toggleOne(f.id)}
                          aria-label={`Select ${f.column_name}`}
                        />
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">{f.data_source_name ?? '—'}</td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">{f.table_name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-primary)]">{f.column_name}</td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{f.pii_category}</td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          'px-2 py-0.5 rounded text-xs',
                          f.classification === 'sensitive'
                            ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                            : 'bg-[var(--status-info-bg)] text-[var(--status-info)]',
                        )}>
                          {f.classification}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {f.confidence}% ({f.match_count}/{f.sample_count})
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-tertiary)]">{f.example_masked ?? '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {!f.has_purpose_mapping && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-warning-bg)] text-[var(--status-warning)]" title="No purpose mapping">
                              purpose
                            </span>
                          )}
                          {!f.has_retention_policy && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-warning-bg)] text-[var(--status-warning)]" title="No retention policy">
                              retention
                            </span>
                          )}
                          {f.is_child_data && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-danger-bg)] text-[var(--status-danger)]" title="Children's data">
                              minor
                            </span>
                          )}
                          {f.cross_border_transfer && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--status-danger-bg)] text-[var(--status-danger)]" title="Cross-border transfer">
                              cross-border
                            </span>
                          )}
                          {f.has_purpose_mapping && f.has_retention_policy && !f.is_child_data && !f.cross_border_transfer && (
                            <span className="text-[10px] text-[var(--text-tertiary)]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleDismiss(f)}
                          disabled={dismissingId === f.id}
                          className="px-3 py-1 rounded text-xs border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {dismissingId === f.id && <Loader2 className="w-3 h-3 animate-spin" />}
                          Dismiss
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePager
                page={findingsSafePage}
                pageCount={findingsPageCount}
                total={filteredFindings.length}
                pageSize={FINDINGS_PAGE_SIZE}
                onPage={setFindingsPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* New Scan Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="rounded-lg max-w-lg w-full bg-[var(--surface-card)] border border-[var(--border-default)]">
            <div className="p-6 border-b flex items-center justify-between border-[var(--border-default)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Run PII Scan</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><X className="size-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--text-primary)]">Data Source</label>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
                >
                  <option value="">Select a source…</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id} disabled={!isPiiScannableSource(s)}>
                      {s.name}{!isPiiScannableSource(s) ? ' (unsupported)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[var(--text-primary)]">Sample size (rows per table)</label>
                <input
                  type="number"
                  value={sampleSize}
                  onChange={(e) => setSampleSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
                />
              </div>
              <div className="p-3 rounded-lg border bg-[var(--status-info-bg)] border-[var(--status-info)] text-sm text-[var(--status-info)]">
                The scan samples values, detects PII (regex + Aadhaar/PAN checksums), and updates the matching Data Inventory fields. Nothing is modified in your source database.
              </div>
            </div>
            <div className="p-6 border-t flex gap-2 justify-end border-[var(--border-default)]">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-black/5 text-[var(--text-primary)]">Cancel</button>
              <button onClick={runScan} disabled={scanning} className="px-4 py-2 text-sm rounded-md text-white hover:opacity-90 bg-[var(--brand-primary)] disabled:opacity-50 inline-flex items-center gap-1.5">
                {scanning && <Loader2 className="w-4 h-4 animate-spin" />}
                {scanning ? 'Scanning…' : 'Start Scan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlaybook && <PiiScanPlaybook onClose={() => setShowPlaybook(false)} orgId={orgId} />}

      {showSchedules && (
        <ScheduleManager sources={sources} orgId={orgId} onClose={() => setShowSchedules(false)} />
      )}

      {selectedJobId && (
        <ScanDetailDrawer
          job={selectedJobDetail}
          loading={loadingDetail}
          sourceName={selectedJobDetail ? sourceName(selectedJobDetail.data_source_id) : ''}
          onClose={() => {
            setSelectedJobId(null);
            setSelectedJobDetail(null);
          }}
          onRetry={() => selectedJobId && handleRetry(selectedJobId)}
          retrying={retryingId === selectedJobId}
        />
      )}
    </div>
  );
}
