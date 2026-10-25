import { notify } from '@/app/utils/notify';
import { DPDPALabelChip } from '@/app/components/common/DPDPAChip';
import { StatusPill } from '@/app/components/common/StatusPill';
import { TablePager } from '@/app/components/common/TablePager';
import { Modal } from '@/app/components/ui/Modal';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/app/components/ui/sheet';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { fetchAuditEvents } from '@/lib/api/compliance';
import {
  createLegitimateUseRecord,
  deleteLegitimateUseRecord,
  downloadLegitimateUseExport,
  fetchLegitimateUseRecords,
  fetchLegitimateUseSummary,
  markLegitimateUseReviewed,
  updateLegitimateUseRecord,
  type LegitimateUseRecord,
  type LegitimateUseSummary,
} from '@/lib/api/legitimateUse';
import { fetchRopaActivities, type ProcessingActivity } from '@/lib/api/ropa';
import { listUsers } from '@/lib/api/users';
import type { User } from '@/types/auth';
import type { AuditEvent } from '@/types/compliance';
import type { PillStatus } from '@/types';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Download,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

const GROUNDS = [
  'employment',
  'medical_emergency',
  'disaster_response',
  'legal_claim',
  'research_statistics',
  'fraud_default',
  'judicial_regulatory',
  'startup_notification',
  'other',
] as const;

const STATUSES = ['active', 'under_review', 'retired'] as const;

type KpiFilter = 'all' | 'active' | 'under_review' | 'due';

interface RecordFormState {
  title: string;
  ground_type: string;
  legal_rationale: string;
  approver_name: string;
  approver_user_id: string;
  retention_basis: string;
  downstream_sharing: string;
  review_date: string;
  exemption_tags: string;
  evidence_refs: string;
  status: string;
  ropa_activity_id: string;
}

const EMPTY_FORM: RecordFormState = {
  title: '',
  ground_type: 'legal_claim',
  legal_rationale: '',
  approver_name: '',
  approver_user_id: '',
  retention_basis: '',
  downstream_sharing: '',
  review_date: '',
  exemption_tags: '',
  evidence_refs: '',
  status: 'active',
  ropa_activity_id: '',
};

function formatGround(value: string): string {
  return value.replace(/_/g, ' ');
}

function mapStatus(status: string): PillStatus {
  if (status === 'active') return 'active';
  if (status === 'under_review') return 'pending';
  return 'closed';
}

function isDue(record: LegitimateUseRecord): boolean {
  if (!record.review_date || record.status !== 'active') return false;
  return new Date(record.review_date) <= new Date();
}

function recordToForm(record: LegitimateUseRecord): RecordFormState {
  return {
    title: record.title,
    ground_type: record.ground_type,
    legal_rationale: record.legal_rationale,
    approver_name: record.approver_name ?? '',
    approver_user_id: record.approver_user_id ?? '',
    retention_basis: record.retention_basis ?? '',
    downstream_sharing: record.downstream_sharing ?? '',
    review_date: record.review_date ?? '',
    exemption_tags: (record.exemption_tags ?? []).join(', '),
    evidence_refs: (record.evidence_refs ?? []).join('\n'),
    status: record.status,
    ropa_activity_id: record.ropa_activity_id ?? '',
  };
}

function formToPayload(form: RecordFormState): Partial<LegitimateUseRecord> {
  return {
    title: form.title.trim(),
    ground_type: form.ground_type,
    legal_rationale: form.legal_rationale.trim(),
    approver_name: form.approver_name.trim() || null,
    approver_user_id: form.approver_user_id || null,
    retention_basis: form.retention_basis.trim() || null,
    downstream_sharing: form.downstream_sharing.trim() || null,
    review_date: form.review_date || null,
    exemption_tags: form.exemption_tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    evidence_refs: form.evidence_refs
      .split('\n')
      .map((ref) => ref.trim())
      .filter(Boolean),
    status: form.status,
    ropa_activity_id: form.ropa_activity_id || null,
  };
}

function AuditFeed({ events, loading }: { events: AuditEvent[]; loading: boolean }): ReactElement {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }
  if (events.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">No audit activity recorded yet.</p>;
  }
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="rounded-lg border border-[var(--border-default)] p-3">
          <div className="text-sm font-medium text-[var(--text-primary)]">{event.action}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">{event.details}</div>
          <div className="text-xs text-[var(--text-tertiary)] mt-2">
            {new Date(event.time).toLocaleString()} · {event.actor}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LegitimateUseRegistry(): ReactElement {
  const { orgIdParam, canEdit, hasOrg } = useComplianceOrg();
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState<LegitimateUseRecord[]>([]);
  const [summary, setSummary] = useState<LegitimateUseSummary | null>(null);
  const [ropaActivities, setRopaActivities] = useState<ProcessingActivity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [groundFilter, setGroundFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [linkedRopaOnly, setLinkedRopaOnly] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<LegitimateUseRecord | null>(null);
  const [selected, setSelected] = useState<LegitimateUseRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LegitimateUseRecord | null>(null);
  const [form, setForm] = useState<RecordFormState>(EMPTY_FORM);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');

  const load = useCallback(async () => {
    if (!hasOrg) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rows, sum, activities, orgUsers] = await Promise.all([
        fetchLegitimateUseRecords(orgIdParam),
        fetchLegitimateUseSummary(orgIdParam),
        fetchRopaActivities({ orgId: orgIdParam }),
        listUsers(orgIdParam),
      ]);
      setRecords(rows);
      setSummary(sum);
      setRopaActivities(activities);
      setUsers(orgUsers);
    } catch {
      notify('Failed to load legitimate use registry');
    } finally {
      setLoading(false);
    }
  }, [hasOrg, orgIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'due') {
      setKpiFilter('due');
      setDueOnly(true);
    }
  }, [searchParams]);

  const loadAudit = useCallback(
    async (recordId: string) => {
      setAuditLoading(true);
      try {
        const result = await fetchAuditEvents({
          orgId: orgIdParam,
          resource_type: 'legitimate_use_record',
          page_size: 10,
        });
        setAuditEvents(result.items.filter((event) => event.resource_id === recordId));
      } catch {
        setAuditEvents([]);
      } finally {
        setAuditLoading(false);
      }
    },
    [orgIdParam],
  );

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((record) => {
      if (q) {
        const haystack = `${record.title} ${record.legal_rationale} ${record.approver_name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (groundFilter && record.ground_type !== groundFilter) return false;
      if (statusFilter && record.status !== statusFilter) return false;
      if (dueOnly && !isDue(record)) return false;
      if (linkedRopaOnly && !record.ropa_activity_id) return false;
      if (kpiFilter === 'active' && record.status !== 'active') return false;
      if (kpiFilter === 'under_review' && record.status !== 'under_review') return false;
      if (kpiFilter === 'due' && !isDue(record)) return false;
      return true;
    });
  }, [records, search, groundFilter, statusFilter, dueOnly, linkedRopaOnly, kpiFilter]);

  const filterKey = `${search}|${groundFilter}|${statusFilter}|${dueOnly}|${linkedRopaOnly}|${kpiFilter}`;
  const { page, setPage, pageCount, slice } = useClientPagination(filteredRecords, undefined, filterKey);

  const ropaById = useMemo(
    () => new Map(ropaActivities.map((activity) => [activity.id, activity])),
    [ropaActivities],
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(record: LegitimateUseRecord) {
    setEditing(record);
    setForm(recordToForm(record));
    setFormOpen(true);
  }

  function openDetail(record: LegitimateUseRecord) {
    setSelected(record);
    setReviewNotes('');
    setNextReviewDate('');
    setDetailOpen(true);
    void loadAudit(record.id);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.legal_rationale.trim()) {
      notify('Title and legal rationale are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = formToPayload(form);
      if (editing) {
        await updateLegitimateUseRecord(editing.id, payload, orgIdParam);
        notify('Record updated');
      } else {
        await createLegitimateUseRecord(payload, orgIdParam);
        notify('Record created');
      }
      setFormOpen(false);
      await load();
    } catch {
      notify(editing ? 'Could not update record' : 'Could not create record');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteLegitimateUseRecord(deleteTarget.id, orgIdParam);
      notify('Record removed');
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) setDetailOpen(false);
      await load();
    } catch {
      notify('Could not delete record');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkReviewed() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const updated = await markLegitimateUseReviewed(
        selected.id,
        {
          review_date: nextReviewDate || null,
          notes: reviewNotes.trim() || null,
        },
        orgIdParam,
      );
      setSelected(updated);
      notify('Record marked as reviewed');
      await load();
      void loadAudit(updated.id);
    } catch {
      notify('Could not mark record reviewed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport() {
    try {
      await downloadLegitimateUseExport(orgIdParam);
      notify('Register exported');
    } catch {
      notify('Export failed');
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Scale className="size-8 text-[var(--brand-primary)]" />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Legitimate Use Registry</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Operational register for DPDPA §7 and §17 processing grounds.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <DPDPALabelChip text="§7 Legitimate Use" />
              <DPDPALabelChip text="§17 Exemptions" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-default)] text-sm"
          >
            <Download className="size-4" /> Export CSV
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm"
            >
              <Plus className="size-4" /> Add record
            </button>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          View-only access. Compliance manage permission is required to edit this register.
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { key: 'all' as const, label: 'Total records', value: summary.total_records },
            { key: 'active' as const, label: 'Active', value: summary.active_records },
            { key: 'under_review' as const, label: 'Under review', value: summary.under_review_records ?? 0 },
            { key: 'due' as const, label: 'Due for review', value: summary.due_for_review },
          ].map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setKpiFilter(card.key)}
              className={cn(
                'p-4 rounded-xl border text-left transition-colors',
                kpiFilter === card.key
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                  : 'border-[var(--border-default)] bg-[var(--surface-primary)] hover:bg-[var(--surface-raised)]',
              )}
            >
              <div className="text-sm text-[var(--text-secondary)]">{card.label}</div>
              <div className="text-2xl font-semibold mt-1">{card.value}</div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, rationale, approver..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm"
            />
          </div>
          <select
            value={groundFilter}
            onChange={(event) => setGroundFilter(event.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm"
          >
            <option value="">All grounds</option>
            {GROUNDS.map((ground) => (
              <option key={ground} value={ground}>
                {formatGround(ground)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatGround(status)}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm px-2">
            <input type="checkbox" checked={dueOnly} onChange={(event) => setDueOnly(event.target.checked)} />
            Due only
          </label>
          <label className="inline-flex items-center gap-2 text-sm px-2">
            <input
              type="checkbox"
              checked={linkedRopaOnly}
              onChange={(event) => setLinkedRopaOnly(event.target.checked)}
            />
            Linked to RoPA
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-[var(--brand-primary)]" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-12 text-center">
          <Scale className="size-10 mx-auto text-[var(--text-tertiary)] mb-3" />
          <h3 className="text-lg font-medium">No legitimate-use records yet</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
            Document every non-consent processing ground with legal rationale, approver, and review cadence.
          </p>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm"
            >
              <Plus className="size-4" /> Add your first record
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Ground</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Approver</th>
                  <th className="text-left px-4 py-3 font-medium">Review date</th>
                  <th className="text-left px-4 py-3 font-medium">RoPA link</th>
                  <th className="text-left px-4 py-3 font-medium">Last reviewed</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((record) => {
                  const ropa = record.ropa_activity_id ? ropaById.get(record.ropa_activity_id) : null;
                  return (
                    <tr key={record.id} className="border-t border-[var(--border-default)] hover:bg-[var(--surface-raised)]/40">
                      <td className="px-4 py-3 font-medium">{record.title}</td>
                      <td className="px-4 py-3 capitalize">{formatGround(record.ground_type)}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={mapStatus(record.status)} label={formatGround(record.status)} />
                      </td>
                      <td className="px-4 py-3">{record.approver_name || '—'}</td>
                      <td className={cn('px-4 py-3', isDue(record) && 'text-[var(--status-danger)] font-medium')}>
                        {record.review_date ? new Date(record.review_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {ropa ? (
                          <Link to="/data/ropa" className="text-[var(--brand-primary)] hover:underline">
                            {ropa.activity_ref}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {record.last_reviewed_at
                          ? new Date(record.last_reviewed_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => openDetail(record)} className="p-2 rounded hover:bg-black/5" title="View">
                            <Eye className="size-4" />
                          </button>
                          {canEdit ? (
                            <>
                              <button type="button" onClick={() => openEdit(record)} className="p-2 rounded hover:bg-black/5" title="Edit">
                                <Pencil className="size-4" />
                              </button>
                              <button type="button" onClick={() => setDeleteTarget(record)} className="p-2 rounded hover:bg-black/5 text-[var(--status-danger)]" title="Delete">
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePager
            page={page}
            pageCount={pageCount}
            total={filteredRecords.length}
            pageSize={TABLE_PAGE_SIZE}
            onPage={setPage}
          />
        </>
      )}

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col gap-0 p-0">
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 pr-12 border-b border-[var(--border-default)]">
            <SheetTitle>{editing ? 'Edit record' : 'Add processing ground'}</SheetTitle>
            <SheetDescription>Capture the full §7 / §17 legitimate-use assessment for audit readiness.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            <Field label="Title">
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Ground type">
              <select value={form.ground_type} onChange={(event) => setForm({ ...form, ground_type: event.target.value })} className={inputClass}>
                {GROUNDS.map((ground) => (
                  <option key={ground} value={ground}>
                    {formatGround(ground)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Legal rationale">
              <textarea value={form.legal_rationale} onChange={(event) => setForm({ ...form, legal_rationale: event.target.value })} rows={4} className={inputClass} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Approver name">
                <input value={form.approver_name} onChange={(event) => setForm({ ...form, approver_name: event.target.value })} className={inputClass} />
              </Field>
              <Field label="Approver user">
                <select value={form.approver_user_id} onChange={(event) => setForm({ ...form, approver_user_id: event.target.value })} className={inputClass}>
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Retention basis">
              <textarea value={form.retention_basis} onChange={(event) => setForm({ ...form, retention_basis: event.target.value })} rows={2} className={inputClass} />
            </Field>
            <Field label="Downstream sharing">
              <textarea value={form.downstream_sharing} onChange={(event) => setForm({ ...form, downstream_sharing: event.target.value })} rows={2} className={inputClass} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Review date">
                <input type="date" value={form.review_date} onChange={(event) => setForm({ ...form, review_date: event.target.value })} className={inputClass} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={inputClass}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatGround(status)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Exemption tags (comma-separated)">
              <input value={form.exemption_tags} onChange={(event) => setForm({ ...form, exemption_tags: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Evidence references (one per line)">
              <textarea value={form.evidence_refs} onChange={(event) => setForm({ ...form, evidence_refs: event.target.value })} rows={3} className={inputClass} />
            </Field>
            <Field label="Linked RoPA activity">
              <select value={form.ropa_activity_id} onChange={(event) => setForm({ ...form, ropa_activity_id: event.target.value })} className={inputClass}>
                <option value="">None</option>
                {ropaActivities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.activity_ref} — {activity.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <SheetFooter className="shrink-0 flex-row justify-end gap-2 px-6 py-4 border-t border-[var(--border-default)] bg-[var(--surface-raised)]">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg border text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm disabled:opacity-60"
            >
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create record'}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col gap-0 p-0">
          {selected ? (
            <>
              <SheetHeader className="shrink-0 px-6 pt-6 pb-4 pr-12 border-b border-[var(--border-default)]">
                <SheetTitle className="pr-2">{selected.title}</SheetTitle>
                <SheetDescription className="capitalize">{formatGround(selected.ground_type)} · {formatGround(selected.status)}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 pb-8 space-y-5">
                <DetailBlock label="Legal rationale" value={selected.legal_rationale} />
                <DetailBlock label="Approver" value={selected.approver_name || '—'} />
                <DetailBlock label="Retention basis" value={selected.retention_basis || '—'} />
                <DetailBlock label="Downstream sharing" value={selected.downstream_sharing || '—'} />
                <DetailBlock
                  label="Review date"
                  value={selected.review_date ? new Date(selected.review_date).toLocaleDateString() : '—'}
                />
                {selected.ropa_activity_id && ropaById.get(selected.ropa_activity_id) ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1">RoPA link</div>
                    <Link to="/data/ropa" className="text-[var(--brand-primary)] hover:underline text-sm">
                      {ropaById.get(selected.ropa_activity_id)?.activity_ref} — {ropaById.get(selected.ropa_activity_id)?.title}
                    </Link>
                  </div>
                ) : null}
                {canEdit ? (
                  <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-3">
                    <h4 className="font-medium">Mark reviewed</h4>
                    <input
                      type="date"
                      value={nextReviewDate}
                      onChange={(event) => setNextReviewDate(event.target.value)}
                      className={inputClass}
                      placeholder="Next review date"
                    />
                    <textarea
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder="Review notes (optional)"
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleMarkReviewed()}
                      className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm disabled:opacity-60"
                    >
                      Mark reviewed
                    </button>
                  </div>
                ) : null}
                <div>
                  <h4 className="font-medium mb-3">Recent activity</h4>
                  <AuditFeed events={auditEvents} loading={auditLoading} />
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {deleteTarget ? (
        <Modal size="sm" title="Delete record?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            This will permanently remove <strong>{deleteTarget.title}</strong> from the register.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg border text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleDelete()}
              className="px-4 py-2 rounded-lg bg-[var(--status-danger)] text-white text-sm disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1">{label}</div>
      <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{value}</div>
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:border-[var(--brand-primary)]';
