import type { ReactElement } from 'react';
import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Eye,
  Edit,
  Archive,
  CheckCircle,
  AlertCircle,
  FileText,
  Mail,
  MessageSquare,
  Bell,
  Sparkles,
  RotateCw,
  X,
  Calendar,
  User,
  History,
  Info,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePolicyManagement } from '@/hooks/usePolicyManagement';
import type { PolicySummary, PolicyDetail, PolicyVersion } from '@/types/policy';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';

const POLICY_TYPE_LABELS: Record<string, string> = {
  privacy: 'Privacy Policy',
  cookie: 'Cookie Policy',
  children: "Children's Privacy Notice",
  employee: 'Employee Data Protection Policy',
  vendor: 'Vendor DPA Template',
  aup: 'Acceptable Use Policy',
  retention: 'Data Retention & Erasure Schedule',
  incident: 'Incident Response Plan',
  custom: 'Custom Policy',
};

const PUBLISH_STEPS = [
  { label: 'Draft', desc: 'Content creation' },
  { label: 'Internal Review', desc: 'DPO/Legal sign-off' },
  { label: 'Approved', desc: 'Awaiting deployment' },
  { label: 'Live', desc: 'Notifying data principals' },
];

export function PolicyManager(): ReactElement {
  const {
    policies,
    stats,
    acknowledgements,
    activities,
    loading,
    error,
    canEdit,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    reload,
    createPolicy,
    updatePolicy,
    archivePolicy,
    restorePolicy,
    getPolicyDetail,
    createVersion,
    submitVersionForReview,
    approvePolicyVersion,
    publishPolicyVersion,
    sendReminderEmails,
    generateFromRopa,
    showArchived,
    setShowArchived,
  } = usePolicyManagement();

  // Dialog/Modal/Drawer States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showViewDrawer, setShowViewDrawer] = useState(false);
  
  // Selected policy states for workflow and detail views
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [currentDetail, setCurrentDetail] = useState<PolicyDetail | null>(null);
  const [activePreviewVersion, setActivePreviewVersion] = useState<PolicyVersion | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Syncing State
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Reminder Dispatch States
  const [sendingReminderForId, setSendingReminderForId] = useState<string | null>(null);
  const [reminderChannel, setReminderChannel] = useState<'email' | 'sms' | 'in-app'>('email');

  // Form Fields State - New Policy
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('privacy');
  const [newContent, setNewContent] = useState('');
  const [newSummary, setNewSummary] = useState('');

  // Form Fields State - New Version
  const [newVerContent, setNewVerContent] = useState('');
  const [newVerSummary, setNewVerSummary] = useState('');
  const [newVerEffectiveDate, setNewVerEffectiveDate] = useState('');

  // Settings Edit State
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState('');

  // Reset forms helper
  const resetNewPolicyForm = () => {
    setNewTitle('');
    setNewType('privacy');
    setNewContent('');
    setNewSummary('');
  };

  const resetNewVersionForm = () => {
    setNewVerContent('');
    setNewVerSummary('');
    setNewVerEffectiveDate('');
  };

  // Sync Handler
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await reload();
      notify('Policy Manager synchronized successfully.');
    } catch {
      notify('Failed to sync policy data.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGeneratePolicy = async () => {
    if (!canEdit || !hasOrg) return;
    setIsGenerating(true);
    try {
      const result = await generateFromRopa('privacy');
      setSelectedPolicyId(result.policy.id);
      setCurrentDetail(result.policy);
      if (result.policy.versions.length > 0) {
        setActivePreviewVersion(result.policy.versions[0]);
      }
      setShowViewDrawer(true);
    } catch {
      // Notification handled in hook
    } finally {
      setIsGenerating(false);
    }
  };

  // Archive Handler
  const handleArchive = async (policy: PolicySummary) => {
    if (!window.confirm(`Are you sure you want to archive "${policy.title}"?`)) return;
    try {
      await archivePolicy(policy.id);
    } catch {
      // Notification handled in hook
    }
  };

  // Restore Handler
  const handleRestore = async (policy: PolicySummary) => {
    if (!window.confirm(`Restore policy "${policy.title}"?`)) return;
    try {
      await restorePolicy(policy.id);
    } catch {
      // Notification handled in hook
    }
  };

  // Fetch and show policy detail drawer
  const openPolicyDetail = async (id: string, startEditingSettings = false) => {
    setSelectedPolicyId(id);
    setDetailLoading(true);
    setShowViewDrawer(true);
    setIsEditingSettings(startEditingSettings);
    try {
      const detail = await getPolicyDetail(id);
      setCurrentDetail(detail);
      setEditTitle(detail.title);
      setEditType(detail.policy_type);
      // Default active preview to latest version
      if (detail.versions.length > 0) {
        setActivePreviewVersion(detail.versions[0]);
      } else {
        setActivePreviewVersion(null);
      }
    } catch {
      notify('Failed to load policy details.');
      setShowViewDrawer(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Create Policy Handler
  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      notify('Please enter a policy title.');
      return;
    }
    try {
      await createPolicy({
        title: newTitle,
        policy_type: newType,
        content: newContent,
        summary: newSummary || undefined,
      });
      setShowCreateModal(false);
      resetNewPolicyForm();
    } catch {
      // Error handled in hook
    }
  };

  // Create Version Handler
  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicyId) return;
    if (!newVerContent.trim()) {
      notify('Please enter the policy content.');
      return;
    }
    try {
      await createVersion(selectedPolicyId, {
        content: newVerContent,
        summary: newVerSummary || undefined,
        effective_date: newVerEffectiveDate ? new Date(newVerEffectiveDate).toISOString() : undefined,
      });
      setShowVersionModal(false);
      resetNewVersionForm();
      // Reload drawer if it is currently open
      if (showViewDrawer) {
        await openPolicyDetail(selectedPolicyId);
      }
    } catch {
      // Error handled in hook
    }
  };

  // Update Policy Settings
  const handleUpdatePolicySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicyId || !editTitle.trim()) return;
    try {
      await updatePolicy(selectedPolicyId, {
        title: editTitle,
        policy_type: editType,
      });
      setIsEditingSettings(false);
      if (showViewDrawer) {
        await openPolicyDetail(selectedPolicyId);
      }
    } catch {
      // Error
    }
  };

  // Workflow Actions
  const handleWorkflowAction = async (action: 'submit' | 'approve' | 'publish', version: PolicyVersion) => {
    if (!selectedPolicyId) return;
    try {
      if (action === 'submit') {
        await submitVersionForReview(selectedPolicyId, version.id);
        if (showViewDrawer && currentDetail) {
          await openPolicyDetail(selectedPolicyId);
        }
      } else if (action === 'approve') {
        await approvePolicyVersion(selectedPolicyId, version.id);
        if (showViewDrawer && currentDetail) {
          await openPolicyDetail(selectedPolicyId);
        }
      } else if (action === 'publish') {
        if (!window.confirm('Publishing this policy will make it live and archive the previous version. Proceed?')) return;
        await publishPolicyVersion(selectedPolicyId, version.id);
        if (showViewDrawer && currentDetail) {
          await openPolicyDetail(selectedPolicyId);
        }
      }
    } catch {
      // Error handled in hook
    }
  };

  // Dispatch reminders
  const handleSendReminder = async (policyId: string, versionId?: string) => {
    setSendingReminderForId(policyId);
    try {
      await sendReminderEmails(policyId, versionId, reminderChannel);
    } catch {
      // Error handled in hook
    } finally {
      setSendingReminderForId(null);
    }
  };

  // Set default selected policy for Workflow Stepper
  useEffect(() => {
    if (policies.length > 0 && !selectedPolicyId) {
      // Load first policy details for workflow display
      const activePols = policies.filter(p => !p.archived_at);
      if (activePols.length > 0) {
        setSelectedPolicyId(activePols[0].id);
        void getPolicyDetail(activePols[0].id).then(detail => {
          setCurrentDetail(detail);
          if (detail.versions.length > 0) {
            setActivePreviewVersion(detail.versions[0]);
          }
        });
      }
    }
  }, [policies, selectedPolicyId, getPolicyDetail]);

  // Handle workflow selection switch
  const handleWorkflowPolicyChange = async (policyId: string) => {
    setSelectedPolicyId(policyId);
    try {
      const detail = await getPolicyDetail(policyId);
      setCurrentDetail(detail);
      if (detail.versions.length > 0) {
        setActivePreviewVersion(detail.versions[0]);
      } else {
        setActivePreviewVersion(null);
      }
    } catch {
      notify('Failed to load policy details.');
    }
  };

  const getStatusBadge = (statusVal: string | null) => {
    switch (statusVal) {
      case 'live':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">Live</span>;
      case 'approved':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">Approved</span>;
      case 'review':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-700">Review</span>;
      case 'draft':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">Draft</span>;
      case 'archived':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">Archived</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">—</span>;
    }
  };

  const currentWorkflowStepIndex = useMemo(() => {
    if (!activePreviewVersion) return 0;
    const s = activePreviewVersion.status;
    if (s === 'draft') return 0;
    if (s === 'review') return 1;
    if (s === 'approved') return 2;
    if (s === 'live') return 3;
    return 0;
  }, [activePreviewVersion]);

  const ackPager = useClientPagination(acknowledgements);

  useEffect(() => {
    ackPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, showArchived]);

  return (
    <div className="min-h-screen p-8 bg-[var(--surface-base)] text-[var(--text-primary)]">
      <div className="max-w-[1280px] mx-auto">
        
        {/* Header Block */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-bold">Policy Manager</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Manage your privacy policy versions, publish workflows, and capture acknowledgements as DPDPA evidence
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Org Selector */}
            {isSuperadmin && (
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Organization:</span>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="text-sm font-medium bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--text-primary)] cursor-pointer"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Show Archived */}
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer bg-[var(--surface-card)] border border-[var(--border-default)] px-3 py-2 rounded-lg transition-colors hover:bg-gray-50">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
              />
              Show Archived
            </label>

            {/* Sync button */}
            <button
              type="button"
              onClick={handleSync}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-default)] transition-colors hover:bg-gray-50 bg-[var(--surface-card)] text-sm font-medium"
            >
              <RotateCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} strokeWidth={1.5} />
              Sync
            </button>

            {/* Add Policy */}
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)] text-sm font-medium"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                New Policy
              </button>
            )}
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] transition-all hover:shadow-sm">
            <div className="text-2xl font-semibold mb-1 text-[var(--text-primary)]">
              {loading ? '...' : stats?.active_count ?? 0}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Active policies</div>
          </div>
          <div className="p-4 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] transition-all hover:shadow-sm">
            <div className="text-2xl font-semibold mb-1 text-[var(--text-primary)]">
              {loading ? '...' : stats?.total_versions ?? 0}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Total versions</div>
          </div>
          <div className="p-4 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] transition-all hover:shadow-sm">
            <div className={cn("text-2xl font-semibold mb-1", (stats?.pending_acknowledgements ?? 0) > 0 ? "text-amber-600" : "text-[var(--text-primary)]")}>
              {loading ? '...' : (stats?.pending_acknowledgements ?? 0).toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Pending acknowledgements</div>
          </div>
          <div className="p-4 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] transition-all hover:shadow-sm">
            <div className="text-2xl font-semibold mb-1 text-[var(--text-primary)]">
              {loading ? '...' : stats?.auto_published_this_year ?? 0}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Auto-published this year</div>
          </div>
        </div>

        {/* Library & Workflow layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Policy Library */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-bold">Policy Library</h2>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-5 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                    <div className="flex gap-2">
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-6 rounded-lg border border-red-300 bg-red-50 text-red-700 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">Failed to load policies</div>
                  <div className="text-xs mt-1">{error}</div>
                </div>
              </div>
            ) : policies.length === 0 ? (
              <div className="p-8 rounded-lg border border-dashed border-[var(--border-default)] text-center bg-[var(--surface-card)]">
                <FileText className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-3" strokeWidth={1} />
                <div className="font-medium mb-1">No policies found</div>
                <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto mb-4">
                  There are no policy documents created yet. Create a new policy to start versioning and tracking acknowledgements.
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-[var(--brand-primary)] text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-4 h-4" />
                    Create Policy
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {policies.map((policy) => (
                  <div
                    key={policy.id}
                    className={cn(
                      "p-5 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] transition-all flex flex-col justify-between",
                      policy.archived_at && "opacity-75 bg-gray-50/50"
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1">
                          <span className="text-xs font-semibold tracking-wider text-[var(--brand-primary)] uppercase">
                            {POLICY_TYPE_LABELS[policy.policy_type] || policy.policy_type}
                          </span>
                          <h3 className="text-base font-semibold mt-1 mb-2 text-[var(--text-primary)]">
                            {policy.title}
                          </h3>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-[var(--text-secondary)]">
                              {policy.version_label}
                            </span>
                            {getStatusBadge(policy.archived_at ? 'archived' : policy.status)}
                          </div>
                        </div>
                        <FileText className="w-5 h-5 text-[var(--text-tertiary)] flex-shrink-0" strokeWidth={1.5} />
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mb-3">
                        Last updated {new Date(policy.updated_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      {policy.pending_acknowledgements > 0 && (
                        <div className="mb-4 text-xs font-medium text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {policy.pending_acknowledgements.toLocaleString()} pending acknowledgements
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => openPolicyDetail(policy.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] transition-colors hover:bg-gray-50 text-[var(--text-primary)] bg-white"
                      >
                        <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                        View
                      </button>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => openPolicyDetail(policy.id, true)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] transition-colors hover:bg-gray-50 text-[var(--text-primary)] bg-white"
                          >
                            <Edit className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPolicyId(policy.id);
                              setShowVersionModal(true);
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] transition-colors hover:bg-gray-50 text-[var(--text-primary)] bg-white"
                          >
                            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                            New Version
                          </button>
                          {policy.archived_at ? (
                            <button
                              type="button"
                              onClick={() => handleRestore(policy)}
                              className="px-2.5 py-1.5 rounded text-xs font-medium border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                              title="Restore Policy"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleArchive(policy)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] text-red-600 transition-colors hover:bg-red-50 hover:border-red-200 bg-white"
                              title="Archive Policy"
                            >
                              <Archive className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow Stepper Card */}
          <div className="h-fit">
            <h2 className="mb-4 text-lg font-bold">Publish Workflow</h2>
            <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] flex flex-col gap-6">
              
              {/* Selector */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">
                  Track Policy:
                </label>
                <select
                  value={selectedPolicyId || ''}
                  onChange={(e) => handleWorkflowPolicyChange(e.target.value)}
                  className="w-full text-sm p-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  <option value="" disabled>Select a policy</option>
                  {policies.filter(p => !p.archived_at).map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              {currentDetail ? (
                <>
                  {/* Stepper display */}
                  <div className="flex flex-col gap-4">
                    {PUBLISH_STEPS.map((step, idx) => {
                      const isActive = idx === currentWorkflowStepIndex;
                      const isCompleted = idx < currentWorkflowStepIndex;
                      return (
                        <div key={step.label} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300',
                                isCompleted && 'bg-green-100 text-green-700 border border-green-300',
                                isActive && 'bg-[var(--brand-primary)] text-white ring-4 ring-blue-100',
                                !isActive && !isCompleted && 'bg-gray-100 text-gray-400 border border-gray-200'
                              )}
                            >
                              {isCompleted ? '✓' : idx + 1}
                            </div>
                            {idx < PUBLISH_STEPS.length - 1 && (
                              <div
                                className={cn(
                                  'w-0.5 h-8 bg-gray-200 my-1',
                                  isCompleted && 'bg-green-300'
                                )}
                              />
                            )}
                          </div>
                          <div>
                            <div className={cn(
                              'text-sm font-semibold',
                              isActive && 'text-[var(--brand-primary)]',
                              !isActive && 'text-[var(--text-primary)]'
                            )}>
                              {step.label}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                              {step.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Dynamic Workflow Actions */}
                  {activePreviewVersion && (
                    <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
                      <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 uppercase">
                        <Info className="w-3.5 h-3.5 text-blue-600" />
                        Version v{activePreviewVersion.version_number}.0 details
                      </div>

                      {activePreviewVersion.status === 'draft' && canEdit && (
                        <button
                          type="button"
                          onClick={() => handleWorkflowAction('submit', activePreviewVersion)}
                          className="w-full py-2 rounded-lg text-white font-medium bg-[var(--brand-primary)] hover:opacity-90 transition-opacity text-sm"
                        >
                          Submit for DPO Review
                        </button>
                      )}

                      {activePreviewVersion.status === 'review' && canEdit && (
                        <button
                          type="button"
                          onClick={() => handleWorkflowAction('approve', activePreviewVersion)}
                          className="w-full py-2 rounded-lg text-white font-medium bg-indigo-600 hover:opacity-90 transition-opacity text-sm"
                        >
                          Approve Version (DPO)
                        </button>
                      )}

                      {activePreviewVersion.status === 'approved' && canEdit && (
                        <button
                          type="button"
                          onClick={() => handleWorkflowAction('publish', activePreviewVersion)}
                          className="w-full py-2 rounded-lg text-white font-medium bg-green-600 hover:opacity-90 transition-opacity text-sm"
                        >
                          Publish Version Live
                        </button>
                      )}

                      {activePreviewVersion.status === 'live' && (
                        <div className="flex flex-col gap-3">
                          <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)]">
                            <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2">
                              Remind Data Principals via notice channels:
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setReminderChannel('email')}
                                className={cn(
                                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs font-semibold transition-all',
                                  reminderChannel === 'email'
                                    ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm'
                                    : 'bg-white border-[var(--border-default)] text-[var(--text-secondary)]'
                                )}
                              >
                                <Mail className="w-3.5 h-3.5" />
                                Email
                              </button>
                              <button
                                type="button"
                                onClick={() => setReminderChannel('sms')}
                                className={cn(
                                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs font-semibold transition-all',
                                  reminderChannel === 'sms'
                                    ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm'
                                    : 'bg-white border-[var(--border-default)] text-[var(--text-secondary)]'
                                )}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                SMS
                              </button>
                              <button
                                type="button"
                                onClick={() => setReminderChannel('in-app')}
                                className={cn(
                                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs font-semibold transition-all',
                                  reminderChannel === 'in-app'
                                    ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm'
                                    : 'bg-white border-[var(--border-default)] text-[var(--text-secondary)]'
                                )}
                              >
                                <Bell className="w-3.5 h-3.5" />
                                In-App
                              </button>
                            </div>
                          </div>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleSendReminder(currentDetail.id, activePreviewVersion.id)}
                              disabled={sendingReminderForId === currentDetail.id}
                              className="w-full py-2 rounded-lg text-white font-medium bg-[var(--brand-primary)] hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2"
                            >
                              {sendingReminderForId === currentDetail.id ? (
                                <>
                                  <RotateCw className="w-4 h-4 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Mail className="w-4 h-4" />
                                  Send reminders ({reminderChannel})
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6 text-sm text-[var(--text-secondary)] border border-dashed border-[var(--border-default)] rounded-lg">
                  Select an active policy to view its publish workflow.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Acknowledgement Tracker Table */}
        <div className="mb-6">
          <h2 className="mb-4 text-lg font-bold">Acknowledgement Tracker</h2>
          <div className="rounded-lg border overflow-hidden bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-default)]">
                    {['Policy', 'Version', 'Audience', 'Sent', 'Acknowledged', 'Pending', 'Overdue', 'Actions'].map(
                      (header) => (
                        <th
                          key={header}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                        >
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {acknowledgements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                        No active policy acknowledgements found. When you publish a policy version live, acknowledgement queues are automatically seeded.
                      </td>
                    </tr>
                  ) : (
                    ackPager.slice.map((ack) => (
                      <tr key={ack.policy_id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{ack.policy_title}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{ack.version}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{ack.audience}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{ack.sent.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-green-600" strokeWidth={1.5} />
                            <span className="font-semibold text-green-700">{ack.acknowledged.toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'font-semibold',
                              ack.pending > 0 ? 'text-amber-600' : 'text-[var(--text-secondary)]',
                            )}
                          >
                            {ack.pending.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {ack.overdue > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4 text-red-600" strokeWidth={1.5} />
                              <span className="font-semibold text-red-600">{ack.overdue.toLocaleString()} (Overdue)</span>
                            </div>
                          ) : (
                            <span className="text-[var(--text-secondary)]">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleSendReminder(ack.policy_id)}
                              disabled={sendingReminderForId === ack.policy_id}
                              className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] transition-colors hover:bg-gray-50 bg-white text-[var(--text-primary)] disabled:opacity-50"
                            >
                              {sendingReminderForId === ack.policy_id ? 'Sending...' : 'Send reminder'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <TablePager
                page={ackPager.page}
                pageCount={ackPager.pageCount}
                total={ackPager.total}
                pageSize={ackPager.pageSize}
                onPage={ackPager.setPage}
              />
            </div>
          </div>
        </div>

        {/* Recent Activity Log */}
        <div className="mb-6">
          <h2 className="mb-4 text-lg font-bold">Recent Activities</h2>
          <div className="rounded-lg border overflow-hidden bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="divide-y divide-[var(--border-default)] max-h-80 overflow-y-auto">
              {activities.length === 0 ? (
                <div className="p-6 text-center text-sm text-[var(--text-secondary)]">
                  No policy activities logged yet. Actions like publishing or reminders generate audit entries.
                </div>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <History className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {act.action} — <span className="font-medium text-gray-500">{act.policy_title}</span>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                          Version: {act.policy_version} • Actor: {act.user_name}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5 flex-shrink-0">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(act.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Vajra AI Promotion Card */}
        <div className="p-6 rounded-lg border bg-[var(--status-ai-bg)] border-violet-300 transition-all hover:shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-violet-600">
              <Sparkles className="w-5 h-5 text-white animate-pulse" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="mb-2 font-bold text-violet-900">Vajra AI</h3>
              <p className="text-sm mb-4 text-violet-800">
                Generate policy from your processing activities — Auto-draft a policy from your RoPA in 30 seconds
              </p>
              <button
                type="button"
                onClick={handleGeneratePolicy}
                disabled={!canEdit || !hasOrg || isGenerating}
                className="px-4 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-90 bg-violet-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isGenerating ? 'Generating draft...' : 'Generate policy now'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* CREATE NEW POLICY MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-bold">New Policy Document</h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetNewPolicyForm();
                }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePolicy} className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                  Policy Title:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Employee Privacy Policy"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-sm p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                  Policy Type:
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full text-sm p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] cursor-pointer"
                >
                  {Object.entries(POLICY_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                  Initial Content (Draft):
                </label>
                <textarea
                  placeholder="Provide markdown or plaintext content for this initial draft version..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={6}
                  className="w-full text-sm p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                  Changelog Summary:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Initial DPDPA template draft"
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  className="w-full text-sm p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetNewPolicyForm();
                  }}
                  className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-white bg-[var(--brand-primary)] text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Create Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW VERSION MODAL */}
      {showVersionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-bold">Create New Draft Version</h2>
              <button
                type="button"
                onClick={() => {
                  setShowVersionModal(false);
                  resetNewVersionForm();
                }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateVersion} className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                  Policy Content:
                </label>
                <textarea
                  required
                  placeholder="Provide updated markdown/plaintext content for the new draft version..."
                  value={newVerContent}
                  onChange={(e) => setNewVerContent(e.target.value)}
                  rows={8}
                  className="w-full text-sm p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                  Version Changelog Summary:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Added details on automated user rights flow"
                  value={newVerSummary}
                  onChange={(e) => setNewVerSummary(e.target.value)}
                  className="w-full text-sm p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                  Scheduled Go-Live (Optional):
                </label>
                <input
                  type="datetime-local"
                  value={newVerEffectiveDate}
                  onChange={(e) => setNewVerEffectiveDate(e.target.value)}
                  className="w-full text-sm p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] cursor-pointer"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowVersionModal(false);
                    resetNewVersionForm();
                  }}
                  className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-white bg-[var(--brand-primary)] text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS SIDE DRAWER */}
      {showViewDrawer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-3xl bg-[var(--surface-base)] h-full overflow-y-auto p-6 shadow-2xl border-l border-[var(--border-default)] flex flex-col justify-between animate-slide-in">
            <div>
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                <div className="flex-1">
                  {isEditingSettings ? (
                    <form onSubmit={handleUpdatePolicySettings} className="flex flex-col gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase">Policy Title</label>
                        <input
                          type="text"
                          required
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full text-sm p-2 border border-[var(--border-default)] rounded bg-[var(--surface-card)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase">Policy Type</label>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          className="w-full text-sm p-2 border border-[var(--border-default)] rounded bg-[var(--surface-card)]"
                        >
                          {Object.entries(POLICY_TYPE_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-3 py-1 bg-[var(--brand-primary)] text-white text-xs font-semibold rounded"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingSettings(false)}
                          className="px-3 py-1 border border-[var(--border-default)] text-xs font-semibold rounded bg-white text-[var(--text-primary)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-50 border border-blue-200 text-blue-800 uppercase">
                          {currentDetail ? POLICY_TYPE_LABELS[currentDetail.policy_type] : ''}
                        </span>
                      </div>
                      <h2 className="text-xl font-bold mt-1 text-[var(--text-primary)]">
                        {currentDetail?.title}
                      </h2>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowViewDrawer(false)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500 ml-4"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <RotateCw className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="text-sm text-[var(--text-secondary)]">Loading policy timeline...</span>
                </div>
              ) : currentDetail ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Timeline selector */}
                  <div className="md:col-span-1 border-r border-[var(--border-default)] pr-4">
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 tracking-wider flex items-center gap-1">
                      <History className="w-3.5 h-3.5" />
                      Version History
                    </h3>
                    <div className="flex flex-col gap-2">
                      {currentDetail.versions.map((ver) => (
                        <button
                          key={ver.id}
                          type="button"
                          onClick={() => setActivePreviewVersion(ver)}
                          className={cn(
                            'w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1',
                            activePreviewVersion?.id === ver.id
                              ? 'border-[var(--brand-primary)] bg-blue-50/50 shadow-sm ring-1 ring-[var(--brand-primary)]'
                              : 'border-[var(--border-default)] hover:bg-gray-50 bg-white'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-[var(--text-primary)]">
                              v{ver.version_number}.0
                            </span>
                            {getStatusBadge(ver.status)}
                          </div>
                          <span className="text-[10px] text-[var(--text-secondary)] line-clamp-1">
                            {ver.summary}
                          </span>
                          <span className="text-[9px] text-[var(--text-tertiary)] text-right self-end mt-1">
                            {new Date(ver.updated_at).toLocaleDateString('en-IN')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Version Detail content view */}
                  <div className="md:col-span-2">
                    {activePreviewVersion ? (
                      <div className="flex flex-col gap-4">
                        {/* Meta */}
                        <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] text-xs flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-[var(--text-secondary)]">Author:</span>
                            <span className="font-semibold">{activePreviewVersion.published_by_name || 'System / Auto-seeded'}</span>
                          </div>
                          {activePreviewVersion.reviewed_by_name && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              <span className="text-[var(--text-secondary)]">Reviewed By:</span>
                              <span className="font-semibold">{activePreviewVersion.reviewed_by_name}</span>
                            </div>
                          )}
                          {activePreviewVersion.effective_date && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-gray-500" />
                              <span className="text-[var(--text-secondary)]">Effective:</span>
                              <span className="font-semibold">
                                {new Date(activePreviewVersion.effective_date).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Content text */}
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-bold uppercase text-gray-500">Document Content Preview</span>
                          <div className="p-4 rounded-lg border border-[var(--border-default)] bg-white max-h-[350px] overflow-y-auto shadow-inner">
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-primary)]">
                              {activePreviewVersion.content}
                            </pre>
                          </div>
                        </div>

                        {/* Version status controls */}
                        {activePreviewVersion.status !== 'live' && canEdit && (
                          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2">
                            <div>
                              <span className="text-xs font-semibold text-blue-900 block">Manage Status Workflow</span>
                              <span className="text-[10px] text-blue-700">Transition version through review pipeline.</span>
                            </div>
                            <div className="flex gap-2 self-end sm:self-center">
                              {activePreviewVersion.status === 'draft' && (
                                <button
                                  type="button"
                                  onClick={() => handleWorkflowAction('submit', activePreviewVersion)}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                                >
                                  Submit Review
                                </button>
                              )}
                              {activePreviewVersion.status === 'review' && (
                                <button
                                  type="button"
                                  onClick={() => handleWorkflowAction('approve', activePreviewVersion)}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
                                >
                                  Approve DPO
                                </button>
                              )}
                              {activePreviewVersion.status === 'approved' && (
                                <button
                                  type="button"
                                  onClick={() => handleWorkflowAction('publish', activePreviewVersion)}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
                                >
                                  Publish Live
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-sm text-[var(--text-secondary)] border border-dashed border-[var(--border-default)] rounded-lg">
                        Select a version to inspect its document content.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer close */}
            <div className="border-t border-[var(--border-default)] pt-4 mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowViewDrawer(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-semibold hover:bg-gray-50 bg-white text-[var(--text-primary)] transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
