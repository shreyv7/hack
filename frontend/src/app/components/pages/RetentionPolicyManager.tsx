import { notify } from '@/app/utils/notify';
import { TablePager } from '@/app/components/common/TablePager';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { AlertTriangle, Calendar, Check, Clock, Copy, Download, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelObligation,
  confirmRun,
  createObligation,
  createPolicy,
  deletePolicy,
  executeRun,
  fetchObligationApiInfo,
  fetchObligations,
  fetchObligationSummary,
  fetchPolicies,
  fetchPolicyImpact,
  fetchRetentionIndustryPresets,
  fetchRetentionSummary,
  fetchRuns,
  fulfillObligation,
  runDuePolicies,
  runPolicy,
  updatePolicy,
} from '@/lib/api/retention';
import { fetchDataSources } from '@/lib/api/dataSources';
import { fetchAssets } from '@/lib/api/dataInventory';
import type {
  EvidentiaryProfile,
  ObligationApiInfo,
  ObligationCreate,
  ObligationStatus,
  ObligationSummary,
  PolicyCreate,
  PolicyImpact,
  RetentionAction,
  RetentionIndustryPresets,
  RetentionObligation,
  RetentionPolicy,
  RetentionPeriodUnit,
  RetentionPolicyPreset,
  RetentionRun,
  RetentionSummary,
  PolicyStatus,
  TriggerEvent,
} from '@/types/retention';
import type { DataSource } from '@/types/dataSource';
import type { InventoryAsset } from '@/types/dataInventory';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  creation_date: 'From creation date',
  last_interaction: 'From last interaction',
  consent_withdrawal: 'From consent withdrawal',
  contract_end: 'From contract end',
  custom: 'Custom trigger',
};

const ACTION_LABELS: Record<RetentionAction, string> = {
  delete: 'Permanent deletion',
  anonymize: 'Anonymization',
  mask: 'Masking (partial redaction)',
  pseudonymize: 'Pseudonymization (hash)',
  archive: 'Archive to cold storage',
  manual_review: 'Manual review',
};

const EXECUTABLE_ACTIONS: RetentionAction[] = [
  'delete',
  'anonymize',
  'mask',
  'pseudonymize',
  'archive',
];

function executeVerb(action: RetentionAction): string {
  if (action === 'delete') return 'permanently DELETE';
  if (action === 'anonymize') return 'anonymise (mask the personal fields of)';
  if (action === 'mask') return 'mask PII fields on';
  if (action === 'pseudonymize') return 'pseudonymize (hash) PII fields on';
  if (action === 'archive') return 'record an archival manifest for';
  return 'process';
}

function executeLabel(action: RetentionAction): string {
  if (action === 'delete') return 'Execute delete';
  if (action === 'anonymize') return 'Execute anonymise';
  if (action === 'mask') return 'Execute mask';
  if (action === 'pseudonymize') return 'Execute pseudonymize';
  if (action === 'archive') return 'Execute archive';
  return 'Execute';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface PolicyForm {
  name: string;
  data_category: string;
  data_source_id: string;
  asset_id: string;
  trigger_field: string;
  period_value: string;
  period_unit: RetentionPeriodUnit;
  trigger_event: TriggerEvent;
  legal_basis: string;
  action: RetentionAction;
  auto_delete: boolean;
  notify_before_days: string;
  status: PolicyStatus;
  keep_fields: string;
}

const EMPTY_FORM: PolicyForm = {
  name: '',
  data_category: '',
  data_source_id: '',
  asset_id: '',
  trigger_field: '',
  period_value: '7',
  period_unit: 'years',
  trigger_event: 'creation_date',
  legal_basis: 'DPDPA Section 8(7)',
  action: 'delete',
  auto_delete: false,
  notify_before_days: '7',
  status: 'active',
  keep_fields: 'consent_reference, proof_hash, transaction_id, customer_ref_token, created_at',
};

/**
 * Retention Policy Manager (DPDPA Section 8(7)). Policies + safe "flag & confirm"
 * deletion runs are wired to /retention; the feature cards and builder steps are
 * static reference content.
 */
export function RetentionPolicyManager(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [runs, setRuns] = useState<RetentionRun[]>([]);
  const [summary, setSummary] = useState<RetentionSummary | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<RetentionPolicy | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actingRunId, setActingRunId] = useState<string | null>(null);
  const [runningDue, setRunningDue] = useState(false);
  const [impact, setImpact] = useState<PolicyImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [industryPresets, setIndustryPresets] = useState<RetentionIndustryPresets | null>(null);
  const [presetsLoading, setPresetsLoading] = useState(false);

  // Drop any stale impact when the open policy changes.
  useEffect(() => {
    setImpact(null);
  }, [selected?.id]);

  const checkImpact = async (p: RetentionPolicy) => {
    setImpactLoading(true);
    setImpact(null);
    try {
      setImpact(await fetchPolicyImpact(p.id, orgId));
    } catch (error) {
      notify(`Impact check failed: ${(error as Error).message}`);
    } finally {
      setImpactLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [p, r, s] = await Promise.all([
        fetchPolicies(orgId),
        fetchRuns(orgId),
        fetchRetentionSummary(orgId),
      ]);
      setPolicies(p);
      setRuns(r);
      setSummary(s);
    } catch (error) {
      notify(`Failed to load retention data: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPresets = async () => {
    setPresetsLoading(true);
    try {
      setIndustryPresets(await fetchRetentionIndustryPresets(orgId));
    } catch (error) {
      notify(`Could not load banking presets: ${(error as Error).message}`);
    } finally {
      setPresetsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadPresets();
    fetchDataSources(orgId).then(setSources).catch(() => setSources([]));
    fetchAssets(orgId).then(setAssets).catch(() => setAssets([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assetsForSource = useMemo(
    () => (form.data_source_id ? assets.filter((a) => a.data_source_id === form.data_source_id) : assets),
    [assets, form.data_source_id],
  );

  const policyName = (id: string): string => policies.find((p) => p.id === id)?.name ?? '—';

  const policiesPager = useClientPagination(policies);
  const runsPager = useClientPagination(runs);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (p: RetentionPolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      data_category: p.data_category ?? '',
      data_source_id: p.data_source_id ?? '',
      asset_id: p.asset_id ?? '',
      trigger_field: p.trigger_field ?? '',
      period_value: String(p.period_value),
      period_unit: p.period_unit,
      trigger_event: p.trigger_event,
      legal_basis: p.legal_basis ?? '',
      action: p.action,
      auto_delete: p.auto_delete,
      notify_before_days: String(p.notify_before_days),
      status: p.status,
      keep_fields: (p.evidentiary_profile?.keep_fields ?? []).join(', '),
    });
    setSelected(null);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      notify('Please enter a policy name.');
      return;
    }
    setSaving(true);
    try {
      const keepFields = form.keep_fields
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const evidentiary_profile: EvidentiaryProfile | null =
        keepFields.length > 0
          ? {
              dpdpa_minimum_record: true,
              keep_fields: keepFields,
              legal_basis_note: 'DPDPA Sec 8(7) — preserve minimum evidentiary fields',
            }
          : null;
      const payload: PolicyCreate = {
        name: form.name,
        data_category: form.data_category || null,
        data_source_id: form.data_source_id || null,
        asset_id: form.asset_id || null,
        trigger_field: form.trigger_field || null,
        period_value: Number(form.period_value) || 1,
        period_unit: form.period_unit,
        trigger_event: form.trigger_event,
        legal_basis: form.legal_basis || null,
        action: form.action,
        auto_delete: form.auto_delete,
        notify_before_days: Number(form.notify_before_days) || 0,
        status: form.status,
        evidentiary_profile,
      };
      if (editingId) {
        await updatePolicy(editingId, payload, orgId);
        notify('Policy updated.');
      } else {
        await createPolicy(payload, orgId);
        notify('Retention policy created.');
      }
      setShowModal(false);
      await load();
    } catch (error) {
      notify(`Failed to save policy: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (p: RetentionPolicy) => {
    setRunningId(p.id);
    try {
      const run = await runPolicy(p.id, orgId);
      notify(run.detail ?? 'Dry-run complete.');
      await load();
    } catch (error) {
      notify(`Run failed: ${(error as Error).message}`);
    } finally {
      setRunningId(null);
    }
  };

  const handleConfirm = async (run: RetentionRun) => {
    if (!window.confirm('Confirm this deletion run? (Audit only — no live data is deleted in this MVP.)')) return;
    setConfirmingId(run.id);
    try {
      await confirmRun(run.id, orgId);
      notify('Run confirmed and recorded in the audit trail.');
      await load();
    } catch (error) {
      notify(`Confirm failed: ${(error as Error).message}`);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleExecute = async (run: RetentionRun) => {
    const verb = executeVerb(run.action);
    if (
      !window.confirm(
        `${verb} ${run.records_matched} row(s) in the source database? This cannot be undone.`,
      )
    )
      return;
    setActingRunId(run.id);
    try {
      const updated = await executeRun(run.id, orgId);
      const note =
        run.action === 'archive'
          ? updated.detail ?? 'Archive manifest recorded.'
          : `Executed: ${updated.records_deleted} row(s) processed.`;
      notify(note);
      await load();
    } catch (error) {
      notify(`Execute failed: ${(error as Error).message}`);
    } finally {
      setActingRunId(null);
    }
  };

  const applyPreset = (preset: RetentionPolicyPreset) => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      name: preset.name,
      data_category: preset.data_category ?? '',
      period_value: String(preset.period_value),
      period_unit: preset.period_unit,
      trigger_event: preset.trigger_event,
      legal_basis: preset.legal_basis ?? EMPTY_FORM.legal_basis,
      action: preset.action,
      keep_fields: (preset.evidentiary_profile?.keep_fields ?? []).join(', ') || EMPTY_FORM.keep_fields,
    });
    setShowModal(true);
  };

  const handleRunDue = async () => {
    setRunningDue(true);
    try {
      const result = await runDuePolicies(orgId);
      notify(
        `Engine: ${result.policies_evaluated} policy(ies) evaluated · ${result.runs_executed} executed ` +
          `(${result.rows_deleted} rows) · ${result.flagged} flagged.`,
      );
      await load();
    } catch (error) {
      notify(`Run failed: ${(error as Error).message}`);
    } finally {
      setRunningDue(false);
    }
  };

  const handleDelete = async (p: RetentionPolicy) => {
    if (!window.confirm(`Delete policy "${p.name}"?`)) return;
    try {
      await deletePolicy(p.id, orgId);
      notify(`Deleted "${p.name}".`);
      setSelected(null);
      await load();
    } catch (error) {
      notify(`Failed to delete: ${(error as Error).message}`);
    }
  };

  return (
    <div className="p-8 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="mb-2 text-3xl font-semibold">Retention Policy Manager</h1>
            <div className="flex items-center gap-3">
              <DPDPAChip
                sections={{
                  chapter: 2,
                  section: 8,
                  subsection: 7,
                  name: 'Erasure after purpose served',
                  url: '/dpdpa2023/chapter-2/section8.html',
                  excerpt: 'Erase personal data when purpose is fulfilled...',
                }}
                size="detailed"
              />
              <PenaltyChip amount={250} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunDue}
              disabled={runningDue}
              title="Evaluate all due policies now (auto_delete ones execute)"
              className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {runningDue && <Loader2 className="size-4 animate-spin" />}
              Run due policies
            </button>
            <button
              onClick={openCreate}
              className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              New Policy
            </button>
          </div>
        </div>
        <SectionReference section="DPDPA Section 8(7) — Data Minimization & Retention Limitation" />
      </div>

      {/* Stats (wired) */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Active policies" value={summary?.active_policies ?? 0} />
        <StatCard label="Pending confirmations" value={summary?.pending_confirmations ?? 0} tone="warning" />
        <StatCard label="Records flagged" value={summary?.records_flagged ?? 0} tone="warning" />
        <StatCard label="Records deleted (confirmed)" value={summary?.records_deleted_total ?? 0} tone="success" />
      </div>

      {/* Safety note */}
      <div className="mb-6 p-3 rounded-lg border border-yellow-500/30 bg-[var(--status-warning-bg)] text-sm text-[var(--text-primary)]">
        <strong>How it works:</strong> running a policy performs a <strong>dry-run</strong> that counts what would
        expire (nothing changed). For executable actions (<em>delete, anonymize, mask, pseudonymize, archive</em>)
        click <strong>Execute</strong> to apply on the source — write actions require a <strong>read-write</strong>{' '}
        data source. Evidentiary fields listed below are preserved under DPDPA Sec 8(7). Policies marked{' '}
        <strong>auto-delete</strong> run automatically via “Run due policies”.
      </div>

      {(industryPresets?.policy_presets.length ?? 0) > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Banking retention presets (RBI / DPDPA)</h3>
            {presetsLoading && <Loader2 className="size-4 animate-spin text-[var(--text-tertiary)]" />}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Templates for Fino Bank — apply manually and wire to inventoried sources. Default evidentiary profile
            preserves minimum compliance fields while reducing operational PII.
          </p>
          <div className="flex flex-wrap gap-2">
            {industryPresets?.policy_presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]"
              >
                {preset.name} · {ACTION_LABELS[preset.action]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Policies Table */}
      <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg border border-[var(--border-default)] mb-6">
        <div className="p-4 border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
          <h3 className="font-medium">Retention Policies</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : policies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="w-8 h-8 text-[var(--text-tertiary)] mb-3" />
            <h3 className="text-base font-semibold mb-1">No retention policies yet</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md">
              Create a policy to define how long each data category is kept before deletion.
            </p>
            <button onClick={openCreate} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer">
              <Plus className="size-4" /> New Policy
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                  {['Policy Name', 'Category', 'Retention', 'Trigger', 'Action', 'Enforcement', 'Auto', 'Status', 'Last Run'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-sm font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policiesPager.pageItems.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer"
                  >
                    <td className="py-3 px-4 font-medium">{p.name}</td>
                    <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{p.data_category ?? '—'}</td>
                    <td className="py-3 px-4 text-sm font-medium">{p.period_value} {p.period_unit}</td>
                    <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{TRIGGER_LABELS[p.trigger_event]}</td>
                    <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{ACTION_LABELS[p.action]}</td>
                    <td className="py-3 px-4">
                      <EnforcementBadge policy={p} />
                    </td>
                    <td className="py-3 px-4">
                      {p.auto_delete ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">✓ ON</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs">Manual</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs capitalize text-[var(--text-secondary)]">{p.status}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{formatDate(p.last_run_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePager
              page={policiesPager.page}
              pageCount={policiesPager.pageCount}
              total={policiesPager.total}
              pageSize={policiesPager.pageSize}
              onPage={policiesPager.setPage}
            />
          </div>
        )}
      </div>

      {/* Deletion Audit Trail (wired runs) */}
      <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg border-2 border-purple-200 dark:border-purple-900/40 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-lg bg-purple-600 text-white flex items-center justify-center">
            <Download className="size-6" />
          </div>
          <div>
            <h3 className="font-medium">Deletion Audit Trail</h3>
            <div className="text-xs text-purple-600 dark:text-purple-400">Every retention run, with confirmation status</div>
          </div>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] py-4">No runs yet. Open a policy and click “Run dry-run”.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  {['Run Date', 'Policy', 'Matched', 'Deleted', 'Status', 'Certificate', 'By', ''].map((h) => (
                    <th key={h} className="text-left py-2 px-4 text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runsPager.pageItems.map((run) => (
                  <tr key={run.id} className="border-b border-[var(--border-default)] text-sm">
                    <td className="py-2 px-4 text-[var(--text-secondary)]">{formatDate(run.run_at)}</td>
                    <td className="py-2 px-4 font-medium">{policyName(run.policy_id)}</td>
                    <td className="py-2 px-4 font-mono">{run.records_matched}</td>
                    <td className="py-2 px-4 font-mono">{run.records_deleted}</td>
                    <td className="py-2 px-4">
                      {run.status === 'executed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">Executed</span>
                      ) : run.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs">Acknowledged</span>
                      ) : run.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs">Failed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs">Pending</span>
                      )}
                    </td>
                    <td className="py-2 px-4 font-mono text-xs text-[var(--text-secondary)]">{run.certificate_ref ?? '—'}</td>
                    <td className="py-2 px-4 text-xs text-[var(--text-secondary)]">{run.executed_by ?? '—'}</td>
                    <td className="py-2 px-4">
                      {run.status === 'pending_confirmation' && (
                        EXECUTABLE_ACTIONS.includes(run.action) ? (
                          <button
                            onClick={() => handleExecute(run)}
                            disabled={actingRunId === run.id}
                            title="Act on the matched rows in the source database"
                            className="px-3 py-1 rounded text-xs bg-[var(--status-danger)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {actingRunId === run.id && <Loader2 className="w-3 h-3 animate-spin" />}
                            {executeLabel(run.action)}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConfirm(run)}
                            disabled={confirmingId === run.id}
                            className="px-3 py-1 rounded text-xs bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {confirmingId === run.id && <Loader2 className="w-3 h-3 animate-spin" />}
                            Acknowledge
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePager
              page={runsPager.page}
              pageCount={runsPager.pageCount}
              total={runsPager.total}
              pageSize={runsPager.pageSize}
              onPage={runsPager.setPage}
            />
          </div>
        )}
      </div>

      {/* Application-level erasure obligations (Stage 4) */}
      <ObligationsSection orgId={orgId} />

      {/* Feature highlight cards (static reference) */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Calendar, title: 'Configurable Retention Periods', body: 'Define custom retention per data category per DPDPA Section 8(7).' },
          { icon: Clock, title: 'Flag & Confirm Deletion', body: 'Dry-run counts expiring records; a human confirms before anything is removed.' },
          { icon: Download, title: 'Deletion Audit Trail', body: 'Every run is logged with a certificate reference for compliance evidence.' },
        ].map((c) => (
          <div key={c.title} className="rounded-lg p-6 border border-[var(--border-default)] bg-[var(--surface-card)]">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-12 rounded-lg bg-[var(--brand-primary)] text-white flex items-center justify-center">
                <c.icon className="size-6" />
              </div>
              <h3 className="font-semibold">{c.title}</h3>
            </div>
            <div className="text-sm text-[var(--text-secondary)]">{c.body}</div>
          </div>
        ))}
      </div>

      {/* New / Edit Policy Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Retention Policy' : 'Create New Retention Policy'}</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X className="size-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <Labeled label="Policy Name *">
                <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Order Records" />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Data Category">
                  <input className={inputCls} value={form.data_category} onChange={(e) => setForm((f) => ({ ...f, data_category: e.target.value }))} placeholder="Transactional data" />
                </Labeled>
                <Labeled label="Legal Basis">
                  <input className={inputCls} value={form.legal_basis} onChange={(e) => setForm((f) => ({ ...f, legal_basis: e.target.value }))} />
                </Labeled>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Labeled label="Retention Period">
                  <input type="number" className={inputCls} value={form.period_value} onChange={(e) => setForm((f) => ({ ...f, period_value: e.target.value }))} />
                </Labeled>
                <Labeled label="Unit">
                  <select className={inputCls} value={form.period_unit} onChange={(e) => setForm((f) => ({ ...f, period_unit: e.target.value as RetentionPeriodUnit }))}>
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </Labeled>
                <Labeled label="Notify before (days)">
                  <input type="number" className={inputCls} value={form.notify_before_days} onChange={(e) => setForm((f) => ({ ...f, notify_before_days: e.target.value }))} />
                </Labeled>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Trigger Event">
                  <select className={inputCls} value={form.trigger_event} onChange={(e) => setForm((f) => ({ ...f, trigger_event: e.target.value as TriggerEvent }))}>
                    {(Object.keys(TRIGGER_LABELS) as TriggerEvent[]).map((t) => (
                      <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Action on Expiry">
                  <select className={inputCls} value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as RetentionAction }))}>
                    {(Object.keys(ACTION_LABELS) as RetentionAction[]).map((a) => (
                      <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                    ))}
                  </select>
                </Labeled>
              </div>
              {form.trigger_event === 'consent_withdrawal' && (
                <div className="flex items-start gap-2 p-2.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] text-xs text-[var(--text-secondary)]">
                  <Clock className="size-4 flex-shrink-0 mt-0.5 text-[var(--brand-primary)]" />
                  <span>
                    Set the <strong>Date Column</strong> below to the consent-withdrawal timestamp (e.g.
                    <code className="px-1">consent_withdrawn_at</code>). Under the DPDP Act, processing/traffic
                    logs must be kept <strong>≥ 1 year</strong> after withdrawal — mark those columns as a{' '}
                    <strong>legal retention hold</strong> in Data Inventory and this policy will keep them until the hold expires.
                  </span>
                </div>
              )}

              <Labeled label="Evidentiary fields to preserve (comma-separated)">
                <div>
                  <input
                    className={inputCls}
                    value={form.keep_fields}
                    onChange={(e) => setForm((f) => ({ ...f, keep_fields: e.target.value }))}
                    placeholder="consent_reference, proof_hash, transaction_id"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                    DPDPA minimum record — these columns are skipped during mask / anonymize / pseudonymize runs.
                  </p>
                </div>
              </Labeled>

              <div className="pt-2 border-t border-[var(--border-default)]">
                <div className="text-sm font-medium mb-2">
                  Target{' '}
                  <span className="font-normal text-[var(--text-tertiary)]">
                    (source + asset + date column — required for automated actions)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Labeled label="Data Source">
                    <select className={inputCls} value={form.data_source_id} onChange={(e) => setForm((f) => ({ ...f, data_source_id: e.target.value, asset_id: '' }))}>
                      <option value="">— None —</option>
                      {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Labeled>
                  <Labeled label="Asset / Table">
                    <select className={inputCls} value={form.asset_id} onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))}>
                      <option value="">— None —</option>
                      {assetsForSource.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </Labeled>
                  <Labeled label="Date Column">
                    <input className={inputCls} value={form.trigger_field} onChange={(e) => setForm((f) => ({ ...f, trigger_field: e.target.value }))} placeholder="created_at" />
                  </Labeled>
                </div>
                {EXECUTABLE_ACTIONS.includes(form.action) &&
                  !(form.data_source_id && form.asset_id && form.trigger_field) && (
                    <div className="mt-3 flex items-start gap-2 p-2.5 rounded-md border border-yellow-500/30 bg-[var(--status-warning-bg)] text-xs text-[var(--text-primary)]">
                      <AlertTriangle className="size-4 flex-shrink-0 mt-0.5 text-[var(--status-warning)]" />
                      <span>
                        Without a complete target, this “{ACTION_LABELS[form.action]}” policy is saved as{' '}
                        <strong>documentation only</strong> — it will not delete or anonymise any data.
                      </span>
                    </div>
                  )}
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input type="checkbox" checked={form.auto_delete} onChange={(e) => setForm((f) => ({ ...f, auto_delete: e.target.checked }))} />
                  Auto-flag when due
                </label>
                <Labeled label="Status">
                  <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PolicyStatus }))}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="draft">Draft</option>
                  </select>
                </Labeled>
              </div>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Policy Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg max-w-2xl w-full">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X className="size-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Detail label="Category" value={selected.data_category ?? '—'} />
                <Detail label="Retention" value={`${selected.period_value} ${selected.period_unit} (${selected.retention_days}d)`} />
                <Detail label="Trigger" value={TRIGGER_LABELS[selected.trigger_event]} />
                <Detail label="Action" value={ACTION_LABELS[selected.action]} />
                <Detail label="Legal Basis" value={selected.legal_basis ?? '—'} />
                <Detail label="Last Run" value={formatDate(selected.last_run_at)} />
              </div>
              <div className="space-y-3 pt-2 border-t border-[var(--border-default)]">
                <div className="flex items-center gap-2 text-sm">
                  <EnforcementBadge policy={selected} />
                  {selected.enforcement_state !== 'enforced' && (
                    <span className="text-[var(--text-secondary)]">{selected.enforcement_reason}</span>
                  )}
                </div>
                {selected.enforcement_state === 'enforced' && (
                  <div>
                    <button
                      onClick={() => checkImpact(selected)}
                      disabled={impactLoading}
                      title="Count expiring rows and check foreign-key / primary-key safety (read-only)"
                      className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {impactLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Check impact
                    </button>
                    {impact && (
                      <div className="mt-3 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm space-y-1.5">
                        <div>
                          {impact.matched != null ? (
                            <>
                              <strong>{impact.matched}</strong> record(s) older than{' '}
                              {formatDate(impact.cutoff_date)} would be{' '}
                              {ACTION_LABELS[impact.action].toLowerCase()}.
                            </>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              {impact.count_note ?? 'Could not count matching rows.'}
                            </span>
                          )}
                        </div>
                        {impact.dependent_tables.length > 0 && (
                          <div className="text-xs text-[var(--text-secondary)]">
                            Referenced by: {impact.dependent_tables.join(', ')}
                          </div>
                        )}
                        {impact.legal_hold_fields.length > 0 && (
                          <div className="text-xs text-[var(--text-secondary)]">
                            🔒 Legal hold ≥{impact.legal_hold_days}d on: {impact.legal_hold_fields.join(', ')}
                          </div>
                        )}
                        {impact.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[var(--status-warning)] text-xs">
                            <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </div>
                        ))}
                        {impact.warnings.length === 0 && impact.matched != null && (
                          <div className="flex items-center gap-1.5 text-[var(--status-success)] text-xs">
                            <Check className="size-4" /> No referential-integrity issues detected.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-between">
              <button onClick={() => handleDelete(selected)} className="px-4 py-2 text-sm rounded-md border border-[var(--status-danger)] text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] inline-flex items-center gap-1.5">
                <Trash2 className="size-4" /> Delete
              </button>
              <div className="flex gap-2">
                <button onClick={() => openEdit(selected)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]">Edit</button>
                <button
                  onClick={() => handleRun(selected)}
                  disabled={runningId === selected.id}
                  className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {runningId === selected.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  Run dry-run
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';

function Labeled({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}

function EnforcementBadge({ policy }: { policy: RetentionPolicy }): ReactElement {
  if (policy.enforcement_state === 'enforced') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">
        <Check className="size-3" /> Enforced
      </span>
    );
  }
  return (
    <span
      title={policy.enforcement_reason ?? ''}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs"
    >
      <AlertTriangle className="size-3" /> Documentation
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <div className="text-sm text-[var(--text-secondary)] mb-1">{label}</div>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}

const OBLIGATION_STATUS_CLASS: Record<ObligationStatus, string> = {
  due: 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
  pending: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
  on_hold: 'bg-[var(--status-info-bg)] text-[var(--status-info)]',
  fulfilled: 'bg-[var(--status-success-bg)] text-[var(--status-success)]',
  cancelled: 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]',
};

interface ObligationForm {
  subject_ref: string;
  data_category: string;
  trigger_event: TriggerEvent;
  action: '' | RetentionAction;
  retention_days: string;
  notes: string;
}

const EMPTY_OBLIGATION_FORM: ObligationForm = {
  subject_ref: '',
  data_category: '',
  trigger_event: 'consent_withdrawal',
  action: '',
  retention_days: '',
  notes: '',
};

function ObligationsSection({ orgId }: { orgId?: string }): ReactElement {
  const [obligations, setObligations] = useState<RetentionObligation[]>([]);
  const [summary, setSummary] = useState<ObligationSummary | null>(null);
  const [apiInfo, setApiInfo] = useState<ObligationApiInfo | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ObligationStatus>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<ObligationForm>(EMPTY_OBLIGATION_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([
        fetchObligations(orgId, statusFilter === 'all' ? undefined : statusFilter),
        fetchObligationSummary(orgId),
      ]);
      setObligations(o);
      setSummary(s);
    } catch (error) {
      notify(`Failed to load obligations: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const obligationsPager = useClientPagination(obligations, undefined, statusFilter);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    fetchObligationApiInfo(orgId).then(setApiInfo).catch(() => setApiInfo(null));
  }, [orgId]);

  const handleFulfill = async (o: RetentionObligation) => {
    setBusyId(o.id);
    try {
      await fulfillObligation(o.id, orgId);
      notify(`Marked ${o.subject_ref} fulfilled.`);
      await load();
    } catch (error) {
      notify(`Failed: ${(error as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (o: RetentionObligation) => {
    if (!window.confirm(`Cancel the erasure obligation for "${o.subject_ref}"?`)) return;
    setBusyId(o.id);
    try {
      await cancelObligation(o.id, orgId);
      notify('Obligation cancelled.');
      await load();
    } catch (error) {
      notify(`Failed: ${(error as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    if (!form.subject_ref.trim()) {
      notify('Enter a subject reference.');
      return;
    }
    setSaving(true);
    try {
      const payload: ObligationCreate = {
        subject_ref: form.subject_ref.trim(),
        trigger_event: form.trigger_event,
        data_category: form.data_category || null,
        action: form.action || null,
        retention_days: form.retention_days ? Number(form.retention_days) : null,
        notes: form.notes || null,
      };
      await createObligation(payload, orgId);
      notify('Obligation recorded.');
      setShowCreate(false);
      setForm(EMPTY_OBLIGATION_FORM);
      await load();
    } catch (error) {
      notify(`Failed to record: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg border border-[var(--border-default)]">
        <div className="p-4 border-b border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">Erasure Obligations (application-level)</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Per-subject erasure duties created by lifecycle events. Your app polls the API to purge
              them at its own level (database, caches, search, backups), then confirms.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | ObligationStatus)}
              className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="due">Due</option>
              <option value="on_hold">On hold</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              onClick={() => { setForm(EMPTY_OBLIGATION_FORM); setShowCreate(true); }}
              className="px-3 py-1.5 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 inline-flex items-center gap-1.5"
            >
              <Plus className="size-4" /> Record obligation
            </button>
          </div>
        </div>

        {summary && (
          <div className="px-4 py-3 border-b border-[var(--border-default)] flex flex-wrap gap-4 text-sm">
            <span className="text-[var(--text-secondary)]">Total <strong className="text-[var(--text-primary)]">{summary.total}</strong></span>
            <span className="text-[var(--status-warning)]">Pending {summary.pending}</span>
            <span className="text-[var(--status-danger)]">Due {summary.due}</span>
            <span className="text-[var(--status-info)]">On hold {summary.on_hold}</span>
            <span className="text-[var(--status-success)]">Fulfilled {summary.fulfilled}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : obligations.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
            No obligations yet. They appear when your app reports a lifecycle event (see the Developer API below),
            or record one manually.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)] text-xs text-[var(--text-tertiary)]">
                  {['Subject', 'Category', 'Trigger', 'Action', 'Due', 'Hold until', 'Source', 'Status', ''].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obligationsPager.pageItems.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--border-default)] text-sm">
                    <td className="py-2.5 px-4 font-mono text-xs text-[var(--text-primary)]">{o.subject_ref}</td>
                    <td className="py-2.5 px-4 text-[var(--text-secondary)]">{o.data_category ?? '—'}</td>
                    <td className="py-2.5 px-4 text-[var(--text-secondary)]">{TRIGGER_LABELS[o.trigger_event]}</td>
                    <td className="py-2.5 px-4 text-[var(--text-secondary)]">{ACTION_LABELS[o.action]}</td>
                    <td className="py-2.5 px-4 text-[var(--text-secondary)]">{formatDate(o.due_at)}</td>
                    <td className="py-2.5 px-4 text-[var(--text-secondary)]">
                      {o.legal_hold_until ? <span title="Legal retention hold">🔒 {formatDate(o.legal_hold_until)}</span> : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[var(--text-tertiary)]">{o.source}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${OBLIGATION_STATUS_CLASS[o.status]}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {o.status !== 'fulfilled' && o.status !== 'cancelled' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleFulfill(o)}
                            disabled={busyId === o.id}
                            title="Mark as erased (audit only — records that your app purged this subject)"
                            className="px-2.5 py-1 rounded text-xs border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {busyId === o.id && <Loader2 className="w-3 h-3 animate-spin" />}
                            Fulfilled
                          </button>
                          <button
                            onClick={() => handleCancel(o)}
                            disabled={busyId === o.id}
                            className="px-2.5 py-1 rounded text-xs text-[var(--text-tertiary)] hover:text-[var(--status-danger)] disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePager
              page={obligationsPager.page}
              pageCount={obligationsPager.pageCount}
              total={obligationsPager.total}
              pageSize={obligationsPager.pageSize}
              onPage={obligationsPager.setPage}
            />
          </div>
        )}
      </div>

      <ObligationDevApi info={apiInfo} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg max-w-lg w-full">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">Record Erasure Obligation</h2>
              <button onClick={() => setShowCreate(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X className="size-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <Labeled label="Subject reference *">
                <input className={inputCls} value={form.subject_ref} onChange={(e) => setForm((f) => ({ ...f, subject_ref: e.target.value }))} placeholder="USER_12345" />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Data category">
                  <input className={inputCls} value={form.data_category} onChange={(e) => setForm((f) => ({ ...f, data_category: e.target.value }))} placeholder="Marketing" />
                </Labeled>
                <Labeled label="Trigger event">
                  <select className={inputCls} value={form.trigger_event} onChange={(e) => setForm((f) => ({ ...f, trigger_event: e.target.value as TriggerEvent }))}>
                    {(Object.keys(TRIGGER_LABELS) as TriggerEvent[]).map((t) => (
                      <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                    ))}
                  </select>
                </Labeled>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Action (blank = from policy)">
                  <select className={inputCls} value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as '' | RetentionAction }))}>
                    <option value="">Auto (from matching policy)</option>
                    {(Object.keys(ACTION_LABELS) as RetentionAction[]).map((a) => (
                      <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Retention days (optional override)">
                  <input type="number" className={inputCls} value={form.retention_days} onChange={(e) => setForm((f) => ({ ...f, retention_days: e.target.value }))} placeholder="from policy" />
                </Labeled>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                The due date is computed from a matching active policy (by category + trigger) and extended by any
                legal-retention hold. Leave overrides blank to use the policy.
              </p>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving…' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ObligationDevApi({ info }: { info: ObligationApiInfo | null }): ReactElement {
  const key = info?.api_key_prefix ? `${info.api_key_prefix}-YOUR_API_KEY_SECRET` : 'YOUR_API_KEY';
  const events = info?.events_url || '';
  const due = info?.due_url || '';
  const fulfill = info?.fulfill_url || '';
  const snippet = `# 1. Report a lifecycle event → creates an erasure obligation
curl -X POST "${events}" \\
  -H "X-Api-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"subject_ref":"USER_12345","trigger_event":"consent_withdrawal","data_category":"Marketing"}'

# 2. Poll what is due, then purge each subject in YOUR systems
curl "${due}" -H "X-Api-Key: ${key}"

# 3. Confirm the purge (records evidence for audit)
curl -X POST "${fulfill.replace('{obligation_id}', 'OBLIGATION_ID')}" \\
  -H "X-Api-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"evidence":{"systems":["postgres","search_index","cache","backups"]}}'`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      notify('Copied to clipboard.');
    } catch {
      notify('Copy failed — select the code manually.');
    }
  };

  return (
    <div className="mt-4 p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-medium">Developer API — drive erasure from your app</h3>
        <button onClick={copy} className="inline-flex items-center gap-1 text-xs text-[var(--brand-primary)] hover:underline">
          <Copy className="w-3 h-3" /> Copy
        </button>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-3 max-w-3xl">
        Retention shouldn&apos;t depend only on where data is stored. Report events, poll what&apos;s due, and delete
        at the application level — respecting your own foreign keys, caches, search indexes and backups.
        {info && !info.has_api_key && (
          <span className="text-[var(--status-warning)]"> Generate an API key in the Integrations module first.</span>
        )}
      </p>
      <pre className="text-xs p-3 rounded-lg overflow-x-auto bg-[var(--surface-raised)] text-[var(--text-primary)] whitespace-pre">
        {snippet}
      </pre>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warning';
}): ReactElement {
  const toneClass =
    tone === 'success'
      ? 'text-[var(--status-success)]'
      : tone === 'warning'
        ? 'text-[var(--status-warning)]'
        : 'text-[var(--text-primary)]';
  return (
    <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4">
      <div className={`text-2xl font-semibold mb-1 ${toneClass}`}>{value}</div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}
