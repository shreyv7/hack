import type { ReactElement } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Search,
  Shield,
  Wand2,
} from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { Button } from '@/app/components/ui/Button';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { DataMaskingPlaybook } from '@/app/components/masking/DataMaskingPlaybook';
import { MaskingApplyModal } from '@/app/components/masking/MaskingApplyModal';
import { MaskingColumnDrawer } from '@/app/components/masking/MaskingColumnDrawer';
import { cn } from '@/lib/utils';
import {
  applyMaskingToColumn,
  fetchMaskingRules,
  fetchMaskingRuns,
  fetchMaskingSummary,
  fetchPiiColumns,
  previewField,
  previewMask,
  upsertMaskingRule,
} from '@/lib/api/masking';
import { fetchDataSources } from '@/lib/api/dataSources';
import { fetchAssets } from '@/lib/api/dataInventory';
import type {
  FieldPreviewResult,
  MaskingRule,
  MaskingRun,
  MaskingStrategy,
  MaskingSummary,
  PiiColumnTarget,
} from '@/types/masking';
import { STRATEGY_META } from '@/types/masking';
import type { DataSource } from '@/types/dataSource';
import { isScannableSource } from '@/types/dataSource';
import type { InventoryAsset } from '@/types/dataInventory';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';
import { hasRole } from '@/lib/auth/permissions';

const STRATEGIES = Object.entries(STRATEGY_META).map(([value, meta]) => ({
  value: value as MaskingStrategy,
  ...meta,
}));

function Metric({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: number | string;
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

export function DataMasking(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const isAdmin = hasRole(user, 'admin', 'superadmin');

  const [rules, setRules] = useState<MaskingRule[]>([]);
  const [piiColumns, setPiiColumns] = useState<PiiColumnTarget[]>([]);
  const [summary, setSummary] = useState<MaskingSummary | null>(null);
  const [runs, setRuns] = useState<MaskingRun[]>([]);
  const [runsPage, setRunsPage] = useState(0);
  const [runsHasMore, setRunsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showLab, setShowLab] = useState(false);

  const loadRuns = useCallback(
    async (page: number) => {
      const offset = page * TABLE_PAGE_SIZE;
      const batch = await fetchMaskingRuns(orgId, TABLE_PAGE_SIZE, offset);
      setRunsHasMore(batch.length === TABLE_PAGE_SIZE);
      setRuns(batch);
      setRunsPage(page);
    },
    [orgId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, cols, s] = await Promise.all([
        fetchMaskingRules(orgId),
        fetchPiiColumns(orgId),
        fetchMaskingSummary(orgId),
      ]);
      setRules(r);
      setPiiColumns(cols);
      setSummary(s);
      await loadRuns(0);
    } catch (error) {
      notify(`Failed to load masking config: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [orgId, loadRuns]);

  useEffect(() => {
    void load();
  }, [load]);

  const runsTotal = runsHasMore
    ? (runsPage + 1) * TABLE_PAGE_SIZE + 1
    : runsPage * TABLE_PAGE_SIZE + runs.length;
  const runsPageCount = runsHasMore ? Math.max(runsPage + 2, 2) : Math.max(runsPage + 1, 1);

  const saveRule = async (rule: MaskingRule, patch: Partial<MaskingRule>) => {
    try {
      const updated = await upsertMaskingRule(
        {
          pii_category: rule.pii_category,
          strategy: patch.strategy ?? rule.strategy,
          params: patch.params ?? rule.params,
          enabled: patch.enabled ?? rule.enabled,
        },
        orgId,
      );
      setRules((prev) => prev.map((r) => (r.pii_category === rule.pii_category ? updated : r)));
      await load();
      notify(`Saved rule for ${rule.pii_category}`);
    } catch (error) {
      notify(`Failed to save rule: ${(error as Error).message}`);
    }
  };

  return (
    <div className="min-h-full">
      <div className="px-8 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2 text-[var(--text-primary)]">Data Masking</h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
              Implements Sec 8(5) security safeguards on connected databases. Define masking strategies per PII
              category, preview on real samples, and apply in place — with audit trail and purpose context.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setShowPlaybook(true)}>
              <BookOpen className="w-4 h-4 mr-2" />
              Playbook
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--text-secondary)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-6">
              <Metric
                label="PII fields"
                value={summary?.total_pii_fields ?? 0}
                icon={<Shield className="w-5 h-5 text-[var(--brand-primary)]" />}
              />
              <Metric
                label="Rule coverage"
                value={summary ? `${summary.coverage_pct}%` : '0%'}
                valueClass={
                  summary && summary.coverage_pct < 100 ? 'text-[var(--status-danger)]' : 'text-[var(--status-success)]'
                }
                icon={<Lock className="w-5 h-5 text-[var(--brand-primary)]" />}
              />
              <Metric label="Maskable sources" value={summary?.sources_maskable ?? 0} />
              <Metric label="Applied (30d)" value={summary?.columns_applied_last_30d ?? 0} />
            </div>

            <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Compliance signals</h2>
                <button type="button" onClick={() => setShowPlaybook(true)} className="text-xs text-[var(--brand-primary)] hover:underline">
                  What do these mean?
                </button>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <SignalStat
                  label="Uncovered categories"
                  value={summary?.uncovered_categories.length ?? 0}
                  hint="No active rule"
                  warn={(summary?.uncovered_categories.length ?? 0) > 0}
                />
                <SignalStat
                  label="Prod · discovery only"
                  value={summary?.prod_sources_discovery_only ?? 0}
                  hint="Needs read-write for apply"
                  warn={(summary?.prod_sources_discovery_only ?? 0) > 0}
                />
                <SignalStat
                  label="Safeguard unapplied"
                  value={summary?.fields_safeguard_masking_unapplied ?? 0}
                  hint="Tagged masking, never applied"
                  warn={(summary?.fields_safeguard_masking_unapplied ?? 0) > 0}
                />
                <SignalStat label="Read-write sources" value={summary?.sources_read_write ?? 0} hint="Can apply in place" />
                <SignalStat
                  label="No purpose link"
                  value={piiColumns.filter((c) => c.purpose_count === 0).length}
                  hint="Sec 4/5 purpose limitation"
                  warn={piiColumns.filter((c) => c.purpose_count === 0).length > 0}
                />
              </div>
            </div>

            <MaskingRulesSection rules={rules} isAdmin={isAdmin} onSave={saveRule} />

            <DetectedPiiColumns
              columns={piiColumns}
              orgId={orgId}
              isAdmin={isAdmin}
              onApplied={load}
            />

            {runs.length > 0 && (
              <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
                <div className="px-6 py-4 border-b border-[var(--border-default)]">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recent apply history</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)] text-xs text-[var(--text-tertiary)]">
                        {['When', 'Source', 'Column', 'Strategy', 'Rows', 'Trigger'].map((h) => (
                          <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className="border-b border-[var(--border-default)]">
                          <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                            {new Date(run.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">{run.data_source_name ?? '—'}</td>
                          <td className="py-3 px-4 font-mono text-xs">{run.table_name}.{run.column_name}</td>
                          <td className="py-3 px-4">{run.strategy}</td>
                          <td className="py-3 px-4">{run.rows_updated}</td>
                          <td className="py-3 px-4 text-xs capitalize">{run.trigger}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  page={runsPage}
                  pageCount={runsPageCount}
                  total={runsTotal}
                  pageSize={TABLE_PAGE_SIZE}
                  onPage={(p) => void loadRuns(p)}
                />
              </div>
            )}

            <RuleTuningLab collapsed={!showLab} onToggle={() => setShowLab((v) => !v)} orgId={orgId} />
          </>
        )}
      </div>

      {showPlaybook && <DataMaskingPlaybook onClose={() => setShowPlaybook(false)} orgId={orgId} />}
    </div>
  );
}

function MaskingRulesSection({
  rules,
  isAdmin,
  onSave,
}: {
  rules: MaskingRule[];
  isAdmin: boolean;
  onSave: (rule: MaskingRule, patch: Partial<MaskingRule>) => void;
}): ReactElement {
  return (
    <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
      <div className="px-6 py-4 border-b border-[var(--border-default)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Masking rules by category</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Built-in defaults apply until saved. Hash/redact are irreversible — encrypt is reversible. For analytics
          exports use{' '}
          <Link to="/data/anonymisation" className="text-[var(--brand-primary)] hover:underline">
            Data Anonymisation
          </Link>
          .
        </p>
      </div>
      <div className="divide-y divide-[var(--border-default)]">
        {rules.map((rule) => (
          <div key={rule.pii_category} className="px-6 py-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-[var(--text-primary)]">{rule.pii_category}</span>
                {rule.is_default && (
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">default</span>
                )}
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] ml-2">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    disabled={!isAdmin}
                    onChange={(e) => onSave(rule, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <select
                value={rule.strategy}
                disabled={!isAdmin}
                onChange={(e) => onSave(rule, { strategy: e.target.value as MaskingStrategy })}
                className="px-3 py-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-sm"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)]">{STRATEGY_META[rule.strategy].dpdpaHint}</p>
            {rule.strategy === 'mask' && isAdmin && (
              <div className="flex items-center gap-2 text-xs">
                <label className="text-[var(--text-secondary)]">Keep last</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  defaultValue={Number(rule.params.keep_last ?? 2)}
                  onBlur={(e) =>
                    onSave(rule, { params: { ...rule.params, keep_last: Number(e.target.value) } })
                  }
                  className="w-16 px-2 py-1 rounded border border-[var(--border-default)] bg-[var(--surface-base)]"
                />
                <span className="text-[var(--text-tertiary)]">characters visible</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleTuningLab({
  collapsed,
  onToggle,
  orgId,
}: {
  collapsed: boolean;
  onToggle: () => void;
  orgId?: string;
}): ReactElement {
  const [testValue, setTestValue] = useState('rajesh@acme.com');
  const [testStrategy, setTestStrategy] = useState<MaskingStrategy>('mask');
  const [testOut, setTestOut] = useState<string | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [table, setTable] = useState('');
  const [column, setColumn] = useState('');
  const [fieldResult, setFieldResult] = useState<FieldPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    fetchDataSources(orgId).then(setSources).catch(() => setSources([]));
    fetchAssets(orgId).then(setAssets).catch(() => setAssets([]));
  }, [orgId]);

  const tablesForSource = useMemo(
    () => assets.filter((a) => a.data_source_id === sourceId).map((a) => a.name),
    [assets, sourceId],
  );

  const runTest = async () => {
    if (!testValue.trim()) return;
    try {
      const res = await previewMask(testValue, testStrategy);
      setTestOut(res.masked);
    } catch (error) {
      notify(`Preview failed: ${(error as Error).message}`);
    }
  };

  const runFieldPreview = async () => {
    if (!sourceId || !table || !column) {
      notify('Pick a source, table and column.');
      return;
    }
    setPreviewing(true);
    setFieldResult(null);
    try {
      setFieldResult(await previewField(sourceId, table, column, null, orgId));
    } catch (error) {
      notify(`Preview failed: ${(error as Error).message}`);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-[var(--brand-primary)]" />
          <span className="text-lg font-semibold text-[var(--text-primary)]">Rule tuning lab</span>
          <span className="text-xs text-[var(--text-tertiary)]">— sandbox values without touching data</span>
        </div>
        {collapsed ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
      </button>
      {!collapsed && (
        <div className="px-6 pb-6 grid grid-cols-2 gap-6 border-t border-[var(--border-default)] pt-6">
          <div>
            <h3 className="text-sm font-medium mb-3">Try a value</h3>
            <input
              value={testValue}
              onChange={(e) => setTestValue(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] mb-3 text-sm"
            />
            <select
              value={testStrategy}
              onChange={(e) => setTestStrategy(e.target.value as MaskingStrategy)}
              className="w-full px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] mb-3 text-sm"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label} — {s.note}</option>
              ))}
            </select>
            <button onClick={runTest} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white">
              Mask it
            </button>
            {testOut !== null && (
              <div className="mt-4 p-3 rounded-lg bg-[var(--surface-raised)] font-mono text-sm break-all">{testOut}</div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium mb-1">Preview on a column</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              SQL/Mongo sources — PostgreSQL, MySQL, MariaDB, Oracle, SQL Server, MongoDB and cloud variants.
            </p>
            <div className="space-y-3">
              <select
                value={sourceId}
                onChange={(e) => { setSourceId(e.target.value); setTable(''); }}
                className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-base)]"
              >
                <option value="">Select source…</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id} disabled={!isScannableSource(s.source_type)}>
                    {s.name}{!isScannableSource(s.source_type) ? ' (unsupported)' : ''}
                  </option>
                ))}
              </select>
              <select value={table} onChange={(e) => setTable(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-base)]">
                <option value="">Select table…</option>
                {tablesForSource.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                value={column}
                onChange={(e) => setColumn(e.target.value)}
                placeholder="column name"
                className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-base)]"
              />
              <button
                onClick={runFieldPreview}
                disabled={previewing}
                className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {previewing && <Loader2 className="w-4 h-4 animate-spin" />}
                Preview masking
              </button>
            </div>
            {fieldResult && (
              <div className="mt-4 space-y-1 max-h-40 overflow-y-auto font-mono text-xs">
                {fieldResult.samples.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[var(--text-tertiary)] truncate flex-1">{s.before}</span>
                    <span>→</span>
                    <span className="text-[var(--status-success)] truncate flex-1">{s.after}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetectedPiiColumns({
  columns,
  orgId,
  isAdmin,
  onApplied,
}: {
  columns: PiiColumnTarget[];
  orgId?: string;
  isAdmin: boolean;
  onApplied: () => void;
}): ReactElement {
  const [strat, setStrat] = useState<Record<string, MaskingStrategy>>({});
  const [preview, setPreview] = useState<Record<string, FieldPreviewResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [maskableFilter, setMaskableFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [drawerCol, setDrawerCol] = useState<PiiColumnTarget | null>(null);
  const [applyTarget, setApplyTarget] = useState<PiiColumnTarget | null>(null);

  const keyOf = (c: PiiColumnTarget) => `${c.asset_id}:${c.column}`;
  const stratFor = (c: PiiColumnTarget) => strat[keyOf(c)] ?? c.strategy ?? 'mask';

  const sources = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of columns) if (c.data_source_id) m.set(c.data_source_id, c.data_source_name ?? c.data_source_id);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [columns]);

  const categories = useMemo(
    () => Array.from(new Set(columns.map((c) => c.pii_category).filter(Boolean) as string[])).sort(),
    [columns],
  );

  const filtered = useMemo(
    () =>
      columns.filter((c) => {
        if (sourceFilter !== 'all' && c.data_source_id !== sourceFilter) return false;
        if (categoryFilter !== 'all' && c.pii_category !== categoryFilter) return false;
        if (maskableFilter === 'yes' && !c.can_apply) return false;
        if (maskableFilter === 'no' && c.can_apply) return false;
        return true;
      }),
    [columns, sourceFilter, categoryFilter, maskableFilter],
  );

  const maskableFiltered = filtered.filter((c) => c.can_apply && isAdmin);
  const columnsPager = useClientPagination(filtered);

  useEffect(() => {
    columnsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter, categoryFilter, maskableFilter, filtered.length]);

  const doPreview = async (c: PiiColumnTarget) => {
    if (!c.data_source_id) return;
    const k = keyOf(c);
    setBusy(k);
    try {
      const res = await previewField(c.data_source_id, c.table, c.column, stratFor(c), orgId);
      setPreview((p) => ({ ...p, [k]: res }));
    } catch (error) {
      notify(`Preview failed: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const executeApply = async (c: PiiColumnTarget) => {
    if (!c.data_source_id) return;
    const k = keyOf(c);
    setBusy(k);
    try {
      const res = await applyMaskingToColumn(
        c.data_source_id,
        c.table,
        c.column,
        stratFor(c),
        orgId,
        { assetId: c.asset_id, fieldId: c.field_id },
      );
      notify(`Masked ${res.rows_updated} value(s) in ${res.table}.${res.column}.`);
      setApplyTarget(null);
      await doPreview(c);
      onApplied();
    } catch (error) {
      notify(`Apply failed: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const bulkApply = async () => {
    const targets = maskableFiltered.filter((c) => selected.has(keyOf(c)));
    if (targets.length === 0) return;
    if (!window.confirm(`Apply masking to ${targets.length} column(s)? This cannot be undone.`)) return;
    setBusy('bulk');
    for (const c of targets) {
      try {
        await applyMaskingToColumn(c.data_source_id!, c.table, c.column, stratFor(c), orgId, {
          assetId: c.asset_id,
          fieldId: c.field_id,
        });
      } catch {
        /* continue */
      }
    }
    notify(`Bulk apply finished for ${targets.length} column(s).`);
    setSelected(new Set());
    setBusy(null);
    onApplied();
  };

  return (
    <>
      <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Detected PII columns</h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-3xl mt-1">
              From PII Scanner classifications. Apply rewrites values in place on SQL/Mongo sources (read-write mode
              required). File/API sources →{' '}
              <Link to="/data/anonymisation" className="text-[var(--brand-primary)] hover:underline">
                Data Anonymisation
              </Link>
              .
            </p>
          </div>
          {columns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-3 py-1.5 text-sm rounded-md border bg-[var(--surface-base)]">
                <option value="all">All sources</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-1.5 text-sm rounded-md border bg-[var(--surface-base)]">
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={maskableFilter} onChange={(e) => setMaskableFilter(e.target.value as 'all' | 'yes' | 'no')} className="px-3 py-1.5 text-sm rounded-md border bg-[var(--surface-base)]">
                <option value="all">All</option>
                <option value="yes">Maskable</option>
                <option value="no">Not maskable</option>
              </select>
            </div>
          )}
        </div>

        {isAdmin && columns.length > 0 && (
          <div className="px-6 py-2.5 border-b bg-[var(--surface-raised)] flex items-center gap-3 text-sm">
            <span className="text-[var(--text-secondary)]">{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} columns`}</span>
            <button
              onClick={bulkApply}
              disabled={selected.size === 0 || busy !== null}
              className="px-3 py-1 rounded text-xs border border-[var(--status-danger)] text-[var(--status-danger)] disabled:opacity-40"
            >
              Apply to selected
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">
            {columns.length === 0 ? (
              <>
                No PII columns yet —{' '}
                <Link to="/scanner/pii" className="text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1">
                  <Search className="size-3.5" /> Run a PII scan
                </Link>
              </>
            ) : (
              'No columns match filters.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-[var(--surface-raised)] text-xs text-[var(--text-tertiary)]">
                  {isAdmin && <th className="w-10 py-3 px-2" />}
                  {['Source', 'Column', 'Category', 'Env', 'Mode', 'Purposes', 'Safeguard', 'Last applied', 'Strategy', ''].map((h) => (
                    <th key={h} className="text-left py-3 px-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {columnsPager.slice.map((c) => {
                  const k = keyOf(c);
                  const p = preview[k];
                  return (
                    <Fragment key={k}>
                      <tr className="border-b text-sm hover:bg-[var(--surface-raised)]/50 cursor-pointer" onClick={() => setDrawerCol(c)}>
                        {isAdmin && (
                          <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(k)}
                              onChange={() => {
                                setSelected((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(k)) n.delete(k);
                                  else n.add(k);
                                  return n;
                                });
                              }}
                              disabled={!c.can_apply}
                            />
                          </td>
                        )}
                        <td className="py-3 px-3 text-xs">{c.data_source_name ?? '—'}</td>
                        <td className="py-3 px-3 font-mono text-xs">{c.table}.{c.column}</td>
                        <td className="py-3 px-3 text-xs">{c.pii_category ?? '—'}</td>
                        <td className="py-3 px-3 text-xs capitalize">{c.environment ?? '—'}</td>
                        <td className="py-3 px-3 text-xs">{c.integration_mode ?? '—'}</td>
                        <td className="py-3 px-3 text-xs">{c.purpose_count || '—'}</td>
                        <td className="py-3 px-3 text-xs">{c.security_safeguard ?? '—'}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">
                          {c.last_applied_at ? new Date(c.last_applied_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={stratFor(c)}
                            onChange={(e) => setStrat((s) => ({ ...s, [k]: e.target.value as MaskingStrategy }))}
                            disabled={!c.can_apply || !isAdmin}
                            className="px-2 py-1 rounded border text-xs bg-[var(--surface-base)] disabled:opacity-40"
                          >
                            {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </td>
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          {c.can_apply && isAdmin ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => doPreview(c)} disabled={busy !== null} className="px-2 py-1 text-xs rounded border hover:bg-[var(--surface-raised)]">
                                Preview
                              </button>
                              <button onClick={() => setApplyTarget(c)} disabled={busy !== null} className="px-2 py-1 text-xs rounded border border-[var(--status-danger)] text-[var(--status-danger)]">
                                Apply
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-tertiary)]">{c.can_apply ? 'View only' : 'Anonymise'}</span>
                          )}
                        </td>
                      </tr>
                      {p && (
                        <tr className="border-b bg-[var(--surface-raised)]">
                          <td colSpan={isAdmin ? 11 : 10} className="py-2 px-4">
                            <div className="text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
                              {p.samples.map((s, i) => (
                                <div key={i} className="flex gap-2">
                                  <span className="text-[var(--text-tertiary)] truncate flex-1">{s.before}</span>
                                  <span>→</span>
                                  <span className="text-[var(--status-success)] truncate flex-1">{s.after}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <TablePager
              page={columnsPager.page}
              pageCount={columnsPager.pageCount}
              total={columnsPager.total}
              pageSize={columnsPager.pageSize}
              onPage={columnsPager.setPage}
            />
          </div>
        )}
      </div>

      {drawerCol && (
        <MaskingColumnDrawer
          column={drawerCol}
          strategy={stratFor(drawerCol)}
          orgId={orgId}
          onClose={() => setDrawerCol(null)}
          onApply={() => {
            setDrawerCol(null);
            setApplyTarget(drawerCol);
          }}
          canApply={drawerCol.can_apply && isAdmin}
        />
      )}

      {applyTarget && (
        <MaskingApplyModal
          column={applyTarget}
          strategy={stratFor(applyTarget)}
          applying={busy === keyOf(applyTarget)}
          onClose={() => setApplyTarget(null)}
          onConfirm={() => executeApply(applyTarget)}
        />
      )}
    </>
  );
}
