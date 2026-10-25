import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileLock2,
  Hash,
  HeartPulse,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldAlert,
  Siren,
  Stethoscope,
  UnlockKeyhole,
} from 'lucide-react';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/app/components/ui/sheet';
import { notify } from '@/app/utils/notify';
import { adviseHealthcareAccess, breakTheGlass, evaluateHealthcareAccess, USE_MOCK_DATA } from '@/lib/api/healthcare';
import type { AccessDecisionResponse, AIEvaluationResponse, ClinicalRecordItem, HealthcarePurpose } from '@/types/healthcare';
import { GemmaBadge, HealthcarePanel, HealthcareHeader, HealthcarePage, LiveBadge, LoadingState } from './HealthcareUI';

const departments = ['Cardiology', 'Oncology', 'Dentistry', 'Psychiatry', 'General Medicine', 'Emergency'];
const purposes: HealthcarePurpose[] = ['treatment', 'diagnostics', 'research', 'insurance', 'emergency'];

function formatKey(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(' · ');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function AllowedRecordCard({ record, emergency }: { record: ClinicalRecordItem; emergency: boolean }) {
  return (
    <article className={`relative overflow-hidden rounded-xl border bg-[var(--surface-card)] p-5 ${emergency ? 'border-[color:var(--status-warning)]/25' : 'border-[color:var(--status-success)]/25'}`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${emergency ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-success)]'}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex size-8 items-center justify-center rounded-lg ${emergency ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]' : 'bg-[var(--status-success-bg)] text-[var(--status-success)]'}`}>
            {emergency ? <UnlockKeyhole className="size-4" /> : <HeartPulse className="size-4" />}
          </span>
          <div><h3 className="text-sm font-semibold text-[var(--text-primary)]">{formatKey(record.category)}</h3><p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{formatKey(record.sensitivity)}</p></div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${emergency ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]' : 'bg-[var(--status-success-bg)] text-[var(--status-success)]'}`}>{emergency ? 'Emergency unlock' : 'Allowed'}</span>
      </div>
      <dl className="mt-5 space-y-3">
        {Object.entries(record.data ?? {}).map(([key, value]) => (
          <div key={key} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1fr)] gap-3 border-t border-[var(--border-default)] pt-3 text-xs">
            <dt className="break-words text-[var(--text-secondary)]">{formatKey(key)}</dt><dd className="break-words font-medium leading-5 text-[var(--text-primary)]">{renderValue(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function RedactedRecordCard({ record, purpose }: { record: ClinicalRecordItem; purpose: HealthcarePurpose }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[color:var(--status-danger)]/25 bg-[var(--status-danger-bg)]">
      <div className="flex items-center gap-3 border-b border-[color:var(--status-danger)]/25 bg-[var(--status-danger-bg)] px-5 py-4 text-[var(--status-danger)]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--status-danger-bg)]"><LockKeyhole className="size-5" /></span>
        <p className="break-words font-mono text-[11px] font-bold leading-5">🔒 {record.redaction_notice ?? `[REDACTED — no consent for ${record.category} under purpose '${purpose}']`}</p>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--text-primary)]">{formatKey(record.category)}</h3><span className="rounded-full bg-[var(--status-danger-bg)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--status-danger)]">Highly sensitive</span></div>
        <p className="text-xs leading-6 text-[var(--text-secondary)]">Under DPDPA Section 6, this category is protected and not accessible.</p>
        <div className="mt-4 space-y-2 opacity-25" aria-hidden="true"><div className="h-2.5 w-full rounded bg-[var(--surface-raised)]" /><div className="h-2.5 w-4/5 rounded bg-[var(--surface-raised)]" /><div className="h-2.5 w-3/5 rounded bg-[var(--surface-raised)]" /></div>
      </div>
    </article>
  );
}

export function ClinicianAccessView() {
  const [department, setDepartment] = useState('Cardiology');
  const [purpose, setPurpose] = useState<HealthcarePurpose>('treatment');
  const [mrn, setMrn] = useState('MRN-2024-8842');
  const [decision, setDecision] = useState<AccessDecisionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [justification, setJustification] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [query, setQuery] = useState("Can I access Priya's psychiatric notes?");
  const [advice, setAdvice] = useState<AIEvaluationResponse | null>(null);
  const [asking, setAsking] = useState(false);

  async function evaluateAccess() {
    setLoading(true);
    try {
      setDecision(await evaluateHealthcareAccess({ patient_id: 'p-101', clinician_id: 'doc-402', department, purpose }));
      notify.success('Consent policy evaluated and proof sealed.');
    } catch {
      notify.error('The access gateway could not evaluate this request.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void evaluateAccess(); }, []); // Initial policy evaluation only; filters apply on command.

  const allowed = useMemo(() => decision?.records.filter((record) => record.status === 'allowed') ?? [], [decision]);
  const redacted = useMemo(() => decision?.records.filter((record) => record.status === 'redacted') ?? [], [decision]);

  async function submitOverride() {
    if (justification.trim().length < 20) { notify.error('Add a specific clinical justification of at least 20 characters.'); return; }
    setOverriding(true);
    try {
      const response = await breakTheGlass({ patient_id: 'p-101', clinician_id: 'doc-402', department: department === 'Emergency' ? 'Emergency Medicine' : department, emergency_reason: justification.trim() });
      setDecision(response);
      setBreakGlassOpen(false);
      setJustification('');
      notify.success('Emergency access opened and sealed in Proof Vault block #46.');
    } catch {
      notify.error('Emergency access could not be opened.');
    } finally {
      setOverriding(false);
    }
  }

  async function askAdvisor() {
    if (!query.trim()) return;
    setAsking(true); setAdvice(null);
    try {
      setAdvice(await adviseHealthcareAccess({ patient_id: 'p-101', clinician_id: 'doc-402', query: query.trim() }));
    } catch {
      notify.error('The clinical access advisor is unavailable.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <HealthcarePage>
      <HealthcareHeader
        eyebrow="Zero-trust clinical workspace"
        title="See what care requires. Nothing more."
        description="Every clinical record is filtered against Priya's active purpose-based consent before it reaches the care team."
        actions={<div className="flex flex-wrap gap-2"><LiveBadge label={USE_MOCK_DATA ? 'Policy engine · demo' : 'Policy engine live'} /><button type="button" onClick={() => setAdvisorOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--status-ai)]/25 bg-[var(--status-ai-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--status-ai)]"><Bot className="size-3.5" /> Ask access advisor</button></div>}
      />

      <HealthcarePanel className="mb-6 p-4 lg:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_auto] xl:items-end">
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Clinical department</span><Select value={department} onValueChange={setDepartment}><SelectTrigger className="h-11 border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)]"><SelectValue /></SelectTrigger><SelectContent className="border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)]">{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label>
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Declared purpose</span><Select value={purpose} onValueChange={(value) => setPurpose(value as HealthcarePurpose)}><SelectTrigger className="h-11 border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)]"><SelectValue /></SelectTrigger><SelectContent className="border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)]">{purposes.map((item) => <SelectItem key={item} value={item}>{formatKey(item)}</SelectItem>)}</SelectContent></Select></label>
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Patient MRN</span><Input value={mrn} onChange={(event) => setMrn(event.target.value)} className="h-11 border-[var(--border-default)] bg-[var(--surface-raised)] font-mono text-[var(--text-primary)]" /></label>
          <button type="button" onClick={() => void evaluateAccess()} disabled={loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Evaluate access</button>
        </div>
      </HealthcarePanel>

      {loading || !decision ? <HealthcarePanel><LoadingState label="Evaluating consent, purpose, and clinical context…" /></HealthcarePanel> : (
        <>
          {decision.emergency_override ? (
            <div role="alert" className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-[color:var(--status-warning)]/25 bg-[var(--status-warning-bg)] p-5 md:flex-row md:items-center">
              <div className="flex gap-3"><AlertOctagon className="mt-0.5 size-6 shrink-0 text-[var(--status-warning)]" /><div><h2 className="font-bold text-[var(--status-warning)]">Emergency override active · Section 7(a)</h2><p className="mt-1 text-xs leading-5 text-[var(--status-warning)]">Protected data is temporarily visible. Patient notification and DPO review are queued automatically.</p></div></div>
              <div className="flex items-center gap-2 rounded-xl border border-[color:var(--status-warning)]/25 bg-[var(--surface-raised)] px-3 py-2 font-mono text-[10px] text-[var(--status-warning)]"><Hash className="size-3.5" /> {decision.proof_hash.slice(0, 18)}… · Block #{decision.block_number}</div>
            </div>
          ) : null}

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <HealthcarePanel className="flex items-center gap-4 p-4"><div className="flex size-10 items-center justify-center rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success)]"><CheckCircle2 className="size-5" /></div><div><div className="text-xl font-semibold text-[var(--text-primary)]">{allowed.length}</div><div className="text-xs text-[var(--text-secondary)]">Categories allowed</div></div></HealthcarePanel>
            <HealthcarePanel className="flex items-center gap-4 p-4"><div className="flex size-10 items-center justify-center rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger)]"><FileLock2 className="size-5" /></div><div><div className="text-xl font-semibold text-[var(--text-primary)]">{redacted.length}</div><div className="text-xs text-[var(--text-secondary)]">Categories redacted</div></div></HealthcarePanel>
            <HealthcarePanel className="flex items-center gap-4 p-4"><div className="flex size-10 items-center justify-center rounded-xl bg-[var(--status-info-bg)] text-[var(--status-info)]"><ClipboardCheck className="size-5" /></div><div><div className="font-mono text-sm font-semibold text-[var(--text-primary)]">Block #{decision.block_number}</div><div className="text-xs text-[var(--text-secondary)]">Decision sealed</div></div></HealthcarePanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <HealthcarePanel className="p-5 lg:p-6">
              <div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-[var(--status-success)]"><Stethoscope className="size-4" /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">Permitted clinical view</span></div><h2 className="text-xl font-semibold text-[var(--text-primary)]">Allowed records</h2></div><span className="rounded-full border border-[color:var(--status-success)]/25 bg-[var(--status-success-bg)] px-3 py-1 text-xs text-[var(--status-success)]">Consent matched</span></div>
              <div className="grid gap-3 sm:grid-cols-2">{allowed.map((record) => <AllowedRecordCard key={record.category} record={record} emergency={decision.emergency_override} />)}</div>
            </HealthcarePanel>
            <HealthcarePanel className="p-5 lg:p-6">
              <div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-[var(--status-danger)]"><ShieldAlert className="size-4" /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">Consent boundary</span></div><h2 className="text-xl font-semibold text-[var(--text-primary)]">{decision.emergency_override ? 'Emergency-unlocked records' : 'Redacted records'}</h2></div>{!decision.emergency_override ? <span className="rounded-full border border-[color:var(--status-danger)]/25 bg-[var(--status-danger-bg)] px-3 py-1 text-xs text-[var(--status-danger)]">Section 6 protected</span> : null}</div>
              {decision.emergency_override ? <div className="grid gap-3 sm:grid-cols-2">{decision.records.filter((record) => ['mental_health', 'reproductive', 'hiv_std_status'].includes(record.category)).map((record) => <AllowedRecordCard key={record.category} record={record} emergency />)}</div> : <div className="space-y-3">{redacted.map((record) => <RedactedRecordCard key={record.category} record={record} purpose={purpose} />)}</div>}
            </HealthcarePanel>
          </div>

          {!decision.emergency_override ? (
            <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-[color:var(--status-danger)]/25 bg-[var(--status-danger-bg)] p-5 md:flex-row">
              <div className="flex items-center gap-3"><Siren className="size-6 text-[var(--status-danger)]" /><div><h3 className="text-sm font-semibold text-[var(--text-primary)]">Life-threatening emergency?</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">Override only when immediate health or life is at risk. Every action is audited.</p></div></div>
              <button type="button" onClick={() => setBreakGlassOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--status-danger)]/25 bg-[var(--status-danger)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"><Siren className="size-4" /> Break The Glass (Section 7 Override)</button>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={breakGlassOpen} onOpenChange={setBreakGlassOpen}>
        <DialogContent className="border-[color:var(--status-danger)]/25 bg-[var(--surface-card)] text-[var(--text-primary)] sm:max-w-xl">
          <DialogHeader><div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger)]"><Siren className="size-5" /></div><DialogTitle className="text-xl text-[var(--text-primary)]">Confirm emergency override</DialogTitle><DialogDescription className="leading-6 text-[var(--text-secondary)]">This reveals all protected categories under DPDPA Section 7(a). The patient and DPO will be notified and your justification becomes immutable evidence.</DialogDescription></DialogHeader>
          <div><label htmlFor="emergency-reason" className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">Clinical justification <span className="text-[var(--status-danger)]">*</span></label><Textarea id="emergency-reason" value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Describe the immediate threat to life or health and why protected data is necessary…" className="min-h-32 border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)]" /><div className="mt-2 flex justify-between text-[11px]"><span className="text-[var(--text-secondary)]">Minimum 20 characters</span><span className={justification.trim().length >= 20 ? 'text-[var(--status-success)]' : 'text-[var(--text-tertiary)]'}>{justification.trim().length}/20</span></div></div>
          <div className="rounded-xl border border-[color:var(--status-warning)]/25 bg-[var(--status-warning-bg)] p-3 text-xs leading-5 text-[var(--status-warning)]"><KeyRound className="mr-2 inline size-4" /> Access is session-limited and sealed with a high-priority SHA-256 proof.</div>
          <DialogFooter><button type="button" onClick={() => setBreakGlassOpen(false)} className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)]">Cancel</button><button type="button" disabled={overriding || justification.trim().length < 20} onClick={() => void submitOverride()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--status-danger)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{overriding ? <Activity className="size-4 animate-spin" /> : <UnlockKeyhole className="size-4" />} Confirm & unlock</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={advisorOpen} onOpenChange={setAdvisorOpen}>
        <SheetContent className="w-full border-l-[var(--border-default)] bg-[var(--surface-card)] p-0 text-[var(--text-primary)] sm:max-w-xl">
          <SheetHeader className="border-b border-[var(--border-default)] p-6 pr-14"><div className="mb-2 flex items-center gap-2"><GemmaBadge /><span className="text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">Clinical policy reasoning</span></div><SheetTitle className="text-2xl text-[var(--text-primary)]">Access advisor</SheetTitle><SheetDescription className="leading-6 text-[var(--text-secondary)]">Ask whether a record can be used in the current care context.</SheetDescription></SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-6">
            <div className="flex-1 space-y-4 overflow-y-auto">
              <div className="ml-auto max-w-[88%] rounded-xl rounded-br-md bg-[var(--brand-primary)] px-4 py-3 text-sm leading-6 text-white">{query}</div>
              {asking ? <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Bot className="size-4 animate-pulse text-[var(--status-ai)]" /> Gemma 4 is checking consent and statute…</div> : advice ? (
                <div className="max-w-[92%] rounded-xl rounded-bl-md border border-[color:var(--status-ai)]/25 bg-[var(--status-ai-bg)] p-4">
                  <div className="mb-3 flex items-center gap-2"><span className="rounded-md bg-[var(--status-danger-bg)] px-2 py-1 text-[10px] font-bold tracking-wider text-[var(--status-danger)]">{advice.verdict}</span></div>
                  <p className="text-sm leading-6 text-[var(--text-primary)]">{advice.reason}</p>
                  <blockquote className="mt-4 border-l-2 border-[color:var(--status-ai)]/25 pl-3 text-xs leading-5 text-[var(--status-ai)]">{advice.statutory_citation}</blockquote>
                  <p className="mt-4 rounded-lg bg-[var(--status-warning-bg)] p-3 text-xs leading-5 text-[var(--status-warning)]">{advice.emergency_recourse}</p>
                </div>
              ) : <div className="flex items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4"><MessageSquareText className="mt-0.5 size-4 text-[var(--status-ai)]" /><p className="text-xs leading-5 text-[var(--text-secondary)]">I’ll cross-reference active consent, record sensitivity, declared purpose, and DPDPA Sections 6 and 7.</p></div>}
            </div>
            <div className="mt-5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-2"><Textarea value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-20 border-0 bg-transparent text-[var(--text-primary)] focus-visible:ring-0" /><div className="flex items-center justify-between px-2 pb-1"><span className="text-[10px] text-[var(--text-tertiary)]">Patient: Priya Sharma · treatment</span><button type="button" onClick={() => void askAdvisor()} disabled={asking || !query.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"><Send className="size-3.5" /> Ask Gemma</button></div></div>
          </div>
        </SheetContent>
      </Sheet>
    </HealthcarePage>
  );
}
