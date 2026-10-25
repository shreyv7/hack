import type { ReactElement, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Download,
  FileText,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { TablePager } from '@/app/components/common/TablePager';
import { AnonymisationJobDrawer } from '@/app/components/anonymisation/AnonymisationJobDrawer';
import { DataAnonymisationPlaybook } from '@/app/components/anonymisation/DataAnonymisationPlaybook';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import {
  createAnonymisationJob,
  downloadAnonymisationEvidence,
  downloadAnonymisationOutput,
  fetchAnonymisationDatasets,
  fetchAnonymisationJob,
  fetchAnonymisationJobs,
  fetchAnonymisationSummary,
  fetchDownloadLogs,
  previewAnonymisationRisk,
  runAnonymisationMaintenance,
} from '@/lib/api/anonymisation';
import { fetchDataSources } from '@/lib/api/dataSources';
import { anonymizeText } from '@/lib/api/masking';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';
import { hasRole } from '@/lib/auth/permissions';
import {
  isTrueAnonymisation,
  TECHNIQUE_GROUPS,
  techniqueClassLabel,
  techniqueOptionLabel,
} from '@/lib/anonymisation/techniqueTaxonomy';
import type { AnonymizeTextResult } from '@/types/masking';
import type { DataSource } from '@/types/dataSource';
import {
  ROLE_LABELS,
  SCHEDULE_LABELS,
  TECHNIQUE_LABELS,
  TREATMENT_LABELS,
} from '@/types/anonymisation';
import type {
  AnonymisationJob,
  AnonymisationSummary,
  AnonymisationTechnique,
  DatasetOption,
  DownloadJustification,
  DownloadLog,
  FieldRole,
  FieldRule,
  FieldTreatment,
  RiskPreviewResult,
  ScheduleKind,
} from '@/types/anonymisation';

const SCHEDULES: ScheduleKind[] = ['one_time', 'daily', 'weekly', 'monthly'];

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as FieldRole[];
const TREATMENT_OPTIONS = Object.keys(TREATMENT_LABELS) as FieldTreatment[];


function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const K_OPTIONS = [5, 10, 25, 50, 100];

function riskClasses(level: string | null): string {
  if (level === 'low') return 'bg-[var(--status-success-bg)] text-[var(--status-success)]';
  if (level === 'medium') return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
  if (level === 'high') return 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]';
  return 'bg-[var(--surface-raised)] text-[var(--text-secondary)]';
}

/**
 * Data Anonymisation (DPDPA Section 8) — run anonymisation jobs on connected
 * datasets: pick a dataset, choose a technique, and the platform applies
 * per-field privacy transforms, measures re-identification risk (k-anonymity),
 * and produces a downloadable anonymised copy.
 */
export function DataAnonymisation(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const isAdmin = hasRole(user, 'admin', 'superadmin');
  const [summary, setSummary] = useState<AnonymisationSummary | null>(null);
  const [jobs, setJobs] = useState<AnonymisationJob[]>([]);
  const [jobsPage, setJobsPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const JOBS_PAGE_SIZE = 10;

  const [showModal, setShowModal] = useState(false);
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [s3Sources, setS3Sources] = useState<DataSource[]>([]);
  const [form, setForm] = useState({
    name: '',
    asset_id: '',
    technique: 'k_anonymity' as AnonymisationTechnique,
    k_threshold: 25,
    l_threshold: 2,
    epsilon: 1,
    schedule: 'one_time' as ScheduleKind,
    output_destination: 'download',
    output_source_id: '',
    business_purpose: '',
    output_recipient: '',
    external_sharing: false,
    cross_border_expected: false,
  });
  const [rules, setRules] = useState<FieldRule[]>([]);
  const [risk, setRisk] = useState<RiskPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);

  // Download-justification prompt (mandatory audit questions).
  const [downloadTarget, setDownloadTarget] = useState<AnonymisationJob | null>(null);
  const [downloadForm, setDownloadForm] = useState<DownloadJustification>({
    purpose: '',
    shared_with: '',
    recipient_type: 'internal',
    notes: '',
    acknowledge: false,
  });
  // Download audit history viewer.
  const [historyTarget, setHistoryTarget] = useState<AnonymisationJob | null>(null);
  const [history, setHistory] = useState<DownloadLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [detailTarget, setDetailTarget] = useState<AnonymisationJob | null>(null);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        (j.dataset_name?.toLowerCase().includes(q) ?? false) ||
        (j.business_purpose?.toLowerCase().includes(q) ?? false),
    );
  }, [jobs, jobSearch]);

  const jobsPageCount = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PAGE_SIZE));
  const jobsSafePage = Math.min(jobsPage, jobsPageCount - 1);
  const pagedJobs = filteredJobs.slice(jobsSafePage * JOBS_PAGE_SIZE, (jobsSafePage + 1) * JOBS_PAGE_SIZE);

  const load = async () => {
    setLoading(true);
    try {
      const [s, j] = await Promise.all([
        fetchAnonymisationSummary(orgId),
        fetchAnonymisationJobs(orgId),
      ]);
      setSummary(s);
      setJobs(j);
    } catch (error) {
      notify(`Failed to load anonymisation: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openModal = async () => {
    setForm({
      name: '',
      asset_id: '',
      technique: 'k_anonymity',
      k_threshold: 25,
      l_threshold: 2,
      epsilon: 1,
      schedule: 'one_time',
      output_destination: 'download',
      output_source_id: '',
      business_purpose: '',
      output_recipient: '',
      external_sharing: false,
      cross_border_expected: false,
    });
    setRules([]);
    setRisk(null);
    setShowModal(true);
    try {
      setDatasets(await fetchAnonymisationDatasets(orgId));
    } catch {
      setDatasets([]);
    }
    try {
      const sources = await fetchDataSources(orgId);
      setS3Sources(sources.filter((s) => s.source_type === 's3'));
    } catch {
      setS3Sources([]);
    }
  };

  const handleRunMonitor = async () => {
    setMonitoring(true);
    try {
      const r = await runAnonymisationMaintenance(orgId);
      notify(`Risk monitor: re-checked ${r.monitored} job(s), re-ran ${r.reran}.`);
      await load();
    } catch (error) {
      notify(`Monitor failed: ${(error as Error).message}`);
    } finally {
      setMonitoring(false);
    }
  };

  const pickDataset = (assetId: string) => {
    const ds = datasets.find((d) => d.asset_id === assetId);
    setForm((f) => ({
      ...f,
      asset_id: assetId,
      name: f.name.trim() ? f.name : ds ? `${ds.name} — anonymised` : f.name,
    }));
    setRules([]);
    setRisk(null);
  };

  const updateRule = (field: string, patch: Partial<FieldRule>) => {
    setRules((rs) => rs.map((r) => (r.field === field ? { ...r, ...patch } : r)));
  };

  // When the dataset or technique changes, (re)derive the technique's field plan.
  useEffect(() => {
    if (!showModal || !form.asset_id) {
      setRules([]);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    previewAnonymisationRisk(
      {
        asset_id: form.asset_id,
        technique: form.technique,
        k_threshold: form.k_threshold,
        l_threshold: form.l_threshold,
        epsilon: form.epsilon,
      },
      orgId,
    )
      .then((r) => {
        if (!cancelled) {
          setRules(r.rules);
          setRisk(r);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRules([]);
          setRisk(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, form.asset_id, form.technique]);

  // Re-score the live risk when the plan / thresholds are edited.
  useEffect(() => {
    if (!showModal || !form.asset_id || rules.length === 0) return;
    let cancelled = false;
    setPreviewing(true);
    const t = setTimeout(() => {
      previewAnonymisationRisk(
        {
          asset_id: form.asset_id,
          technique: form.technique,
          k_threshold: form.k_threshold,
          l_threshold: form.l_threshold,
          epsilon: form.epsilon,
          field_rules: rules,
        },
        orgId,
      )
        .then((r) => {
          if (!cancelled) setRisk(r);
        })
        .catch(() => {
          if (!cancelled) setRisk(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, form.k_threshold, form.l_threshold, form.epsilon, rules]);

  const handleCreate = async () => {
    if (!form.name.trim()) return notify('Enter a job name.');
    if (!form.asset_id) return notify('Select a source dataset.');
    if (!form.business_purpose.trim()) return notify('Enter the business purpose for this export.');
    if (!form.output_recipient.trim()) return notify('Enter who will receive the anonymised output.');
    if (form.output_destination === 's3' && !form.output_source_id) {
      return notify('Select an S3 destination.');
    }
    if (!isTrueAnonymisation(form.technique)) {
      notify(
        'De-identification technique selected — confirm with Legal/DPO that output may still be personal data.',
      );
    }
    setCreating(true);
    try {
      const created = await createAnonymisationJob(
        {
          name: form.name.trim(),
          asset_id: form.asset_id,
          technique: form.technique,
          k_threshold: form.k_threshold,
          l_threshold: form.l_threshold,
          epsilon: form.epsilon,
          schedule: form.schedule,
          output_destination: form.output_destination,
          output_source_id: form.output_destination === 's3' ? form.output_source_id : null,
          business_purpose: form.business_purpose.trim(),
          output_recipient: form.output_recipient.trim(),
          external_sharing: form.external_sharing,
          cross_border_expected: form.cross_border_expected,
          field_rules: rules.length ? rules : null,
        },
        orgId,
      );
      setShowModal(false);
      await load();
      // The job runs in the background — poll until it finishes.
      let job = created;
      for (let i = 0; i < 120 && job.status === 'running'; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        job = await fetchAnonymisationJob(created.id, orgId);
      }
      if (job.status === 'failed') notify(`Job failed: ${job.error ?? 'unknown error'}`);
      else if (job.status === 'completed')
        notify(`Anonymisation complete — ${fmtCount(job.records_processed)} records, k=${job.k_value}.`);
      await load();
    } catch (error) {
      notify(`Failed to create job: ${(error as Error).message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = (job: AnonymisationJob) => {
    // Every download must be justified & audited — open the prompt first.
    setDownloadForm({ purpose: '', shared_with: '', recipient_type: 'internal', notes: '', acknowledge: false });
    setDownloadTarget(job);
  };

  const confirmDownload = async () => {
    if (!downloadTarget) return;
    if (!downloadForm.purpose.trim() || !downloadForm.shared_with.trim()) {
      notify('Please state the purpose and who it will be shared with.');
      return;
    }
    if (!downloadForm.acknowledge) {
      notify('Please confirm responsible handling to proceed.');
      return;
    }
    setDownloadingId(downloadTarget.id);
    try {
      await downloadAnonymisationOutput(downloadTarget, downloadForm, orgId);
      notify('Download started — this access has been recorded in the audit log.');
      setDownloadTarget(null);
    } catch (error) {
      notify(`Download failed: ${(error as Error).message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const openHistory = async (job: AnonymisationJob) => {
    setHistoryTarget(job);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await fetchDownloadLogs(job.id, orgId));
    } catch (error) {
      notify(`Failed to load download history: ${(error as Error).message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleEvidence = async (job: AnonymisationJob) => {
    setEvidenceId(job.id);
    try {
      await downloadAnonymisationEvidence(job, orgId);
    } catch (error) {
      notify(`Evidence export failed: ${(error as Error).message}`);
    } finally {
      setEvidenceId(null);
    }
  };

  return (
    <div className="min-h-full">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold mb-1 text-[var(--text-primary)]">Data Anonymisation</h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
              Analytics &amp; export de-identification (DPDPA §8) — governed copies for ML, research, and reporting.
              Withdrawal and in-place remediation use{' '}
              <Link to="/data/masking" className="text-[var(--brand-primary)] hover:underline">
                Data Masking
              </Link>{' '}
              and{' '}
              <Link to="/data/retention" className="text-[var(--brand-primary)] hover:underline">
                Retention
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="md" onClick={() => setShowPlaybook(true)}>
              <BookOpen className="w-4 h-4 mr-2" />
              Playbook
            </Button>
            {isAdmin ? (
              <Button variant="primary" size="md" onClick={openModal}>
                <Plus className="w-4 h-4 mr-1" /> New Anonymisation Job
              </Button>
            ) : (
              <span className="text-xs text-[var(--text-tertiary)] px-3 py-2 rounded-md border border-[var(--border-default)]">
                Admin required to create jobs
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Module scope:</strong> This module produces export copies
          with measurable re-identification risk. Irreversible anonymisation techniques are recommended when the
          goal is to leave DPDPA personal-data scope; de-identification techniques require legal review.
        </div>

        {/* Masking vs Anonymisation */}
        <div className="grid grid-cols-2 gap-6">
          <div className="p-6 rounded-xl bg-[var(--status-info-bg)] border border-[var(--border-default)]">
            <h3 className="font-semibold mb-2 text-[var(--text-primary)]">Masking (Reversible)</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              In-place safeguards on live databases — still personal data under DPDPA. Use for operational systems,
              non-prod clones, and withdrawal remediation.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-[var(--status-info-bg)] border-2 border-[var(--brand-primary)]">
            <h3 className="font-semibold mb-2 text-[var(--text-primary)]">
              Anonymisation export (This module)
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              <strong>Recommended for analytics exports.</strong> k/l-diversity and suppression techniques aim to
              irreversibly de-link data principals. Proof Vault sealing and download audit apply to every export.
            </p>
          </div>
        </div>

        {/* Overview stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Datasets anonymised" value={summary ? String(summary.datasets_anonymised) : '—'} />
          <Stat
            label="Total records processed"
            value={summary ? fmtCount(summary.total_records) : '—'}
            accent="text-[var(--brand-primary)]"
          />
          <Stat label="Total jobs" value={summary ? String(summary.total_jobs) : '—'} />
          <Stat
            label="Running"
            value={summary ? String(summary.running_jobs) : '—'}
            accent={summary && summary.running_jobs > 0 ? 'text-[var(--status-warning)]' : undefined}
          />
          <Stat
            label="Avg re-ID risk"
            value={summary?.avg_risk_percent != null ? `${summary.avg_risk_percent}%` : '—'}
            sub={summary?.lowest_k != null ? `k ≥ ${summary.lowest_k}` : summary && summary.drift_jobs > 0 ? `${summary.drift_jobs} drift` : undefined}
            accent="text-[var(--status-success)]"
          />
        </div>

        {/* Jobs table */}
        <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
          <div className="p-6 border-b border-[var(--border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Anonymisation Jobs</h2>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-tertiary)]" />
              <input
                className="w-full pl-9 pr-3 py-2 rounded-md border text-sm bg-[var(--surface-base)] border-[var(--border-default)]"
                placeholder="Search jobs…"
                value={jobSearch}
                onChange={(e) => {
                  setJobSearch(e.target.value);
                  setJobsPage(0);
                }}
              />
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="py-16 text-center text-sm text-[var(--text-secondary)]">
              {jobs.length === 0
                ? 'No anonymisation jobs yet. Open the Playbook for prerequisites, then create a job.'
                : 'No jobs match your search.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-default)]">
                  <th className="px-6 py-3 font-medium">Job Name</th>
                  <th className="px-6 py-3 font-medium">Technique</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Records</th>
                  <th className="px-6 py-3 font-medium">Risk Level</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedJobs.map((job) => (
                  <tr key={job.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--surface-raised)]/50">
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        className="font-medium text-[var(--text-primary)] hover:text-[var(--brand-primary)] text-left"
                        onClick={() => setDetailTarget(job)}
                      >
                        {job.name}
                      </button>
                      <div className="text-xs text-[var(--text-tertiary)]">
                        Source: {job.dataset_name ?? '—'}
                        {job.source_label ? ` · ${job.source_label}` : ''}
                      </div>
                      {job.business_purpose && (
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5 truncate max-w-xs" title={job.business_purpose}>
                          Purpose: {job.business_purpose}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">
                      {TECHNIQUE_LABELS[job.technique]}
                      <div className="text-[10px] mt-0.5">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded',
                            isTrueAnonymisation(job.technique)
                              ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                              : 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
                          )}
                        >
                          {isTrueAnonymisation(job.technique) ? 'Irreversible' : 'De-ID'}
                        </span>
                      </div>
                      {job.k_value != null && (
                        <div className="text-xs text-[var(--text-tertiary)]">k={job.k_value}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={job.status} monitorStatus={job.monitor_status} />
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">
                      {fmtCount(job.records_processed)}
                      {job.status === 'completed' && job.records_processed > 0 && (
                        job.records_suppressed >= job.records_processed ? (
                          <div className="text-xs text-[var(--status-danger)]" title="Every record was suppressed to satisfy the privacy threshold — the output file has only column headers. Lower k, or use a larger dataset.">
                            0 kept · output empty
                          </div>
                        ) : job.records_suppressed > 0 ? (
                          <div className="text-xs text-[var(--status-warning)]">
                            {fmtCount(job.records_processed - job.records_suppressed)} kept · {fmtCount(job.records_suppressed)} suppressed
                          </div>
                        ) : null
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {job.risk_percent != null ? (
                        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', riskClasses(job.risk_level))}>
                          {job.risk_percent}% {job.risk_level ? job.risk_level[0].toUpperCase() + job.risk_level.slice(1) : ''}
                        </span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailTarget(job)}
                        className="text-xs text-[var(--text-secondary)] hover:underline mr-3"
                      >
                        Details
                      </button>
                      {job.status === 'completed' && isAdmin ? (
                        <div className="inline-flex items-center gap-3">
                          {job.output_filename && (
                            <button
                              type="button"
                              onClick={() => handleDownload(job)}
                              disabled={downloadingId === job.id}
                              className="inline-flex items-center gap-1.5 text-[var(--brand-primary)] hover:underline disabled:opacity-50"
                            >
                              {downloadingId === job.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              Data
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEvidence(job)}
                            disabled={evidenceId === job.id}
                            title="Download the DPDPA evidence pack (PDF)"
                            className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:underline disabled:opacity-50"
                          >
                            {evidenceId === job.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                            Evidence
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistory(job)}
                            title="Who downloaded this dataset, when and why"
                            className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:underline"
                          >
                            <History className="w-3.5 h-3.5" />
                            Log
                          </button>
                        </div>
                      ) : job.status === 'failed' ? (
                        <button
                          type="button"
                          className="text-xs text-[var(--status-danger)] hover:underline"
                          onClick={() => setDetailTarget(job)}
                        >
                          View error
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TablePager
            page={jobsSafePage}
            pageCount={jobsPageCount}
            total={filteredJobs.length}
            pageSize={JOBS_PAGE_SIZE}
            onPage={setJobsPage}
          />
        </div>

        {/* Continuous re-identification risk monitor */}
        <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
          <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Continuous Re-identification Risk Monitor
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Re-checks completed datasets against current data and flags drift
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunMonitor}
              disabled={monitoring || !isAdmin}
              title={!isAdmin ? 'Admin required' : undefined}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-50"
            >
              {monitoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Run checks now
            </button>
          </div>
          <div className="p-6">
            {jobs.filter((j) => j.status === 'completed').length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No completed datasets to monitor yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {jobs
                  .filter((j) => j.status === 'completed')
                  .slice(0, 6)
                  .map((j) => {
                    const drift = j.monitor_status === 'drift';
                    const pct = j.monitor_risk_percent ?? j.risk_percent;
                    return (
                      <div
                        key={j.id}
                        className={cn(
                          'p-4 rounded-lg border',
                          drift
                            ? 'bg-[var(--status-warning-bg)] border-[var(--status-warning)]'
                            : 'bg-[var(--status-success-bg)] border-[var(--border-default)]',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{j.name}</span>
                          {drift ? (
                            <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
                          ) : (
                            <Check className="w-4 h-4 text-[var(--status-success)]" />
                          )}
                        </div>
                        <div className={cn('text-2xl font-semibold mt-1', drift ? 'text-[var(--status-warning)]' : 'text-[var(--status-success)]')}>
                          {pct != null ? `${pct}%` : '—'}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] mt-1">
                          {j.monitor_k != null ? `k=${j.monitor_k} · ` : ''}
                          {drift ? 'Re-anonymise recommended' : 'Risk: Low'}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        <QuickTextAnonymiser />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Create New Anonymisation Job</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Job Name">
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Q2 Marketing Analytics Export"
                />
              </Field>
              <Field label="Business purpose *">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.business_purpose}
                  onChange={(e) => setForm((f) => ({ ...f, business_purpose: e.target.value }))}
                  placeholder="e.g. Quarterly churn model training on marketing leads"
                />
              </Field>
              <Field label="Output recipient *">
                <input
                  className={inputCls}
                  value={form.output_recipient}
                  onChange={(e) => setForm((f) => ({ ...f, output_recipient: e.target.value }))}
                  placeholder="e.g. Data Science team / Acme Analytics Ltd"
                />
              </Field>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={form.external_sharing}
                    onChange={(e) => setForm((f) => ({ ...f, external_sharing: e.target.checked }))}
                  />
                  Shared outside the organisation
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={form.cross_border_expected}
                    onChange={(e) => setForm((f) => ({ ...f, cross_border_expected: e.target.checked }))}
                  />
                  Cross-border transfer expected
                </label>
              </div>
              <Field label="Source Dataset">
                <select className={inputCls} value={form.asset_id} onChange={(e) => pickDataset(e.target.value)}>
                  <option value="">Select dataset…</option>
                  {Object.entries(
                    datasets.reduce<Record<string, DatasetOption[]>>((groups, d) => {
                      const key = d.source_label || 'Other';
                      (groups[key] ??= []).push(d);
                      return groups;
                    }, {}),
                  ).map(([sourceLabel, items]) => (
                    <optgroup key={sourceLabel} label={sourceLabel}>
                      {items.map((d) => (
                        <option key={d.asset_id} value={d.asset_id}>
                          {d.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {datasets.length === 0 && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    No datasets yet — connect a database or upload a file, then run a PII scan so it
                    appears here.
                  </p>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Anonymisation Technique">
                  <select
                    className={inputCls}
                    value={form.technique}
                    onChange={(e) => setForm((f) => ({ ...f, technique: e.target.value as AnonymisationTechnique }))}
                  >
                    {TECHNIQUE_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.techniques.map((t) => (
                          <option key={t} value={t}>
                            {techniqueOptionLabel(t)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {!isTrueAnonymisation(form.technique) && (
                    <p className="text-xs text-[var(--status-warning)] mt-1 flex items-start gap-1">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      {techniqueClassLabel(form.technique)} — confirm with Legal/DPO before external use.
                    </p>
                  )}
                </Field>
                <Field label="k-Anonymity Threshold">
                  <select
                    className={inputCls}
                    value={form.k_threshold}
                    onChange={(e) => setForm((f) => ({ ...f, k_threshold: Number(e.target.value) }))}
                  >
                    {K_OPTIONS.map((k) => (
                      <option key={k} value={k}>k={k}{k === 25 ? ' (Standard)' : ''}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {form.technique === 'l_diversity' && (
                <Field label="l-Diversity Threshold (distinct sensitive values per group)">
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={form.l_threshold}
                    onChange={(e) => setForm((f) => ({ ...f, l_threshold: Number(e.target.value) || 1 }))}
                  />
                </Field>
              )}

              {form.technique === 'differential_privacy' && (
                <Field label={`Privacy budget ε = ${form.epsilon} (lower = more noise / more privacy)`}>
                  <input
                    type="range"
                    min={0.1}
                    max={10}
                    step={0.1}
                    className="w-full"
                    value={form.epsilon}
                    onChange={(e) => setForm((f) => ({ ...f, epsilon: Number(e.target.value) }))}
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
                    <span>0.1 — strong privacy</span>
                    <span>10 — high accuracy</span>
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Output Destination">
                  <select
                    className={inputCls}
                    value={form.output_destination}
                    onChange={(e) => setForm((f) => ({ ...f, output_destination: e.target.value }))}
                  >
                    <option value="download">Download (CSV)</option>
                    <option value="s3" disabled={s3Sources.length === 0}>
                      Write to AWS S3{s3Sources.length === 0 ? ' (no S3 source connected)' : ''}
                    </option>
                  </select>
                </Field>
                <Field label="Schedule">
                  <select
                    className={inputCls}
                    value={form.schedule}
                    onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value as ScheduleKind }))}
                  >
                    {SCHEDULES.map((s) => (
                      <option key={s} value={s}>{SCHEDULE_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {form.output_destination === 's3' && (
                <Field label="S3 Destination">
                  <select
                    className={inputCls}
                    value={form.output_source_id}
                    onChange={(e) => setForm((f) => ({ ...f, output_source_id: e.target.value }))}
                  >
                    <option value="">Select S3 source…</option>
                    {s3Sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              )}

              {/* Live re-identification risk preview */}
              {rules.length > 0 && (
                <div className={cn('rounded-lg p-4 border', risk ? riskClasses(risk.risk_level) : 'bg-[var(--surface-raised)] border-[var(--border-default)]')}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Live re-identification risk</span>
                    {previewing && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  {risk ? (
                    <div className="mt-2 text-sm">
                      <span className="text-2xl font-semibold">
                        {risk.risk_percent != null ? `${risk.risk_percent}%` : '—'}
                      </span>{' '}
                      <span className="font-medium">
                        {risk.risk_level ? risk.risk_level.toUpperCase() : ''}
                      </span>
                      <div className="text-xs mt-1 opacity-90">
                        Predicted k = {risk.predicted_k} (target k={form.k_threshold}) ·{' '}
                        ~{risk.estimated_suppressed} of {risk.sample_rows} rows suppressed (
                        {risk.estimated_suppression_rate}%)
                      </div>
                      {risk.quasi_identifiers.length > 0 && (
                        <div className="text-xs mt-1 opacity-75">
                          Quasi-identifiers: {risk.quasi_identifiers.join(', ')}
                        </div>
                      )}
                      {risk.note && <div className="text-xs mt-1 opacity-75">{risk.note}</div>}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs opacity-75">Estimating…</div>
                  )}
                </div>
              )}

              {/* Editable field plan */}
              {rules.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                    Field plan ({rules.length} columns) — auto-derived from your data classification;
                    adjust as needed
                  </div>
                  <div className="rounded-lg border border-[var(--border-default)] divide-y divide-[var(--border-default)] max-h-60 overflow-y-auto">
                    {rules.map((r) => (
                      <div key={r.field} className="grid grid-cols-3 gap-2 items-center px-3 py-1.5 text-xs">
                        <span className="font-mono text-[var(--text-primary)] truncate" title={r.field}>
                          {r.field}
                        </span>
                        <select
                          className="px-2 py-1 rounded border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
                          value={r.role}
                          onChange={(e) => updateRule(r.field, { role: e.target.value as FieldRole })}
                        >
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o} value={o}>{ROLE_LABELS[o]}</option>
                          ))}
                        </select>
                        <select
                          className="px-2 py-1 rounded border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
                          value={r.treatment}
                          onChange={(e) => updateRule(r.field, { treatment: e.target.value as FieldTreatment })}
                        >
                          {TREATMENT_OPTIONS.map((o) => (
                            <option key={o} value={o}>{TREATMENT_LABELS[o]}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]">
                Cancel
              </button>
              <Button variant="primary" size="md" onClick={handleCreate} disabled={creating}>
                {creating ? 'Running…' : 'Create Job'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Download justification prompt (mandatory audit questions) */}
      {downloadTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg max-w-lg w-full">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Download dataset — justification required</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  This access will be recorded in the audit log. Please answer before downloading “{downloadTarget.name}”.
                </p>
              </div>
              <button onClick={() => setDownloadTarget(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X className="size-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Why are you downloading this? *</label>
                <textarea
                  className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]"
                  rows={2}
                  value={downloadForm.purpose}
                  onChange={(e) => setDownloadForm((f) => ({ ...f, purpose: e.target.value }))}
                  placeholder="e.g. Quarterly analytics model training"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Where / with whom is it shared? *</label>
                  <input
                    className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]"
                    value={downloadForm.shared_with}
                    onChange={(e) => setDownloadForm((f) => ({ ...f, shared_with: e.target.value }))}
                    placeholder="e.g. Data Science team / Acme Analytics Ltd"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Recipient type</label>
                  <select
                    className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]"
                    value={downloadForm.recipient_type ?? 'internal'}
                    onChange={(e) => setDownloadForm((f) => ({ ...f, recipient_type: e.target.value }))}
                  >
                    <option value="internal">Internal team</option>
                    <option value="external_vendor">External vendor / processor</option>
                    <option value="regulator">Regulator / authority</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <input
                  className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]"
                  value={downloadForm.notes ?? ''}
                  onChange={(e) => setDownloadForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={downloadForm.acknowledge}
                  onChange={(e) => setDownloadForm((f) => ({ ...f, acknowledge: e.target.checked }))}
                />
                I confirm I will handle this data responsibly and in line with our data-protection policy.
              </label>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setDownloadTarget(null)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]">Cancel</button>
              <button
                onClick={confirmDownload}
                disabled={downloadingId === downloadTarget.id}
                className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {downloadingId === downloadTarget.id && <Loader2 className="w-4 h-4 animate-spin" />}
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download audit history */}
      {historyTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between sticky top-0 bg-[var(--surface-card)]">
              <div>
                <h2 className="text-lg font-semibold">Download Audit Log</h2>
                <p className="text-xs text-[var(--text-secondary)]">Every download of “{historyTarget.name}”.</p>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X className="size-5" /></button>
            </div>
            <div className="p-6">
              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-[var(--text-secondary)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)] py-6 text-center">No downloads recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{h.downloaded_by_email ?? 'Unknown user'}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">{new Date(h.created_at).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="text-[var(--text-secondary)] mt-1"><strong>Purpose:</strong> {h.purpose}</div>
                      <div className="text-[var(--text-secondary)]">
                        <strong>Shared with:</strong> {h.shared_with}
                        {h.recipient_type ? ` (${h.recipient_type})` : ''}
                      </div>
                      {h.notes && <div className="text-[var(--text-tertiary)] text-xs mt-1">{h.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPlaybook && <DataAnonymisationPlaybook onClose={() => setShowPlaybook(false)} orgId={orgId} />}

      {detailTarget && (
        <AnonymisationJobDrawer
          job={detailTarget}
          onClose={() => setDetailTarget(null)}
          isAdmin={isAdmin}
          onDownload={handleDownload}
          onEvidence={handleEvidence}
          onHistory={openHistory}
          downloadingId={downloadingId}
          evidenceId={evidenceId}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }): ReactElement {
  return (
    <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
      <div className={cn('text-3xl font-semibold mb-1 text-[var(--text-primary)]', accent)}>{value}</div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      {sub && <div className="text-xs text-[var(--status-success)] mt-1">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status, monitorStatus }: { status: string; monitorStatus?: string | null }): ReactElement {
  if (status === 'completed') {
    const drift = monitorStatus === 'drift';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
          drift
            ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
            : 'bg-[var(--status-success-bg)] text-[var(--status-success)]',
        )}
      >
        {drift ? <AlertTriangle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
        {drift ? 'Drift' : 'Complete'}
      </span>
    );
  }
  if (status === 'failed')
    return <span className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--status-danger-bg)] text-[var(--status-danger)]">Failed</span>;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
      <Loader2 className="w-3 h-3 animate-spin" /> Running
    </span>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)] disabled:opacity-60';

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-[var(--text-primary)]">{label}</label>
      {children}
    </div>
  );
}

// --- Secondary tool: quick free-text anonymiser (Presidio NER) ---------------

const SAMPLE =
  'Patient Priya Sharma (PAN ABCDE1234F) can be reached at 9876543210 or priya@acme.com in Mumbai.';

function QuickTextAnonymiser(): ReactElement {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<AnonymizeTextResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!text.trim()) return;
    setRunning(true);
    try {
      setResult(await anonymizeText(text));
    } catch (error) {
      notify(`Anonymisation failed: ${(error as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] p-6">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-[var(--text-tertiary)]" />
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Quick free-text anonymiser</h2>
        <span className="text-xs text-[var(--text-tertiary)]">— for ad-hoc notes / tickets (no dataset needed)</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] text-sm resize-none"
          />
          <button
            onClick={run}
            disabled={running}
            className="mt-2 px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {running ? 'Anonymising…' : 'Anonymise'}
          </button>
        </div>
        <div className="p-3 rounded-lg bg-[var(--surface-raised)] text-sm whitespace-pre-wrap text-[var(--text-primary)] min-h-[120px]">
          {result ? result.anonymized_text : <span className="text-[var(--text-tertiary)]">Output appears here.</span>}
        </div>
      </div>
    </div>
  );
}
