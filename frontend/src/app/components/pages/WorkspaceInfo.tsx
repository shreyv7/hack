import { SectionReference } from '@/app/components/common/SectionReference';
import { WorkspaceEvidenceExportButtons } from '@/app/components/pages/WorkspaceEvidenceExportButtons';
import { WorkspaceSettingsGate } from '@/app/components/pages/WorkspaceSettingsGate';
import { Edit, FileCheck, Award, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { notify } from '@/app/utils/notify';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { ApiError } from '@/lib/api/client';
import {
  PLATFORM_COMPLIANCE_CHANGELOG,
  PLATFORM_COMPLIANCE_SUBTITLE,
  PLATFORM_COMPLIANCE_VERSION,
} from '@/lib/workspace/platformComplianceChangelog';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Tenant organization profile, solution overview, and compliance metadata.
 */
export function WorkspaceInfo(): ReactElement {
  const {
    settings,
    loading,
    error,
    hasOrg,
    canEdit,
    saveProfile,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    exportEvidencePack,
    exportFullEvidencePack,
    canExport,
  } = useWorkspaceSettings();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditSolution, setShowEditSolution] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [showAuditDetails, setShowAuditDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  const [orgName, setOrgName] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [headquarters, setHeadquarters] = useState('');
  const [indiaPresence, setIndiaPresence] = useState('');
  const [solutionDescription, setSolutionDescription] = useState('');

  useEffect(() => {
    if (!settings) return;
    setOrgName(settings.organization.name);
    setRegisteredAddress(settings.registered_address ?? '');
    setHeadquarters(settings.headquarters ?? '');
    setIndiaPresence(settings.india_presence ?? '');
    setSolutionDescription(settings.solution_description ?? '');
  }, [settings]);

  const handleSaveProfile = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await saveProfile({
        org_name: orgName,
        registered_address: registeredAddress || null,
        headquarters: headquarters || null,
        india_presence: indiaPresence || null,
      });
      notify('Organization profile updated');
      setShowEditProfile(false);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSolution = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await saveProfile({ solution_description: solutionDescription || null });
      notify('Solution description updated');
      setShowEditSolution(false);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
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
      {settings && (
        <div className="p-8 max-w-[1280px] mx-auto">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1>{settings.organization.name}</h1>
              {!canEdit && (
                <span className="text-xs text-[var(--text-secondary)]">Read-only</span>
              )}
              <WorkspaceEvidenceExportButtons
                section="profile"
                onExportSection={exportEvidencePack}
                onExportFull={exportFullEvidencePack}
                disabled={!canExport}
              />
            </div>
            <SectionReference section="DPDPA 2023 — Profile & Solution Overview" />
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 text-[var(--text-primary)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-[var(--text-primary)]">Organization Profile</h3>
                {canEdit && (
                  <button
                    onClick={() => setShowEditProfile(true)}
                    className="p-1 hover:bg-[var(--surface-raised)] rounded text-[var(--text-secondary)]"
                  >
                    <Edit className="size-4" />
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Registered address</div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {settings.registered_address || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Headquarters</div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {settings.headquarters || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-1">India presence</div>
                  <div className="text-sm text-[var(--text-primary)] whitespace-pre-line">
                    {settings.india_presence || '—'}
                  </div>
                </div>
                {settings.dpo_name && (
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-1">Data Protection Officer</div>
                    <div className="text-sm text-[var(--text-primary)]">
                      {settings.dpo_name}
                      {settings.dpo_email ? ` · ${settings.dpo_email}` : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 text-[var(--text-primary)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-[var(--text-primary)]">Solution Description</h3>
                {canEdit && (
                  <button
                    onClick={() => setShowEditSolution(true)}
                    className="p-1 hover:bg-[var(--surface-raised)] rounded text-[var(--text-secondary)]"
                  >
                    <Edit className="size-4" />
                  </button>
                )}
              </div>
              <div className="text-sm text-[var(--text-primary)] leading-relaxed">
                {settings.solution_description ||
                  'Add a description of your DPDPA compliance solution and processing scope.'}
              </div>
            </div>

            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 text-[var(--text-primary)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-[var(--text-primary)]">DPDP Adoption Status</h3>
                <FileCheck className="size-5 text-[var(--status-success)]" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded-md bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs font-medium border border-[var(--status-success)]/20">
                    {settings.compliance_version || PLATFORM_COMPLIANCE_VERSION}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {settings.changelog_summary || PLATFORM_COMPLIANCE_SUBTITLE}
                </div>
                <button
                  onClick={() => setShowChangelogModal(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 underline block"
                >
                  View changelog
                </button>
                <div className="pt-3 border-t border-[var(--border-default)] space-y-2">
                  {settings.self_attested_at && (
                    <button
                      onClick={() => setShowAuditDetails(true)}
                      className="flex items-center gap-2 text-sm hover:bg-[var(--surface-raised)] w-full p-1 -m-1 rounded text-[var(--text-primary)]"
                    >
                      <Award className="size-4 text-indigo-600 dark:text-indigo-400" />
                      <span>DPDPA Self-Attested</span>
                    </button>
                  )}
                  {settings.third_party_audit_firm && (
                    <button
                      onClick={() => setShowAuditDetails(true)}
                      className="flex items-center gap-2 text-sm hover:bg-[var(--surface-raised)] w-full p-1 -m-1 rounded text-[var(--text-primary)]"
                    >
                      <Award className="size-4 text-[var(--status-success)]" />
                      <span>Third-party Audited</span>
                    </button>
                  )}
                  {settings.audit_valid_until && (
                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                      Valid until {formatDate(settings.audit_valid_until)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {showEditProfile && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-2xl w-full text-[var(--text-primary)]">
                <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
                  <h2 className="font-semibold">Edit organization profile</h2>
                  <button onClick={() => setShowEditProfile(false)} className="text-[var(--text-tertiary)]">
                    <X className="size-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Organization name</label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Registered address</label>
                    <textarea
                      value={registeredAddress}
                      onChange={(e) => setRegisteredAddress(e.target.value)}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md px-3 py-2 h-20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Headquarters</label>
                    <input
                      type="text"
                      value={headquarters}
                      onChange={(e) => setHeadquarters(e.target.value)}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">India presence</label>
                    <textarea
                      value={indiaPresence}
                      onChange={(e) => setIndiaPresence(e.target.value)}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md px-3 py-2 h-20"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      disabled={saving}
                      onClick={() => void handleSaveProfile()}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Save changes
                    </button>
                    <button
                      onClick={() => setShowEditProfile(false)}
                      className="px-4 py-2 border border-[var(--border-strong)] rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showEditSolution && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-2xl w-full text-[var(--text-primary)]">
                <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
                  <h2 className="font-semibold">Edit solution description</h2>
                  <button onClick={() => setShowEditSolution(false)}>
                    <X className="size-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <textarea
                    value={solutionDescription}
                    onChange={(e) => setSolutionDescription(e.target.value)}
                    className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md px-3 py-2 h-32"
                  />
                  <div className="flex gap-3 pt-4">
                    <button
                      disabled={saving}
                      onClick={() => void handleSaveSolution()}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Save changes
                    </button>
                    <button onClick={() => setShowEditSolution(false)} className="px-4 py-2 border rounded-md">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showChangelogModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-[var(--surface-card)] border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
                  <h2 className="font-semibold">DPDPA Compliance Changelog</h2>
                  <button onClick={() => setShowChangelogModal(false)}>
                    <X className="size-5" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {settings.changelog_summary && (
                    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-4">
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">
                        Workspace note
                      </div>
                      <p className="text-sm text-[var(--text-primary)] whitespace-pre-line">
                        {settings.changelog_summary}
                      </p>
                    </div>
                  )}
                  {PLATFORM_COMPLIANCE_CHANGELOG.map((entry, index) => (
                    <div key={entry.version}>
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className={
                            index === 0
                              ? 'px-2 py-1 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs font-medium'
                              : 'px-2 py-1 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs font-medium'
                          }
                        >
                          {entry.version}
                        </span>
                        <span className="text-sm text-[var(--text-secondary)]">{entry.date}</span>
                      </div>
                      <h3 className="font-medium mb-2 text-[var(--text-primary)]">{entry.title}</h3>
                      <ul className="list-disc list-inside space-y-1 text-sm text-[var(--text-secondary)]">
                        {entry.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showAuditDetails && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-3xl w-full p-6 space-y-4">
                <div className="flex justify-between">
                  <h2 className="font-semibold">Audit & certification</h2>
                  <button onClick={() => setShowAuditDetails(false)}>
                    <X className="size-5" />
                  </button>
                </div>
                {settings.self_attested_at && (
                  <div className="text-sm">
                    <strong>Self-attested:</strong> {formatDate(settings.self_attested_at)}
                    {settings.dpo_name ? ` · ${settings.dpo_name}` : ''}
                  </div>
                )}
                {settings.third_party_audit_firm && (
                  <div className="text-sm">
                    <strong>Audit firm:</strong> {settings.third_party_audit_firm}
                    {settings.audit_valid_until
                      ? ` · valid until ${formatDate(settings.audit_valid_until)}`
                      : ''}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </WorkspaceSettingsGate>
  );
}
