import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { TablePager } from '@/app/components/common/TablePager';
import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { useConsentManagement } from '@/hooks/useConsentManagement';
import {
  approveNoticeDpo,
  approveNoticeLegal,
  fetchNoticeApprovals,
  rejectNoticeReview,
} from '@/lib/api/consent';
import { ApiError } from '@/lib/api/client';
import { notify } from '@/app/utils/notify';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import type { NoticeApprovalQueueItem, NoticeVersionStatus } from '@/types/consent';

const STATUS_LABELS: Record<NoticeVersionStatus, string> = {
  draft: 'Draft',
  pending_legal: 'Pending Legal',
  pending_dpo: 'Pending DPO',
  dpo_approved: 'DPO Approved',
  live: 'Live',
  archived: 'Archived',
};

interface NoticeApprovalsProps {
  onEditNotice: (noticeId: string, versionId: string) => void;
}

export function NoticeApprovals({ onEditNotice }: NoticeApprovalsProps): ReactElement {
  const {
    loading,
    error,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    reload,
  } = useConsentManagement();

  const navigate = useNavigate();
  const [queue, setQueue] = useState<NoticeApprovalQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [actionItem, setActionItem] = useState<NoticeApprovalQueueItem | null>(null);
  const [actionType, setActionType] = useState<'legal' | 'dpo' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const orgIdParam = isSuperadmin ? selectedOrgId || undefined : undefined;
  const queuePager = useClientPagination(queue);

  useEffect(() => {
    queuePager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const loadQueue = useCallback(async () => {
    if (!hasOrg) return;
    setQueueLoading(true);
    try {
      const items = await fetchNoticeApprovals(orgIdParam);
      setQueue(items);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to load approval queue');
    } finally {
      setQueueLoading(false);
    }
  }, [hasOrg, orgIdParam]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const openAction = (item: NoticeApprovalQueueItem, type: 'legal' | 'dpo' | 'reject') => {
    setActionItem(item);
    setActionType(type);
    setComment('');
  };

  const closeAction = () => {
    setActionItem(null);
    setActionType(null);
    setComment('');
  };

  const submitAction = async () => {
    if (!actionItem || !actionType) return;
    setSubmitting(true);
    try {
      if (actionType === 'legal') {
        await approveNoticeLegal(actionItem.notice_id, actionItem.version_id, comment || undefined, orgIdParam);
        notify('Legal review approved');
      } else if (actionType === 'dpo') {
        await approveNoticeDpo(actionItem.notice_id, actionItem.version_id, comment || undefined, orgIdParam);
        notify('DPO approval granted');
      } else {
        await rejectNoticeReview(actionItem.notice_id, actionItem.version_id, comment || undefined, orgIdParam);
        notify('Review rejected — returned to draft');
      }
      closeAction();
      await loadQueue();
      await reload();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConsentManagementGate
      title="Notice Approvals"
      loading={loading && !hasOrg}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Legal & DPO Approval Queue</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Review consent notice versions submitted by administrators before they go live.
            </p>
          </div>
          <Button variant="secondary" size="md" onClick={() => navigate('/consent/notices')}>
            Back to Notices
          </Button>
        </div>

        {queueLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading queue…</p>
        ) : queue.length === 0 ? (
          <div className="rounded-xl border border-[var(--border-default)] p-8 text-center text-[var(--text-secondary)]">
            <Clock className="size-8 mx-auto mb-3 opacity-50" />
            <p>No notices pending approval.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-muted)] text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Notice</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queuePager.slice.map((item) => (
                  <tr key={item.version_id} className="border-t border-[var(--border-default)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.notice_internal_name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{item.display_name}</div>
                    </td>
                    <td className="px-4 py-3">{item.version_label}</td>
                    <td className="px-4 py-3">{STATUS_LABELS[item.status]}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {item.submitted_at
                        ? new Date(item.submitted_at).toLocaleString('en-IN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditNotice(item.notice_id, item.version_id)}
                        >
                          <ExternalLink className="size-3.5 mr-1" />
                          View
                        </Button>
                        {item.status === 'pending_legal' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => openAction(item, 'legal')}
                            >
                              <CheckCircle className="size-3.5 mr-1" />
                              Approve Legal
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openAction(item, 'reject')}
                            >
                              <XCircle className="size-3.5 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {item.status === 'pending_dpo' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => openAction(item, 'dpo')}
                            >
                              <CheckCircle className="size-3.5 mr-1" />
                              Approve DPO
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openAction(item, 'reject')}
                            >
                              <XCircle className="size-3.5 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePager
              page={queuePager.page}
              pageCount={queuePager.pageCount}
              total={queuePager.total}
              pageSize={queuePager.pageSize}
              onPage={queuePager.setPage}
            />
          </div>
        )}
      </div>

      {actionItem && actionType && (
        <Modal
          size="sm"
          title={
            actionType === 'legal'
              ? 'Approve Legal Review'
              : actionType === 'dpo'
                ? 'Grant DPO Approval'
                : 'Reject Review'
          }
          onClose={closeAction}
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {actionItem.notice_internal_name} · {actionItem.version_label}
            </p>
            <textarea
              className="w-full min-h-[80px] rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-sm"
              placeholder="Optional comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={closeAction} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={() => void submitAction()} disabled={submitting}>
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </ConsentManagementGate>
  );
}
