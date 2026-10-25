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
import { GemmaBadge, GlassPanel, HealthcareHeader, HealthcarePage, LiveBadge, LoadingState } from './HealthcareUI';

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
    <article className={`relative overflow-hidden rounded-2xl border p-5 ${emergency ? 'border-amber-300/25 bg-amber-400/[0.06]' : 'border-emerald-400/20 bg-emerald-400/[0.055] shadow-[0_0_35px_rgba(16,185,129,.055)]'}`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${emergency ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex size-8 items-center justify-center rounded-lg ${emergency ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'}`}>
            {emergency ? <UnlockKeyhole className="size-4" /> : <HeartPulse className="size-4" />}
          </span>
          <div><h3 className="text-sm font-semibold text-white">{formatKey(record.category)}</h3><p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{formatKey(record.sensitivity)}</p></div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${emergency ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'}`}>{emergency ? 'Emergency unlock' : 'Allowed'}</span>
      </div>
      <dl className="mt-5 space-y-3">
        {Object.entries(record.data ?? {}).map(([key, value]) => (
          <div key={key} className="grid grid-cols-[110px_1fr] gap-3 border-t border-white/[0.06] pt-3 text-xs">
            <dt className="text-slate-500">{formatKey(key)}</dt><dd className="font-medium leading-5 text-slate-200">{renderValue(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function RedactedRecordCard({ record, purpose }: { record: ClinicalRecordItem; purpose: HealthcarePurpose }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-rose-500/25 bg-rose-500/[0.055] shadow-[0_0_40px_rgba(225,29,72,.06)]">
      <div className="flex items-center gap-3 border-b border-rose-400/20 bg-rose-500/15 px-5 py-4 text-rose-100">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20"><LockKeyhole className="size-5" /></span>
        <p className="break-words font-mono text-[11px] font-bold leading-5">🔒 {record.redaction_notice ?? `[REDACTED — no consent for ${record.category} under purpose '${purpose}']`}</p>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white">{formatKey(record.category)}</h3><span className="rounded-full bg-rose-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-300">Highly sensitive</span></div>
        <p className="text-xs leading-6 text-slate-400">Under DPDPA Section 6, this category is protected and not accessible.</p>
        <div className="mt-4 space-y-2 opacity-25" aria-hidden="true"><div className="h-2.5 w-full rounded bg-slate-400" /><div className="h-2.5 w-4/5 rounded bg-slate-400" /><div className="h-2.5 w-3/5 rounded bg-slate-400" /></div>
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
        actions={<div className="flex flex-wrap gap-2"><LiveBadge label={USE_MOCK_DATA ? 'Policy engine · demo' : 'Policy engine live'} /><button type="button" onClick={() => setAdvisorOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200"><Bot className="size-3.5" /> Ask access advisor</button></div>}
      />

      <GlassPanel className="mb-6 p-4 lg:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_auto] xl:items-end">
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Clinical department</span><Select value={department} onValueChange={setDepartment}><SelectTrigger className="h-11 border-white/10 bg-white/[0.04] text-slate-100"><SelectValue /></SelectTrigger><SelectContent className="border-white/10 bg-[#101b18] text-slate-100">{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label>
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Declared purpose</span><Select value={purpose} onValueChange={(value) => setPurpose(value as HealthcarePurpose)}><SelectTrigger className="h-11 border-white/10 bg-white/[0.04] text-slate-100"><SelectValue /></SelectTrigger><SelectContent className="border-white/10 bg-[#101b18] text-slate-100">{purposes.map((item) => <SelectItem key={item} value={item}>{formatKey(item)}</SelectItem>)}</SelectContent></Select></label>
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Patient MRN</span><Input value={mrn} onChange={(event) => setMrn(event.target.value)} className="h-11 border-white/10 bg-white/[0.04] font-mono text-slate-100" /></label>
          <button type="button" onClick={() => void evaluateAccess()} disabled={loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-[#052e24] transition hover:bg-emerald-400 disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Evaluate access</button>
        </div>
      </GlassPanel>

      {loading || !decision ? <GlassPanel><LoadingState label="Evaluating consent, purpose, and clinical context…" /></GlassPanel> : (
        <>
          {decision.emergency_override ? (
            <div role="alert" className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-amber-300/30 bg-amber-400/[0.11] p-5 shadow-[0_0_40px_rgba(245,158,11,.08)] md:flex-row md:items-center">
              <div className="flex gap-3"><AlertOctagon className="mt-0.5 size-6 shrink-0 text-amber-300" /><div><h2 className="font-bold text-amber-100">Emergency override active · Section 7(a)</h2><p className="mt-1 text-xs leading-5 text-amber-100/65">Protected data is temporarily visible. Patient notification and DPO review are queued automatically.</p></div></div>
              <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-black/20 px-3 py-2 font-mono text-[10px] text-amber-200"><Hash className="size-3.5" /> {decision.proof_hash.slice(0, 18)}… · Block #{decision.block_number}</div>
            </div>
          ) : null}

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <GlassPanel className="flex items-center gap-4 p-4"><div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 className="size-5" /></div><div><div className="text-xl font-semibold text-white">{allowed.length}</div><div className="text-xs text-slate-500">Categories allowed</div></div></GlassPanel>
            <GlassPanel className="flex items-center gap-4 p-4"><div className="flex size-10 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300"><FileLock2 className="size-5" /></div><div><div className="text-xl font-semibold text-white">{redacted.length}</div><div className="text-xs text-slate-500">Categories redacted</div></div></GlassPanel>
            <GlassPanel className="flex items-center gap-4 p-4"><div className="flex size-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><ClipboardCheck className="size-5" /></div><div><div className="font-mono text-sm font-semibold text-white">Block #{decision.block_number}</div><div className="text-xs text-slate-500">Decision sealed</div></div></GlassPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <GlassPanel className="p-5 lg:p-6">
              <div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-emerald-300"><Stethoscope className="size-4" /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">Permitted clinical view</span></div><h2 className="text-xl font-semibold text-white">Allowed records</h2></div><span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-1 text-xs text-emerald-300">Consent matched</span></div>
              <div className="grid gap-3 sm:grid-cols-2">{allowed.map((record) => <AllowedRecordCard key={record.category} record={record} emergency={decision.emergency_override} />)}</div>
            </GlassPanel>
            <GlassPanel className="p-5 lg:p-6">
              <div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-rose-300"><ShieldAlert className="size-4" /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">Consent boundary</span></div><h2 className="text-xl font-semibold text-white">{decision.emergency_override ? 'Emergency-unlocked records' : 'Redacted records'}</h2></div>{!decision.emergency_override ? <span className="rounded-full border border-rose-400/15 bg-rose-400/[0.07] px-3 py-1 text-xs text-rose-300">Section 6 protected</span> : null}</div>
              {decision.emergency_override ? <div className="grid gap-3 sm:grid-cols-2">{decision.records.filter((record) => ['mental_health', 'reproductive', 'hiv_std_status'].includes(record.category)).map((record) => <AllowedRecordCard key={record.category} record={record} emergency />)}</div> : <div className="space-y-3">{redacted.map((record) => <RedactedRecordCard key={record.category} record={record} purpose={purpose} />)}</div>}
            </GlassPanel>
          </div>

          {!decision.emergency_override ? (
            <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-rose-500/20 bg-gradient-to-r from-rose-950/40 to-transparent p-5 md:flex-row">
              <div className="flex items-center gap-3"><Siren className="size-6 text-rose-400" /><div><h3 className="text-sm font-semibold text-white">Life-threatening emergency?</h3><p className="mt-1 text-xs text-slate-500">Override only when immediate health or life is at risk. Every action is audited.</p></div></div>
              <button type="button" onClick={() => setBreakGlassOpen(true)} className="inline-flex animate-pulse items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-[0_0_28px_rgba(225,29,72,.25)] transition hover:bg-rose-500"><Siren className="size-4" /> Break The Glass (Section 7 Override)</button>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={breakGlassOpen} onOpenChange={setBreakGlassOpen}>
        <DialogContent className="border-rose-400/20 bg-[#111816] text-slate-100 sm:max-w-xl">
          <DialogHeader><div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300"><Siren className="size-5" /></div><DialogTitle className="text-xl text-white">Confirm emergency override</DialogTitle><DialogDescription className="leading-6 text-slate-400">This reveals all protected categories under DPDPA Section 7(a). The patient and DPO will be notified and your justification becomes immutable evidence.</DialogDescription></DialogHeader>
          <div><label htmlFor="emergency-reason" className="mb-2 block text-xs font-semibold text-slate-300">Clinical justification <span className="text-rose-400">*</span></label><Textarea id="emergency-reason" value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Describe the immediate threat to life or health and why protected data is necessary…" className="min-h-32 border-white/10 bg-black/20 text-slate-100" /><div className="mt-2 flex justify-between text-[11px]"><span className="text-slate-500">Minimum 20 characters</span><span className={justification.trim().length >= 20 ? 'text-emerald-400' : 'text-slate-600'}>{justification.trim().length}/20</span></div></div>
          <div className="rounded-xl border border-amber-300/15 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100/70"><KeyRound className="mr-2 inline size-4" /> Access is session-limited and sealed with a high-priority SHA-256 proof.</div>
          <DialogFooter><button type="button" onClick={() => setBreakGlassOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button><button type="button" disabled={overriding || justification.trim().length < 20} onClick={() => void submitOverride()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{overriding ? <Activity className="size-4 animate-spin" /> : <UnlockKeyhole className="size-4" />} Confirm & unlock</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={advisorOpen} onOpenChange={setAdvisorOpen}>
        <SheetContent className="w-full border-l-white/10 bg-[#091310]/95 p-0 text-slate-100 backdrop-blur-2xl sm:max-w-xl">
          <SheetHeader className="border-b border-white/[0.08] p-6 pr-14"><div className="mb-2 flex items-center gap-2"><GemmaBadge /><span className="text-[11px] uppercase tracking-wider text-slate-500">Clinical policy reasoning</span></div><SheetTitle className="text-2xl text-white">Access advisor</SheetTitle><SheetDescription className="leading-6 text-slate-400">Ask whether a record can be used in the current care context.</SheetDescription></SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-6">
            <div className="flex-1 space-y-4 overflow-y-auto">
              <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-emerald-500 px-4 py-3 text-sm leading-6 text-[#052e24]">{query}</div>
              {asking ? <div className="flex items-center gap-2 text-sm text-slate-500"><Bot className="size-4 animate-pulse text-violet-300" /> Gemma 4 is checking consent and statute…</div> : advice ? (
                <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-violet-400/15 bg-violet-400/[0.07] p-4">
                  <div className="mb-3 flex items-center gap-2"><span className="rounded-md bg-rose-400/15 px-2 py-1 text-[10px] font-bold tracking-wider text-rose-300">{advice.verdict}</span></div>
                  <p className="text-sm leading-6 text-slate-200">{advice.reason}</p>
                  <blockquote className="mt-4 border-l-2 border-violet-400/50 pl-3 text-xs leading-5 text-violet-200">{advice.statutory_citation}</blockquote>
                  <p className="mt-4 rounded-lg bg-amber-400/[0.07] p-3 text-xs leading-5 text-amber-100/70">{advice.emergency_recourse}</p>
                </div>
              ) : <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4"><MessageSquareText className="mt-0.5 size-4 text-violet-300" /><p className="text-xs leading-5 text-slate-500">I’ll cross-reference active consent, record sensitivity, declared purpose, and DPDPA Sections 6 and 7.</p></div>}
            </div>
            <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-2"><Textarea value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-20 border-0 bg-transparent text-slate-100 focus-visible:ring-0" /><div className="flex items-center justify-between px-2 pb-1"><span className="text-[10px] text-slate-600">Patient: Priya Sharma · treatment</span><button type="button" onClick={() => void askAdvisor()} disabled={asking || !query.trim()} className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Send className="size-3.5" /> Ask Gemma</button></div></div>
          </div>
        </SheetContent>
      </Sheet>
    </HealthcarePage>
  );
}
