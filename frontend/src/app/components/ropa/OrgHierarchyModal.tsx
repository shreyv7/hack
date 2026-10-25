import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import { Building2, X } from 'lucide-react';
import {
  createBusinessUnit,
  createDepartment,
  type BusinessUnit,
  type Department,
} from '@/lib/api/ropa';
import { notify } from '@/app/utils/notify';

interface OrgHierarchyModalProps {
  open: boolean;
  onClose: () => void;
  orgId?: string;
  businessUnits: BusinessUnit[];
  departments: Department[];
  onUpdated: () => void | Promise<void>;
  /** Pre-select BU when opening from activity form */
  initialBusinessUnitId?: string;
  /** Open directly on department tab */
  focusDepartment?: boolean;
}

export function OrgHierarchyModal({
  open,
  onClose,
  orgId,
  businessUnits,
  departments,
  onUpdated,
  initialBusinessUnitId,
  focusDepartment = false,
}: OrgHierarchyModalProps): ReactElement | null {
  const [tab, setTab] = useState<'bu' | 'dept'>(focusDepartment ? 'dept' : 'bu');
  const [buName, setBuName] = useState('');
  const [buCode, setBuCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptBuId, setDeptBuId] = useState(initialBusinessUnitId ?? businessUnits[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(focusDepartment ? 'dept' : 'bu');
      if (initialBusinessUnitId) {
        setDeptBuId(initialBusinessUnitId);
      } else if (businessUnits[0]?.id) {
        setDeptBuId(businessUnits[0].id);
      }
    }
  }, [open, focusDepartment, initialBusinessUnitId, businessUnits]);

  if (!open) return null;

  const handleCreateBu = async () => {
    const name = buName.trim();
    if (!name) {
      notify('Business unit name is required');
      return;
    }
    setSaving(true);
    try {
      const created = await createBusinessUnit(
        { name, code: buCode.trim() || null },
        orgId
      );
      setBuName('');
      setBuCode('');
      await onUpdated();
      setDeptBuId(created.id);
      notify(`Business unit "${name}" created`);
      setTab('dept');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to create business unit');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDept = async () => {
    const name = deptName.trim();
    if (!deptBuId) {
      notify('Select a business unit first');
      setTab('bu');
      return;
    }
    if (!name) {
      notify('Department name is required');
      return;
    }
    setSaving(true);
    try {
      await createDepartment(
        { business_unit_id: deptBuId, name, code: deptCode.trim() || null },
        orgId
      );
      setDeptName('');
      setDeptCode('');
      await onUpdated();
      notify(`Department "${name}" created`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to create department');
    } finally {
      setSaving(false);
    }
  };

  const buNameById = (id: string) => businessUnits.find((b) => b.id === id)?.name ?? '—';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col text-[var(--text-primary)]">
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-[var(--brand-primary)]" />
            <h2 className="font-bold text-lg">Organization Structure</h2>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex border-b border-[var(--border-default)] px-6 gap-4 bg-[var(--surface-raised)]">
          <button
            type="button"
            onClick={() => setTab('bu')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              tab === 'bu'
                ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                : 'border-transparent text-[var(--text-secondary)]'
            }`}
          >
            Business Units ({businessUnits.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('dept')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              tab === 'dept'
                ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                : 'border-transparent text-[var(--text-secondary)]'
            }`}
          >
            Departments ({departments.length})
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {tab === 'bu' && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Business units scope RoPA activities, governance dashboards, and compliance records.
              </p>
              <div className="space-y-3 p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/50">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1">Name *</label>
                  <input
                    type="text"
                    value={buName}
                    onChange={(e) => setBuName(e.target.value)}
                    placeholder="e.g. Engineering"
                    className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1">Code (optional)</label>
                  <input
                    type="text"
                    value={buCode}
                    onChange={(e) => setBuCode(e.target.value)}
                    placeholder="e.g. ENG"
                    className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleCreateBu()}
                  className="w-full py-2 text-sm font-semibold rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  Add Business Unit
                </button>
              </div>
              {businessUnits.length > 0 ? (
                <ul className="text-sm divide-y divide-[var(--border-default)] border border-[var(--border-default)] rounded-lg overflow-hidden">
                  {businessUnits.map((bu) => (
                    <li key={bu.id} className="px-3 py-2 flex justify-between bg-[var(--surface-card)]">
                      <span className="font-medium">{bu.name}</span>
                      {bu.code && <span className="text-xs text-[var(--text-secondary)] font-mono">{bu.code}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--text-secondary)] text-center py-2">No business units yet.</p>
              )}
            </>
          )}

          {tab === 'dept' && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Departments belong to a business unit and refine processing activity ownership.
              </p>
              {businessUnits.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Create at least one business unit before adding departments.
                </p>
              ) : (
                <div className="space-y-3 p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/50">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1">Business Unit *</label>
                    <select
                      value={deptBuId}
                      onChange={(e) => setDeptBuId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
                    >
                      <option value="">Select business unit…</option>
                      {businessUnits.map((bu) => (
                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1">Department Name *</label>
                    <input
                      type="text"
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                      placeholder="e.g. Platform Engineering"
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1">Code (optional)</label>
                    <input
                      type="text"
                      value={deptCode}
                      onChange={(e) => setDeptCode(e.target.value)}
                      placeholder="e.g. PLT"
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreateDept()}
                    className="w-full py-2 text-sm font-semibold rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Add Department
                  </button>
                </div>
              )}
              {departments.length > 0 ? (
                <ul className="text-sm divide-y divide-[var(--border-default)] border border-[var(--border-default)] rounded-lg overflow-hidden">
                  {departments.map((d) => (
                    <li key={d.id} className="px-3 py-2 flex justify-between gap-2 bg-[var(--surface-card)]">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-xs text-[var(--text-secondary)] truncate">{buNameById(d.business_unit_id)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--text-secondary)] text-center py-2">No departments yet.</p>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-default)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
