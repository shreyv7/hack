import { SectionReference } from '@/app/components/common/SectionReference';
import { TablePager } from '@/app/components/common/TablePager';
import { WorkspaceEvidenceExportButtons } from '@/app/components/pages/WorkspaceEvidenceExportButtons';
import { WorkspaceSettingsGate } from '@/app/components/pages/WorkspaceSettingsGate';
import { Edit, Shield, Check, Globe, X, Plus, Trash2, AlertTriangle, Upload, Download } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { ApiError } from '@/lib/api/client';
import {
  downloadDataResidencyTemplate,
  parseDataResidencyCsv,
} from '@/lib/workspace/parseDataResidencyCsv';
import type { DataResidencyRow, DeploymentModel, WorkspaceDeploymentUpdate } from '@/types/workspace';

/**
 * Deployment model and data residency configuration.
 */
const DEPLOYMENT_LABELS: Record<DeploymentModel, { title: string; subtitle: string }> = {
  public: { title: 'Public Cloud (AWS)', subtitle: 'Multi-tenant SaaS' },
  private: { title: 'Private Cloud', subtitle: 'Single-tenant on your cloud' },
  hybrid: { title: 'Hybrid', subtitle: 'Sensitive data on-premises' },
  on_prem: { title: 'On-Premises', subtitle: 'Self-hosted Kubernetes' },
};

const DEPLOYMENT_OPTIONS: { value: DeploymentModel; label: string }[] = [
  { value: 'public', label: 'Public Cloud (AWS) — Multi-tenant SaaS' },
  { value: 'private', label: 'Private Cloud — Your AWS/Azure/GCP' },
  { value: 'hybrid', label: 'Hybrid — On-prem + Cloud' },
  { value: 'on_prem', label: 'On-Premises — Self-hosted Kubernetes' },
];

const REGION_OPTIONS = [
  'Mumbai (ap-south-1)',
  'Hyderabad (ap-south-2)',
  'Singapore (ap-southeast-1)',
  'Frankfurt (eu-central-1)',
];

const EMPTY_RESIDENCY: DataResidencyRow = {
  category: '',
  region: '',
  cross_border: false,
  legal_basis: '',
  details: '',
};

// A region counts as "in India" (DPDPA-resident) if it's one of the AWS India
// regions / mentions India. Anything else is a cross-border location.
function isIndiaRegion(region?: string | null): boolean {
  if (!region) return false;
  const r = region.toLowerCase();
  return (
    r.includes('mumbai') ||
    r.includes('hyderabad') ||
    r.includes('ap-south') ||
    r.includes('india')
  );
}

export function DeploymentSettings(): ReactElement {
  const {
    settings,
    loading,
    error,
    hasOrg,
    canEdit,
    saveDeployment,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    exportEvidencePack,
    exportFullEvidencePack,
    canExport,
  } = useWorkspaceSettings();
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentModel>('public');
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // "Change deployment" modal draft state.
  const [modalModel, setModalModel] = useState<DeploymentModel>('public');
  const [modalPrimaryRegion, setModalPrimaryRegion] = useState(REGION_OPTIONS[0]);
  const [modalBackupRegion, setModalBackupRegion] = useState(REGION_OPTIONS[1]);

  // Data residency editor state. editIndex === null means "adding a new row".
  const [residencyOpen, setResidencyOpen] = useState(false);
  const [residencyEditIndex, setResidencyEditIndex] = useState<number | null>(null);
  const [residencyDraft, setResidencyDraft] = useState<DataResidencyRow>(EMPTY_RESIDENCY);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<DataResidencyRow[]>([]);
  const [importPreviewErrors, setImportPreviewErrors] = useState<string[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) setSelectedDeployment(settings.deployment_model);
  }, [settings]);

  const residencyRows: DataResidencyRow[] = settings?.data_residency ?? [];
  const residencyPager = useClientPagination(residencyRows);
  const importPreviewPager = useClientPagination(importPreviewRows);

  const persistDeployment = async (patch: WorkspaceDeploymentUpdate, successMsg: string) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await saveDeployment(patch);
      notify(successMsg);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save deployment settings');
    } finally {
      setSaving(false);
    }
  };

  const selectModel = (model: DeploymentModel) => {
    if (!canEdit) return;
    setSelectedDeployment(model);
    void persistDeployment(
      { deployment_model: model },
      `Deployment model saved: ${DEPLOYMENT_LABELS[model].title}`
    );
  };

  const openChangeModal = () => {
    if (!settings) return;
    setModalModel(settings.deployment_model);
    setModalPrimaryRegion(settings.primary_region ?? REGION_OPTIONS[0]);
    setModalBackupRegion(settings.backup_region ?? REGION_OPTIONS[1]);
    setShowChangeModal(true);
  };

  const saveChangeModal = async () => {
    await persistDeployment(
      {
        deployment_model: modalModel,
        primary_region: modalPrimaryRegion,
        backup_region: modalBackupRegion,
      },
      'Deployment configuration updated'
    );
    setShowChangeModal(false);
  };

  const openResidencyAdd = () => {
    setResidencyEditIndex(null);
    setResidencyDraft({ ...EMPTY_RESIDENCY });
    setResidencyOpen(true);
  };

  const openResidencyEdit = (index: number) => {
    setResidencyEditIndex(index);
    setResidencyDraft({ ...residencyRows[index] });
    setResidencyOpen(true);
  };

  const saveResidency = async () => {
    if (!residencyDraft.category.trim()) {
      notify('Data category is required');
      return;
    }
    const next =
      residencyEditIndex === null
        ? [...residencyRows, residencyDraft]
        : residencyRows.map((row, i) => (i === residencyEditIndex ? residencyDraft : row));
    await persistDeployment({ data_residency: next }, 'Data residency updated');
    setResidencyOpen(false);
  };

  const deleteResidency = async () => {
    if (residencyEditIndex === null) {
      setResidencyOpen(false);
      return;
    }
    const next = residencyRows.filter((_, i) => i !== residencyEditIndex);
    await persistDeployment({ data_residency: next }, 'Data category removed');
    setResidencyOpen(false);
  };

  const handleCsvFileSelected = async (file: File) => {
    try {
      const text = await file.text();
      const { rows, errors } = parseDataResidencyCsv(text);
      if (rows.length === 0) {
        notify(errors[0] ?? 'No valid rows found in CSV');
        return;
      }
      setImportPreviewRows(rows);
      setImportPreviewErrors(errors);
      setImportPreviewOpen(true);
    } catch {
      notify('Could not read CSV file');
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const confirmCsvImport = async () => {
    const next = [...residencyRows, ...importPreviewRows];
    await persistDeployment(
      { data_residency: next },
      `Imported ${importPreviewRows.length} data ${importPreviewRows.length === 1 ? 'category' : 'categories'}`,
    );
    setImportPreviewOpen(false);
    setImportPreviewRows([]);
    setImportPreviewErrors([]);
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
    <div className="p-8 max-w-[1280px] mx-auto">
      {settings && (
        <>
      {!canEdit && (
        <p className="text-xs text-[var(--text-secondary)] mb-4">Read-only — contact your org admin to edit.</p>
      )}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1>Deployment & Data Residency</h1>
          <WorkspaceEvidenceExportButtons
            section="deployment"
            onExportSection={exportEvidencePack}
            onExportFull={exportFullEvidencePack}
            disabled={!canExport}
          />
        </div>
        <SectionReference section="DPDPA Section 16 — Cross-border Data Transfer" />
      </div>

      {/* Current Deployment */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 mb-6 text-[var(--text-primary)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-[var(--text-primary)]">Current Deployment</h3>
          {canEdit && (
          <button
            onClick={openChangeModal}
            className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2"
          >
            <Edit className="size-4" />
            Change Deployment
          </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-[var(--text-secondary)] mb-2">Deployment Model</div>
            <div className="font-medium">{DEPLOYMENT_LABELS[settings.deployment_model].title}</div>
            <div className="text-sm text-[var(--text-secondary)]">{DEPLOYMENT_LABELS[settings.deployment_model].subtitle}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)] mb-2">Primary Region</div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{settings.primary_region ?? '—'}</span>
              <span>{isIndiaRegion(settings.primary_region) ? '🇮🇳' : '🌐'}</span>
            </div>
            {isIndiaRegion(settings.primary_region) ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs border border-[var(--status-success)]/20">
                <Check className="size-3" />
                Data residency: India
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs border border-[var(--status-warning)]/20">
                <AlertTriangle className="size-3" />
                Outside India — cross-border
              </span>
            )}
          </div>
          <div>
            <div className="text-xs text-[var(--text-secondary)] mb-2">Backup Region</div>
            <div className="font-medium mb-1">{settings.backup_region ?? '—'}</div>
            {isIndiaRegion(settings.backup_region) ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--status-info-bg)] text-[var(--status-info)] text-xs border border-[var(--status-info)]/20">
                <Shield className="size-3" />
                DPDPA Section 16 compliant
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs border border-[var(--status-warning)]/20">
                <AlertTriangle className="size-3" />
                Cross-border — Section 16 applies
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Switch Deployment */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 mb-6 text-[var(--text-primary)]">
        <h3 className="font-medium mb-4 text-[var(--text-primary)]">Switch Deployment Model</h3>

        <div className="grid grid-cols-2 gap-4">
          {/* Public Cloud */}
          <div
            onClick={() => selectModel('public')}
            className={`p-4 rounded-lg border-2 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${
              selectedDeployment === 'public' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className={`font-medium ${selectedDeployment === 'public' ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]'}`}>Public Cloud</h4>
                <div className={`text-sm mt-1 ${selectedDeployment === 'public' ? 'text-[var(--brand-primary)]/80' : 'text-[var(--text-secondary)]'}`}>Multi-tenant SaaS</div>
              </div>
              <div className={`size-5 rounded-full ${selectedDeployment === 'public' ? 'bg-[var(--brand-primary)]' : 'border-2 border-[var(--border-default)]'} flex items-center justify-center`}>
                {selectedDeployment === 'public' && <div className="size-2 rounded-full bg-white"></div>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={`px-2 py-0.5 rounded text-xs ${selectedDeployment === 'public' ? 'bg-[var(--surface-card)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/30' : 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)]'}`}>Mumbai</span>
              <span className={`px-2 py-0.5 rounded text-xs ${selectedDeployment === 'public' ? 'bg-[var(--surface-card)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/30' : 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)]'}`}>Hyderabad</span>
              <span className={`px-2 py-0.5 rounded text-xs ${selectedDeployment === 'public' ? 'bg-[var(--surface-card)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/30' : 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)]'}`}>Singapore</span>
              <span className={`px-2 py-0.5 rounded text-xs ${selectedDeployment === 'public' ? 'bg-[var(--surface-card)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/30' : 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)]'}`}>Frankfurt</span>
            </div>
          </div>

          {/* Private Cloud */}
          <div
            onClick={() => selectModel('private')}
            className={`p-4 rounded-lg border-2 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${
              selectedDeployment === 'private' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className={`font-medium ${selectedDeployment === 'private' ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]'}`}>Private Cloud</h4>
                <div className={`text-sm mt-1 ${selectedDeployment === 'private' ? 'text-[var(--brand-primary)]/80' : 'text-[var(--text-secondary)]'}`}>Single-tenant on your cloud</div>
              </div>
              <div className={`size-5 rounded-full ${selectedDeployment === 'private' ? 'bg-[var(--brand-primary)]' : 'border-2 border-[var(--border-default)]'} flex items-center justify-center`}>
                {selectedDeployment === 'private' && <div className="size-2 rounded-full bg-white"></div>}
              </div>
            </div>
            <div className={`text-xs ${selectedDeployment === 'private' ? 'text-[var(--brand-primary)]/80' : 'text-[var(--text-secondary)]'}`}>
              Single-tenant on customer's AWS/Azure/GCP, BYOK encryption
            </div>
          </div>

          {/* Hybrid */}
          <div
            onClick={() => selectModel('hybrid')}
            className={`p-4 rounded-lg border-2 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${
              selectedDeployment === 'hybrid' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className={`font-medium ${selectedDeployment === 'hybrid' ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]'}`}>Hybrid</h4>
                <div className={`text-sm mt-1 ${selectedDeployment === 'hybrid' ? 'text-[var(--brand-primary)]/80' : 'text-[var(--text-secondary)]'}`}>Sensitive data on-premises</div>
              </div>
              <div className={`size-5 rounded-full ${selectedDeployment === 'hybrid' ? 'bg-[var(--brand-primary)]' : 'border-2 border-[var(--border-default)]'} flex items-center justify-center`}>
                {selectedDeployment === 'hybrid' && <div className="size-2 rounded-full bg-white"></div>}
              </div>
            </div>
            <div className={`text-xs ${selectedDeployment === 'hybrid' ? 'text-[var(--brand-primary)]/80' : 'text-[var(--text-secondary)]'}`}>
              Sensitive data on-prem + cloud processing, preferred for banking/healthcare
            </div>
          </div>

          {/* On-Premises */}
          <div
            onClick={() => selectModel('on_prem')}
            className={`p-4 rounded-lg border-2 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${
              selectedDeployment === 'on_prem' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className={`font-medium ${selectedDeployment === 'on_prem' ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]'}`}>On-Premises</h4>
                <div className={`text-sm mt-1 ${selectedDeployment === 'on_prem' ? 'text-[var(--brand-primary)]/80' : 'text-[var(--text-secondary)]'}`}>Self-hosted Kubernetes</div>
              </div>
              <div className={`size-5 rounded-full ${selectedDeployment === 'on_prem' ? 'bg-[var(--brand-primary)]' : 'border-2 border-[var(--border-default)]'} flex items-center justify-center`}>
                {selectedDeployment === 'on_prem' && <div className="size-2 rounded-full bg-white"></div>}
              </div>
            </div>
            <div className={`text-xs ${selectedDeployment === 'on_prem' ? 'text-[var(--brand-primary)]/80' : 'text-[var(--text-secondary)]'}`}>
              Kubernetes self-host, 16-core minimum, air-gapped option
            </div>
          </div>
        </div>
      </div>

      {/* India Data Residency */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 text-[var(--text-primary)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-[var(--status-success)]" />
            <h3 className="font-medium text-[var(--text-primary)]">India Data Residency</h3>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadDataResidencyTemplate}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2"
              >
                <Download className="size-4" />
                Template
              </button>
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2"
              >
                <Upload className="size-4" />
                Import CSV
              </button>
              <button
                type="button"
                onClick={openResidencyAdd}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2"
              >
                <Plus className="size-4" />
                Add category
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCsvFileSelected(file);
                }}
              />
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Data Category</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Storage Region</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Cross-border?</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Legal Basis</th>
              </tr>
            </thead>
            <tbody>
              {residencyRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-[var(--text-secondary)]">
                    No data categories defined yet.
                  </td>
                </tr>
              )}
              {residencyPager.slice.map((row, sliceIndex) => {
                const index = residencyPager.page * residencyPager.pageSize + sliceIndex;
                return (
                <tr
                  key={index}
                  onClick={() => (canEdit ? openResidencyEdit(index) : undefined)}
                  className={`border-b border-[var(--border-default)] ${canEdit ? 'hover:bg-[var(--surface-raised)] cursor-pointer' : ''}`}
                >
                  <td className="py-3 px-4 text-sm text-[var(--text-primary)]">{row.category}</td>
                  <td className="py-3 px-4 text-sm font-mono text-[var(--text-secondary)]">{row.region || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs ${
                      row.cross_border ? 'bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info)]/20' : 'bg-[var(--status-success-bg)] text-[var(--status-success)] border border-[var(--status-success)]/20'
                    }`}>
                      {row.cross_border ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{row.legal_basis || '—'}</td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        <TablePager
          page={residencyPager.page}
          pageCount={residencyPager.pageCount}
          total={residencyPager.total}
          pageSize={residencyPager.pageSize}
          onPage={residencyPager.setPage}
        />
      </div>

      {/* Change Deployment Modal */}
      {showChangeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-2xl w-full text-[var(--text-primary)]">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-primary)]">Change Deployment Model</h2>
              <button onClick={() => setShowChangeModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[var(--status-warning-bg)] border border-[var(--status-warning)]/30 rounded-lg p-4">
                <div className="text-sm text-[var(--text-primary)]">
                  <strong>Note:</strong> In production, changing deployment model may require data migration and downtime. This updates your recorded configuration.
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Deployment Model</label>
                <select
                  value={modalModel}
                  onChange={(e) => setModalModel(e.target.value as DeploymentModel)}
                  className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  {DEPLOYMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[var(--surface-card)] text-[var(--text-primary)]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Primary Region</label>
                <select
                  value={modalPrimaryRegion}
                  onChange={(e) => setModalPrimaryRegion(e.target.value)}
                  className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  {REGION_OPTIONS.map((r) => (
                    <option key={r} value={r} className="bg-[var(--surface-card)] text-[var(--text-primary)]">{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Backup Region</label>
                <select
                  value={modalBackupRegion}
                  onChange={(e) => setModalBackupRegion(e.target.value)}
                  className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  {REGION_OPTIONS.map((r) => (
                    <option key={r} value={r} className="bg-[var(--surface-card)] text-[var(--text-primary)]">{r}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  disabled={saving}
                  onClick={() => void saveChangeModal()}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save deployment'}
                </button>
                <button onClick={() => setShowChangeModal(false)} className="px-4 py-2 border border-[var(--border-strong)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)] bg-transparent">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Residency Editor Modal */}
      {residencyOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-2xl w-full text-[var(--text-primary)]">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-primary)]">
                {residencyEditIndex === null ? 'Add Data Category' : 'Edit Data Category'}
              </h2>
              <button onClick={() => setResidencyOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Data Category *</label>
                <input
                  value={residencyDraft.category}
                  onChange={(e) => setResidencyDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  placeholder="e.g. Consent records"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Storage Region</label>
                <input
                  value={residencyDraft.region}
                  onChange={(e) => setResidencyDraft((d) => ({ ...d, region: e.target.value }))}
                  className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  placeholder="e.g. Mumbai"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={residencyDraft.cross_border}
                  onChange={(e) => setResidencyDraft((d) => ({ ...d, cross_border: e.target.checked }))}
                  className="rounded border-[var(--border-default)]"
                />
                Cross-border transfer
              </label>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Legal Basis</label>
                <input
                  value={residencyDraft.legal_basis}
                  onChange={(e) => setResidencyDraft((d) => ({ ...d, legal_basis: e.target.value }))}
                  className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  placeholder="e.g. Anonymized only"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Details</label>
                <textarea
                  value={residencyDraft.details}
                  onChange={(e) => setResidencyDraft((d) => ({ ...d, details: e.target.value }))}
                  className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 text-sm h-20 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  disabled={saving}
                  onClick={() => void saveResidency()}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {residencyEditIndex !== null && (
                  <button
                    disabled={saving}
                    onClick={() => void deleteResidency()}
                    className="px-4 py-2 border border-red-300 text-red-700 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </button>
                )}
                <button onClick={() => setResidencyOpen(false)} className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Preview Modal */}
      {importPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col text-[var(--text-primary)]">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="font-semibold">Import data residency from CSV</h2>
              <button
                type="button"
                onClick={() => setImportPreviewOpen(false)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                {importPreviewRows.length} row{importPreviewRows.length === 1 ? '' : 's'} will be
                added to your existing categories.
              </p>
              {importPreviewErrors.length > 0 && (
                <div className="rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-3 text-xs text-[var(--text-secondary)] space-y-1">
                  {importPreviewErrors.slice(0, 5).map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                  {importPreviewErrors.length > 5 && (
                    <p>…and {importPreviewErrors.length - 5} more warnings</p>
                  )}
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                      <th className="text-left py-2 px-3 font-medium">Data Category</th>
                      <th className="text-left py-2 px-3 font-medium">Storage Region</th>
                      <th className="text-left py-2 px-3 font-medium">Cross-border?</th>
                      <th className="text-left py-2 px-3 font-medium">Legal Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewPager.slice.map((row, index) => (
                      <tr key={`${row.category}-${importPreviewPager.page}-${index}`} className="border-b border-[var(--border-default)]">
                        <td className="py-2 px-3">{row.category}</td>
                        <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">{row.region || '—'}</td>
                        <td className="py-2 px-3">{row.cross_border ? 'Yes' : 'No'}</td>
                        <td className="py-2 px-3 text-[var(--text-secondary)]">{row.legal_basis || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TablePager
                  page={importPreviewPager.page}
                  pageCount={importPreviewPager.pageCount}
                  total={importPreviewPager.total}
                  pageSize={importPreviewPager.pageSize}
                  onPage={importPreviewPager.setPage}
                />
              </div>
            </div>
            <div className="border-t border-[var(--border-default)] px-6 py-4 flex gap-3 shrink-0">
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmCsvImport()}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? 'Importing…' : `Import ${importPreviewRows.length} rows`}
              </button>
              <button
                type="button"
                onClick={() => setImportPreviewOpen(false)}
                className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
    </WorkspaceSettingsGate>
  );
}
