import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Baby,
  Check,
  FileCheck,
  Loader2,
  Code2,
  Copy,
  FileText,
  Mail,
  MailPlus,
  MessageSquare,
  Plus,
  RefreshCw,
  ScanSearch,
  Settings,
  Shield,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';
import { cn } from '@/lib/utils';
import {
  autoDetectChildren,
  checkEnforcement,
  createChildRecord,
  deleteChildRecord,
  fetchChildApiInfo,
  fetchChildRecords,
  fetchChildSummary,
  fetchConsentEvidence,
  previewBulkConsent,
  recordParentalConsent,
  requestBulkConsent,
  requestParentalConsent,
  runChildMaintenance,
} from '@/lib/api/childData';
import { fetchDataSources } from '@/lib/api/dataSources';
import type {
  BulkConsentPreview,
  ChildApiInfo,
  ChildConsentStatus,
  ConsentEvidence,
  ChildDataSummary,
  ChildRecord,
  ChildRecordCreate,
  EnforcementDecision,
  RecordParentalConsent,
  RequestParentalConsentBody,
  RestrictedPurpose as EnforcePurpose,
} from '@/types/childData';
import type { DataSource } from '@/types/dataSource';
import { isScannableSource } from '@/types/dataSource';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

function consentStatusClass(status: ChildConsentStatus): string {
  if (status === 'verified') return 'bg-green-100 text-green-700';
  if (status === 'pending') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

interface RestrictedPurpose {
  purpose: string;
  status: 'blocked' | 'conditional';
  note: string;
}

interface WorkflowStep {
  label: string;
  icon: LucideIcon;
}

// The three purposes the Enforcement Decision API actually evaluates (DPDPA s.9).
const RESTRICTED_PURPOSES: RestrictedPurpose[] = [
  { purpose: 'Targeted advertising', status: 'blocked', note: 'Never allowed for a minor — s.9(3)' },
  { purpose: 'Behavioural profiling / tracking', status: 'blocked', note: 'Never allowed for a minor — s.9(3)' },
  { purpose: 'Processing personal data', status: 'conditional', note: 'Allowed only with verified parental consent — s.9(1)' },
];

// The real consent lifecycle this module implements.
const WORKFLOW_STEPS: WorkflowStep[] = [
  { label: 'Detect / add minor', icon: Baby },
  { label: 'Request consent', icon: Mail },
  { label: 'Parent reviews', icon: MessageSquare },
  { label: 'Parent grants', icon: Video },
  { label: 'Verified', icon: FileCheck },
  { label: 'Enforced via API', icon: Shield },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RecordForm {
  child_ref: string;
  age: string;
  date_of_birth: string;
  detection_method: string;
  consent_status: ChildConsentStatus;
  profiling_blocked: boolean;
  ad_targeting_blocked: boolean;
}

const EMPTY_RECORD_FORM: RecordForm = {
  child_ref: '',
  age: '',
  date_of_birth: '',
  detection_method: 'DOB input',
  consent_status: 'missing',
  profiling_blocked: true,
  ad_targeting_blocked: true,
};

interface ConsentForm {
  parent_name: string;
  parent_email: string;
  parent_relationship: string;
  verification_method: string;
  expires_at: string;
}

const EMPTY_CONSENT_FORM: ConsentForm = {
  parent_name: '',
  parent_email: '',
  parent_relationship: '',
  verification_method: 'DigiLocker (Aadhaar)',
  expires_at: '',
};

interface RequestForm {
  parent_email: string;
  parent_name: string;
  parent_relationship: string;
  purpose_note: string;
  consent_validity_days: string;
  link_expiry_days: string;
}

const EMPTY_REQUEST_FORM: RequestForm = {
  parent_email: '',
  parent_name: '',
  parent_relationship: '',
  purpose_note: '',
  consent_validity_days: '365',
  link_expiry_days: '14',
};

interface BulkForm {
  purpose_note: string;
  consent_validity_days: string;
  link_expiry_days: string;
}

const EMPTY_BULK_FORM: BulkForm = {
  purpose_note: '',
  consent_validity_days: '365',
  link_expiry_days: '14',
};

/**
 * Children's data compliance hub (DPDPA Section 9). The summary stats and the
 * detected-records table are wired to the /childrens-data API; the age-method,
 * restricted-purpose and workflow panels are reference presentation.
 */
export function ChildrensData(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const [summary, setSummary] = useState<ChildDataSummary | null>(null);
  const [records, setRecords] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [recordForm, setRecordForm] = useState<RecordForm>(EMPTY_RECORD_FORM);
  const [saving, setSaving] = useState(false);

  const [consentTarget, setConsentTarget] = useState<ChildRecord | null>(null);
  const [consentForm, setConsentForm] = useState<ConsentForm>(EMPTY_CONSENT_FORM);
  const [savingConsent, setSavingConsent] = useState(false);

  const [requestTarget, setRequestTarget] = useState<ChildRecord | null>(null);
  const [requestForm, setRequestForm] = useState<RequestForm>(EMPTY_REQUEST_FORM);
  const [requesting, setRequesting] = useState(false);

  const [maintaining, setMaintaining] = useState(false);

  const [showDetectModal, setShowDetectModal] = useState(false);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [detectSourceId, setDetectSourceId] = useState('');
  const [detectTable, setDetectTable] = useState('');
  const [detectDobColumn, setDetectDobColumn] = useState('');
  const [detectEmailColumn, setDetectEmailColumn] = useState('');
  const [detecting, setDetecting] = useState(false);

  const [evidenceTarget, setEvidenceTarget] = useState<ChildRecord | null>(null);

  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkForm>(EMPTY_BULK_FORM);
  const [bulkPreview, setBulkPreview] = useState<BulkConsentPreview | null>(null);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const [enforceRef, setEnforceRef] = useState('');
  const [enforcePurpose, setEnforcePurpose] = useState<EnforcePurpose>('ad_targeting');
  const [enforceResult, setEnforceResult] = useState<EnforcementDecision | null>(null);
  const [enforcing, setEnforcing] = useState(false);

  const runEnforcement = async () => {
    if (!enforceRef.trim()) {
      notify('Enter a subject reference (external id or child ref).');
      return;
    }
    setEnforcing(true);
    setEnforceResult(null);
    try {
      setEnforceResult(await checkEnforcement(enforceRef.trim(), enforcePurpose, orgId));
    } catch (error) {
      notify(`Check failed: ${(error as Error).message}`);
    } finally {
      setEnforcing(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([fetchChildSummary(orgId), fetchChildRecords(orgId)]);
      setSummary(s);
      setRecords(r);
      window.dispatchEvent(new CustomEvent('child-records-updated'));
    } catch (error) {
      notify(`Failed to load children's data: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    fetchDataSources(orgId).then(setSources).catch(() => setSources([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAutoDetect = async () => {
    if (!detectSourceId) {
      notify('Select a data source.');
      return;
    }
    setDetecting(true);
    try {
      const result = await autoDetectChildren(
        detectSourceId,
        {
          table: detectTable || undefined,
          dobColumn: detectDobColumn || undefined,
          parentEmailColumn: detectEmailColumn || undefined,
        },
        orgId,
      );
      notify(result.message);
      setShowDetectModal(false);
      setDetectTable('');
      setDetectDobColumn('');
      setDetectEmailColumn('');
      await load();
    } catch (error) {
      notify(`Auto-detect failed: ${(error as Error).message}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleAdd = async () => {
    if (!recordForm.age && !recordForm.date_of_birth) {
      notify('Provide a date of birth or an age.');
      return;
    }
    setSaving(true);
    try {
      const payload: ChildRecordCreate = {
        child_ref: recordForm.child_ref || null,
        age: recordForm.age ? Number(recordForm.age) : null,
        date_of_birth: recordForm.date_of_birth || null,
        detection_method: recordForm.detection_method || null,
        consent_status: recordForm.consent_status,
        profiling_blocked: recordForm.profiling_blocked,
        ad_targeting_blocked: recordForm.ad_targeting_blocked,
      };
      await createChildRecord(payload, orgId);
      notify('Child record added.');
      setShowAddModal(false);
      setRecordForm(EMPTY_RECORD_FORM);
      await load();
    } catch (error) {
      notify(`Failed to add record: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const openConsent = (record: ChildRecord) => {
    setConsentTarget(record);
    setConsentForm({
      ...EMPTY_CONSENT_FORM,
      parent_name: record.parent_name ?? '',
      parent_email: record.parent_email ?? '',
      parent_relationship: record.parent_relationship ?? '',
    });
  };

  const handleRecordConsent = async () => {
    if (!consentTarget) return;
    if (!consentForm.parent_name.trim() || !consentForm.verification_method.trim()) {
      notify('Parent name and verification method are required.');
      return;
    }
    setSavingConsent(true);
    try {
      const payload: RecordParentalConsent = {
        parent_name: consentForm.parent_name,
        parent_email: consentForm.parent_email || null,
        parent_relationship: consentForm.parent_relationship || null,
        verification_method: consentForm.verification_method,
        expires_at: consentForm.expires_at ? new Date(consentForm.expires_at).toISOString() : null,
      };
      await recordParentalConsent(consentTarget.id, payload, orgId);
      notify('Verifiable parental consent recorded.');
      setConsentTarget(null);
      await load();
    } catch (error) {
      notify(`Failed to record consent: ${(error as Error).message}`);
    } finally {
      setSavingConsent(false);
    }
  };

  const handleMaintenance = async () => {
    setMaintaining(true);
    try {
      const result = await runChildMaintenance(orgId);
      notify(result.message);
      await load();
    } catch (error) {
      notify(`Lifecycle checks failed: ${(error as Error).message}`);
    } finally {
      setMaintaining(false);
    }
  };

  const openRequest = (record: ChildRecord) => {
    setRequestTarget(record);
    setRequestForm({
      ...EMPTY_REQUEST_FORM,
      parent_email: record.parent_email ?? '',
      parent_name: record.parent_name ?? '',
      parent_relationship: record.parent_relationship ?? '',
    });
  };

  const handleRequestConsent = async () => {
    if (!requestTarget) return;
    if (!requestForm.parent_email.trim()) {
      notify("Enter the parent's email address.");
      return;
    }
    setRequesting(true);
    try {
      const payload: RequestParentalConsentBody = {
        parent_email: requestForm.parent_email.trim(),
        parent_name: requestForm.parent_name || null,
        parent_relationship: requestForm.parent_relationship || null,
        purpose_note: requestForm.purpose_note || null,
        consent_validity_days: Number(requestForm.consent_validity_days) || 365,
        link_expiry_days: Number(requestForm.link_expiry_days) || 14,
      };
      const result = await requestParentalConsent(requestTarget.id, payload, orgId);
      notify(result.message);
      setRequestTarget(null);
      await load();
    } catch (error) {
      notify(`Failed to send request: ${(error as Error).message}`);
    } finally {
      setRequesting(false);
    }
  };

  const openBulk = () => {
    if (selectedRecordIds.size === 0) {
      notify('Select one or more records first.');
      return;
    }
    setBulkForm(EMPTY_BULK_FORM);
    setBulkPreview(null);
    setShowBulkModal(true);
  };

  // Dry-run preview for the currently selected records.
  useEffect(() => {
    if (!showBulkModal) return;
    const ids = [...selectedRecordIds];
    if (ids.length === 0) {
      setBulkPreview(null);
      return;
    }
    let cancelled = false;
    setBulkPreviewLoading(true);
    previewBulkConsent({ record_ids: ids }, orgId)
      .then((p) => {
        if (!cancelled) setBulkPreview(p);
      })
      .catch(() => {
        if (!cancelled) setBulkPreview(null);
      })
      .finally(() => {
        if (!cancelled) setBulkPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBulkModal]);

  const handleBulkSend = async () => {
    const ids = [...selectedRecordIds];
    if (ids.length === 0) {
      notify('Select one or more records first.');
      return;
    }
    setBulkSending(true);
    try {
      const result = await requestBulkConsent(
        {
          record_ids: ids,
          purpose_note: bulkForm.purpose_note || null,
          consent_validity_days: Number(bulkForm.consent_validity_days) || 365,
          link_expiry_days: Number(bulkForm.link_expiry_days) || 14,
        },
        orgId,
      );
      notify(result.message);
      setShowBulkModal(false);
      setSelectedRecordIds(new Set());
      await load();
    } catch (error) {
      notify(`Bulk request failed: ${(error as Error).message}`);
    } finally {
      setBulkSending(false);
    }
  };

  // Selection helpers — only records that still need consent (not aged-out, not verified).
  const selectableRecords = records.filter((r) => !r.aged_out_at && r.consent_status !== 'verified');
  const allSelectableSelected =
    selectableRecords.length > 0 && selectableRecords.every((r) => selectedRecordIds.has(r.id));

  const toggleSelectAllRecords = () => {
    setSelectedRecordIds(
      allSelectableSelected ? new Set() : new Set(selectableRecords.map((r) => r.id)),
    );
  };

  const toggleRecord = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (record: ChildRecord) => {
    if (!window.confirm(`Delete child record "${record.child_ref}"?`)) return;
    try {
      await deleteChildRecord(record.id, orgId);
      notify(`Deleted "${record.child_ref}".`);
      await load();
    } catch (error) {
      notify(`Failed to delete: ${(error as Error).message}`);
    }
  };

  const {
    page: recordsPage,
    setPage: setRecordsPage,
    pageCount: recordsPageCount,
    pageItems: recordsPageItems,
    total: recordsTotal,
    pageSize: recordsPageSize,
  } = useClientPagination(records, TABLE_PAGE_SIZE, orgId);

  return (
    <div className="min-h-screen p-8 bg-[var(--surface-base)]">
      <div className="max-w-[1280px] mx-auto">
        <div className="mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="mb-2 text-3xl font-semibold">Children&apos;s Data</h1>
              <p className="text-sm mb-3 text-[var(--text-secondary)]">
                DPDPA Section 9 compliance: age verification, verifiable parental consent, restricted processing
              </p>
              <div className="flex items-center gap-3">
                <DPDPAChip
                  sections={{
                    chapter: 2,
                    section: 9,
                    name: "Processing of children's data",
                    url: '/dpdpa2023/chapter-2/section9.html',
                    excerpt: 'Verifiable parental consent required...',
                  }}
                  size="detailed"
                />
                <PenaltyChip amount={200} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMaintenance}
                disabled={maintaining}
                title="Re-detect minors, age out 18+, and expire lapsed consents"
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-50"
              >
                {maintaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" strokeWidth={1.5} />}
                Run lifecycle checks
              </button>
              <button
                type="button"
                onClick={() => setShowDetectModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]"
              >
                <ScanSearch className="w-4 h-4" strokeWidth={1.5} />
                Auto-detect from source
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)]"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Add child record
              </button>
            </div>
          </div>
        </div>

        {/* Risk banner driven by summary */}
        {summary && summary.total_records > 0 && (
          <div className="p-6 rounded-lg border mb-6 bg-gradient-to-br from-[var(--status-warning-bg)] to-[var(--status-danger-bg)] border-[var(--status-warning)]">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-8 h-8 flex-shrink-0 text-[var(--status-danger)]" strokeWidth={1.5} />
              <div className="flex-1">
                <h2 className="mb-2 text-[var(--status-danger)]">
                  {summary.total_records} children records in your user base
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-[var(--status-success)]" strokeWidth={2} />
                    <span className="text-sm text-[var(--text-primary)]">
                      {summary.verified_consent} with verified parental consent
                    </span>
                  </div>
                  {summary.without_consent > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-[var(--status-danger)]" strokeWidth={2} />
                      <span className="text-sm font-medium text-[var(--status-danger)]">
                        {summary.without_consent} without verified consent — HIGH RISK DPDPA violation (₹200 Cr per case)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary stat cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { value: String(summary?.total_records ?? 0), label: 'Children records', valueClass: 'text-[var(--text-primary)]' },
            { value: String(summary?.verified_consent ?? 0), label: 'Verified parental consent', valueClass: 'text-[var(--status-success)]' },
            { value: `${summary?.consent_rate ?? 0}%`, label: 'Parental consent rate', valueClass: 'text-[var(--status-success)]' },
            { value: String(summary?.restrictions_active ?? 0), label: 'Records with restrictions', valueClass: 'text-[var(--text-primary)]' },
          ].map((stat) => (
            <div key={stat.label} className="p-4 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
              <div className={cn('text-2xl font-semibold mb-1', stat.valueClass)}>{stat.value}</div>
              <div className="text-sm text-[var(--text-secondary)]">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Reference panels (static): age methods + restricted purposes */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="flex items-center justify-between mb-4">
              <h3>Age Verification Methods <span className="text-xs font-normal text-[var(--text-tertiary)]">(reference)</span></h3>
              <Settings className="w-5 h-5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Recognised ways to verify a parent's age/identity. Verification happens in <em>your</em>{' '}
              flow (e.g. you confirm the parent via DigiLocker, then record it through our API) — we
              store the method used as consent evidence. Age itself is read from the date-of-birth in
              your data.
            </p>
            <div className="space-y-2">
              {[
                { title: 'Self-declaration', detail: 'Low assurance, not DPDPA-compliant' },
                { title: 'Government ID (Aadhaar + DigiLocker)', detail: 'High assurance — recommended' },
                { title: 'Credit card validation', detail: 'Medium assurance' },
                { title: 'Video verification with parent', detail: 'Highest assurance' },
              ].map((method) => (
                <div key={method.title} className="p-3 rounded bg-[var(--surface-raised)]">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{method.title}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{method.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="flex items-center justify-between mb-1">
              <h3>Restricted Purposes</h3>
              <Settings className="w-5 h-5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              What the Enforcement Decision API returns for a known minor.
            </p>
            <div className="space-y-2">
              {RESTRICTED_PURPOSES.map((purpose) => {
                const blocked = purpose.status === 'blocked';
                return (
                  <div key={purpose.purpose} className="flex items-start justify-between p-2 gap-3">
                    <div>
                      <span className="text-sm text-[var(--text-primary)]">{purpose.purpose}</span>
                      <div className="text-xs text-[var(--text-tertiary)]">{purpose.note}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {blocked ? (
                        <Shield className="w-4 h-4 text-[var(--status-danger)]" strokeWidth={2} />
                      ) : (
                        <Check className="w-4 h-4 text-[var(--status-warning)]" strokeWidth={2} />
                      )}
                      <span className={cn('text-xs', blocked ? 'text-[var(--status-danger)]' : 'text-[var(--status-warning)]')}>
                        {blocked ? 'Blocked' : 'Consent required'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Workflow (static) */}
        <div className="mb-6">
          <h2 className="mb-4">Parental Consent Workflow</h2>
          <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="flex items-center justify-between">
              {WORKFLOW_STEPS.map((step, idx) => {
                const StepIcon = step.icon;
                return (
                  <div key={step.label} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2 bg-[var(--brand-primary)] text-white">
                        <StepIcon className="w-5 h-5" strokeWidth={1.5} />
                      </div>
                      <div className="text-xs text-center text-[var(--text-secondary)]">{step.label}</div>
                    </div>
                    {idx < WORKFLOW_STEPS.length - 1 && (
                      <div className="w-16 h-0.5 mb-8 mx-2 bg-[var(--brand-primary)]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Enforcement decision tester */}
        <div className="mb-6 p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-[var(--brand-primary)]" strokeWidth={1.5} />
            <h2>Enforcement Decision API</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Your marketing / ad-targeting systems call this before processing a person. It answers
            per DPDPA Section 9. Try it with a subject reference (the source row id, or a child ref).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Subject reference</label>
              <input
                value={enforceRef}
                onChange={(e) => setEnforceRef(e.target.value)}
                placeholder="external id or CH_xxxx"
                className="w-full px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Purpose</label>
              <select
                value={enforcePurpose}
                onChange={(e) => setEnforcePurpose(e.target.value as EnforcePurpose)}
                className="px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)]"
              >
                <option value="ad_targeting">Ad targeting</option>
                <option value="profiling">Profiling</option>
                <option value="processing">Processing</option>
              </select>
            </div>
            <button
              onClick={runEnforcement}
              disabled={enforcing}
              className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {enforcing && <Loader2 className="w-4 h-4 animate-spin" />}
              Check
            </button>
          </div>
          {enforceResult && (
            <div
              className={cn(
                'mt-4 p-4 rounded-lg border flex items-start gap-3',
                enforceResult.allowed
                  ? 'bg-[var(--status-success-bg)] border-[var(--status-success)]'
                  : 'bg-[var(--status-danger-bg)] border-[var(--status-danger)]',
              )}
            >
              {enforceResult.allowed ? (
                <Check className="w-5 h-5 text-[var(--status-success)] flex-shrink-0" strokeWidth={2} />
              ) : (
                <Shield className="w-5 h-5 text-[var(--status-danger)] flex-shrink-0" strokeWidth={2} />
              )}
              <div>
                <div className={cn('font-semibold', enforceResult.allowed ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]')}>
                  {enforceResult.allowed ? 'ALLOWED' : 'BLOCKED'}
                  {enforceResult.matched && enforceResult.is_minor ? ' · minor' : enforceResult.matched ? ' · adult' : ' · not found'}
                </div>
                <div className="text-sm text-[var(--text-primary)]">{enforceResult.reason}</div>
                {enforceResult.matched && (
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    consent: {enforceResult.consent_status} · child ref: {enforceResult.child_ref}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Developer integration (real API for the org's own app) */}
        <DeveloperApiSection orgId={orgId} />

        {/* Detected records (wired) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2>Detected Children Records</h2>
            {selectedRecordIds.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text-secondary)]">{selectedRecordIds.size} selected</span>
                <button
                  type="button"
                  onClick={openBulk}
                  title="Email a consent link to the selected records that have a parent email"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)] text-sm"
                >
                  <MailPlus className="w-4 h-4" strokeWidth={1.5} />
                  Request consent ({selectedRecordIds.size})
                </button>
              </div>
            )}
          </div>
          <div className="rounded-lg border overflow-hidden bg-[var(--surface-card)] border-[var(--border-default)]">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading records…
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Baby className="w-8 h-8 text-[var(--text-tertiary)] mb-3" strokeWidth={1.5} />
                <h3 className="text-base font-semibold mb-1">No children records yet</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md">
                  Add minor records so you can track verifiable parental consent and processing restrictions.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white hover:opacity-90 bg-[var(--brand-primary)]"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.5} />
                  Add child record
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-default)]">
                      <th className="px-4 py-3 text-left w-10">
                        <input
                          type="checkbox"
                          checked={allSelectableSelected}
                          onChange={toggleSelectAllRecords}
                          disabled={selectableRecords.length === 0}
                          aria-label="Select all records needing consent"
                        />
                      </th>
                      {['Child ID', 'Age', 'Detection', 'Parent email', 'Parental Consent', 'Restrictions', 'Last Activity', 'Actions'].map((header) => (
                        <th key={header} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recordsPageItems.map((record) => {
                      const restricted = record.profiling_blocked || record.ad_targeting_blocked;
                      const selectable = !record.aged_out_at && record.consent_status !== 'verified';
                      return (
                        <tr key={record.id} className="border-b border-[var(--border-default)]">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedRecordIds.has(record.id)}
                              onChange={() => toggleRecord(record.id)}
                              disabled={!selectable}
                              aria-label={`Select ${record.child_ref}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm text-[var(--text-primary)]">{record.child_ref}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-[var(--text-primary)]">{record.effective_age ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-[var(--text-secondary)]">{record.detection_method ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            {record.parent_email ? (
                              <span className="text-sm text-[var(--text-primary)]" title={record.parent_email}>
                                {record.parent_email}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--text-tertiary)]">no email</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-1 rounded text-xs font-medium', consentStatusClass(record.consent_status))}>
                              {record.consent_status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {restricted ? (
                              <div className="flex items-center gap-1.5">
                                <Check className="w-4 h-4 text-[var(--status-success)]" strokeWidth={2} />
                                <span className="text-sm text-[var(--status-success)]">Active</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-[var(--status-danger)]" strokeWidth={2} />
                                <span className="text-sm text-[var(--status-danger)]">Inactive</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-[var(--text-secondary)]">{formatDate(record.last_activity_at ?? record.updated_at)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {record.aged_out_at && (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                                  Aged out · 18+
                                </span>
                              )}
                              {record.consent_status !== 'verified' && !record.aged_out_at && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openRequest(record)}
                                    title="Email the parent a secure consent link"
                                    className="px-3 py-1.5 rounded text-sm font-medium inline-flex items-center gap-1.5 transition-colors bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-black/5"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    {record.consent_status === 'pending' ? 'Resend request' : 'Request from parent'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openConsent(record)}
                                    title="Manually record consent already collected"
                                    className="px-3 py-1.5 rounded text-sm font-medium text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)]"
                                  >
                                    Record consent
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => setEvidenceTarget(record)}
                                className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--brand-primary)]"
                                title="View consent evidence / audit trail"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(record)}
                                className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-danger)]"
                                title="Delete record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <TablePager
                  page={recordsPage}
                  pageCount={recordsPageCount}
                  total={recordsTotal}
                  pageSize={recordsPageSize}
                  onPage={setRecordsPage}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auto-detect Modal */}
      {showDetectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-lg w-full border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Auto-detect Children</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Scans a source for date-of-birth columns and flags under-18 records.
                </p>
              </div>
              <button onClick={() => setShowDetectModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Labeled label="Data Source">
                <select
                  className={inputCls}
                  value={detectSourceId}
                  onChange={(e) => setDetectSourceId(e.target.value)}
                >
                  <option value="">Select source…</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id} disabled={!isScannableSource(s.source_type)}>
                      {s.name}{!isScannableSource(s.source_type) ? ' (unsupported)' : ''}
                    </option>
                  ))}
                </select>
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Table (optional)">
                  <input className={inputCls} value={detectTable} onChange={(e) => setDetectTable(e.target.value)} placeholder="auto from inventory" />
                </Labeled>
                <Labeled label="DOB column (optional)">
                  <input className={inputCls} value={detectDobColumn} onChange={(e) => setDetectDobColumn(e.target.value)} placeholder="auto from inventory" />
                </Labeled>
              </div>
              <Labeled label="Parent / guardian email column (optional)">
                <input className={inputCls} value={detectEmailColumn} onChange={(e) => setDetectEmailColumn(e.target.value)} placeholder="e.g. guardian_email — enables bulk consent" />
              </Labeled>
              <p className="text-xs text-[var(--text-secondary)]">
                Leave table/column blank to auto-discover date-of-birth (and any parent/guardian email)
                columns from your Data Inventory. Capturing the guardian&apos;s email lets you send bulk
                consent requests later. Run a schema scan + PII scan first for best results.
              </p>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setShowDetectModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]">
                Cancel
              </button>
              <button onClick={handleAutoDetect} disabled={detecting} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                {detecting && <Loader2 className="w-4 h-4 animate-spin" />}
                {detecting ? 'Detecting…' : 'Run detection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Record Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-lg w-full border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Child Record</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Labeled label="Child reference (optional — auto-generated if blank)">
                <input className={inputCls} value={recordForm.child_ref} onChange={(e) => setRecordForm((f) => ({ ...f, child_ref: e.target.value }))} placeholder="CH_x8b3c9" />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Date of birth">
                  <input type="date" className={inputCls} value={recordForm.date_of_birth} onChange={(e) => setRecordForm((f) => ({ ...f, date_of_birth: e.target.value }))} />
                </Labeled>
                <Labeled label="Or age">
                  <input type="number" className={inputCls} value={recordForm.age} onChange={(e) => setRecordForm((f) => ({ ...f, age: e.target.value }))} placeholder="15" />
                </Labeled>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Detection method">
                  <input className={inputCls} value={recordForm.detection_method} onChange={(e) => setRecordForm((f) => ({ ...f, detection_method: e.target.value }))} placeholder="DOB input" />
                </Labeled>
                <Labeled label="Consent status">
                  <select className={inputCls} value={recordForm.consent_status} onChange={(e) => setRecordForm((f) => ({ ...f, consent_status: e.target.value as ChildConsentStatus }))}>
                    <option value="missing">Missing</option>
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="expired">Expired</option>
                  </select>
                </Labeled>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input type="checkbox" checked={recordForm.profiling_blocked} onChange={(e) => setRecordForm((f) => ({ ...f, profiling_blocked: e.target.checked }))} />
                  Block profiling
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input type="checkbox" checked={recordForm.ad_targeting_blocked} onChange={(e) => setRecordForm((f) => ({ ...f, ad_targeting_blocked: e.target.checked }))} />
                  Block targeted advertising
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]">
                Cancel
              </button>
              <button onClick={handleAdd} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving…' : 'Add Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Parental Consent Modal */}
      {consentTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-lg w-full border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Record Parental Consent</h2>
                <p className="text-xs text-[var(--text-secondary)]">For child {consentTarget.child_ref}</p>
              </div>
              <button onClick={() => setConsentTarget(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Parent / guardian name *">
                  <input className={inputCls} value={consentForm.parent_name} onChange={(e) => setConsentForm((f) => ({ ...f, parent_name: e.target.value }))} />
                </Labeled>
                <Labeled label="Relationship">
                  <input className={inputCls} value={consentForm.parent_relationship} onChange={(e) => setConsentForm((f) => ({ ...f, parent_relationship: e.target.value }))} placeholder="Father" />
                </Labeled>
              </div>
              <Labeled label="Parent email">
                <input type="email" className={inputCls} value={consentForm.parent_email} onChange={(e) => setConsentForm((f) => ({ ...f, parent_email: e.target.value }))} />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Verification method *">
                  <input className={inputCls} value={consentForm.verification_method} onChange={(e) => setConsentForm((f) => ({ ...f, verification_method: e.target.value }))} placeholder="DigiLocker (Aadhaar)" />
                </Labeled>
                <Labeled label="Consent expires (optional)">
                  <input type="date" className={inputCls} value={consentForm.expires_at} onChange={(e) => setConsentForm((f) => ({ ...f, expires_at: e.target.value }))} />
                </Labeled>
              </div>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setConsentTarget(null)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]">
                Cancel
              </button>
              <button onClick={handleRecordConsent} disabled={savingConsent} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50">
                {savingConsent ? 'Saving…' : 'Mark Verified'}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-lg w-full border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Request Consent from Parent</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Emails a secure link for child {requestTarget.child_ref}. The parent grants or
                  declines — the record updates itself.
                </p>
              </div>
              <button onClick={() => setRequestTarget(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Labeled label="Parent / guardian email *">
                <input type="email" className={inputCls} value={requestForm.parent_email} onChange={(e) => setRequestForm((f) => ({ ...f, parent_email: e.target.value }))} placeholder="parent@example.com" />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Parent name (optional)">
                  <input className={inputCls} value={requestForm.parent_name} onChange={(e) => setRequestForm((f) => ({ ...f, parent_name: e.target.value }))} />
                </Labeled>
                <Labeled label="Relationship (optional)">
                  <input className={inputCls} value={requestForm.parent_relationship} onChange={(e) => setRequestForm((f) => ({ ...f, parent_relationship: e.target.value }))} placeholder="Mother" />
                </Labeled>
              </div>
              <Labeled label="Purpose shown to the parent (optional)">
                <input className={inputCls} value={requestForm.purpose_note} onChange={(e) => setRequestForm((f) => ({ ...f, purpose_note: e.target.value }))} placeholder="e.g. To provide your child access to our learning app" />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Consent valid for (days)">
                  <input type="number" className={inputCls} value={requestForm.consent_validity_days} onChange={(e) => setRequestForm((f) => ({ ...f, consent_validity_days: e.target.value }))} />
                </Labeled>
                <Labeled label="Link expires in (days)">
                  <input type="number" className={inputCls} value={requestForm.link_expiry_days} onChange={(e) => setRequestForm((f) => ({ ...f, link_expiry_days: e.target.value }))} />
                </Labeled>
              </div>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setRequestTarget(null)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]">
                Cancel
              </button>
              <button onClick={handleRequestConsent} disabled={requesting} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                {requesting && <Loader2 className="w-4 h-4 animate-spin" />}
                {requesting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Request Consent Modal (preview → confirm) */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-lg w-full border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Request Consent in Bulk</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Emails a secure consent link to every targeted record that has a parent email on file.
                </p>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">{selectedRecordIds.size}</strong> record(s) selected.
              </div>

              {/* Preview */}
              <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm">
                {bulkPreviewLoading ? (
                  <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                    <Loader2 className="w-4 h-4 animate-spin" /> Calculating…
                  </span>
                ) : !bulkPreview ? (
                  <span className="text-[var(--text-secondary)]">Select at least one status to target.</span>
                ) : (
                  <div className="space-y-1">
                    <div>
                      This will email{' '}
                      <strong className="text-[var(--status-success)]">{bulkPreview.eligible}</strong>{' '}
                      parent(s).
                    </div>
                    {bulkPreview.skipped_no_email > 0 && (
                      <div className="text-[var(--status-warning)]">
                        {bulkPreview.skipped_no_email} matching record(s) have no parent email and will be skipped.
                      </div>
                    )}
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {bulkPreview.total_matched} record(s) matched across the selected statuses.
                    </div>
                  </div>
                )}
              </div>

              <Labeled label="Purpose shown to parents (optional)">
                <input className={inputCls} value={bulkForm.purpose_note} onChange={(e) => setBulkForm((f) => ({ ...f, purpose_note: e.target.value }))} placeholder="e.g. To provide your child access to our learning app" />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Consent valid for (days)">
                  <input type="number" className={inputCls} value={bulkForm.consent_validity_days} onChange={(e) => setBulkForm((f) => ({ ...f, consent_validity_days: e.target.value }))} />
                </Labeled>
                <Labeled label="Link expires in (days)">
                  <input type="number" className={inputCls} value={bulkForm.link_expiry_days} onChange={(e) => setBulkForm((f) => ({ ...f, link_expiry_days: e.target.value }))} />
                </Labeled>
              </div>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setShowBulkModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]">
                Cancel
              </button>
              <button
                onClick={handleBulkSend}
                disabled={bulkSending || bulkPreviewLoading || !bulkPreview || bulkPreview.eligible === 0}
                title={bulkPreview && bulkPreview.eligible === 0 ? 'No targeted records have a parent email' : undefined}
                className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {bulkSending && <Loader2 className="w-4 h-4 animate-spin" />}
                {bulkSending
                  ? 'Sending…'
                  : bulkPreview
                    ? `Email ${bulkPreview.eligible} parent(s)`
                    : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {evidenceTarget && (
        <EvidenceDrawer
          record={evidenceTarget}
          orgId={orgId}
          onClose={() => setEvidenceTarget(null)}
        />
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]';

function Labeled({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}

// --- Consent evidence drawer (DPDPA s.9 audit trail) -------------------------

function EvidenceRow({ label, value }: { label: string; value: ReactElement | string | null | undefined }): ReactElement {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-[var(--text-secondary)] flex-shrink-0">{label}</span>
      <span className="text-[var(--text-primary)] text-right break-words min-w-0">{value || '—'}</span>
    </div>
  );
}

function EvidenceSection({ title, children }: { title: string; children: ReactElement }): ReactElement {
  return (
    <div className="py-4 border-b border-[var(--border-default)] last:border-b-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">{title}</h3>
      {children}
    </div>
  );
}

function EvidenceDrawer({
  record,
  orgId,
  onClose,
}: {
  record: ChildRecord;
  orgId?: string;
  onClose: () => void;
}): ReactElement {
  const [data, setData] = useState<ConsentEvidence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchConsentEvidence(record.id, orgId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((error) => {
        notify(`Failed to load evidence: ${(error as Error).message}`);
        if (!cancelled) onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, orgId]);

  const payload = data?.evidence ?? null;
  const req = payload?.request ?? null;
  // For email-link consent the response is nested; for manual/API pushes the
  // top-level payload is itself the response (identified by `source`).
  const resp = payload?.response ?? (payload?.source ? payload : null);
  const decision = resp?.decision ?? payload?.decision ?? null;
  const hasTechnical = Boolean(resp?.ip || resp?.user_agent);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md h-full overflow-y-auto bg-[var(--surface-card)] text-[var(--text-primary)] border-l border-[var(--border-default)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--surface-card)] p-6 border-b border-[var(--border-default)] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-[var(--brand-primary)]" strokeWidth={1.5} />
              Consent Evidence
            </h2>
            <p className="text-xs text-[var(--text-secondary)] font-mono">{record.child_ref}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <X className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--text-secondary)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading evidence…
          </div>
        ) : !data ? (
          <div className="p-6 text-sm text-[var(--text-secondary)]">No evidence available.</div>
        ) : (
          <div className="px-6 pb-8">
            <EvidenceSection title="Status">
              <div>
                <span className={cn('px-2 py-1 rounded text-xs font-medium', consentStatusClass(data.consent_status))}>
                  {data.consent_status}
                </span>
                <div className="mt-2">
                  <EvidenceRow label="Verified at" value={formatDateTime(data.consent_verified_at)} />
                  <EvidenceRow label="Consent expires" value={formatDateTime(data.consent_expires_at)} />
                  {data.aged_out_at && <EvidenceRow label="Aged out (18+)" value={formatDateTime(data.aged_out_at)} />}
                </div>
              </div>
            </EvidenceSection>

            <EvidenceSection title="Parent / Guardian">
              <div>
                <EvidenceRow label="Name" value={data.parent_name} />
                <EvidenceRow label="Relationship" value={data.parent_relationship} />
                <EvidenceRow label="Email" value={data.parent_email} />
                <EvidenceRow label="Verification method" value={data.consent_verification_method} />
              </div>
            </EvidenceSection>

            {(decision || resp?.responded_at || payload?.recorded_by) && (
              <EvidenceSection title="Decision">
                <div>
                  <EvidenceRow
                    label="Decision"
                    value={
                      decision ? (
                        <span className={decision === 'grant' ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'}>
                          {decision === 'grant' ? 'Granted' : 'Declined'}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <EvidenceRow label="Responded at" value={formatDateTime(resp?.responded_at ?? payload?.responded_at)} />
                  {typeof resp?.confirmed_guardian === 'boolean' && (
                    <EvidenceRow label="Guardian confirmed" value={resp.confirmed_guardian ? 'Yes' : 'No'} />
                  )}
                  {payload?.recorded_by && <EvidenceRow label="Recorded by" value={payload.recorded_by} />}
                  {payload?.source && <EvidenceRow label="Source" value={payload.source} />}
                </div>
              </EvidenceSection>
            )}

            {req && (
              <EvidenceSection title="Request">
                <div>
                  <EvidenceRow label="Requested by" value={req.requested_by} />
                  <EvidenceRow label="Requested at" value={formatDateTime(req.requested_at)} />
                  <EvidenceRow label="Sent to" value={formatDateTime(data.consent_requested_at)} />
                  <EvidenceRow label="Link expires" value={formatDateTime(data.consent_request_expires_at)} />
                  {typeof req.validity_days === 'number' && (
                    <EvidenceRow label="Consent validity" value={`${req.validity_days} days`} />
                  )}
                  {req.purpose_note && <EvidenceRow label="Purpose shown" value={req.purpose_note} />}
                  {req.bulk && <EvidenceRow label="Channel" value="Bulk request" />}
                </div>
              </EvidenceSection>
            )}

            {hasTechnical && (
              <EvidenceSection title="Technical evidence (sensitive)">
                <div>
                  <EvidenceRow label="IP address" value={resp?.ip} />
                  <EvidenceRow
                    label="User agent"
                    value={resp?.user_agent ? <span className="text-xs">{resp.user_agent}</span> : undefined}
                  />
                </div>
              </EvidenceSection>
            )}

            {!payload && (
              <p className="pt-4 text-sm text-[var(--text-secondary)]">
                No consent evidence recorded yet for this record.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Developer integration (real API for the org's own app) ------------------

type ApiLang = 'curl' | 'js' | 'python';

function buildRecordSnippet(lang: ApiLang, url: string, key: string): string {
  if (lang === 'js') {
    return `await fetch("${url}", {
  method: "POST",
  headers: { "X-Api-Key": "${key}", "Content-Type": "application/json" },
  body: JSON.stringify({
    subject_ref: "USER_12345",         // your user id for the child
    decision: "grant",                 // "grant" if the parent approved, else "deny"
    parent_name: "Asha Verma",
    parent_email: "asha@example.com",  // stored — lets us email/renew consent later
    verification_method: "DigiLocker", // how you verified the parent
    date_of_birth: "2015-05-01",
  }),
});`;
  }
  if (lang === 'python') {
    return `import requests

requests.post(
    "${url}",
    headers={"X-Api-Key": "${key}"},
    json={
        "subject_ref": "USER_12345",
        "decision": "grant",                # "grant" if the parent approved, else "deny"
        "parent_name": "Asha Verma",
        "parent_email": "asha@example.com", # stored — lets us email/renew consent later
        "verification_method": "DigiLocker",
        "date_of_birth": "2015-05-01",
    },
)`;
  }
  return `curl -X POST "${url}" \
  -H "X-Api-Key: ${key}" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_ref": "USER_12345",
    "decision": "grant",
    "parent_name": "Asha Verma",
    "parent_email": "asha@example.com",
    "verification_method": "DigiLocker",
    "date_of_birth": "2015-05-01"
  }'`;
}

function buildEnforceSnippet(lang: ApiLang, url: string, key: string): string {
  if (lang === 'js') {
    return `const res = await fetch("${url}", {
  method: "POST",
  headers: { "X-Api-Key": "${key}", "Content-Type": "application/json" },
  body: JSON.stringify({ subject_ref: "USER_12345", purpose: "ad_targeting" }),
});
const { allowed } = await res.json();
if (!allowed) showGenericAdInstead();`;
  }
  if (lang === 'python') {
    return `import requests

r = requests.post(
    "${url}",
    headers={"X-Api-Key": "${key}"},
    json={"subject_ref": "USER_12345", "purpose": "ad_targeting"},
)
if not r.json()["allowed"]:
    show_generic_ad_instead()`;
  }
  return `curl -X POST "${url}" \
  -H "X-Api-Key: ${key}" \
  -H "Content-Type: application/json" \
  -d '{"subject_ref": "USER_12345", "purpose": "ad_targeting"}'`;
}

function CodeBlock({ title, code, onCopy }: { title: string; code: string; onCopy: () => void }): ReactElement {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-[var(--text-secondary)]">{title}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-xs text-[var(--brand-primary)] hover:underline"
        >
          <Copy className="w-3 h-3" /> Copy
        </button>
      </div>
      <pre className="text-xs p-3 rounded-lg overflow-x-auto bg-[var(--surface-raised)] text-[var(--text-primary)] whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function DeveloperApiSection({ orgId }: { orgId?: string }): ReactElement {
  const [info, setInfo] = useState<ChildApiInfo | null>(null);
  const [lang, setLang] = useState<ApiLang>('curl');

  useEffect(() => {
    fetchChildApiInfo(orgId).then(setInfo).catch(() => setInfo(null));
  }, [orgId]);

  const key = info?.api_key_prefix 
    ? `${info.api_key_prefix}-YOUR_API_KEY_SECRET`
    : 'YOUR_API_KEY';
  const recordUrl = info?.record_consent_url || '';
  const enforceUrl = info?.enforce_url || '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied to clipboard.');
    } catch {
      notify('Copy failed — select the code and copy manually.');
    }
  };

  return (
    <div className="mb-6 p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
      <div className="flex items-center gap-2 mb-1">
        <Code2 className="w-5 h-5 text-[var(--brand-primary)]" strokeWidth={1.5} />
        <h2>Developer API — connect your app</h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-3xl">
        Your own website/app talks to these endpoints — parents never log into this platform. After
        you collect parental consent (e.g. via DigiLocker or your own form), <strong>record</strong>{' '}
        it; then <strong>check</strong> before any profiling / ad-targeting / processing of a child.
      </p>

      <div className="mb-4 text-xs">
        {info?.has_api_key ? (
          <span className="text-[var(--text-secondary)]">
            Authenticated with your API key{' '}
            <code className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)]">{info.api_key_prefix}…</code>{' '}
            — replace with your full key (shown once when created in <strong>Integrations</strong>).
          </span>
        ) : (
          <span className="text-[var(--status-warning)]">
            No API key yet — generate one in the <strong>Integrations</strong> module, then send it in
            the <code>X-Api-Key</code> header.
          </span>
        )}
      </div>

      <div className="flex gap-1 mb-3">
        {(['curl', 'js', 'python'] as ApiLang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium',
              lang === l
                ? 'bg-[var(--brand-primary)] text-white'
                : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]',
            )}
          >
            {l === 'curl' ? 'cURL' : l === 'js' ? 'JavaScript' : 'Python'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <CodeBlock
          title="1. Record parental consent (after your app collects it)"
          code={buildRecordSnippet(lang, recordUrl, key)}
          onCopy={() => copy(buildRecordSnippet(lang, recordUrl, key))}
        />
        <CodeBlock
          title="2. Check before acting (enforcement)"
          code={buildEnforceSnippet(lang, enforceUrl, key)}
          onCopy={() => copy(buildEnforceSnippet(lang, enforceUrl, key))}
        />
      </div>
    </div>
  );
}
