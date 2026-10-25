import { SectionReference, StatuteTextLink } from '@/app/components/common/SectionReference';
import { TablePager } from '@/app/components/common/TablePager';
import { ProcessorFormModal } from '@/app/components/pages/ProcessorFormModal';
import { WorkspaceEvidenceExportButtons } from '@/app/components/pages/WorkspaceEvidenceExportButtons';
import { WorkspaceSettingsGate } from '@/app/components/pages/WorkspaceSettingsGate';
import { Check, X, AlertTriangle, ChevronDown, Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { notify } from '@/app/utils/notify';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { ApiError } from '@/lib/api/client';
import { isSignificantDataFiduciary } from '@/lib/workspace/sdfStatus';
import { getObligationGuidance } from '@/lib/workspace/obligationGuidance';
import type { DataProcessor, DataProcessorCreate, DpdpObligation, DpdpRole } from '@/types/workspace';

/**
 * DPDPA role mapping for fiduciaries, processors, and consent managers.
 */
const ROLE_LABELS: Record<DpdpRole, string> = {
  data_fiduciary: 'Data Fiduciary',
  data_processor: 'Data Processor',
  significant_data_fiduciary: 'Significant Data Fiduciary',
};

export function DPDPRoleMapping(): ReactElement {
  const {
    settings,
    obligations,
    loading,
    error,
    hasOrg,
    canEdit,
    saveRoleMapping,
    saveIndustry,
    createProcessor,
    updateProcessor,
    removeProcessor,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    exportEvidencePack,
    exportFullEvidencePack,
    canExport,
  } = useWorkspaceSettings();
  const [showSDFModal, setShowSDFModal] = useState(false);
  const [showReassessModal, setShowReassessModal] = useState(false);
  const [selectedObligation, setSelectedObligation] = useState<DpdpObligation | null>(null);
  const [selectedProcessor, setSelectedProcessor] = useState<DataProcessor | null>(null);
  const [processorFormOpen, setProcessorFormOpen] = useState(false);
  const [processorFormMode, setProcessorFormMode] = useState<'create' | 'edit'>('create');
  const [editingProcessor, setEditingProcessor] = useState<DataProcessor | null>(null);
  const [processorSaving, setProcessorSaving] = useState(false);
  const [reassessPurpose, setReassessPurpose] = useState<'yes' | 'no' | ''>('');
  const [reassessPrincipals, setReassessPrincipals] = useState('');
  const [reassessTurnover, setReassessTurnover] = useState('');
  const [obligationGuidanceOpen, setObligationGuidanceOpen] = useState(false);

  const processors = settings?.processors ?? [];
  const isSdf = settings ? isSignificantDataFiduciary(settings) : false;
  const selectedGuidance = selectedObligation ? getObligationGuidance(selectedObligation) : null;
  const obligationsPager = useClientPagination(obligations);
  const processorsPager = useClientPagination(processors);

  useEffect(() => {
    processorsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processors.length]);

  const handleUnmarkSdf = async (): Promise<void> => {
    if (
      !window.confirm(
        'Remove Significant Data Fiduciary designation? Your DPDP role will revert to Data Fiduciary and SDF-specific obligations will no longer apply in this workspace.'
      )
    ) {
      return;
    }
    try {
      await saveRoleMapping({ dpdp_role: 'data_fiduciary' });
      notify('SDF designation removed. Role updated to Data Fiduciary.');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to remove SDF designation');
    }
  };

  const openCreateProcessor = () => {
    setProcessorFormMode('create');
    setEditingProcessor(null);
    setProcessorFormOpen(true);
  };

  const openEditProcessor = (proc: DataProcessor) => {
    setSelectedProcessor(null);
    setProcessorFormMode('edit');
    setEditingProcessor(proc);
    setProcessorFormOpen(true);
  };

  const handleProcessorFormSubmit = async (body: DataProcessorCreate) => {
    setProcessorSaving(true);
    try {
      if (processorFormMode === 'create') {
        await createProcessor(body);
        notify(`Added processor: ${body.name}`);
      } else if (editingProcessor) {
        const updated = await updateProcessor(editingProcessor.id, body);
        notify(`Updated processor: ${updated.name}`);
        if (selectedProcessor?.id === updated.id) {
          setSelectedProcessor(updated);
        }
      }
      setProcessorFormOpen(false);
      setEditingProcessor(null);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save processor');
    } finally {
      setProcessorSaving(false);
    }
  };

  const handleDeleteProcessor = async (proc: DataProcessor) => {
    if (!window.confirm(`Remove "${proc.name}" from your processor registry?`)) return;
    try {
      await removeProcessor(proc.id);
      notify(`Removed processor: ${proc.name}`);
      setSelectedProcessor(null);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to delete processor');
    }
  };

  const handleMarkDpaSigned = async (proc: DataProcessor) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const updated = await updateProcessor(proc.id, {
        dpa_status: 'signed',
        dpa_signed_date: today,
      });
      setSelectedProcessor(updated);
      notify(`DPA marked signed for ${proc.name}`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to update DPA status');
    }
  };

  return (
    <WorkspaceSettingsGate
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
    <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
      {settings && (
        <>
      {!canEdit && (
        <p className="text-xs text-[var(--text-secondary)] mb-4">Read-only — contact your org admin to edit.</p>
      )}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1>DPDP Role Mapping</h1>
          <WorkspaceEvidenceExportButtons
            section="role-mapping"
            onExportSection={exportEvidencePack}
            onExportFull={exportFullEvidencePack}
            disabled={!canExport}
          />
        </div>
        <SectionReference section="DPDPA Sections 2, 10 — Data Fiduciary, Data Processor, SDF" />
      </div>

      {/* Current Role */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="text-indigo-100 mb-2">{settings.organization.name} is a:</div>
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-md bg-white text-indigo-700 font-medium">
                {ROLE_LABELS[settings.dpdp_role]}
              </span>
              {isSdf && (
                <span className="px-2 py-0.5 rounded-md bg-yellow-400/20 text-yellow-100 text-xs font-medium border border-yellow-300/40">
                  SDF designated
                </span>
              )}
              <div className="flex items-center gap-4 text-sm">
                <div>Data Principals: <span className="font-semibold">{settings.data_principals_count_band ?? 'Not set'}</span></div>
                <div>Annual revenue: <span className="font-semibold">{settings.annual_turnover_band ?? 'Not set'}</span></div>
                <div className="flex items-center gap-1">
                  {isSdf ? (
                    <>
                      <Check className="size-4 text-green-300" />
                      <span>Designated as SDF</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="size-4 text-yellow-300" />
                      <span>SDF eligibility</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowReassessModal(true)}
                className="px-4 py-2 text-sm rounded-md bg-white/10 hover:bg-white/20 border border-white/20"
              >
                Reassess role
              </button>
              {canEdit && (
                isSdf ? (
                  <button
                    type="button"
                    onClick={() => void handleUnmarkSdf()}
                    className="px-4 py-2 text-sm rounded-md bg-white/10 hover:bg-white/20 border border-white/30 text-white font-medium"
                  >
                    Remove SDF designation
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSDFModal(true)}
                    className="px-4 py-2 text-sm rounded-md bg-yellow-600 hover:bg-yellow-700 text-white font-medium"
                  >
                    Mark as Significant Data Fiduciary →
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Role Comparison Matrix */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 mb-6">
        <h3 className="font-medium mb-4 text-[var(--text-primary)]">Role Comparison Matrix</h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[var(--border-default)]">
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Obligation</th>
                <th className="text-center py-3 px-4 text-sm">
                  <div className="px-3 py-1 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium inline-block">
                    Data Fiduciary
                  </div>
                </th>
                <th className="text-center py-3 px-4 text-sm">
                  <div className="px-3 py-1 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-medium inline-block">
                    Data Processor
                  </div>
                </th>
                <th className="text-center py-3 px-4 text-sm">
                  <div className="px-3 py-1 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-medium inline-block">
                    Significant Data Fiduciary
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {obligationsPager.slice.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => {
                    setObligationGuidanceOpen(false);
                    setSelectedObligation(row);
                  }}
                  className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] group cursor-pointer text-[var(--text-primary)]"
                >
                  <td className="py-3 px-4 text-sm font-medium flex items-center gap-2">
                    {row.obligation}
                    <ChevronDown className="size-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.df === 'required' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 text-xs font-medium">✓ Required</span>}
                    {row.df === 'recommended' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 text-xs">Recommended</span>}
                    {row.df === 'no' && <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.dp === 'required' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 text-xs font-medium">✓ Required</span>}
                    {row.dp === 'recommended' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 text-xs">Recommended</span>}
                    {row.dp === 'no' && <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.sdf === 'required' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 text-xs font-medium">✓ Required</span>}
                    {row.sdf === 'mandatory' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 text-xs font-medium">MANDATORY</span>}
                    {row.sdf === 'mandatory-high-risk' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 text-xs font-medium">MANDATORY (high-risk)</span>}
                    {row.sdf === 'no' && <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager
          page={obligationsPager.page}
          pageCount={obligationsPager.pageCount}
          total={obligationsPager.total}
          pageSize={obligationsPager.pageSize}
          onPage={obligationsPager.setPage}
        />
      </div>

      {/* Your Processors */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-[var(--text-primary)]">Your Data Processors</h3>
          {canEdit && (
            <button
              type="button"
              onClick={openCreateProcessor}
              className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2"
            >
              <Plus className="size-4" />
              Add processor
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Organization</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Role</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Purpose</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">DPA Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Risk Level</th>
              </tr>
            </thead>
            <tbody>
              {processors.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-[var(--text-secondary)]">
                    No data processors registered yet.
                    {canEdit && (
                      <>
                        {' '}
                        <button
                          type="button"
                          onClick={openCreateProcessor}
                          className="text-indigo-600 dark:text-indigo-400 underline"
                        >
                          Add your first processor
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {processorsPager.slice.map((processor) => (
                <tr
                  key={processor.id}
                  onClick={() => setSelectedProcessor(processor)}
                  className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer text-[var(--text-primary)]"
                >
                  <td className="py-3 px-4 text-sm font-medium">{processor.name}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300 text-xs">DP</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{processor.purpose ?? '—'}</td>
                  <td className="py-3 px-4">
                    {processor.dpa_status === 'signed' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 text-xs">
                        <Check className="size-3" />
                        DPA signed
                      </span>
                    )}
                    {processor.dpa_status === 'expired' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300 text-xs">
                        <AlertTriangle className="size-3" />
                        DPA expired
                      </span>
                    )}
                    {processor.dpa_status === 'none' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 text-xs">
                        <X className="size-3" />
                        No DPA
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                      processor.risk_level?.toLowerCase() === 'low' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' :
                      processor.risk_level?.toLowerCase() === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300' :
                      'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 font-medium'
                    }`}>
                      {processor.risk_level ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager
          page={processorsPager.page}
          pageCount={processorsPager.pageCount}
          total={processorsPager.total}
          pageSize={processorsPager.pageSize}
          onPage={processorsPager.setPage}
        />
      </div>

      {/* SDF Modal */}
      {showSDFModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-card)] rounded-lg shadow-xl max-w-3xl w-full text-[var(--text-primary)]">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold">Significant Data Fiduciary (SDF) Designation</h2>
              <button onClick={() => setShowSDFModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-[var(--status-warning-bg)] border border-[var(--status-warning)]/30 rounded-lg p-4">
                <div className="text-sm text-[var(--text-primary)]">
                  <strong className="text-[var(--status-warning)]">Important:</strong> Marking your organization as a Significant Data Fiduciary triggers additional compliance obligations under DPDPA Section 10.
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">Additional Obligations for SDFs:</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Mandatory Data Protection Impact Assessment (DPIA) for all high-risk processing</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Appointment of Data Protection Officer (DPO)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Independent data audit at least once every year</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Periodic review of processing activities and risk assessments</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Enhanced breach notification requirements</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">Eligibility Criteria:</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-[var(--border-default)] rounded-lg p-3">
                    <div className="text-sm text-[var(--text-secondary)] mb-1">Data Principals Threshold</div>
                    <div className="font-medium">50 lakh+ individuals</div>
                  </div>
                  <div className="border border-[var(--border-default)] rounded-lg p-3">
                    <div className="text-sm text-[var(--text-secondary)] mb-1">Your Current Status</div>
                    <div className="font-medium">{settings.data_principals_count_band ?? 'Not set'}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    void (async () => {
                      try {
                        await saveRoleMapping({ dpdp_role: 'significant_data_fiduciary' });
                        notify('Marked as Significant Data Fiduciary. Additional obligations apply.');
                        setShowSDFModal(false);
                      } catch (e) {
                        notify(e instanceof ApiError ? e.message : 'Failed to update role');
                      }
                    })();
                  }}
                  className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-medium"
                >
                  Confirm SDF Designation
                </button>
                <button
                  onClick={() => setShowSDFModal(false)}
                  className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassess Role Modal */}
      {showReassessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-card)] rounded-lg shadow-xl max-w-2xl w-full text-[var(--text-primary)]">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold">Reassess DPDP Role</h2>
              <button onClick={() => setShowReassessModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)]/30 rounded-lg p-4">
                <div className="text-sm text-[var(--text-primary)]">
                  Answer these questions to determine your organization's role under DPDPA
                </div>
              </div>

              <div className="space-y-3">
                <div className="border border-[var(--border-default)] rounded-lg p-4 bg-[var(--surface-card)]">
                  <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                    Does your organization determine the purpose and means of processing personal data?
                  </label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="radio"
                        name="purpose"
                        checked={reassessPurpose === 'yes'}
                        onChange={() => setReassessPurpose('yes')}
                        className="rounded border-[var(--border-default)]"
                      />
                      <span>Yes</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="radio"
                        name="purpose"
                        checked={reassessPurpose === 'no'}
                        onChange={() => setReassessPurpose('no')}
                        className="rounded border-[var(--border-default)]"
                      />
                      <span>No</span>
                    </label>
                  </div>
                </div>

                <div className="border border-[var(--border-default)] rounded-lg p-4 bg-[var(--surface-card)]">
                  <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                    How many data principals does your organization process data for?
                  </label>
                  <select
                    value={reassessPrincipals}
                    onChange={(e) => setReassessPrincipals(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)] text-sm"
                  >
                    <option value="">Select band</option>
                    <option>Less than 1 lakh</option>
                    <option>1-10 lakhs</option>
                    <option>10-50 lakhs</option>
                    <option>More than 50 lakhs</option>
                  </select>
                </div>

                <div className="border border-[var(--border-default)] rounded-lg p-4 bg-[var(--surface-card)]">
                  <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                    What is your organization's annual turnover?
                  </label>
                  <select
                    value={reassessTurnover}
                    onChange={(e) => setReassessTurnover(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)] text-sm"
                  >
                    <option value="">Select band</option>
                    <option>Less than ₹100 Cr</option>
                    <option>₹100-500 Cr</option>
                    <option>More than ₹500 Cr</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    void (async () => {
                      const assessment = {
                        determines_purpose: reassessPurpose,
                        data_principals_band: reassessPrincipals,
                        annual_turnover_band: reassessTurnover,
                      };
                      const role: DpdpRole =
                        reassessPurpose === 'no' ? 'data_processor' : 'data_fiduciary';
                      try {
                        await saveRoleMapping({ role_assessment: assessment, dpdp_role: role });
                        if (reassessPrincipals || reassessTurnover) {
                          await saveIndustry({
                            data_principals_count_band: reassessPrincipals || undefined,
                            annual_turnover_band: reassessTurnover || undefined,
                          });
                        }
                        notify(`Role reassessment saved: ${ROLE_LABELS[role]}`);
                        setShowReassessModal(false);
                      } catch (e) {
                        notify(e instanceof ApiError ? e.message : 'Failed to save assessment');
                      }
                    })();
                  }}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
                >
                  Complete Assessment
                </button>
                <button
                  onClick={() => setShowReassessModal(false)}
                  className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Obligation Detail Modal */}
      {selectedObligation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-card)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto text-[var(--text-primary)]">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between sticky top-0 bg-[var(--surface-card)]">
              <h2 className="font-semibold">{selectedObligation.obligation}</h2>
              <button
                onClick={() => {
                  setObligationGuidanceOpen(false);
                  setSelectedObligation(null);
                }}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)]/30 rounded-lg p-4">
                <div className="text-sm font-medium text-[var(--text-primary)] mb-2">Description</div>
                <div className="text-sm text-[var(--text-secondary)]">
                  {selectedObligation.description}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Legal Reference</label>
                <div className="text-sm text-[var(--text-primary)] bg-[var(--surface-raised)] p-4 rounded">
                  <StatuteTextLink label={selectedObligation.statute_reference} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">Applicability by Role</label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-[var(--border-default)] rounded-lg p-3 bg-[var(--surface-card)]">
                    <div className="text-xs text-[var(--text-secondary)] mb-2">Data Fiduciary</div>
                    <div className="text-sm">
                      {selectedObligation.df === 'required' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 font-medium">✓ Required</span>}
                      {selectedObligation.df === 'recommended' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Recommended</span>}
                      {selectedObligation.df === 'no' && <span className="text-[var(--text-tertiary)]">Not applicable</span>}
                    </div>
                  </div>
                  <div className="border border-[var(--border-default)] rounded-lg p-3 bg-[var(--surface-card)]">
                    <div className="text-xs text-[var(--text-secondary)] mb-2">Data Processor</div>
                    <div className="text-sm">
                      {selectedObligation.dp === 'required' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 font-medium">✓ Required</span>}
                      {selectedObligation.dp === 'recommended' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Recommended</span>}
                      {selectedObligation.dp === 'no' && <span className="text-[var(--text-tertiary)]">Not applicable</span>}
                    </div>
                  </div>
                  <div className="border border-[var(--border-default)] rounded-lg p-3 bg-[var(--surface-card)]">
                    <div className="text-xs text-[var(--text-secondary)] mb-2">SDF</div>
                    <div className="text-sm">
                      {selectedObligation.sdf === 'required' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 font-medium">✓ Required</span>}
                      {selectedObligation.sdf === 'mandatory' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 font-medium">MANDATORY</span>}
                      {selectedObligation.sdf === 'mandatory-high-risk' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 font-medium">MANDATORY (high-risk)</span>}
                      {selectedObligation.sdf === 'no' && <span className="text-[var(--text-tertiary)]">Not applicable</span>}
                    </div>
                  </div>
                </div>
              </div>

              {obligationGuidanceOpen && selectedGuidance && (
                <div className="border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 bg-indigo-50/50 dark:bg-indigo-950/20">
                  <div className="text-sm font-medium text-[var(--text-primary)] mb-1">Compliance guidance</div>
                  <div className="text-xs text-[var(--text-secondary)] mb-3">
                    Vajra module:{' '}
                    <span className="font-medium text-indigo-700 dark:text-indigo-300">
                      {selectedGuidance.featureLabel}
                    </span>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text-secondary)]">
                    {selectedGuidance.steps.map((step) => (
                      <li key={step} className="pl-1">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-4">
                {selectedGuidance ? (
                  <button
                    type="button"
                    onClick={() => setObligationGuidanceOpen((open) => !open)}
                    className="flex-1 min-w-[12rem] px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
                  >
                    {obligationGuidanceOpen ? 'Hide compliance guidance' : 'View compliance guidance'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 px-4 py-2 bg-[var(--surface-raised)] text-[var(--text-tertiary)] rounded-md font-medium cursor-not-allowed border border-[var(--border-default)]"
                  >
                    Guidance not available for this obligation
                  </button>
                )}
                <button
                  onClick={() => {
                    setObligationGuidanceOpen(false);
                    setSelectedObligation(null);
                  }}
                  className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processor Detail Modal */}
      {selectedProcessor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-card)] rounded-lg shadow-xl max-w-2xl w-full text-[var(--text-primary)]">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold">{selectedProcessor.name}</h2>
              <button onClick={() => setSelectedProcessor(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className={`border rounded-lg p-4 ${
                selectedProcessor.risk_level?.toUpperCase() === 'HIGH' ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800' :
                selectedProcessor.risk_level?.toLowerCase() === 'medium' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800' :
                'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-[var(--text-primary)]">Risk Level</div>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded font-medium ${
                    selectedProcessor.risk_level?.toUpperCase() === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                    selectedProcessor.risk_level?.toLowerCase() === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}>
                    {selectedProcessor.risk_level ?? '—'}
                  </span>
                </div>
                {selectedProcessor.risk_level?.toUpperCase() === 'HIGH' && (
                  <div className="text-sm text-red-800 dark:text-red-300">
                    <AlertTriangle className="size-4 inline mr-1" />
                    Immediate action required: No Data Processing Agreement in place
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Role</label>
                  <div className="text-sm font-medium">{selectedProcessor.processor_role}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Purpose</label>
                  <div className="text-sm font-medium">{selectedProcessor.purpose}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Data Categories Processed</label>
                <div className="text-sm bg-[var(--surface-raised)] p-3 rounded">
                  {selectedProcessor.data_categories ?? '—'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Processing Location</label>
                  <div className="text-sm font-medium">{selectedProcessor.location}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Contact</label>
                  <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">{selectedProcessor.contact_email ?? '—'}</div>
                </div>
              </div>

              <div className="border-t border-[var(--border-default)] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">DPA Status</label>
                  {selectedProcessor.dpa_status === 'signed' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300 text-xs font-medium">
                      <Check className="size-3" />
                      Signed
                    </span>
                  )}
                  {selectedProcessor.dpa_status === 'expired' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300 text-xs font-medium">
                      <AlertTriangle className="size-3" />
                      Expired
                    </span>
                  )}
                  {selectedProcessor.dpa_status === 'none' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300 text-xs font-medium">
                      <X className="size-3" />
                      No DPA
                    </span>
                  )}
                </div>
                {selectedProcessor.dpa_signed_date && (
                  <div className="text-sm text-[var(--text-secondary)]">
                    {selectedProcessor.dpa_status === 'signed' ? 'Signed on: ' : 'Expired on: '}
                    {selectedProcessor.dpa_signed_date}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-4">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditProcessor(selectedProcessor)}
                      className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-sm font-medium"
                    >
                      Edit
                    </button>
                    {(selectedProcessor.dpa_status === 'none' ||
                      selectedProcessor.dpa_status === 'expired') && (
                      <button
                        type="button"
                        onClick={() => void handleMarkDpaSigned(selectedProcessor)}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                      >
                        Mark DPA signed
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteProcessor(selectedProcessor)}
                      className="px-4 py-2 border border-red-300 text-red-700 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </>
                )}
                {selectedProcessor.dpa_status === 'signed' && (
                  <button
                    type="button"
                    disabled
                    title="DPA document storage & download is coming soon"
                    className="px-4 py-2 bg-[var(--surface-raised)] text-[var(--text-tertiary)] rounded-md text-sm font-medium cursor-not-allowed border border-[var(--border-default)]"
                  >
                    Download DPA (coming soon)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedProcessor(null)}
                  className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ProcessorFormModal
        open={processorFormOpen}
        mode={processorFormMode}
        initial={editingProcessor}
        saving={processorSaving}
        onClose={() => {
          setProcessorFormOpen(false);
          setEditingProcessor(null);
        }}
        onSubmit={handleProcessorFormSubmit}
      />
        </>
      )}
    </div>
    </WorkspaceSettingsGate>
  );
}
