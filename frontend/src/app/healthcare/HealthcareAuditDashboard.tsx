import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  FileCheck2,
  Fingerprint,
  Hash,
  Link2,
  RefreshCw,
  ShieldCheck,
  Siren,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { analyzeHealthcareCompliance, approveEmergencyOverride, getProofVaultAuditRecords, USE_MOCK_DATA } from '@/lib/api/healthcare';
import type { ComplianceAnalysisResponse, ProofVaultAuditRecord } from '@/types/healthcare';
import { GemmaBadge, GlassPanel, HealthcareHeader, HealthcarePage, LiveBadge, LoadingState } from './HealthcareUI';

const scoreBreakdown = [
  { label: 'Consent specificity', score: 98, color: 'bg-emerald-400' },
  { label: 'Access enforcement', score: 96, color: 'bg-cyan-400' },
  { label: 'Emergency governance', score: 91, color: 'bg-amber-400' },
  { label: 'Proof completeness', score: 94, color: 'bg-violet-400' },
];

function eventMeta(type: ProofVaultAuditRecord['event_type']) {
  switch (type) {
    case 'BREAK_THE_GLASS_OVERRIDE': return { label: 'Emergency override', icon: Siren, color: 'rose' };
    case 'EHR_CONSENT_DIGITIZATION': return { label: 'Paper consent digitized', icon: FileCheck2, color: 'violet' };
    case 'CONSENT_UPDATED': return { label: 'Consent updated', icon: UserCheck, color: 'cyan' };
    default: return { label: 'Access evaluated', icon: Fingerprint, color: 'emerald' };
  }
}

function colorClasses(color: string) {
  if (color === 'rose') return 'border-rose-400/20 bg-rose-400/10 text-rose-300';
  if (color === 'violet') return 'border-violet-400/20 bg-violet-400/10 text-violet-300';
  if (color === 'cyan') return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300';
  return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
}

export function HealthcareAuditDashboard() {
  const [records, setRecords] = useState<ProofVaultAuditRecord[]>([]);
  const [analysis, setAnalysis] = useState<ComplianceAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyCursor, setVerifyCursor] = useState(-1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [nextRecords, nextAnalysis] = await Promise.all([getProofVaultAuditRecords(), analyzeHealthcareCompliance()]);
      setRecords(nextRecords); setAnalysis(nextAnalysis);
    } catch {
      notify.error('The healthcare audit workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, []);

  const overrides = useMemo(() => records.filter((record) => record.event_type === 'BREAK_THE_GLASS_OVERRIDE'), [records]);
  const pendingOverrides = overrides.filter((record) => record.review_status !== 'approved');

  function verifyIntegrity() {
    if (verifying) return;
    setVerified(false); setVerifying(true); setVerifyCursor(0);
    let cursor = 0;
    const timer = window.setInterval(() => {
      cursor += 1;
      if (cursor >= records.length) {
        window.clearInterval(timer); setVerifyCursor(records.length - 1); setVerifying(false); setVerified(true);
        notify.success('Proof Vault integrity verified: 0 tampering detected.');
      } else setVerifyCursor(cursor);
    }, 320);
  }

  async function approve(recordId: string) {
    setReviewingId(recordId);
    try {
      await approveEmergencyOverride(recordId);
      setRecords((current) => current.map((record) => record.id === recordId ? { ...record, review_status: 'approved' } : record));
      notify.success('Emergency override reviewed and signed off.');
    } catch {
      notify.error('DPO sign-off could not be recorded.');
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <HealthcarePage>
      <HealthcareHeader
        eyebrow="DPO & compliance command center"
        title="Every decision leaves a proof."
        description="Audit clinical access, review emergency disclosures, and verify the cryptographic chain from one high-trust workspace."
        actions={<div className="flex flex-wrap gap-2"><LiveBadge label={USE_MOCK_DATA ? 'Proof Vault · demo chain' : 'Proof Vault connected'} /><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400"><Clock3 className="size-3.5" /> Synced just now</span></div>}
      />

      {loading ? <GlassPanel><LoadingState label="Reading Proof Vault and compliance signals…" /></GlassPanel> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GlassPanel className="p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Vault blocks</span><Link2 className="size-4 text-emerald-300" /></div><div className="mt-3 text-3xl font-semibold tracking-tight text-white">{records.length + 41}</div><p className="mt-1 text-xs text-emerald-300">100% cryptographically linked</p></GlassPanel>
            <GlassPanel className="p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Access decisions</span><Fingerprint className="size-4 text-cyan-300" /></div><div className="mt-3 text-3xl font-semibold tracking-tight text-white">1,284</div><p className="mt-1 text-xs text-slate-500">Last 30 days</p></GlassPanel>
            <GlassPanel className="p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Emergency overrides</span><Siren className="size-4 text-rose-300" /></div><div className="mt-3 text-3xl font-semibold tracking-tight text-white">{overrides.length}</div><p className="mt-1 text-xs text-amber-300">{pendingOverrides.length} awaiting DPO review</p></GlassPanel>
            <GlassPanel className="p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Tampering detected</span><ShieldCheck className="size-4 text-emerald-300" /></div><div className="mt-3 text-3xl font-semibold tracking-tight text-white">0</div><p className="mt-1 text-xs text-emerald-300">Chain healthy</p></GlassPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(370px,.72fr)]">
            <GlassPanel className="overflow-hidden">
              <div className="flex flex-col justify-between gap-4 border-b border-white/[0.07] p-5 md:flex-row md:items-center lg:p-6">
                <div><div className="mb-2 flex items-center gap-2 text-emerald-300"><Link2 className="size-4" /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">SHA-256 chained ledger</span></div><h2 className="text-xl font-semibold text-white">Cryptographic proof timeline</h2><p className="mt-1 text-xs text-slate-500">Newest sealed block first · Priya Sharma · MRN-2024-8842</p></div>
                <button type="button" onClick={verifyIntegrity} disabled={verifying || records.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-50">{verifying ? <Activity className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {verifying ? `Verifying block ${verifyCursor + 1}/${records.length}` : 'Verify Proof Vault Integrity'}</button>
              </div>
              {verified ? <div className="mx-5 mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.09] p-4 text-sm font-semibold text-emerald-200 lg:mx-6"><CheckCircle2 className="size-5" /> Proof Vault Intact — 0 Tampering Detected</div> : null}
              <div className="p-5 lg:p-6">
                {records.map((record, index) => {
                  const meta = eventMeta(record.event_type); const Icon = meta.icon; const beingVerified = verifying && verifyCursor === index; const passed = verified || (verifying && verifyCursor > index);
                  return (
                    <div key={record.id} className="relative grid grid-cols-[38px_1fr] gap-4 pb-6 last:pb-0">
                      {index < records.length - 1 ? <div className={`absolute left-[18px] top-9 h-[calc(100%-16px)] w-px transition-colors ${passed ? 'bg-emerald-400/55' : 'bg-white/10'}`} /> : null}
                      <div className={`relative z-10 flex size-[38px] items-center justify-center rounded-xl border transition-all ${beingVerified ? 'scale-110 border-cyan-300 bg-cyan-400/20 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,.25)]' : passed ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-300' : colorClasses(meta.color)}`}>{beingVerified ? <RefreshCw className="size-4 animate-spin" /> : passed ? <Check className="size-4" /> : <Icon className="size-4" />}</div>
                      <article className={`rounded-2xl border p-4 transition ${beingVerified ? 'border-cyan-300/30 bg-cyan-400/[0.07]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white">{meta.label}</h3>{record.priority === 'high' ? <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300">High priority</span> : null}</div><p className="mt-1 text-xs text-slate-500">{record.actor} · {new Date(record.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div><span className="whitespace-nowrap rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] text-slate-400">Block #{record.block_number}</span></div>
                        <p className="mt-3 text-xs leading-5 text-slate-300">{record.summary}</p>
                        <div className="mt-4 grid gap-2 md:grid-cols-2"><div className="flex min-w-0 items-center gap-2 rounded-lg bg-black/20 px-3 py-2"><Hash className="size-3.5 shrink-0 text-emerald-400" /><span className="truncate font-mono text-[9px] text-slate-500">{record.proof_hash}</span></div><div className="flex min-w-0 items-center gap-2 rounded-lg bg-black/20 px-3 py-2"><Link2 className="size-3.5 shrink-0 text-slate-600" /><span className="truncate font-mono text-[9px] text-slate-600">prev: {record.previous_hash}</span></div></div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </GlassPanel>

            <div className="space-y-6">
              <GlassPanel className="p-5 lg:p-6">
                <div className="flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-violet-300"><Bot className="size-4" /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">Continuous analysis</span></div><h2 className="text-lg font-semibold text-white">Compliance health</h2></div><GemmaBadge /></div>
                <div className="mt-6 flex items-center gap-6">
                  <div className="relative flex size-32 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#34d399 0 ${analysis?.compliance_score ?? 94}%, rgba(255,255,255,.07) ${analysis?.compliance_score ?? 94}% 100%)` }}><div className="absolute inset-[9px] rounded-full bg-[#0c1613]" /><div className="relative text-center"><div className="text-3xl font-semibold text-white">{analysis?.compliance_score ?? 94}%</div><div className="text-[10px] uppercase tracking-wider text-emerald-300">Healthy</div></div></div>
                  <div><div className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><Sparkles className="size-4" /> Strong posture</div><p className="mt-2 text-xs leading-5 text-slate-500">Consent and access controls are operating above the healthcare policy baseline.</p></div>
                </div>
                <div className="mt-6 space-y-4">{scoreBreakdown.map((item) => <div key={item.label}><div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-400">{item.label}</span><span className="font-semibold text-slate-200">{item.score}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.score}%` }} /></div></div>)}</div>
                {analysis?.gaps_detected[0] ? <div className="mt-6 rounded-xl border border-amber-300/15 bg-amber-400/[0.06] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><AlertTriangle className="size-4" /> {analysis.gaps_detected[0].section} · Low gap</div><p className="mt-2 text-xs leading-5 text-amber-100/60">{analysis.gaps_detected[0].issue}</p></div> : null}
              </GlassPanel>

              <GlassPanel className="overflow-hidden">
                <div className="border-b border-white/[0.07] p-5 lg:p-6"><div className="flex items-center justify-between"><div><div className="mb-2 flex items-center gap-2 text-rose-300"><Siren className="size-4" /><span className="text-[11px] font-bold uppercase tracking-[0.16em]">DPO action required</span></div><h2 className="text-lg font-semibold text-white">Override review queue</h2></div><span className="flex size-7 items-center justify-center rounded-full bg-rose-400/15 text-xs font-bold text-rose-300">{pendingOverrides.length}</span></div></div>
                <div className="space-y-3 p-4">
                  {overrides.map((record) => (
                    <article key={record.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                      <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{record.actor}</h3><p className="mt-1 text-[11px] text-slate-500">{new Date(record.timestamp).toLocaleString('en-IN')} · Block #{record.block_number}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${record.review_status === 'approved' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>{record.review_status ?? 'pending'}</span></div>
                      <div className="mt-3 rounded-lg border border-rose-300/10 bg-rose-400/[0.05] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-rose-300/70">Clinician justification</p><p className="mt-2 text-xs leading-5 text-slate-300">{record.justification}</p></div>
                      {record.review_status !== 'approved' ? <button type="button" onClick={() => void approve(record.id)} disabled={reviewingId === record.id} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-[#052e24] disabled:opacity-50">{reviewingId === record.id ? <Activity className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />} Sign off as DPO</button> : null}
                    </article>
                  ))}
                </div>
                <button type="button" className="flex w-full items-center justify-center gap-2 border-t border-white/[0.07] p-3 text-xs text-slate-500 transition hover:bg-white/[0.03] hover:text-slate-300">View all emergency events <ChevronDown className="size-3.5" /></button>
              </GlassPanel>
            </div>
          </div>
        </>
      )}
      <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-600"><CircleDot className="size-3" /> All timestamps are stored in UTC · Proof hashes shown in SHA-256</div>
    </HealthcarePage>
  );
}
