import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { StatusPill } from '@/app/components/common/StatusPill';
import { TablePager } from '@/app/components/common/TablePager';
import { notify } from '@/app/utils/notify';
import { ApiError } from '@/lib/api/client';
import { fetchAssets } from '@/lib/api/dataInventory';
import {
  deletePurposeDataMapping,
  fetchPurposeDataMappings,
  fetchPurposeEnforcementConfigs,
  upsertPurposeDataMapping,
  upsertPurposeEnforcementConfig,
} from '@/lib/api/enforcement';
import type { Purpose } from '@/types/consent';
import type {
  DenyBehavior,
  EnforcementMode,
  PurposeDataMapping,
  WithdrawalAction,
} from '@/types/enforcement';
import { fetchAsset } from '@/lib/api/dataInventory';
import {
  DENY_BEHAVIOR_LABELS,
  ENFORCEMENT_MODE_LABELS,
  WITHDRAWAL_ACTION_LABELS,
  enforcementModeBadge,
} from '@/app/components/enforcement/enforcementLabels';

const WITHDRAWAL_ACTIONS = Object.keys(WITHDRAWAL_ACTION_LABELS) as WithdrawalAction[];
const DENY_BEHAVIORS = Object.keys(DENY_BEHAVIOR_LABELS) as DenyBehavior[];

interface PurposeEnforcementPanelProps {
  purpose: Purpose;
  orgId?: string;
  canEdit: boolean;
  consentPurposes: Purpose[];
}

export function PurposeEnforcementPanel({
  purpose,
  orgId,
  canEdit,
}: PurposeEnforcementPanelProps): ReactElement {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<EnforcementMode>('disabled');
  const [denyBehavior, setDenyBehavior] = useState<DenyBehavior>('reject');
  const [mappings, setMappings] = useState<PurposeDataMapping[]>([]);
  const [fieldOptions, setFieldOptions] = useState<{ id: string; label: string }[]>([]);
  const [addFieldId, setAddFieldId] = useState('');
  const [addWithdrawalAction, setAddWithdrawalAction] = useState<WithdrawalAction>('suppress');
  const [showChecklist, setShowChecklist] = useState(false);

  const isConsentPurpose = purpose.legal_basis === 'consent';
  const isAlwaysAllowed = purpose.legal_basis === 'legitimate_use';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configs, purposeMappings, assets] = await Promise.all([
        fetchPurposeEnforcementConfigs(orgId),
        fetchPurposeDataMappings(orgId, purpose.id),
        fetchAssets(orgId),
      ]);
      const cfg = configs.find((c) => c.purpose_id === purpose.id);
      setMode(cfg?.mode ?? 'disabled');
      setDenyBehavior(cfg?.deny_behavior ?? 'reject');
      setMappings(purposeMappings);

      const fieldLists = await Promise.all(
        assets.slice(0, 40).map((a) => fetchAsset(a.id, orgId).catch(() => null)),
      );
      const opts: { id: string; label: string }[] = [];
      for (const asset of fieldLists) {
        if (!asset) continue;
        for (const f of asset.fields) {
          opts.push({ id: f.id, label: `${asset.name} · ${f.name}` });
        }
      }
      setFieldOptions(opts);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to load enforcement settings');
    } finally {
      setLoading(false);
    }
  }, [orgId, purpose.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const mappedFieldIds = useMemo(() => new Set(mappings.map((m) => m.inventory_field_id)), [mappings]);
  const mappingsPager = useClientPagination(mappings);

  const checklist = useMemo(
    () => [
      { label: 'Purpose has field mappings', passed: mappings.length > 0 },
      { label: 'Deny behavior configured', passed: denyBehavior !== undefined },
      { label: 'Shadow observations reviewed (7+ days recommended)', passed: mode !== 'disabled' },
      { label: 'DPO / admin sign-off recorded', passed: mode === 'enforced' },
    ],
    [mappings.length, denyBehavior, mode],
  );

  const canPromoteToShadow = mappings.length > 0;
  const canPromoteToEnforced =
    mappings.length > 0 && (mode === 'shadow' || mode === 'enforced');

  const saveConfig = async (nextMode: EnforcementMode, nextDeny = denyBehavior) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await upsertPurposeEnforcementConfig(
        { purpose_id: purpose.id, mode: nextMode, deny_behavior: nextDeny },
        orgId,
      );
      setMode(nextMode);
      notify(`Purpose enforcement set to ${ENFORCEMENT_MODE_LABELS[nextMode]}`);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to update enforcement mode');
    } finally {
      setSaving(false);
    }
  };

  const handleDenyChange = async (value: DenyBehavior) => {
    setDenyBehavior(value);
    if (!canEdit) return;
    setSaving(true);
    try {
      await upsertPurposeEnforcementConfig(
        { purpose_id: purpose.id, mode, deny_behavior: value },
        orgId,
      );
      notify('Deny behavior updated');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to update deny behavior');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMapping = async () => {
    if (!addFieldId || !canEdit) return;
    setSaving(true);
    try {
      await upsertPurposeDataMapping(
        {
          purpose_id: purpose.id,
          inventory_field_id: addFieldId,
          withdrawal_action: addWithdrawalAction,
        },
        orgId,
      );
      setAddFieldId('');
      await load();
      notify('Field mapping added');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to add mapping');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMapping = async (mappingId: string) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await deletePurposeDataMapping(mappingId, orgId);
      await load();
      notify('Mapping removed');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to remove mapping');
    } finally {
      setSaving(false);
    }
  };

  const handleMappingActionChange = async (mapping: PurposeDataMapping, action: WithdrawalAction) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await upsertPurposeDataMapping(
        {
          purpose_id: mapping.purpose_id,
          inventory_field_id: mapping.inventory_field_id,
          withdrawal_action: action,
        },
        orgId,
      );
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to update withdrawal action');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading enforcement…</div>;
  }

  if (isAlwaysAllowed) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <StatusPill status="legit-use" label="Legitimate use" />
          <span className="font-medium">Always allowed at enforcement layer</span>
        </div>
        <p className="text-[var(--text-secondary)]">
          Non-consent purposes are structurally exempt from blocking. No enforcement mode applies.
        </p>
      </div>
    );
  }

  if (!isConsentPurpose) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Enforcement applies to consent-based purposes only.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">
            Purpose enforcement mode
          </div>
          <span className={`px-2.5 py-1 rounded text-xs font-bold ${enforcementModeBadge(mode)}`}>
            {ENFORCEMENT_MODE_LABELS[mode]}
          </span>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {mode === 'enforced' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveConfig('shadow')}
                className="px-3 py-1.5 text-xs rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
              >
                Demote to shadow
              </button>
            )}
            {mode === 'shadow' && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveConfig('disabled')}
                  className="px-3 py-1.5 text-xs rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
                >
                  Demote to disabled
                </button>
                <button
                  type="button"
                  disabled={saving || !canPromoteToEnforced}
                  onClick={() => void saveConfig('enforced')}
                  className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Promote to enforced
                </button>
              </>
            )}
            {mode === 'disabled' && (
              <button
                type="button"
                disabled={saving || !canPromoteToShadow}
                onClick={() => void saveConfig('shadow')}
                className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Promote to shadow
              </button>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowChecklist((v) => !v)}
        className="w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
      >
        <span className="font-medium">Promotion checklist</span>
        {showChecklist ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {showChecklist && (
        <ul className="space-y-2 text-sm">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${item.passed ? 'bg-[var(--status-success)]' : 'bg-[var(--status-warning)]'}`}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Deny behavior</label>
        <select
          value={denyBehavior}
          disabled={!canEdit || saving}
          onChange={(e) => void handleDenyChange(e.target.value as DenyBehavior)}
          className="w-full max-w-xs rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          {DENY_BEHAVIORS.map((b) => (
            <option key={b} value={b}>
              {DENY_BEHAVIOR_LABELS[b]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Mapped data fields</h4>
          {mappings.length === 0 && (
            <span className="px-2.5 py-1 rounded bg-[var(--status-warning-bg)] text-xs font-semibold text-[var(--status-warning)] flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Unmapped
            </span>
          )}
        </div>
        {mappings.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Map inventory fields to enable withdrawal remediation and collection-point coverage.
          </p>
        ) : (
          <div className="border border-[var(--border-default)] rounded-md overflow-hidden mb-3">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-raised)]">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Field</th>
                  <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">
                    Withdrawal action
                  </th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {mappingsPager.slice.map((m) => {
                  const label =
                    fieldOptions.find((f) => f.id === m.inventory_field_id)?.label ??
                    m.inventory_field_id.slice(0, 8);
                  return (
                    <tr key={m.id} className="border-t border-[var(--border-default)]/40">
                      <td className="py-2 px-3 font-mono text-xs">{label}</td>
                      <td className="py-2 px-3">
                        <select
                          value={m.withdrawal_action}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            void handleMappingActionChange(m, e.target.value as WithdrawalAction)
                          }
                          className="rounded border border-[var(--border-default)] bg-[var(--surface)] px-2 py-1 text-xs"
                        >
                          {WITHDRAWAL_ACTIONS.map((a) => (
                            <option key={a} value={a}>
                              {WITHDRAWAL_ACTION_LABELS[a]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void handleRemoveMapping(m.id)}
                            className="text-[var(--text-tertiary)] hover:text-[var(--status-danger)]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePager
              page={mappingsPager.page}
              pageCount={mappingsPager.pageCount}
              total={mappingsPager.total}
              pageSize={mappingsPager.pageSize}
              onPage={mappingsPager.setPage}
            />
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Inventory field</label>
              <select
                value={addFieldId}
                onChange={(e) => setAddFieldId(e.target.value)}
                className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <option value="">Select field…</option>
                {fieldOptions
                  .filter((f) => !mappedFieldIds.has(f.id))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">On withdrawal</label>
              <select
                value={addWithdrawalAction}
                onChange={(e) => setAddWithdrawalAction(e.target.value as WithdrawalAction)}
                className="rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                {WITHDRAWAL_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {WITHDRAWAL_ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!addFieldId || saving}
              onClick={() => void handleAddMapping()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="size-4" /> Add mapping
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
