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
import { GemmaBadge, HealthcarePanel, HealthcareHeader, HealthcarePage, LiveBadge, LoadingState, MetricPill } from './HealthcareUI';

const purposes: HealthcarePurpose[] = ['treatment', 'diagnostics', 'research', 'insurance', 'emergency'];
const categoryLabels: Record<ClinicalCategory, string> = {
  demographics: 'Demographics', vitals: 'Vitals', clinical_notes: 'Clinical notes', medications: 'Medications',
  allergies: 'Allergies', surgical_history: 'Surgical history', dental: 'Dental', lab_results: 'Lab results',
  mental_health: 'Mental health', reproductive: 'Reproductive', hiv_std_status: 'HIV / STD status',
};

function ConsentCard({ consent, onToggle, saving }: { consent: HealthcareConsent; onToggle: (consent: HealthcareConsent, enabled: boolean) => void; saving: boolean }) {
  const enabled = consent.status === 'active';
  return (
    <article className={`rounded-xl border p-5 transition-colors ${enabled ? 'border-[color:var(--status-success)]/25 bg-[var(--surface-card)]' : 'border-[var(--border-default)] bg-[var(--surface-raised)]'}`}>
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{purposeLabel(consent.purpose)}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${enabled ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'}`}>{enabled ? 'Sharing' : 'Paused'}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Valid until {new Date(consent.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={saving}
          onCheckedChange={(checked) => onToggle(consent, checked)}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${consent.purpose} consent`}
          className="data-[state=checked]:bg-[var(--brand-primary)]"
        />
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2">
        {consent.allowed_categories.map((category) => (
          <span key={category} className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--status-success)]/25 bg-[var(--status-success-bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--status-success)]">
            <Check className="size-3" /> {categoryLabels[category]}
          </span>
        ))}
        {consent.denied_categories.map((category) => (
          <span key={category} className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--status-danger)]/25 bg-[var(--status-danger-bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--status-danger)]">
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

      {loading || !patient ? <HealthcarePanel><LoadingState label="Loading Priya's consent profile…" /></HealthcarePanel> : (
        <>
          <HealthcarePanel className="mb-6 overflow-hidden">
            <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center lg:p-6">
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-xl font-semibold text-[var(--brand-primary)]">PS</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">{patient.full_name}</h2>
                    <BadgeCheck className="size-4 text-[var(--status-success)]" />
                    <span className="rounded-md bg-[var(--surface-raised)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">{patient.mrn}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
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
          </HealthcarePanel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <HealthcarePanel className="p-5 lg:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Purpose-based permissions</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">Green categories are shared; red categories stay locked.</p>
                </div>
                <button type="button" onClick={() => { setExplainOpen(true); if (!explanation) void loadExplanation(); }} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--status-ai)]/25 bg-[var(--status-ai-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--status-ai)] transition hover:bg-[var(--status-ai-bg)]">
                  <Languages className="size-4" /> Explain my consent <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {purposes.map((purpose) => {
                  const consent = consents.find((item) => item.purpose === purpose);
                  return consent ? <ConsentCard key={purpose} consent={consent} saving={savingPurpose === purpose} onToggle={handleConsentToggle} /> : null;
                })}
              </div>
            </HealthcarePanel>

            <HealthcarePanel className="h-fit p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Digitize paper consent</h2>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">Upload a photo; Gemma 4 extracts a structured consent draft.</p>
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
                className={`mt-5 flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition ${dragging ? 'border-[color:var(--status-info)]/25 bg-[var(--status-info-bg)]' : 'border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[color:var(--status-success)]/25 hover:bg-[var(--status-success-bg)]'}`}
              >
                <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success)]"><UploadCloud className="size-6" /></div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">Drop a consent photo here</span>
                <span className="mt-1 text-xs text-[var(--text-secondary)]">or click to choose · JPG, PNG</span>
              </button>
              {uploading ? (
                <div className="mt-4 rounded-xl border border-[color:var(--status-ai)]/25 bg-[var(--status-ai-bg)] p-4 text-sm text-[var(--status-ai)]"><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-[var(--status-ai)]" />Gemma 4 is reading {uploadedFileName}…</div>
              ) : null}
              {digitized ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-[color:var(--status-success)]/25 bg-[var(--surface-raised)]">
                  <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3"><span className="flex items-center gap-2 text-xs font-semibold text-[var(--status-success)]"><FileJson className="size-4" /> Extracted JSON</span><span className="text-xs text-[var(--text-secondary)]">{Math.round(digitized.confidence_score * 100)}% confidence</span></div>
                  <pre className="max-h-64 overflow-auto p-4 text-[11px] leading-5 text-[var(--status-info)]">{JSON.stringify(digitized, null, 2)}</pre>
                  <div className="border-t border-[var(--border-default)] p-3"><button type="button" onClick={() => { notify.success('Digitized consent accepted and saved.'); setDigitized(null); setUploadedFileName(''); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"><Save className="size-4" /> Accept & Save</button></div>
                </div>
              ) : null}
              {!digitized && !uploading ? <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-3"><FileCheck2 className="size-5 text-[var(--text-secondary)]" /><p className="text-xs leading-5 text-[var(--text-secondary)]">Signature presence and explicit exclusions are verified before anything is saved.</p></div> : null}
            </HealthcarePanel>
          </div>
        </>
      )}

      <Sheet open={explainOpen} onOpenChange={setExplainOpen}>
        <SheetContent className="w-full border-l-[var(--border-default)] bg-[var(--surface-card)] p-0 text-[var(--text-primary)] sm:max-w-xl">
          <SheetHeader className="border-b border-[var(--border-default)] p-6 pr-14">
            <div className="mb-3 flex items-center gap-2"><GemmaBadge /><span className="text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">Plain-language guide</span></div>
            <SheetTitle className="text-2xl text-[var(--text-primary)]">Explain my consent</SheetTitle>
            <SheetDescription className="leading-6 text-[var(--text-secondary)]">A clear explanation of what you are sharing, why it is needed, and what stays private.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-6">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Your language</label>
            <Select value={language} onValueChange={(value) => { setLanguage(value); void loadExplanation(value); }}>
              <SelectTrigger className="h-11 border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)]">{['English', 'Hindi', 'Kannada', 'Tamil'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            {explaining ? <LoadingState label={`Writing a clear ${language} explanation…`} /> : explanation ? (
              <div className="mt-6 space-y-5">
                <div className="rounded-xl border border-[color:var(--status-ai)]/25 bg-[var(--status-ai-bg)] p-5"><HeartPulse className="mb-3 size-5 text-[var(--status-ai)]" /><p className="text-sm leading-7 text-[var(--text-primary)]">{explanation.explanation}</p></div>
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">In simple terms</h3>
                  <ul className="space-y-3">{explanation.key_points.map((point) => <li key={point} className="flex gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 text-sm leading-6 text-[var(--text-secondary)]"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success)]"><Check className="size-3" /></span>{point}</li>)}</ul>
                </div>
                <div className="rounded-xl border border-[color:var(--status-info)]/25 bg-[var(--status-info-bg)] p-4 text-xs leading-5 text-[var(--status-info)]">You remain in control. Changing or withdrawing consent will not affect care already provided.</div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </HealthcarePage>
  );
}
