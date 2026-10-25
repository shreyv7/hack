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
import { Plus, Edit, Archive, Eye, AlertTriangle, Clock, X, RotateCw, Copy, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { useConsentManagement } from '@/hooks/useConsentManagement';
import { ApiError } from '@/lib/api/client';
import type { NoticeDetail, NoticeSummary, NoticeActivity } from '@/types/consent';
import { formatActiveSince } from '@/types/consent';
import { fetchNoticeActivities } from '@/lib/api/consent';
import { cn } from '@/lib/utils';
import { integrationsApi } from '@/lib/api/integrations';
import { ShieldAIDraftModal } from '@/app/components/notices/ShieldAIDraftModal';
import type { ConsentDraftResult } from '@/lib/api/shieldAi';
import { fetchWorkspace } from '@/lib/api/workspace';
import { buildPublicPortalUrl } from '@/lib/dsar/portalSlug';


interface ConsentNoticesManagerProps {
  onCreateNew: () => void;
  onEditNotice: (noticeId: string, versionId: string) => void;
}

export function ConsentNoticesManager({
  onCreateNew,
  onEditNotice,
}: ConsentNoticesManagerProps): ReactElement {
  const {
    notices,
    loading,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    getNotice,
    runComplianceCheck,
    archiveNotice,
    createDraftFromLive,
    exportConsentEvidencePack,
    exportFullConsentEvidencePack,
    reload,
    showArchived,
    setShowArchived,
    restoreNotice,
  } = useConsentManagement();

  const navigate = useNavigate();
  const [showAiModal, setShowAiModal] = useState(false);
  const [orgSlug, setOrgSlug] = useState('demo-org');

  useEffect(() => {
    const loadOrgSlug = async () => {
      try {
        const effectiveId = isSuperadmin ? selectedOrgId : undefined;
        const ws = await fetchWorkspace(effectiveId);
        if (ws?.organization?.slug) {
          setOrgSlug(ws.organization.slug);
        }
      } catch (err) {
        console.error('Failed to load workspace for withdrawal URL:', err);
      }
    };
    if (hasOrg) {
      void loadOrgSlug();
    }
  }, [hasOrg, selectedOrgId, isSuperadmin]);

  const handleDraftReady = (draft: ConsentDraftResult) => {
    setShowAiModal(false);
    navigate('/consent/notices/new', { state: { aiDraft: draft } });
  };

  const [activities, setActivities] = useState<NoticeActivity[]>([]);

  const loadActivities = async () => {
    try {
      const orgId = isSuperadmin ? selectedOrgId || undefined : undefined;
      const apiActivities = await fetchNoticeActivities(orgId);
      setActivities(apiActivities);
    } catch (err) {
      console.error('Failed to load activities:', err);
    }
  };

  useEffect(() => {
    if (hasOrg) {
      void loadActivities();
    }
  }, [hasOrg, selectedOrgId, notices]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await reload();
      await loadActivities();
      notify('Consent notices synchronized successfully');
    } catch {
      notify('Failed to sync consent notices');
    } finally {
      setIsSyncing(false);
    }
  };

  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<NoticeDetail | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [sdkKey, setSdkKey] = useState<string>('');

  useEffect(() => {
    const loadSdkKey = async () => {
      try {
        const props = await integrationsApi.listProperties(isSuperadmin ? selectedOrgId : undefined);
        if (props.length > 0) {
          const propDetail = await integrationsApi.getProperty(props[0].id, isSuperadmin ? selectedOrgId : undefined);
          const activeKey = propDetail.api_keys.find(k => k.status === 'active');
          if (activeKey) {
            setSdkKey(activeKey.key_prefix);
          } else {
            setSdkKey(`sdk_key_${props[0].id.substring(0, 8)}`);
          }
        } else {
          setSdkKey('sdk_key_demo_6ef2a3b1');
        }
      } catch (err) {
        console.error('Failed to load SDK key for withdrawal URL preview:', err);
        setSdkKey('sdk_key_demo_6ef2a3b1');
      }
    };
    if (hasOrg) {
      void loadSdkKey();
    }
  }, [hasOrg, selectedOrgId]);

  const openView = async (summary: NoticeSummary) => {
    setSelectedNoticeId(summary.id);
    setShowViewModal(true);
    setViewLoading(true);
    try {
      const detail = await getNotice(summary.id);
      setViewDetail(detail);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to load notice');
      setShowViewModal(false);
    } finally {
      setViewLoading(false);
    }
  };

  const handleAutoFix = async (summary: NoticeSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!summary.current_version_id) return;
    try {
      const result = await runComplianceCheck(summary.id, summary.current_version_id, true);
      if (result.warnings.length === 0) {
        notify('Auto-fix applied — all warnings resolved');
      } else if (result.auto_fixed) {
        notify(`Auto-fix applied — ${result.warnings.length} warning(s) remaining`);
      } else {
        notify('No automatic fix available for the remaining warnings');
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Auto-fix failed');
    }
  };

  const handleArchive = async (summary: NoticeSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Archive notice "${summary.internal_name}"?`)) return;
    try {
      await archiveNotice(summary.id);
      notify('Notice archived');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to archive notice');
    }
  };

  const handleUnarchive = async (summary: NoticeSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Unarchive notice "${summary.internal_name}"?`)) return;
    try {
      await restoreNotice(summary.id);
      notify('Notice unarchived');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to unarchive notice');
    }
  };

  const handleEdit = async (summary: NoticeSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLoadingId(summary.id);
    try {
      let versionId = summary.current_version_id;
      if (summary.status === 'live') {
        const draft = await createDraftFromLive(summary.id);
        versionId = draft.id;
      }
      if (!versionId) {
        notify('No editable version found');
        return;
      }
      onEditNotice(summary.id, versionId);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to open notice for editing');
    } finally {
      setEditLoadingId(null);
    }
  };

  const displayVersion = (n: NoticeSummary) => n.version_label ?? '—';
  const displayStatus = (n: NoticeSummary) => {
    if (n.archived_at) return 'archived';
    return n.status ?? 'draft';
  };
  const displayName = (n: NoticeSummary) => n.display_name ?? n.internal_name;

  const noticesPager = useClientPagination(notices);

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
          notice: `${act.notice_name} ${act.notice_version}`,
          action: act.action,
          timestamp: dateStr,
          user: act.user_name,
        };
      }),
    [activities],
  );
  const activityPager = useClientPagination(recentActivities);

  useEffect(() => {
    noticesPager.resetPage();
    activityPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, selectedOrgId]);

  return (
    <ConsentManagementGate
      title="Consent Notices"
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
          title="Consent Notices"
          sectionReference="DPDPA Section 5, 6 — Consent Notice Requirements"
          chips={
            <>
              <DPDPAChip
                sections={[
                  {
                    chapter: 2,
                    section: 5,
                    name: 'Notice',
                    url: '/dpdpa2023/chapter-2/section5.html',
                    excerpt: 'Notice shall be clear, specific and plain...',
                  },
                  {
                    chapter: 2,
                    section: 6,
                    name: 'Consent',
                    url: '/dpdpa2023/chapter-2/section6.html',
                    excerpt: 'Consent shall be free, specific, informed...',
                  },
                ]}
                size="detailed"
              />
              <PenaltyChip amount={150} />
            </>
          }
          actions={
            <>
              <ConsentEvidenceExportButtons
                onExportSection={() => exportConsentEvidencePack('consent-notices')}
                onExportFull={exportFullConsentEvidencePack}
                disabled={loading || !hasOrg}
              />
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing || loading}
                className={consentToolbarBtn}
                title="Sync notices"
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAiModal(true)}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 flex items-center gap-2"
                  >
                    <Sparkles className="size-4" />
                    Draft with Shield AI
                  </button>
                  <button type="button" onClick={onCreateNew} className={consentToolbarPrimaryBtn}>
                    <Plus className="size-4" />
                    Create notice
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/consent/notices/approvals')}
                    className={consentToolbarBtn}
                  >
                    <Clock className="size-4" />
                    Approvals
                  </button>
                </div>
              ) : null}
            </>
          }
        />

        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Notice Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Version</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Purposes</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Active Since</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Rule 3 Warnings</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-[var(--text-secondary)]">
                      No consent notices yet. Create your first notice to begin the DPDPA §5 → §6 flow.
                    </td>
                  </tr>
                ) : (
                  noticesPager.slice.map((notice) => (
                    <tr
                      key={notice.id}
                      className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer"
                      onClick={() => void openView(notice)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-primary)]">{displayName(notice)}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{notice.internal_name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm text-[var(--text-secondary)]">{displayVersion(notice)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusPill status={displayStatus(notice)} />
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-[var(--text-secondary)]">{notice.purposes_count} purposes</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                          {notice.active_since && <Clock className="size-3" />}
                          {notice.active_since ? formatActiveSince(notice.active_since) : '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {notice.warnings_count > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 text-xs dark:bg-yellow-950 dark:text-yellow-400">
                              <AlertTriangle className="size-3" />
                              {notice.warnings_count} warnings
                            </span>
                            {canEdit && notice.current_version_id && (
                              <button
                                onClick={(e) => void handleAutoFix(notice, e)}
                                className="text-xs text-indigo-600 hover:text-indigo-700 underline dark:text-indigo-400"
                              >
                                Auto-fix
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-green-600 dark:text-green-400">✓ Compliant</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <button
                              onClick={(e) => void handleEdit(notice, e)}
                              disabled={editLoadingId === notice.id}
                              className="p-1 hover:bg-[var(--surface-raised)] rounded disabled:opacity-50"
                              title="Edit"
                            >
                              <Edit className="size-4 text-[var(--text-secondary)]" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void openView(notice);
                            }}
                            className="p-1 hover:bg-[var(--surface-raised)] rounded"
                            title="View"
                          >
                            <Eye className="size-4 text-[var(--text-secondary)]" />
                          </button>
                          {canEdit && (
                            notice.archived_at ? (
                              <button
                                onClick={(e) => void handleUnarchive(notice, e)}
                                className="p-1 hover:bg-[var(--surface-raised)] rounded"
                                title="Unarchive"
                              >
                                <RotateCw className="size-4 text-emerald-600 dark:text-emerald-400" />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => void handleArchive(notice, e)}
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
            page={noticesPager.page}
            pageCount={noticesPager.pageCount}
            total={noticesPager.total}
            pageSize={noticesPager.pageSize}
            onPage={noticesPager.setPage}
          />
        </div>

        {/* Recent Activity */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">Recent Activity</h2>
          <div className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]">
            {recentActivities.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
                No recent activity. Create or publish a consent notice to see logs here.
              </div>
            ) : (
              activityPager.slice.map((activity, idx) => (
                <div
                  key={activity.id}
                  className={cn('p-4', idx !== activityPager.slice.length - 1 && 'border-b border-[var(--border-default)]')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1 text-[var(--text-primary)]">{activity.notice}</div>
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

        {showViewModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowViewModal(false)}
          >
            <div
              className="bg-[var(--surface-card)] rounded-lg p-6 max-w-3xl w-full m-4 max-h-[90vh] overflow-y-auto border border-[var(--border-default)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Notice Details</h2>
                <button type="button" onClick={() => setShowViewModal(false)} className="p-1 hover:bg-[var(--surface-raised)] rounded">
                  <X className="size-5" />
                </button>
              </div>
              {viewLoading || !viewDetail ? (
                <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-[var(--text-secondary)]">Notice Name</div>
                      <div className="font-medium">{viewDetail.internal_name}</div>
                    </div>
                    <div>
                      <div className="text-sm text-[var(--text-secondary)]">Versions</div>
                      <div className="font-medium">{viewDetail.versions.length}</div>
                    </div>
                  </div>
                  {viewDetail.versions[0] && (
                    <>
                      <div className="border-t pt-4">
                        <h3 className="font-medium mb-3">
                          Current version ({viewDetail.versions[0].status}) — {viewDetail.versions[0].display_name}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                          {viewDetail.versions[0].opening_statement || 'No opening statement.'}
                        </p>
                      </div>
                      <div className="border-t pt-4">
                        <h3 className="font-medium mb-3">Associated Purposes</h3>
                        {viewDetail.versions[0].purposes.length === 0 ? (
                          <p className="text-sm text-[var(--text-secondary)]">No purposes linked.</p>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {viewDetail.versions[0].purposes.map((p) => (
                              <div key={p.id} className="flex items-center justify-between p-3 bg-[var(--surface-raised)] rounded">
                                <span>{p.name}</span>
                                <StatusPill status={p.legal_basis === 'consent' ? 'consent' : 'legit-use'} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="border-t pt-4">
                        <h3 className="font-medium mb-3">Consent Withdrawal URL</h3>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] select-all truncate">
                            {orgSlug ? `${buildPublicPortalUrl(orgSlug)}?right=withdraw` : `https://consent.company.in/withdraw/${sdkKey || 'sdk_key_demo_6ef2a3b1'}`}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const url = orgSlug ? `${buildPublicPortalUrl(orgSlug)}?right=withdraw` : `https://consent.company.in/withdraw/${sdkKey || 'sdk_key_demo_6ef2a3b1'}`;
                              void navigator.clipboard.writeText(url);
                              notify('Withdrawal URL copied to clipboard');
                            }}
                            className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer"
                            title="Copy withdrawal URL"
                          >
                            <Copy className="size-3.5 text-[var(--text-secondary)]" />
                          </button>
                        </div>
                        <p className="text-[10px] text-[var(--text-tertiary)]">
                          Principals can click this link in their consent widget to withdraw consent per DPDPA Rule 3(c).
                        </p>
                      </div>
                    </>
                  )}
                  {canEdit && selectedNoticeId && viewDetail.versions[0]?.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowViewModal(false);
                        onEditNotice(selectedNoticeId, viewDetail.versions[0].id);
                      }}
                      className="w-full px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Continue editing draft
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {showAiModal && (
          <ShieldAIDraftModal
            onClose={() => setShowAiModal(false)}
            onDraftReady={handleDraftReady}
          />
        )}
      </div>
    </ConsentManagementGate>
  );
}