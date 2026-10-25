import { notify } from '@/app/utils/notify';
import { StatusPill } from '@/app/components/common/StatusPill';
import { TablePager } from '@/app/components/common/TablePager';
import { DPDPALabelChip } from '@/app/components/common/DPDPAChip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/app/components/ui/sheet';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { listBreachIncidents, fetchAuditEvents } from '@/lib/api/compliance';
import {
  addRegulatoryCorrespondence,
  assembleRegulatoryEvidence,
  createRegulatoryProceeding,
  downloadRegulatoryProceedingsExport,
  fetchRegulatoryProceedings,
  fetchRegulatoryProceedingSummary,
  updateRegulatoryProceeding,
  type RegulatoryProceeding,
  type RegulatoryProceedingSummary,
} from '@/lib/api/regulatoryProceedings';
import { listUsers } from '@/lib/api/users';
import type { User } from '@/types/auth';
import type { BreachIncident, AuditEvent } from '@/types/compliance';
import type { PillStatus } from '@/types';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Download,
  Eye,
  Gavel,
  Loader2,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

const PROCEEDING_TYPES = [
  'board_notice',
  'inquiry',
  'voluntary_undertaking',
  'appeal',
  'penalty',
  'correspondence',
] as const;

const STATUSES = ['open', 'in_progress', 'submitted', 'closed', 'appealed'] as const;

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['submitted', 'closed', 'appealed'],
  submitted: ['closed', 'appealed'],
  appealed: ['in_progress', 'closed'],
  closed: [],
};

type KpiFilter = 'all' | 'open' | 'in_progress' | 'overdue' | 'due_soon' | 'closed';

interface ProceedingFormState {
  proceeding_type: string;
  title: string;
  description: string;
  board_reference: string;
  penalty_exposure_crores: string;
  due_at: string;
  assigned_to_user_id: string;
  linked_breach_id: string;
  linked_audit_refs: string;
}

const EMPTY_FORM: ProceedingFormState = {
  proceeding_type: 'inquiry',
  title: '',
  description: '',
  board_reference: '',
  penalty_exposure_crores: '',
  due_at: '',
  assigned_to_user_id: '',
  linked_breach_id: '',
  linked_audit_refs: '',
};

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function mapStatus(status: string): PillStatus {
  if (status === 'open') return 'open';
  if (status === 'in_progress') return 'pending';
  if (status === 'submitted') return 'completed';
  if (status === 'appealed') return 'pending_legal';
  return 'closed';
}

function isOverdue(row: RegulatoryProceeding): boolean {
  if (!row.due_at) return false;
  if (row.status === 'closed' || row.status === 'submitted') return false;
  return new Date(row.due_at) < new Date();
}

function isDueSoon(row: RegulatoryProceeding): boolean {
  if (!row.due_at) return false;
  if (row.status === 'closed' || row.status === 'submitted') return false;
  const due = new Date(row.due_at);
  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  return due >= now && due <= soon;
}

function proceedingToForm(row: RegulatoryProceeding): ProceedingFormState {
  return {
    proceeding_type: row.proceeding_type,
    title: row.title,
    description: row.description ?? '',
    board_reference: row.board_reference ?? '',
    penalty_exposure_crores: row.penalty_exposure_crores?.toString() ?? '',
    due_at: row.due_at ? row.due_at.slice(0, 16) : '',
    assigned_to_user_id: row.assigned_to_user_id ?? '',
    linked_breach_id: row.linked_breach_id ?? '',
    linked_audit_refs: (row.linked_audit_refs ?? []).join('\n'),
  };
}

function formToPayload(form: ProceedingFormState): Partial<RegulatoryProceeding> {
  return {
    proceeding_type: form.proceeding_type,
    title: form.title.trim(),
    description: form.description.trim() || null,
    board_reference: form.board_reference.trim() || null,
    penalty_exposure_crores: form.penalty_exposure_crores
      ? Number.parseInt(form.penalty_exposure_crores, 10)
      : null,
    due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
    assigned_to_user_id: form.assigned_to_user_id || null,
    linked_breach_id: form.linked_breach_id || null,
    linked_audit_refs: form.linked_audit_refs
      .split('\n')
      .map((ref) => ref.trim())
      .filter(Boolean),
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
          <div className="text-sm font-medium">{event.action}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">{event.details}</div>
          <div className="text-xs text-[var(--text-tertiary)] mt-2">
            {new Date(event.time).toLocaleString()} · {event.actor}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RegulatoryProceedings(): ReactElement {
  const { orgIdParam, canEdit, hasOrg } = useComplianceOrg();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<RegulatoryProceeding[]>([]);
  const [summary, setSummary] = useState<RegulatoryProceedingSummary | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [breaches, setBreaches] = useState<BreachIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<RegulatoryProceeding | null>(null);
  const [selected, setSelected] = useState<RegulatoryProceeding | null>(null);
  const [form, setForm] = useState<ProceedingFormState>(EMPTY_FORM);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [corrDirection, setCorrDirection] = useState('inbound');
  const [corrSubject, setCorrSubject] = useState('');
  const [corrSummary, setCorrSummary] = useState('');

  const load = useCallback(async () => {
    if (!hasOrg) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, sum, orgUsers, breachList] = await Promise.all([
        fetchRegulatoryProceedings(orgIdParam),
        fetchRegulatoryProceedingSummary(orgIdParam),
        listUsers(orgIdParam),
        listBreachIncidents(orgIdParam),
      ]);
      setRows(list);
      setSummary(sum);
      setUsers(orgUsers);
      setBreaches(breachList);
    } catch {
      notify('Failed to load regulatory proceedings');
    } finally {
      setLoading(false);
    }
  }, [hasOrg, orgIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'overdue') {
      setKpiFilter('overdue');
      setOverdueOnly(true);
    }
  }, [searchParams]);

  const loadAudit = useCallback(
    async (proceedingId: string) => {
      setAuditLoading(true);
      try {
        const result = await fetchAuditEvents({
          orgId: orgIdParam,
          resource_type: 'regulatory_proceeding',
          page_size: 10,
        });
        setAuditEvents(result.items.filter((event) => event.resource_id === proceedingId));
      } catch {
        setAuditEvents([]);
      } finally {
        setAuditLoading(false);
      }
    },
    [orgIdParam],
  );

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const breachesById = useMemo(() => new Map(breaches.map((breach) => [breach.id, breach])), [breaches]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const haystack = `${row.proceeding_ref} ${row.title} ${row.board_reference ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (typeFilter && row.proceeding_type !== typeFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (assigneeFilter && row.assigned_to_user_id !== assigneeFilter) return false;
      if (overdueOnly && !isOverdue(row)) return false;
      if (kpiFilter === 'open' && row.status !== 'open') return false;
      if (kpiFilter === 'in_progress' && row.status !== 'in_progress') return false;
      if (kpiFilter === 'overdue' && !isOverdue(row)) return false;
      if (kpiFilter === 'due_soon' && !isDueSoon(row)) return false;
      if (kpiFilter === 'closed' && row.status !== 'closed') return false;
      return true;
    });
  }, [rows, search, typeFilter, statusFilter, assigneeFilter, overdueOnly, kpiFilter]);

  const filterKey = `${search}|${typeFilter}|${statusFilter}|${assigneeFilter}|${overdueOnly}|${kpiFilter}`;
  const { page, setPage, pageCount, slice } = useClientPagination(filteredRows, undefined, filterKey);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: RegulatoryProceeding) {
    setEditing(row);
    setForm(proceedingToForm(row));
    setFormOpen(true);
  }

  function openDetail(row: RegulatoryProceeding) {
    setSelected(row);
    setCorrDirection('inbound');
    setCorrSubject('');
    setCorrSummary('');
    setDetailOpen(true);
    void loadAudit(row.id);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      notify('Title is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = formToPayload(form);
      if (editing) {
        await updateRegulatoryProceeding(editing.id, payload, orgIdParam);
        notify('Proceeding updated');
      } else {
        await createRegulatoryProceeding(payload, orgIdParam);
        notify('Proceeding created');
      }
      setFormOpen(false);
      await load();
    } catch {
      notify(editing ? 'Could not update proceeding' : 'Could not create proceeding');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(nextStatus: string) {
    if (!selected) return;
    setSubmitting(true);
    try {
      const updated = await updateRegulatoryProceeding(selected.id, { status: nextStatus }, orgIdParam);
      setSelected(updated);
      notify(`Status updated to ${formatLabel(nextStatus)}`);
      await load();
      void loadAudit(updated.id);
    } catch {
      notify('Invalid or blocked status transition');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssembleEvidence() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const updated = await assembleRegulatoryEvidence(selected.id, orgIdParam);
      setSelected(updated);
      notify('Evidence pack assembled');
      await load();
      void loadAudit(updated.id);
    } catch {
      notify('Could not assemble evidence pack');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddCorrespondence() {
    if (!selected || !corrSubject.trim() || !corrSummary.trim()) {
      notify('Subject and summary are required');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await addRegulatoryCorrespondence(
        selected.id,
        {
          direction: corrDirection,
          subject: corrSubject.trim(),
          summary: corrSummary.trim(),
        },
        orgIdParam,
      );
      setSelected(updated);
      setCorrSubject('');
      setCorrSummary('');
      notify('Correspondence logged');
      await load();
      void loadAudit(updated.id);
    } catch {
      notify('Could not log correspondence');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport() {
    try {
      await downloadRegulatoryProceedingsExport(orgIdParam);
      notify('Register exported');
    } catch {
      notify('Export failed');
    }
  }

  function downloadEvidencePack() {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected.evidence_pack ?? [], null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selected.proceeding_ref}-evidence-pack.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Gavel className="size-8 text-[var(--brand-primary)]" />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Regulatory Proceedings</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              §27–§37 Board inquiry, appeal, voluntary undertaking, and correspondence workspace.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <DPDPALabelChip text="§27–§37 Regulatory Proceedings" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void handleExport()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm">
            <Download className="size-4" /> Export CSV
          </button>
          {canEdit ? (
            <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm">
              <Plus className="size-4" /> New case
            </button>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          View-only access. Compliance manage permission is required to manage proceedings.
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { key: 'open' as const, label: 'Open', value: summary.open_count },
            { key: 'in_progress' as const, label: 'In progress', value: summary.in_progress_count },
            { key: 'overdue' as const, label: 'Overdue', value: summary.overdue_count },
            { key: 'due_soon' as const, label: 'Due soon', value: summary.due_soon_count ?? 0 },
            { key: 'closed' as const, label: 'Closed', value: summary.closed_count ?? 0 },
            { key: 'all' as const, label: 'Penalty exposure', value: `₹${summary.total_penalty_exposure_crores} Cr` },
          ].map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => card.key !== 'all' && setKpiFilter(card.key)}
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

      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ref, title, board reference..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm"
            />
          </div>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-sm">
            <option value="">All types</option>
            {PROCEEDING_TYPES.map((type) => (
              <option key={type} value={type}>{formatLabel(type)}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-sm">
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{formatLabel(status)}</option>
            ))}
          </select>
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-sm">
            <option value="">All assignees</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm px-2">
            <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
            Overdue only
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-[var(--brand-primary)]" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-12 text-center">
          <Gavel className="size-10 mx-auto text-[var(--text-tertiary)] mb-3" />
          <h3 className="text-lg font-medium">No regulatory proceedings yet</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
            Track Board inquiries, appeals, and correspondence with evidence packs and deadline management.
          </p>
          {canEdit ? (
            <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm">
              <Plus className="size-4" /> Open first case
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Ref</th>
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Board ref</th>
                  <th className="text-left px-4 py-3 font-medium">Due date</th>
                  <th className="text-left px-4 py-3 font-medium">Assignee</th>
                  <th className="text-left px-4 py-3 font-medium">Penalty</th>
                  <th className="text-left px-4 py-3 font-medium">Evidence</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => {
                  const assignee = row.assigned_to_user_id ? usersById.get(row.assigned_to_user_id) : null;
                  return (
                    <tr key={row.id} className="border-t border-[var(--border-default)] hover:bg-[var(--surface-raised)]/40">
                      <td className="px-4 py-3 font-mono text-xs">{row.proceeding_ref}</td>
                      <td className="px-4 py-3 font-medium">{row.title}</td>
                      <td className="px-4 py-3 capitalize">{formatLabel(row.proceeding_type)}</td>
                      <td className="px-4 py-3"><StatusPill status={mapStatus(row.status)} label={formatLabel(row.status)} /></td>
                      <td className="px-4 py-3">{row.board_reference || '—'}</td>
                      <td className={cn('px-4 py-3', isOverdue(row) && 'text-[var(--status-danger)] font-medium')}>
                        {row.due_at ? new Date(row.due_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">{assignee ? assignee.full_name || assignee.email : '—'}</td>
                      <td className="px-4 py-3">{row.penalty_exposure_crores ? `₹${row.penalty_exposure_crores} Cr` : '—'}</td>
                      <td className="px-4 py-3">{row.evidence_pack?.length ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => openDetail(row)} className="p-2 rounded hover:bg-black/5" title="Open workspace">
                            <Eye className="size-4" />
                          </button>
                          {canEdit ? (
                            <button type="button" onClick={() => openEdit(row)} className="p-2 rounded hover:bg-black/5" title="Edit">
                              <Pencil className="size-4" />
                            </button>
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
            total={filteredRows.length}
            pageSize={TABLE_PAGE_SIZE}
            onPage={setPage}
          />
        </>
      )}

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col gap-0 p-0">
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-[var(--border-default)]">
            <SheetTitle>{editing ? 'Edit proceeding' : 'New regulatory proceeding'}</SheetTitle>
            <SheetDescription>Capture Board reference, deadlines, assignee, and linked breach incident.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            <Field label="Proceeding type">
              <select value={form.proceeding_type} onChange={(event) => setForm({ ...form, proceeding_type: event.target.value })} className={inputClass}>
                {PROCEEDING_TYPES.map((type) => (
                  <option key={type} value={type}>{formatLabel(type)}</option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className={inputClass} />
            </Field>
            <Field label="Board reference">
              <input value={form.board_reference} onChange={(event) => setForm({ ...form, board_reference: event.target.value })} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Penalty exposure (₹ Cr)">
                <input type="number" min="0" value={form.penalty_exposure_crores} onChange={(event) => setForm({ ...form, penalty_exposure_crores: event.target.value })} className={inputClass} />
              </Field>
              <Field label="Due date">
                <input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} className={inputClass} />
              </Field>
            </div>
            <Field label="Assignee">
              <select value={form.assigned_to_user_id} onChange={(event) => setForm({ ...form, assigned_to_user_id: event.target.value })} className={inputClass}>
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                ))}
              </select>
            </Field>
            <Field label="Linked breach incident">
              <select value={form.linked_breach_id} onChange={(event) => setForm({ ...form, linked_breach_id: event.target.value })} className={inputClass}>
                <option value="">None</option>
                {breaches.map((breach) => (
                  <option key={breach.id} value={breach.id}>{breach.incident_ref} — {breach.severity}</option>
                ))}
              </select>
            </Field>
            <Field label="Linked audit refs (one per line)">
              <textarea value={form.linked_audit_refs} onChange={(event) => setForm({ ...form, linked_audit_refs: event.target.value })} rows={3} className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button type="button" disabled={submitting} onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm disabled:opacity-60">
                {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create case'}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col gap-0 p-0">
          {selected ? (
            <>
              <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-[var(--border-default)] space-y-2">
                <p className="text-xs font-mono text-[var(--text-tertiary)]">{selected.proceeding_ref}</p>
                <SheetTitle className="text-xl leading-snug pr-8">{selected.title}</SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="capitalize">{formatLabel(selected.proceeding_type)}</span>
                    <StatusPill status={mapStatus(selected.status)} label={formatLabel(selected.status)} />
                  </div>
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-6 pb-8 space-y-5">
                <DetailBlock label="Description" value={selected.description} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailBlock label="Board reference" value={selected.board_reference} />
                  <DetailBlock
                    label="Due date"
                    value={selected.due_at ? new Date(selected.due_at).toLocaleString() : null}
                  />
                </div>
                {selected.linked_breach_id && breachesById.get(selected.linked_breach_id) ? (
                  <DetailBlock
                    label="Linked breach"
                    value={breachesById.get(selected.linked_breach_id)?.incident_ref ?? null}
                    href={`/breach/${selected.linked_breach_id}`}
                  />
                ) : null}

                {canEdit ? (
                  <SectionCard title="Status workflow">
                    <div className="flex flex-wrap gap-2">
                      {(STATUS_TRANSITIONS[selected.status] ?? []).length === 0 ? (
                        <p className="text-sm text-[var(--text-tertiary)]">No further transitions available.</p>
                      ) : (
                        (STATUS_TRANSITIONS[selected.status] ?? []).map((nextStatus) => (
                          <button
                            key={nextStatus}
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleStatusChange(nextStatus)}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-sm hover:bg-[var(--surface-raised)] disabled:opacity-60"
                          >
                            Move to {formatLabel(nextStatus)}
                          </button>
                        ))
                      )}
                    </div>
                  </SectionCard>
                ) : null}

                <SectionCard
                  title={`Evidence pack (${selected.evidence_pack?.length ?? 0})`}
                  action={
                    <div className="flex gap-2">
                      {canEdit ? (
                        <button type="button" onClick={() => void handleAssembleEvidence()} className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-sm hover:bg-[var(--surface-raised)]">
                          Assemble
                        </button>
                      ) : null}
                      <button type="button" onClick={downloadEvidencePack} className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-sm hover:bg-[var(--surface-raised)]">
                        Download
                      </button>
                    </div>
                  }
                >
                  {(selected.evidence_pack ?? []).length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)]">No evidence items yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {(selected.evidence_pack ?? []).map((item, index) => (
                        <div key={index} className="rounded-lg bg-[var(--surface-raised)] p-3 text-xs font-mono overflow-x-auto">
                          {JSON.stringify(item)}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Correspondence log">
                  {(selected.correspondence_log ?? []).length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)]">No correspondence logged yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {(selected.correspondence_log ?? []).map((entry, index) => (
                        <div key={index} className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/40 p-3">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{String(entry.subject ?? 'Correspondence')}</div>
                          <div className="text-xs text-[var(--text-secondary)] mt-1 capitalize">
                            {String(entry.direction ?? 'unknown')} · {String(entry.author ?? 'Unknown')}
                          </div>
                          <div className="text-sm text-[var(--text-primary)] mt-2">{String(entry.summary ?? '')}</div>
                          {entry.date ? (
                            <div className="text-xs text-[var(--text-tertiary)] mt-2">
                              {new Date(String(entry.date)).toLocaleString()}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                  {canEdit ? (
                    <div className="space-y-3 pt-4 mt-4 border-t border-[var(--border-default)]">
                      <p className="text-xs font-semibold text-[var(--text-secondary)]">Add entry</p>
                      <Field label="Direction">
                        <select value={corrDirection} onChange={(event) => setCorrDirection(event.target.value)} className={inputClass}>
                          <option value="inbound">Inbound</option>
                          <option value="outbound">Outbound</option>
                        </select>
                      </Field>
                      <Field label="Subject">
                        <input value={corrSubject} onChange={(event) => setCorrSubject(event.target.value)} placeholder="Subject line" className={inputClass} />
                      </Field>
                      <Field label="Summary">
                        <textarea value={corrSummary} onChange={(event) => setCorrSummary(event.target.value)} rows={3} placeholder="Summary of correspondence" className={inputClass} />
                      </Field>
                      <button type="button" disabled={submitting} onClick={() => void handleAddCorrespondence()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm disabled:opacity-60">
                        Log correspondence
                      </button>
                    </div>
                  ) : null}
                </SectionCard>

                <SectionCard title="Recent activity">
                  <AuditFeed events={auditEvents} loading={auditLoading} />
                </SectionCard>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{label}</span>
      {children}
    </label>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): ReactElement {
  return (
    <section className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailBlock({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
}): ReactElement {
  const isEmpty = !value?.trim();

  return (
    <div>
      <div className="text-xs font-medium text-[var(--text-tertiary)] mb-1.5">{label}</div>
      {isEmpty ? (
        <p className="text-sm text-[var(--text-tertiary)] italic">Not provided</p>
      ) : href ? (
        <Link to={href} className="text-sm text-[var(--brand-primary)] hover:underline">
          {value}
        </Link>
      ) : (
        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:border-[var(--brand-primary)]';
