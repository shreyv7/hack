import { notify } from '@/app/utils/notify';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { StatusPill } from '@/app/components/common/StatusPill';
import { TablePager } from '@/app/components/common/TablePager';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { ConsentEvidenceExportButtons } from '@/app/components/pages/ConsentEvidenceExportButtons';
import { ConsentModuleHeader } from '@/app/components/pages/ConsentModuleHeader';
import {
  consentToolbarBtn,
  consentToolbarPrimaryBtn,
  consentToolbarToggleLabel,
} from '@/app/components/pages/consentToolbarStyles';
import { ChevronDown, Plus, X, RotateCw, Edit, Archive } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { useConsentManagement } from '@/hooks/useConsentManagement';
import { ApiError } from '@/lib/api/client';
import type { LegalBasis, Purpose, PurposeDetail, PurposeActivity } from '@/types/consent';
import { formatReviewDate } from '@/types/consent';
import { fetchPurposeActivities } from '@/lib/api/consent';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { PurposeEnforcementPanel } from '@/app/components/enforcement/PurposeEnforcementPanel';

function basisPillStatus(basis: LegalBasis): 'consent' | 'legit-use' {
  return basis === 'legitimate_use' ? 'legit-use' : 'consent';
}

function basisLabel(basis: LegalBasis): string {
  return basis === 'legitimate_use' ? 'Legitimate Use' : 'Consent';
}



const EMPTY_FORM = {
  name: '',
  description: '',
  legal_basis: 'consent' as LegalBasis,
  categories: [] as string[],
  categoryInput: '',
  retention: '',
  is_special_category: false,
  translations: {} as Record<string, any>,
  lia_summary: '',
  lia_reviewed_at: '',
  lia_reviewed_by: '',
};

export function PurposeRegistryNew(): ReactElement {
  const {
    purposes,
    loading,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    createPurpose,
    updatePurpose,
    getPurposeDetail,
    exportConsentEvidencePack,
    exportFullConsentEvidencePack,
    reload,
    showArchived,
    setShowArchived,
    removePurpose,
    restorePurpose,
  } = useConsentManagement();

  const [activities, setActivities] = useState<PurposeActivity[]>([]);

  const loadActivities = async () => {
    try {
      const orgId = isSuperadmin ? selectedOrgId || undefined : undefined;
      const apiActivities = await fetchPurposeActivities(orgId);
      setActivities(apiActivities);
    } catch (err) {
      console.error('Failed to load activities:', err);
    }
  };

  useEffect(() => {
    if (hasOrg) {
      void loadActivities();
    }
  }, [hasOrg, selectedOrgId, purposes]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await reload();
      await loadActivities();
      notify('Purposes synchronized successfully');
    } catch {
      notify('Failed to sync purposes');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEditPurpose = async (purpose: Purpose, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const detail = await getPurposeDetail(purpose.id);
      setSelectedPurpose(detail);
      setForm({
        name: detail.name,
        description: detail.description || '',
        legal_basis: detail.legal_basis,
        categories: [...detail.data_categories],
        categoryInput: '',
        retention: detail.retention_period,
        is_special_category: detail.is_special_category,
        translations: detail.translations || {},
        lia_summary: (detail as any).lia_summary || '',
        lia_reviewed_at: (detail as any).lia_reviewed_at ? new Date((detail as any).lia_reviewed_at).toISOString().split('T')[0] : '',
        lia_reviewed_by: (detail as any).lia_reviewed_by || '',
      });
      setEditMode(true);
      setShowAddModal(true);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to load purpose details');
    }
  };

  const handleArchivePurpose = async (purpose: Purpose, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Archive purpose "${purpose.name}"?`)) return;
    try {
      await removePurpose(purpose.id);
      notify('Purpose archived');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to archive purpose');
    }
  };

  const handleUnarchivePurpose = async (purpose: Purpose, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Unarchive purpose "${purpose.name}"?`)) return;
    try {
      await restorePurpose(purpose.id);
      notify('Purpose unarchived');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to unarchive purpose');
    }
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPurpose, setSelectedPurpose] = useState<PurposeDetail | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);



  const resetForm = () => setForm(EMPTY_FORM);

  const openAdd = () => {
    resetForm();
    setEditMode(false);
    setShowAddModal(true);
  };

  const openDetails = async (purpose: Purpose) => {
    try {
      const detail = await getPurposeDetail(purpose.id);
      setSelectedPurpose(detail);
      setShowDetailsModal(true);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to load purpose details');
    }
  };

  const addCategory = () => {
    const cat = form.categoryInput.trim();
    if (!cat || form.categories.includes(cat)) return;
    setForm((f) => ({ ...f, categories: [...f.categories, cat], categoryInput: '' }));
  };

  const removeCategory = (cat: string) => {
    setForm((f) => ({ ...f, categories: f.categories.filter((c) => c !== cat) }));
  };

  const handleSavePurpose = async () => {
    if (!form.name.trim()) {
      notify('Purpose name is required');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        legal_basis: form.legal_basis,
        data_categories: form.categories,
        retention_period: form.retention,
        is_special_category: form.is_special_category,
        translations: (form as any).translations || {},
        lia_summary: form.legal_basis === 'legitimate_use' ? (form.lia_summary?.trim() || null) : null,
        lia_reviewed_at: form.legal_basis === 'legitimate_use' ? (form.lia_reviewed_at || null) : null,
        lia_reviewed_by: form.legal_basis === 'legitimate_use' ? (form.lia_reviewed_by?.trim() || null) : null,
      };
      if (editMode && selectedPurpose) {
        await updatePurpose(selectedPurpose.id, body);
        notify('Purpose updated');
      } else {
        await createPurpose(body);
        notify('Purpose added');
      }
      setShowAddModal(false);
      setShowDetailsModal(false);
      resetForm();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save purpose');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (!selectedPurpose) return;
    setForm({
      name: selectedPurpose.name,
      description: selectedPurpose.description || '',
      legal_basis: selectedPurpose.legal_basis,
      categories: [...selectedPurpose.data_categories],
      categoryInput: '',
      retention: selectedPurpose.retention_period,
      is_special_category: selectedPurpose.is_special_category,
      translations: selectedPurpose.translations || {},
      lia_summary: (selectedPurpose as any).lia_summary || '',
      lia_reviewed_at: (selectedPurpose as any).lia_reviewed_at ? new Date((selectedPurpose as any).lia_reviewed_at).toISOString().split('T')[0] : '',
      lia_reviewed_by: (selectedPurpose as any).lia_reviewed_by || '',
    });
    setEditMode(true);
    setShowDetailsModal(false);
    setShowAddModal(true);
  };

  const purposesPager = useClientPagination(purposes);

  const recentActivities = useMemo(
    () =>
      activities.map((act) => {
        const actDate = new Date(act.created_at);
        const dateStr = actDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        return {
          id: act.id,
          purpose: `${act.purpose_name} ${act.purpose_version}`,
          action: act.action,
          timestamp: dateStr,
          user: act.user_name,
        };
      }),
    [activities],
  );
  const activityPager = useClientPagination(recentActivities);

  useEffect(() => {
    purposesPager.resetPage();
    activityPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, selectedOrgId]);

  return (
    <ConsentManagementGate
      title="Purpose Registry"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="p-8 max-w-[1280px] mx-auto">
        {!canEdit && (
          <p className="text-xs text-[var(--text-secondary)] mb-4">Read-only — contact your org admin to edit.</p>
        )}
        <ConsentModuleHeader
          title="Purpose Registry"
          sectionReference="DPDPA Section 6 — Purpose Limitation & Lawful Basis"
          chips={
            <>
              <DPDPAChip
                sections={{
                  chapter: 2,
                  section: 4,
                  name: 'Grounds for processing',
                  url: '/dpdpa2023/chapter-2/section4.html',
                  excerpt: 'Personal data processing requires lawful grounds...',
                }}
                size="detailed"
              />
              <PenaltyChip amount={250} />
            </>
          }
          actions={
            <>
              <ConsentEvidenceExportButtons
                onExportSection={() => exportConsentEvidencePack('purpose-registry')}
                onExportFull={exportFullConsentEvidencePack}
                disabled={loading || !hasOrg}
              />
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing || loading}
                className={consentToolbarBtn}
                title="Sync purposes"
              >
                <RotateCw className={`size-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <label className={consentToolbarToggleLabel}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded cursor-pointer accent-indigo-600"
                />
                Show archived
              </label>
              {canEdit ? (
                <button type="button" onClick={openAdd} className={consentToolbarPrimaryBtn}>
                  <Plus className="size-4" />
                  Add purpose
                </button>
              ) : null}
            </>
          }
        />

        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Purpose Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Legal Basis</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Data Categories</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Retention</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Linked Notices</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Last Reviewed</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purposes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-[var(--text-secondary)]">
                      No purposes yet. Add your first processing purpose to link to consent notices.
                    </td>
                  </tr>
                ) : (
                  purposesPager.slice.map((purpose) => (
                    <tr
                      key={purpose.id}
                      onClick={() => void openDetails(purpose)}
                      className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] group cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium flex items-center gap-2 text-[var(--text-primary)]">
                          <span>{purpose.name}</span>
                          <span className="text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
                            {purpose.version || 'v1.0'}
                          </span>
                          {purpose.is_special_category && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs dark:bg-purple-950 dark:text-purple-300">
                              Special category
                            </span>
                          )}
                          {purpose.archived_at && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs dark:bg-gray-800 dark:text-gray-400 border border-gray-200/50">
                              Archived
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusPill status={basisPillStatus(purpose.legal_basis)} label={basisLabel(purpose.legal_basis)} />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {purpose.data_categories.map((cat) => (
                            <span
                              key={cat}
                              className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] text-xs"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{purpose.retention_period || '—'}</td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                        {purpose.linked_notices_count} notice{purpose.linked_notices_count === 1 ? '' : 's'}
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                        {formatReviewDate(purpose.last_reviewed_at)}
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && !purpose.archived_at && (
                            <button
                              onClick={(e) => void handleEditPurpose(purpose, e)}
                              className="p-1 hover:bg-[var(--surface-raised)] rounded"
                              title="Edit"
                            >
                              <Edit className="size-4 text-[var(--text-secondary)]" />
                            </button>
                          )}
                          <button
                            onClick={() => void openDetails(purpose)}
                            className="p-1 hover:bg-[var(--surface-raised)] rounded"
                            title="Details"
                          >
                            <ChevronDown className="size-4 text-[var(--text-secondary)]" />
                          </button>
                          {canEdit && (
                            purpose.archived_at ? (
                              <button
                                onClick={(e) => void handleUnarchivePurpose(purpose, e)}
                                className="p-1 hover:bg-[var(--surface-raised)] rounded"
                                title="Unarchive"
                              >
                                <RotateCw className="size-4 text-emerald-600 dark:text-emerald-400" />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => void handleArchivePurpose(purpose, e)}
                                className="p-1 hover:bg-[var(--surface-raised)] rounded"
                                title="Archive"
                              >
                                <Archive className="size-4 text-[var(--text-secondary)]" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePager
            page={purposesPager.page}
            pageCount={purposesPager.pageCount}
            total={purposesPager.total}
            pageSize={purposesPager.pageSize}
            onPage={purposesPager.setPage}
          />
        </div>

        {/* Recent Activity */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">Recent Activity</h2>
          <div className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]">
            {recentActivities.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
                No recent activity. Create or modify a purpose to see logs here.
              </div>
            ) : (
              activityPager.slice.map((activity, idx) => (
                <div
                  key={activity.id}
                  className={cn('p-4', idx !== activityPager.slice.length - 1 && 'border-b border-[var(--border-default)]')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1 text-[var(--text-primary)]">{activity.purpose}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--text-secondary)]">{activity.action}</span>
                        {activity.user && (
                          <>
                            <span className="text-sm text-[var(--text-tertiary)]">·</span>
                            <span className="text-xs text-[var(--text-tertiary)] font-medium">by {activity.user}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-[var(--text-tertiary)]">{activity.timestamp}</div>
                  </div>
                </div>
              ))
            )}
            <TablePager
              page={activityPager.page}
              pageCount={activityPager.pageCount}
              total={activityPager.total}
              pageSize={activityPager.pageSize}
              onPage={activityPager.setPage}
            />
          </div>
        </div>

        {showAddModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowAddModal(false)}
          >
            <div
              className="bg-[var(--surface-card)] rounded-lg p-6 max-w-2xl w-full m-4 border border-[var(--border-default)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  {editMode ? 'Edit Purpose' : 'Add New Purpose'}
                </h2>
                <button type="button" onClick={() => setShowAddModal(false)} className="p-1 hover:bg-[var(--surface-raised)] rounded">
                  <X className="size-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Purpose Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md"
                    placeholder="e.g., Customer Support"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Plain Language Purpose Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md"
                    placeholder="e.g., We collect this data to resolve your customer support requests..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Legal Basis</label>
                  <select
                    value={form.legal_basis}
                    onChange={(e) => setForm((f) => ({ ...f, legal_basis: e.target.value as LegalBasis }))}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md"
                  >
                    <option value="consent">Consent</option>
                    <option value="legitimate_use">Legitimate Use</option>
                  </select>
                </div>
                {form.legal_basis === 'legitimate_use' && (
                  <div className="p-3 border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">⚖️ Legitimate Interest Assessment (LIA)</h4>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Balancing Test Summary *</label>
                      <textarea
                        value={(form as any).lia_summary || ''}
                        onChange={(e) => setForm((f) => ({ ...f, lia_summary: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md text-sm"
                        placeholder="Describe why this processing is necessary, proportionate, and balancing test arguments..."
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Reviewed By</label>
                        <input
                          type="text"
                          value={(form as any).lia_reviewed_by || ''}
                          onChange={(e) => setForm((f) => ({ ...f, lia_reviewed_by: e.target.value }))}
                          className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md text-sm"
                          placeholder="e.g. Legal Team, DPO"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Reviewed Date</label>
                        <input
                          type="date"
                          value={(form as any).lia_reviewed_at || ''}
                          onChange={(e) => setForm((f) => ({ ...f, lia_reviewed_at: e.target.value }))}
                          className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Data Categories</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.categories.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center px-2 py-1 rounded bg-[var(--surface-raised)] border border-[var(--border-default)] text-sm"
                      >
                        {cat}
                        <button type="button" className="ml-1 hover:text-red-600" onClick={() => removeCategory(cat)}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.categoryInput}
                      onChange={(e) => setForm((f) => ({ ...f, categoryInput: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                      className="flex-1 px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md"
                      placeholder="Add data category…"
                    />
                    <button type="button" onClick={addCategory} className="px-3 py-2 text-sm border rounded-md hover:bg-[var(--surface-raised)]">
                      Add
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Retention Period</label>
                  <input
                    type="text"
                    value={form.retention}
                    onChange={(e) => setForm((f) => ({ ...f, retention: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md"
                    placeholder="e.g., 7 years, Until withdrawal"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_special_category}
                    onChange={(e) => setForm((f) => ({ ...f, is_special_category: e.target.checked }))}
                    className="rounded"
                  />
                  Special category data (health, biometric, etc.)
                </label>



                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSavePurpose()}
                    className="flex-1 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : editMode ? 'Save Changes' : 'Add Purpose'}
                  </button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-md border hover:bg-[var(--surface-raised)]">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDetailsModal && selectedPurpose && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowDetailsModal(false)}
          >
            <div
              className="bg-[var(--surface-card)] rounded-lg p-6 max-w-3xl w-full m-4 max-h-[90vh] overflow-y-auto border border-[var(--border-default)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Purpose Details</h2>
                <button type="button" onClick={() => setShowDetailsModal(false)} className="p-1 hover:bg-[var(--surface-raised)] rounded">
                  <X className="size-5" />
                </button>
              </div>
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="bg-[var(--surface-raised)]">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="enforcement">Enforcement</TabsTrigger>
                  <TabsTrigger value="notices">Linked Notices</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-[var(--text-secondary)]">Purpose Name</div>
                    <div className="font-medium">{selectedPurpose.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--text-secondary)]">Version</div>
                    <div className="font-semibold text-[11px] text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] w-fit px-2 py-0.5 rounded font-mono">
                      {selectedPurpose.version || 'v1.0'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--text-secondary)]">Legal Basis</div>
                    <StatusPill
                      status={basisPillStatus(selectedPurpose.legal_basis)}
                      label={basisLabel(selectedPurpose.legal_basis)}
                    />
                  </div>
                </div>
                {selectedPurpose.description && (
                  <div>
                    <div className="text-sm text-[var(--text-secondary)] mb-1">Plain Language Description</div>
                    <div className="text-sm bg-[var(--surface-raised)] p-3 rounded border border-[var(--border-default)]">
                      {selectedPurpose.description}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-[var(--text-secondary)] mb-2">Data Categories</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedPurpose.data_categories.map((cat) => (
                      <span key={cat} className="px-3 py-1 rounded bg-[var(--surface-raised)] border text-sm">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-[var(--text-secondary)]">Retention</div>
                    <div className="font-medium">{selectedPurpose.retention_period || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--text-secondary)]">Last Reviewed</div>
                    <div className="font-medium">{formatReviewDate(selectedPurpose.last_reviewed_at)}</div>
                  </div>
                </div>
                {selectedPurpose.legal_basis === 'legitimate_use' && (
                  <div className="border-t pt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">⚖️ Legitimate Interest Assessment (LIA)</div>
                    <div className="text-sm bg-amber-50 dark:bg-amber-950/20 p-3 rounded border border-amber-200 dark:border-amber-900/50">
                      <div className="text-xs text-[var(--text-secondary)] mb-1">Balancing Test Summary</div>
                      <div className="text-sm">{(selectedPurpose as any).lia_summary || 'No balancing test summary documented.'}</div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-[var(--text-secondary)]">
                        <div>Reviewed By: <span className="font-medium text-[var(--text-primary)]">{(selectedPurpose as any).lia_reviewed_by || '—'}</span></div>
                        <div>Reviewed Date: <span className="font-medium text-[var(--text-primary)]">{(selectedPurpose as any).lia_reviewed_at ? new Date((selectedPurpose as any).lia_reviewed_at).toLocaleDateString() : '—'}</span></div>
                      </div>
                    </div>
                  </div>
                )}
                </TabsContent>
                <TabsContent value="enforcement">
                  <PurposeEnforcementPanel
                    purpose={selectedPurpose}
                    orgId={isSuperadmin ? selectedOrgId || undefined : undefined}
                    canEdit={canEdit}
                    consentPurposes={purposes}
                  />
                </TabsContent>
                <TabsContent value="notices" className="space-y-4">
                <div>
                  <h3 className="font-medium mb-3">
                    Linked Consent Notices ({selectedPurpose.linked_notices.length})
                  </h3>
                  {selectedPurpose.linked_notices.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">Not linked to any notices yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedPurpose.linked_notices.map((n) => (
                        <div key={n.version_id} className="flex items-center justify-between p-3 bg-[var(--surface-raised)] rounded">
                          <span>
                            {n.notice_name} {n.version_label}
                          </span>
                          <StatusPill status={n.status === 'live' ? 'live' : 'draft'} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                </TabsContent>
              </Tabs>
                {canEdit && (
                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={startEdit} className="flex-1 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">
                      Edit Purpose
                    </button>
                    <button type="button" onClick={() => setShowDetailsModal(false)} className="px-4 py-2 rounded-md border hover:bg-[var(--surface-raised)]">
                      Close
                    </button>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </ConsentManagementGate>
  );
}
