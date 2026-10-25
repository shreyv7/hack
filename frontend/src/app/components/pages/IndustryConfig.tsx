import { SectionReference } from '@/app/components/common/SectionReference';
import { WorkspaceEvidenceExportButtons } from '@/app/components/pages/WorkspaceEvidenceExportButtons';
import { WorkspaceSettingsGate } from '@/app/components/pages/WorkspaceSettingsGate';
import { Building2, CheckSquare, AlertTriangle, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { notify } from '@/app/utils/notify';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { ApiError } from '@/lib/api/client';
import { isSignificantDataFiduciary } from '@/lib/workspace/sdfStatus';

/**
 * Industry-specific DPDPA configuration presets and templates.
 */
const INDUSTRY_OPTIONS = [
  'Banking & Financial Services',
  'Healthcare & Pharmaceuticals',
  'E-commerce & Retail',
  'Technology & Software',
  'Telecommunications',
  'Education',
  'Government & Public Sector',
  'Insurance',
  'Other',
];

// Relevant secondary sectors per primary industry, so the checkboxes match the
// chosen industry instead of always showing banking sub-sectors.
const SECTORS_BY_INDUSTRY: Record<string, string[]> = {
  'Banking & Financial Services': ['Insurance', 'Fintech', 'Lending', 'NBFC', 'Wealth Management', 'Asset Management'],
  'Healthcare & Pharmaceuticals': ['Hospitals', 'Diagnostics', 'Pharma', 'Telemedicine', 'Health Insurance', 'Medical Devices'],
  'E-commerce & Retail': ['Marketplace', 'D2C', 'Logistics', 'Payments', 'Advertising', 'Loyalty Programs'],
  'Technology & Software': ['SaaS', 'Cloud Infrastructure', 'AI/ML', 'Cybersecurity', 'DevTools', 'Analytics'],
  'Telecommunications': ['Mobile', 'Broadband', 'Enterprise Connectivity', 'IoT', 'Value-Added Services'],
  'Education': ['EdTech', 'K-12', 'Higher Education', 'Test Prep', 'Corporate Training'],
  'Government & Public Sector': ['e-Governance', 'Public Health', 'Utilities', 'Transport', 'Welfare Schemes'],
  'Insurance': ['Life', 'Health', 'General', 'Reinsurance', 'InsurTech'],
};

const GENERIC_SECTORS = ['Marketing', 'Analytics', 'Customer Support', 'HR', 'Payments', 'Logistics'];

export function IndustryConfig(): ReactElement {
  const {
    settings,
    loading,
    error,
    hasOrg,
    canEdit,
    saveIndustry,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    exportEvidencePack,
    exportFullEvidencePack,
    canExport,
  } = useWorkspaceSettings();
  const [primaryIndustry, setPrimaryIndustry] = useState('Banking & Financial Services');
  const [secondarySectors, setSecondarySectors] = useState<string[]>([]);
  const [showSDFModal, setShowSDFModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setPrimaryIndustry(settings.primary_industry ?? 'Other');
    setSecondarySectors(settings.secondary_industries ?? []);
  }, [settings]);

  const persistIndustry = async (patch: {
    primary_industry?: string;
    secondary_industries?: string[];
    is_significant_data_fiduciary?: boolean;
  }) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await saveIndustry(patch);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save industry settings');
    } finally {
      setSaving(false);
    }
  };

  const sectors = SECTORS_BY_INDUSTRY[primaryIndustry] ?? GENERIC_SECTORS;
  const isSdf = settings ? isSignificantDataFiduciary(settings) : false;

  const handleUnmarkSdf = async (): Promise<void> => {
    if (
      !window.confirm(
        'Remove Significant Data Fiduciary designation? Your organization will no longer be tracked as an SDF in this workspace.'
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await saveIndustry({ is_significant_data_fiduciary: false });
      notify('SDF designation removed.');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to remove SDF designation');
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
    <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
      {!canEdit && (
        <p className="text-xs text-[var(--text-secondary)] mb-4">Read-only — contact your org admin to edit.</p>
      )}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1>Industry Configuration</h1>
          <WorkspaceEvidenceExportButtons
            section="industry"
            onExportSection={exportEvidencePack}
            onExportFull={exportFullEvidencePack}
            disabled={!canExport}
          />
        </div>
        <SectionReference section="DPDPA Section 10 — Significant Data Fiduciary" />
      </div>

      {/* Primary Industry */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="size-5 text-[var(--brand-primary)]" />
          <h3 className="font-medium text-[var(--text-primary)]">Primary Industry</h3>
        </div>

        <div className="mb-4">
          <label className="text-sm text-[var(--text-secondary)] mb-2 block">Select your primary industry</label>
          <select
            value={primaryIndustry}
            disabled={!canEdit || saving}
            onChange={(e) => {
              const v = e.target.value;
              setPrimaryIndustry(v);
              void persistIndustry({ primary_industry: v });
              notify(`Primary industry updated to: ${v}`);
            }}
            className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)] disabled:opacity-60"
          >
            {INDUSTRY_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--status-info-bg)] text-[var(--status-info)] text-sm">
          <CheckSquare className="size-4" />
          <span>{primaryIndustry.split(' ')[0]}-preferred compliance templates enabled</span>
        </div>
        {primaryIndustry === 'Banking & Financial Services' && (
          <div className="mt-3 p-3 rounded-md border border-[var(--brand-primary)]/30 bg-[var(--surface-raised)] text-sm space-y-2">
            <p>
              <strong>Advanced Consent Management enabled.</strong> Configure multi-identifier consent mapping, journey
              rules, assisted capture, and the customer registry.
            </p>
            <div className="flex flex-wrap gap-3 text-[var(--brand-primary)]">
              <Link to="/consent/banking/identifiers" className="hover:underline">
                Open Advanced Consent Management
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Secondary Sectors */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 mb-6">
        <h3 className="font-medium mb-4 text-[var(--text-primary)]">Secondary Sectors</h3>

        <div className="grid grid-cols-3 gap-3">
          {sectors.map((sector) => (
            <label
              key={sector}
              className="flex items-center gap-2 p-3 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] cursor-pointer transition-colors text-[var(--text-primary)]"
            >
              <input
                type="checkbox"
                className="rounded border-[var(--border-default)]"
                disabled={!canEdit || saving}
                checked={secondarySectors.includes(sector)}
                onChange={() => {
                  const next = secondarySectors.includes(sector)
                    ? secondarySectors.filter((s) => s !== sector)
                    : [...secondarySectors, sector];
                  setSecondarySectors(next);
                  void persistIndustry({ secondary_industries: next });
                }}
              />
              <span className="text-sm">{sector}</span>
            </label>
          ))}
        </div>
      </div>

      {/* SDF Eligibility */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--status-warning)] p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-6 text-[var(--status-warning)] mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium mb-2 text-[var(--text-primary)]">Significant Data Fiduciary (SDF) Eligibility</h3>
            <div className="text-sm text-[var(--text-secondary)] mb-3">
              DPDPA Section 10 — Organizations processing large volumes of personal data or certain categories
              may be designated as Significant Data Fiduciaries with additional obligations.
            </div>
            {isSdf ? (
              <span className="inline-block mb-3 px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 text-xs font-medium">
                Marked as Significant Data Fiduciary
              </span>
            ) : (
              <span className="inline-block mb-3 px-2 py-1 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs font-medium border border-[var(--border-default)]">
                Not designated as SDF
              </span>
            )}
            <div className="flex items-center gap-4 mb-4">
              <div className="text-sm text-[var(--text-secondary)]">
                <span>Data Principals:</span>
                <span className="font-medium ml-2 text-[var(--text-primary)]">
                  {settings?.data_principals_count_band ?? 'Not set'}
                </span>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                <span>Recommended for:</span>
                <span className="font-medium ml-2 text-[var(--text-primary)]">Banking, Healthcare, Large E-commerce</span>
              </div>
            </div>
            {canEdit && (
              isSdf ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleUnmarkSdf()}
                  className="px-4 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm font-medium disabled:opacity-50"
                >
                  Remove SDF designation
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSDFModal(true)}
                  className="px-4 py-2 rounded-md bg-yellow-600 text-white hover:bg-yellow-700 text-sm font-medium"
                >
                  Mark as Significant Data Fiduciary →
                </button>
              )
            )}
          </div>
        </div>
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
                    <CheckSquare className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Mandatory Data Protection Impact Assessment (DPIA) for all high-risk processing</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <CheckSquare className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Appointment of Data Protection Officer (DPO)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <CheckSquare className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Independent data audit at least once every year</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <CheckSquare className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
                    <span>Periodic review of processing activities and risk assessments</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <CheckSquare className="size-4 text-[var(--brand-primary)] mt-0.5 flex-shrink-0" />
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
                    <div className="font-medium">{primaryIndustry}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  disabled={saving}
                  onClick={() => {
                    void (async () => {
                      try {
                        await saveIndustry({ is_significant_data_fiduciary: true });
                        notify(
                          'Organization marked as Significant Data Fiduciary. Additional obligations apply.'
                        );
                        setShowSDFModal(false);
                      } catch (e) {
                        notify(e instanceof ApiError ? e.message : 'Failed to update SDF status');
                      }
                    })();
                  }}
                  className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-medium disabled:opacity-50"
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
    </div>
    </WorkspaceSettingsGate>
  );
}
