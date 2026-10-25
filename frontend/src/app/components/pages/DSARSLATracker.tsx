import { notify } from '@/app/utils/notify';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { ConsentEvidenceExportButtons } from '@/app/components/pages/ConsentEvidenceExportButtons';
import { cn } from '@/lib/utils';
import { Clock, CheckCircle, AlertTriangle, XCircle, X, Download } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { useDsarSlaManagement } from '@/hooks/useDsarSlaManagement';
import { ApiError } from '@/lib/api/client';
import type { DataRightType, DataRightsRequest, DataRightsRequestStatus } from '@/types/dsar';
import {
  KANBAN_COLUMNS,
  DSAR_RIGHT_TYPES,
  RIGHT_TYPE_LABELS,
  STATUS_LABELS,
  USER_KANBAN_COLUMNS,
} from '@/types/dsar';
import { downloadClosurePdf } from '@/lib/dsar/closurePdf';
import { downloadDsarEvidencePackPdf } from '@/lib/dsar/dsarEvidencePackPdf';
import { downloadDsarQueueCsv, queueStatusLabel } from '@/lib/dsar/dsarQueueCsv';

export function DSARSLATracker(): ReactElement {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const {
    dashboard,
    loading,
    error,
    hasOrg,
    canEdit,
    isAdmin,
    isOrgAdmin,
    canHandleRequest,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    teamMembers,
    updateRequest,
    batchUpdateRequests,
    legalSignoffRequest,
    resolveRequest,
    canRequestLegal,
    canSignLegal,
    runSlaEngine,
  } = useDsarSlaManagement();

  const [selectedRequest, setSelectedRequest] = useState<DataRightsRequest | null>(null);
  const [pendingHandlerId, setPendingHandlerId] = useState('');
  const [filterRight, setFilterRight] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchHandlerId, setBatchHandlerId] = useState('');

  useEffect(() => {
    const right = searchParams.get('right');
    if (right && DSAR_RIGHT_TYPES.includes(right as DataRightType)) {
      setFilterRight(right);
    }
  }, [searchParams]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterRight, selectedOrgId]);

  useEffect(() => {
    setPendingHandlerId(selectedRequest?.assigned_to_user_id ?? '');
  }, [selectedRequest?.id, selectedRequest?.assigned_to_user_id]);

  const metrics = dashboard?.metrics;
  const requests = dashboard?.requests ?? [];
  const kanbanColumns = isAdmin ? KANBAN_COLUMNS : USER_KANBAN_COLUMNS;
  const filtered =
    filterRight === 'all'
      ? requests
      : requests.filter((r) => r.right_type === filterRight);

  const selectableRequests = useMemo(
    () => filtered.filter((r) => r.status !== 'completed'),
    [filtered]
  );

  const requestsByStatus = useMemo(() => {
    const map = new Map<DataRightsRequestStatus, DataRightsRequest[]>();
    for (const col of kanbanColumns) {
      map.set(col.key, []);
    }
    for (const req of filtered) {
      const bucket = map.get(req.status);
      if (bucket) bucket.push(req);
    }
    return map;
  }, [filtered, kanbanColumns]);

  const columnRequests = (status: DataRightsRequestStatus) =>
    requestsByStatus.get(status) ?? [];

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(selectableRequests.map((r) => r.id)));
  };

  const selectAllInColumn = (status: DataRightsRequestStatus) => {
    if (status === 'completed') return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      columnRequests(status).forEach((r) => next.add(r.id));
      return next;
    });
  };

  const deselectAllInColumn = (status: DataRightsRequestStatus) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      columnRequests(status).forEach((r) => next.delete(r.id));
      return next;
    });
  };

  const allSelectedInColumn = (status: DataRightsRequestStatus) => {
    const col = columnRequests(status);
    return col.length > 0 && col.every((r) => selectedIds.has(r.id));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runBatchAssign = async () => {
    if (selectedIds.size === 0) {
      notify('Select at least one request');
      return;
    }
    if (!batchHandlerId) {
      notify('Select a handler to assign');
      return;
    }
    const ids = [...selectedIds];
    const handler = teamMembers.find((m) => m.id === batchHandlerId);
    const name = handler?.full_name ?? handler?.email ?? 'handler';
    clearSelection();
    setSaving(true);
    try {
      const result = await batchUpdateRequests({
        request_ids: ids,
        assigned_to_user_id: batchHandlerId,
        advance_status: true,
      });
      notify(
        `Assigned ${result.updated} request${result.updated === 1 ? '' : 's'} to ${name} and moved to the next stage` +
          (result.skipped ? ` (${result.skipped} skipped)` : '')
      );
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Assign failed');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (req: DataRightsRequest) => {
    setSelectedRequest(req);
    setPendingHandlerId(req.assigned_to_user_id ?? '');
  };

  const effectiveHandlerId = (req: DataRightsRequest) =>
    pendingHandlerId || req.assigned_to_user_id || '';

  const requireHandlerForAdvance = (req: DataRightsRequest): boolean => {
    if (!canEdit) return true;
    if (effectiveHandlerId(req)) return true;
    notify('Select a handler before moving this request forward');
    return false;
  };

  const afterAdvance = (updated: DataRightsRequest, handlerId: string) => {
    const handler = teamMembers.find((m) => m.id === handlerId);
    const name = handler?.full_name ?? handler?.email ?? 'handler';
    const assignedToSelf = isOrgAdmin && handlerId === user?.id;
    setPendingHandlerId(updated.assigned_to_user_id ?? '');
    if (isOrgAdmin && handlerId && !assignedToSelf) {
      notify(`Request assigned to ${name} and updated.`);
      setSelectedRequest(null);
      return;
    }
    notify('Request updated');
    setSelectedRequest(updated);
  };

  const advanceRequest = async (req: DataRightsRequest, status: DataRightsRequestStatus) => {
    if (!requireHandlerForAdvance(req)) return;
    const handlerId = effectiveHandlerId(req);
    setSaving(true);
    try {
      const updated = await updateRequest(req.id, {
        status,
        ...(canEdit && handlerId ? { assigned_to_user_id: handlerId } : {}),
      });
      afterAdvance(updated, handlerId);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const acknowledgeGrievance = async (req: DataRightsRequest) => {
    if (!requireHandlerForAdvance(req)) return;
    const handlerId = effectiveHandlerId(req);
    setSaving(true);
    try {
      const updated = await updateRequest(req.id, {
        acknowledge_grievance: true,
        ...(canEdit && handlerId ? { assigned_to_user_id: handlerId } : {}),
      });
      setPendingHandlerId(updated.assigned_to_user_id ?? '');
      notify('Grievance acknowledged (S.13)');
      if (isOrgAdmin && handlerId && handlerId !== user?.id) {
        setSelectedRequest(null);
      } else {
        setSelectedRequest(updated);
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Acknowledgement failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async (req: DataRightsRequest) => {
    if (!requireHandlerForAdvance(req)) return;
    const handlerId = effectiveHandlerId(req);
    setSaving(true);
    try {
      if (canEdit && handlerId && handlerId !== req.assigned_to_user_id) {
        await updateRequest(req.id, { assigned_to_user_id: handlerId });
      }
      await resolveRequest(req.id);
      notify('Request resolved. The data principal has been notified by email/SMS.');
      setSelectedRequest(null);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Resolve failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);
  const orgName = selectedOrg?.name ?? 'Organization';
  const orgSlug = selectedOrg?.slug ?? 'organization';

  const handlerNames = useMemo(
    () => Object.fromEntries(teamMembers.map((m) => [m.id, m.full_name || m.email])),
    [teamMembers]
  );

  const exportEvidencePack = (rows: DataRightsRequest[], filterLabel: string) => {
    if (!dashboard) return;
    const filename = downloadDsarEvidencePackPdf({
      organizationName: orgName,
      organizationSlug: orgSlug,
      dashboard,
      requests: rows,
      filterLabel,
      exporterEmail: user?.email,
      exporterRole: user?.role,
      handlerNames,
    });
    notify(`Evidence pack saved as ${filename}`);
  };

  const exportFilteredEvidencePack = () => {
    const label =
      filterRight === 'all'
        ? 'All active requests (current dashboard)'
        : RIGHT_TYPE_LABELS[filterRight as DataRightType];
    exportEvidencePack(filtered, label);
  };

  const exportFullEvidencePack = () => {
    exportEvidencePack(requests, 'Full dashboard register');
  };

  const canActOnRequest = (req: DataRightsRequest) =>
    canEdit || canHandleRequest(req);

  const downloadClosureForRequest = (req: DataRightsRequest) => {
    if (!req.closure_text) return;
    downloadClosurePdf(req.tracking_id, req.closure_text, orgName);
  };

  const downloadColumnCsv = (status: DataRightsRequestStatus, label: string) => {
    const rows = columnRequests(status);
    if (rows.length === 0) {
      notify(`No requests in ${label}`);
      return;
    }
    const filename = downloadDsarQueueCsv(rows, handlerNames, status.replace('_', '-'));
    notify(`Downloaded ${filename} (${rows.length} rows)`);
  };

  return (
    <ConsentManagementGate
      title="DSAR SLA Tracker"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="p-8 max-w-[1280px] mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
            <div>
              <h1 className="mb-2">DSAR SLA Tracker</h1>
              <div className="flex items-center gap-3">
                <DPDPAChip
                  sections={[
                    { chapter: 3, section: 11, name: 'Right to access', url: '/dpdpa2023/chapter-3/section11.html' },
                    { chapter: 3, section: 12, name: 'Correction & erasure', url: '/dpdpa2023/chapter-3/section12.html' },
                    { chapter: 3, section: 13, name: 'Grievance', url: '/dpdpa2023/chapter-3/section13.html' },
                  ]}
                  size="detailed"
                />
                <PenaltyChip amount={50} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ConsentEvidenceExportButtons
                onExportSection={exportFilteredEvidencePack}
                onExportFull={exportFullEvidencePack}
                disabled={loading || !dashboard}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void runSlaEngine().then(() => notify('SLA engine run complete'))}
                  className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
                >
                  Run SLA check
                </button>
              )}
            </div>
          </div>
          <SectionReference section="DPDPA Sections 11–14 — Data Principal Rights & Response SLAs" />
        </div>

        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <MetricCard icon={CheckCircle} color="green" value={metrics.on_track} label="On Track" />
            <MetricCard icon={Clock} color="amber" value={metrics.due_24h} label="Due in 24h" />
            <MetricCard icon={AlertTriangle} color="blue" value={metrics.due_7d} label="Due in 7 days" />
            <MetricCard icon={XCircle} color="red" value={metrics.breached} label="Response breached" pulse />
            <MetricCard icon={AlertTriangle} color="red" value={metrics.ack_overdue} label="Grievance ack overdue" />
          </div>
        )}

        {dashboard?.matrix && dashboard.matrix.length > 0 && (
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg p-6 mb-6 overflow-x-auto">
            <h3 className="font-medium mb-4">SLA Performance</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-3">Right</th>
                  <th className="text-left py-2 px-3">SLA</th>
                  <th className="text-left py-2 px-3">Avg response</th>
                  <th className="text-left py-2 px-3">Success rate</th>
                  <th className="text-left py-2 px-3">Breaches</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.matrix.map((row) => (
                  <tr key={row.right_type} className="border-b border-[var(--border-default)]">
                    <td className="py-2 px-3">{RIGHT_TYPE_LABELS[row.right_type]}</td>
                    <td className="py-2 px-3">{row.sla_label ?? `${row.sla_days} days`}</td>
                    <td className="py-2 px-3">{row.avg_response_days ?? '—'}</td>
                    <td className="py-2 px-3">{row.success_rate != null ? `${row.success_rate}%` : '—'}</td>
                    <td className="py-2 px-3">{row.breaches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-medium">Active Request Queue</h3>
            <div className="flex gap-2 text-xs flex-wrap">
              <FilterBtn active={filterRight === 'all'} onClick={() => setFilterRight('all')}>
                All {requests.length}
              </FilterBtn>
              {DSAR_RIGHT_TYPES.map((rt) => (
                <FilterBtn
                  key={rt}
                  active={filterRight === rt}
                  onClick={() => setFilterRight(rt)}
                >
                  {RIGHT_TYPE_LABELS[rt]}{' '}
                  {requests.filter((r) => r.right_type === rt).length}
                </FilterBtn>
              ))}
            </div>
          </div>
          {canEdit && (
            <div className="mb-4 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  disabled={selectableRequests.length === 0 || saving}
                  className="px-2 py-1 rounded border border-[var(--border-default)] hover:bg-[var(--surface-card)] disabled:opacity-50"
                >
                  Select all ({selectableRequests.length})
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0 || saving}
                  className="px-2 py-1 rounded border border-[var(--border-default)] hover:bg-[var(--surface-card)] disabled:opacity-50"
                >
                  Clear
                </button>
                <span className="text-[var(--text-secondary)]">
                  {selectedIds.size} selected
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <select
                  value={batchHandlerId}
                  disabled={saving || teamMembers.length === 0}
                  onChange={(e) => setBatchHandlerId(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] min-w-[180px]"
                >
                  <option value="">Choose handler…</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name ?? m.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || !batchHandlerId || saving}
                  onClick={() => void runBatchAssign()}
                  className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Assign
                </button>
              </div>
            </div>
          )}
          <div className="space-y-8" key={`${filterRight}-${selectedOrgId ?? ''}`}>
            {kanbanColumns.map((col) => (
              <KanbanColumnSection
                key={col.key}
                col={col}
                colItems={columnRequests(col.key)}
                paginationResetKey={`${filterRight}-${selectedOrgId}-${col.key}`}
                canEdit={canEdit}
                saving={saving}
                selectedIds={selectedIds}
                handlerNames={handlerNames}
                allSelectedInColumn={allSelectedInColumn}
                selectAllInColumn={selectAllInColumn}
                deselectAllInColumn={deselectAllInColumn}
                downloadColumnCsv={downloadColumnCsv}
                toggleSelected={toggleSelected}
                openDetail={openDetail}
                downloadClosureForRequest={downloadClosureForRequest}
              />
            ))}
          </div>
        </div>

        {selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--surface-card)] rounded-lg p-6 max-w-lg w-full border border-[var(--border-default)]">
              <div className="flex justify-between mb-4">
                <h2 className="font-semibold">{selectedRequest.tracking_id}</h2>
                <button type="button" onClick={() => setSelectedRequest(null)}>
                  <X className="size-5" />
                </button>
              </div>
              <div className="space-y-2 text-sm mb-4">
                <p>
                  <strong>Right:</strong> {RIGHT_TYPE_LABELS[selectedRequest.right_type]}
                </p>
                <p>
                  <strong>Status:</strong> {STATUS_LABELS[selectedRequest.status]}
                </p>
                {selectedRequest.retention_hold_applied && (
                  <p className="text-amber-700 text-xs border border-amber-200 rounded p-2 bg-amber-50">
                    DPDPA retention hold active — deletion/masking deferred per RBI/AML/legal obligations.
                  </p>
                )}
                {selectedRequest.fulfillment_metadata &&
                  typeof selectedRequest.fulfillment_metadata === 'object' &&
                  Array.isArray(
                    (selectedRequest.fulfillment_metadata as Record<string, unknown>).proof_vault_record_ids,
                  ) &&
                  ((selectedRequest.fulfillment_metadata as Record<string, unknown>).proof_vault_record_ids as string[])
                    .length > 0 && (
                    <p className="text-xs font-mono text-[var(--text-secondary)]">
                      Proof vault:{' '}
                      {(
                        (selectedRequest.fulfillment_metadata as Record<string, unknown>)
                          .proof_vault_record_ids as string[]
                      ).join(', ')}
                    </p>
                  )}
                {selectedRequest.received_at && (
                  <p>
                    <strong>SLA started:</strong>{' '}
                    {new Date(selectedRequest.received_at).toLocaleString()}
                  </p>
                )}
                {selectedRequest.due_at && (
                  <p>
                    <strong>Response due:</strong>{' '}
                    {new Date(selectedRequest.due_at).toLocaleString()}
                  </p>
                )}
                {selectedRequest.right_type === 'grievance' && (
                  <p>
                    <strong>Grievance ack:</strong>{' '}
                    {selectedRequest.acknowledged_at
                      ? `Acknowledged ${new Date(selectedRequest.acknowledged_at).toLocaleString()}`
                      : selectedRequest.ack_due_at
                        ? `Due by ${new Date(selectedRequest.ack_due_at).toLocaleString()}`
                        : '—'}
                  </p>
                )}
                <p>
                  <strong>Requester:</strong> {selectedRequest.requester_name} (
                  {selectedRequest.requester_email ?? selectedRequest.requester_phone ?? '—'})
                </p>
                {selectedRequest.assigned_to_user_id && (
                  <p>
                    <strong>Handler:</strong>{' '}
                    {handlerNames[selectedRequest.assigned_to_user_id] ?? 'Assigned'}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{selectedRequest.request_details}</p>
              </div>
              {canEdit && teamMembers.length > 0 && selectedRequest.status !== 'completed' && (
                <div className="mb-4">
                  <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">
                    Assign handler
                  </label>
                  <p className="text-xs text-[var(--text-tertiary)] mb-2">
                    Select a handler, then use the action button below to assign and move the
                    request. Choosing a name here does not save until you click the button.
                  </p>
                  <select
                    value={pendingHandlerId}
                    disabled={saving}
                    onChange={(e) => setPendingHandlerId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)] disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name ?? m.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {canActOnRequest(selectedRequest) && selectedRequest.status !== 'completed' && (
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const hasHandler = Boolean(effectiveHandlerId(selectedRequest));
                    const canAdvance = !canEdit || hasHandler;
                    return (
                      <>
                        {canEdit &&
                          selectedRequest.right_type === 'grievance' &&
                          !selectedRequest.acknowledged_at && (
                            <ActionBtn
                              disabled={!canAdvance || saving}
                              onClick={() => void acknowledgeGrievance(selectedRequest)}
                            >
                              Acknowledge grievance (S.13)
                            </ActionBtn>
                          )}
                        {canEdit && selectedRequest.status === 'received' && (
                          <ActionBtn
                            disabled={!canAdvance || saving}
                            onClick={() => void advanceRequest(selectedRequest, 'in_review')}
                          >
                            Move to review
                          </ActionBtn>
                        )}
                        {selectedRequest.status === 'in_review' && (
                          <ActionBtn
                            disabled={!canAdvance || saving}
                            onClick={() => void advanceRequest(selectedRequest, 'response_ready')}
                          >
                            Mark response ready
                          </ActionBtn>
                        )}
                        {selectedRequest.status === 'response_ready' && (
                          <>
                            {canRequestLegal && !selectedRequest.requires_legal_signoff && (
                              <ActionBtn
                                disabled={saving}
                                onClick={() =>
                                  void updateRequest(selectedRequest.id, {
                                    requires_legal_signoff: true,
                                  }).then(() => notify('Forwarded to Legal for review.'))
                                }
                              >
                                Forward to Legal
                              </ActionBtn>
                            )}
                            {canSignLegal &&
                              selectedRequest.requires_legal_signoff &&
                              !selectedRequest.legal_signed_off_by_user_id && (
                                <ActionBtn
                                  disabled={saving}
                                  onClick={() =>
                                    void legalSignoffRequest(selectedRequest.id).then(() =>
                                      notify('Legal sign-off recorded.')
                                    )
                                  }
                                >
                                  Legal sign-off
                                </ActionBtn>
                              )}
                            <ActionBtn
                              disabled={
                                !canAdvance ||
                                saving ||
                                (Boolean(selectedRequest.requires_legal_signoff) &&
                                  !selectedRequest.legal_signed_off_by_user_id &&
                                  !canSignLegal)
                              }
                              onClick={() => void handleResolve(selectedRequest)}
                            >
                              Resolve &amp; close
                            </ActionBtn>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              {selectedRequest.status === 'completed' && selectedRequest.closure_text && (
                <button
                  type="button"
                  className="mt-4 flex items-center gap-2 text-sm text-indigo-600"
                  onClick={() => downloadClosureForRequest(selectedRequest)}
                >
                  <Download className="size-4" />
                  Download closure PDF
                </button>
              )}
              {saving && (
                <p className="text-xs text-[var(--text-secondary)] mt-2">Updating request…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </ConsentManagementGate>
  );
}

function KanbanColumnSection({
  col,
  colItems,
  paginationResetKey,
  canEdit,
  saving,
  selectedIds,
  handlerNames,
  allSelectedInColumn,
  selectAllInColumn,
  deselectAllInColumn,
  downloadColumnCsv,
  toggleSelected,
  openDetail,
  downloadClosureForRequest,
}: {
  col: { key: DataRightsRequestStatus; label: string };
  colItems: DataRightsRequest[];
  paginationResetKey: string;
  canEdit: boolean;
  saving: boolean;
  selectedIds: Set<string>;
  handlerNames: Record<string, string>;
  allSelectedInColumn: (status: DataRightsRequestStatus) => boolean;
  selectAllInColumn: (status: DataRightsRequestStatus) => void;
  deselectAllInColumn: (status: DataRightsRequestStatus) => void;
  downloadColumnCsv: (status: DataRightsRequestStatus, label: string) => void;
  toggleSelected: (id: string) => void;
  openDetail: (req: DataRightsRequest) => void;
  downloadClosureForRequest: (req: DataRightsRequest) => void;
}): ReactElement {
  const { page, setPage, pageCount, pageItems, total, pageSize } = useClientPagination(
    colItems,
    TABLE_PAGE_SIZE,
    paginationResetKey,
  );
  const showColumnSelection = canEdit && col.key !== 'completed' && colItems.length > 0;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-medium leading-snug">
            {col.label}{' '}
            <span className="text-[var(--text-tertiary)] font-normal">({colItems.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
            {showColumnSelection && (
              <>
                <button
                  type="button"
                  disabled={saving || allSelectedInColumn(col.key)}
                  onClick={() => selectAllInColumn(col.key)}
                  className="text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Select all
                </button>
                <span className="text-[var(--text-tertiary)]" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  disabled={saving || !colItems.some((r) => selectedIds.has(r.id))}
                  onClick={() => deselectAllInColumn(col.key)}
                  className="text-[var(--text-secondary)] hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Deselect all
                </button>
                <span className="text-[var(--text-tertiary)]" aria-hidden>
                  ·
                </span>
              </>
            )}
            <button
              type="button"
              disabled={colItems.length === 0}
              onClick={() => downloadColumnCsv(col.key, col.label)}
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              <Download className="size-3" />
              Download CSV
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
              {canEdit && col.key !== 'completed' && (
                <th className="w-10 py-2 px-3" aria-label="Select" />
              )}
              <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">
                Tracking ID
              </th>
              <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">
                Requester
              </th>
              <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">
                Right
              </th>
              <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">
                SLA / Status
              </th>
              <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">
                Handler
              </th>
              <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {colItems.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit && col.key !== 'completed' ? 7 : 6}
                  className="py-6 text-center text-[var(--text-secondary)]"
                >
                  No requests in this stage.
                </td>
              </tr>
            ) : (
              pageItems.map((req) => (
                <tr
                  key={req.id}
                  className={cn(
                    'border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)]',
                    selectedIds.has(req.id) && 'bg-indigo-50/50 dark:bg-indigo-950/20',
                  )}
                >
                  {canEdit && col.key !== 'completed' && (
                    <td className="py-2 px-3 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(req.id)}
                        disabled={saving}
                        onChange={() => toggleSelected(req.id)}
                        className="size-4 cursor-pointer"
                        aria-label={`Select ${req.tracking_id}`}
                      />
                    </td>
                  )}
                  <td className="py-2 px-3 align-top font-mono text-xs text-[var(--text-secondary)]">
                    {req.tracking_id}
                  </td>
                  <td className="py-2 px-3 align-top">
                    <div className="font-medium">{req.requester_name}</div>
                    <div className="text-xs text-[var(--text-tertiary)] truncate max-w-[200px]">
                      {req.requester_email ?? req.requester_phone ?? '—'}
                    </div>
                  </td>
                  <td className="py-2 px-3 align-top text-[var(--text-secondary)]">
                    {RIGHT_TYPE_LABELS[req.right_type]}
                  </td>
                  <td className="py-2 px-3 align-top">
                    <span
                      className={cn(
                        'text-xs',
                        req.sla_bucket === 'ack_breached' || req.sla_bucket === 'breached'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-[var(--text-secondary)]',
                      )}
                    >
                      {queueStatusLabel(req)}
                    </span>
                  </td>
                  <td className="py-2 px-3 align-top text-xs text-[var(--text-secondary)]">
                    {req.assigned_to_user_id
                      ? (handlerNames[req.assigned_to_user_id] ?? 'Assigned')
                      : '—'}
                  </td>
                  <td className="py-2 px-3 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDetail(req)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        View
                      </button>
                      {req.status === 'completed' && req.closure_text && (
                        <button
                          type="button"
                          onClick={() => downloadClosureForRequest(req)}
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                        >
                          <Download className="size-3" />
                          PDF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <TablePager
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          onPage={setPage}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  color,
  value,
  label,
  pulse,
}: {
  icon: typeof CheckCircle;
  color: string;
  value: number;
  label: string;
  pulse?: boolean;
}): ReactElement {
  const colors: Record<string, string> = {
    green: 'border-green-200 text-green-600',
    amber: 'border-amber-200 text-amber-600',
    blue: 'border-blue-200 text-blue-600',
    red: 'border-red-200 text-red-600',
  };
  return (
    <div
      className={`bg-[var(--surface-card)] rounded-lg border-2 p-4 ${colors[color]} ${pulse ? 'animate-pulse' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-5" />
        <div className="text-2xl font-semibold">{value}</div>
      </div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded ${active ? 'bg-[var(--status-info-bg)] text-[var(--status-info)]' : 'border border-[var(--border-default)]'}`}
    >
      {children}
    </button>
  );
}

function ActionBtn({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="px-3 py-1 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
