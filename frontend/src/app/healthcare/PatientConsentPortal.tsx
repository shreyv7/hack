import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronRight,
  FileCheck2,
  FileJson,
  HeartPulse,
  Languages,
  Phone,
  Save,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { Switch } from '@/app/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/app/components/ui/sheet';
import { notify } from '@/app/utils/notify';
import {
  digitizeConsent,
  explainConsent,
  getHealthcareConsents,
  getHealthcarePatient,
  purposeLabel,
  saveHealthcareConsent,
  USE_MOCK_DATA,
} from '@/lib/api/healthcare';
import type {
  ClinicalCategory,
  ConsentDigitizationResponse,
  ConsentExplanationResponse,
  HealthcareConsent,
  HealthcarePatient,
  HealthcarePurpose,
} from '@/types/healthcare';
import { GemmaBadge, GlassPanel, HealthcareHeader, HealthcarePage, LiveBadge, LoadingState, MetricPill } from './HealthcareUI';

const purposes: HealthcarePurpose[] = ['treatment', 'diagnostics', 'research', 'insurance', 'emergency'];
const categoryLabels: Record<ClinicalCategory, string> = {
  demographics: 'Demographics', vitals: 'Vitals', clinical_notes: 'Clinical notes', medications: 'Medications',
  allergies: 'Allergies', surgical_history: 'Surgical history', dental: 'Dental', lab_results: 'Lab results',
  mental_health: 'Mental health', reproductive: 'Reproductive', hiv_std_status: 'HIV / STD status',
};

function ConsentCard({ consent, onToggle, saving }: { consent: HealthcareConsent; onToggle: (consent: HealthcareConsent, enabled: boolean) => void; saving: boolean }) {
  const enabled = consent.status === 'active';
  return (
    <article className={`group relative overflow-hidden rounded-2xl border p-5 transition-all ${enabled ? 'border-emerald-400/20 bg-emerald-400/[0.055] hover:border-emerald-400/35' : 'border-white/[0.07] bg-white/[0.025]'}`}>
      <div className="absolute -right-10 -top-12 size-28 rounded-full bg-emerald-400/[0.06] blur-2xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{purposeLabel(consent.purpose)}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${enabled ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-400/10 text-slate-500'}`}>{enabled ? 'Sharing' : 'Paused'}</span>
          </div>
          <p className="text-xs text-slate-500">Valid until {new Date(consent.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={saving}
          onCheckedChange={(checked) => onToggle(consent, checked)}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${consent.purpose} consent`}
          className="data-[state=checked]:bg-emerald-500"
        />
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2">
        {consent.allowed_categories.map((category) => (
          <span key={category} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-emerald-200">
            <Check className="size-3" /> {categoryLabels[category]}
          </span>
        ))}
        {consent.denied_categories.map((category) => (
          <span key={category} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/15 bg-rose-400/[0.07] px-2.5 py-1.5 text-[11px] font-medium text-rose-300">
            <X className="size-3" /> {categoryLabels[category]}
          </span>
        ))}
      </div>
    </article>
  );
}

export function PatientConsentPortal() {
  const [patient, setPatient] = useState<HealthcarePatient | null>(null);
  const [consents, setConsents] = useState<HealthcareConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPurpose, setSavingPurpose] = useState<HealthcarePurpose | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [language, setLanguage] = useState('English');
  const [explanation, setExplanation] = useState<ConsentExplanationResponse | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [digitized, setDigitized] = useState<ConsentDigitizationResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getHealthcarePatient('p-101'), getHealthcareConsents('p-101')])
      .then(([nextPatient, nextConsents]) => { setPatient(nextPatient); setConsents(nextConsents); })
      .catch(() => notify.error('Could not load the patient consent profile.'))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = useMemo(() => consents.filter((consent) => consent.status === 'active').length, [consents]);
  const protectedCount = useMemo(() => new Set(consents.flatMap((consent) => consent.denied_categories)).size, [consents]);

  async function handleConsentToggle(consent: HealthcareConsent, enabled: boolean) {
    setSavingPurpose(consent.purpose);
    setConsents((current) => current.map((item) => item.id === consent.id ? { ...item, status: enabled ? 'active' : 'revoked' } : item));
    try {
      if (enabled) {
        await saveHealthcareConsent('p-101', {
          purpose: consent.purpose,
          allowed_categories: consent.allowed_categories,
          denied_categories: consent.denied_categories,
          expires_days: 365,
        });
      }
      notify.success(`${purposeLabel(consent.purpose)} consent ${enabled ? 'enabled' : 'paused'}.`);
    } catch {
      setConsents((current) => current.map((item) => item.id === consent.id ? consent : item));
      notify.error('The consent update could not be saved.');
    } finally {
      setSavingPurpose(null);
    }
  }

  async function loadExplanation(nextLanguage = language) {
    setExplaining(true);
    try {
      const treatment = consents.find((consent) => consent.purpose === 'treatment');
      setExplanation(await explainConsent({ purpose: 'treatment', categories: treatment?.allowed_categories ?? ['vitals', 'medications'], language: nextLanguage }));
    } catch {
      notify.error('Gemma 4 could not generate the explanation.');
    } finally {
      setExplaining(false);
    }
  }

  async function processFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify.error('Please upload a JPG, PNG, or other image file.'); return; }
    setUploadedFileName(file.name);
    setDigitized(null);
    setUploading(true);
    try {
      setDigitized(await digitizeConsent(file));
      notify.success('Paper consent digitized with Gemma 4.');
    } catch {
      notify.error('The consent image could not be digitized.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <HealthcarePage>
      <HealthcareHeader
        eyebrow="Universal patient consent portal"
        title="Your health data. Your decision."
        description="Control exactly which parts of your medical record may be used for each purpose—clear, granular, and revocable at any time."
        actions={<LiveBadge label={USE_MOCK_DATA ? 'Independent demo mode' : 'Healthcare gateway live'} />}
      />

      {loading || !patient ? <GlassPanel><LoadingState label="Loading Priya's consent profile…" /></GlassPanel> : (
        <>
          <GlassPanel className="mb-6 overflow-hidden">
            <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center lg:p-6">
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 text-xl font-bold text-emerald-200 shadow-[0_0_35px_rgba(16,185,129,.1)]">PS</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">{patient.full_name}</h2>
                    <BadgeCheck className="size-4 text-emerald-400" />
                    <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-slate-300">{patient.mrn}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" /> 14 Jun 1992</span>
                    <span className="flex items-center gap-1.5"><UserRound className="size-3.5" /> {patient.gender}</span>
                    <span className="flex items-center gap-1.5"><Phone className="size-3.5" /> {patient.phone}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MetricPill value={`${activeCount}/5`} label="Purposes on" />
                <MetricPill value={`${protectedCount}`} label="Protected" />
                <MetricPill value="365d" label="Validity" />
              </div>
            </div>
          </GlassPanel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,.75fr)]">
            <GlassPanel className="p-5 lg:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Purpose-based permissions</h2>
                  <p className="mt-1 text-sm text-slate-500">Green categories are shared; red categories stay locked.</p>
                </div>
                <button type="button" onClick={() => { setExplainOpen(true); if (!explanation) void loadExplanation(); }} className="inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-400/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-400/15">
                  <Languages className="size-4" /> Explain my consent <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {purposes.map((purpose) => {
                  const consent = consents.find((item) => item.purpose === purpose);
                  return consent ? <ConsentCard key={purpose} consent={consent} saving={savingPurpose === purpose} onToggle={handleConsentToggle} /> : null;
                })}
              </div>
            </GlassPanel>

            <GlassPanel className="h-fit p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Digitize paper consent</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">Upload a photo; Gemma 4 extracts a structured consent draft.</p>
                </div>
                <GemmaBadge />
              </div>
              <input ref={fileInputRef} className="hidden" type="file" accept="image/*" onChange={(event) => void processFile(event.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); void processFile(event.dataTransfer.files[0]); }}
                className={`mt-5 flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition ${dragging ? 'border-cyan-300/60 bg-cyan-400/10' : 'border-white/15 bg-black/15 hover:border-emerald-300/35 hover:bg-emerald-400/[0.04]'}`}
              >
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300"><UploadCloud className="size-6" /></div>
                <span className="text-sm font-semibold text-slate-200">Drop a consent photo here</span>
                <span className="mt-1 text-xs text-slate-500">or click to choose · JPG, PNG</span>
              </button>
              {uploading ? (
                <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-400/[0.06] p-4 text-sm text-violet-200"><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-violet-300" />Gemma 4 is reading {uploadedFileName}…</div>
              ) : null}
              {digitized ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-emerald-400/15 bg-black/25">
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><span className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><FileJson className="size-4" /> Extracted JSON</span><span className="text-xs text-slate-500">{Math.round(digitized.confidence_score * 100)}% confidence</span></div>
                  <pre className="max-h-64 overflow-auto p-4 text-[11px] leading-5 text-cyan-100/80">{JSON.stringify(digitized, null, 2)}</pre>
                  <div className="border-t border-white/[0.07] p-3"><button type="button" onClick={() => { notify.success('Digitized consent accepted and saved.'); setDigitized(null); setUploadedFileName(''); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#052e24] transition hover:bg-emerald-400"><Save className="size-4" /> Accept & Save</button></div>
                </div>
              ) : null}
              {!digitized && !uploading ? <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><FileCheck2 className="size-5 text-slate-500" /><p className="text-xs leading-5 text-slate-500">Signature presence and explicit exclusions are verified before anything is saved.</p></div> : null}
            </GlassPanel>
          </div>
        </>
      )}

      <Sheet open={explainOpen} onOpenChange={setExplainOpen}>
        <SheetContent className="w-full border-l-white/10 bg-[#091310]/95 p-0 text-slate-100 backdrop-blur-2xl sm:max-w-xl">
          <SheetHeader className="border-b border-white/[0.08] p-6 pr-14">
            <div className="mb-3 flex items-center gap-2"><GemmaBadge /><span className="text-[11px] uppercase tracking-widest text-slate-500">Plain-language guide</span></div>
            <SheetTitle className="text-2xl text-white">Explain my consent</SheetTitle>
            <SheetDescription className="leading-6 text-slate-400">A clear explanation of what you are sharing, why it is needed, and what stays private.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-6">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Your language</label>
            <Select value={language} onValueChange={(value) => { setLanguage(value); void loadExplanation(value); }}>
              <SelectTrigger className="h-11 border-white/10 bg-white/[0.05] text-slate-100"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#101b18] text-slate-100">{['English', 'Hindi', 'Kannada', 'Tamil'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            {explaining ? <LoadingState label={`Writing a clear ${language} explanation…`} /> : explanation ? (
              <div className="mt-6 space-y-5">
                <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.07] p-5"><HeartPulse className="mb-3 size-5 text-violet-300" /><p className="text-sm leading-7 text-slate-200">{explanation.explanation}</p></div>
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">In simple terms</h3>
                  <ul className="space-y-3">{explanation.key_points.map((point) => <li key={point} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm leading-6 text-slate-300"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><Check className="size-3" /></span>{point}</li>)}</ul>
                </div>
                <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4 text-xs leading-5 text-cyan-100/70">You remain in control. Changing or withdrawing consent will not affect care already provided.</div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </HealthcarePage>
  );
}
