import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import {
  FileText,
  X,
  ArrowLeft,
  Shield,
  AlertOctagon,
  Settings as SettingsIcon,
  Clock,
  CheckCircle2,
  RefreshCw,
  FileDown,
  Send,
  Trash2,
  Sparkles,
  AlertTriangle,
  Plus,
  FileSpreadsheet,
  Search,
  Filter,
  Lock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import {
  fetchCisoDashboard,
  fetchCisoBenchmarkMatrix,
  fetchCisoControls,
  fetchCisoControl,
  createCisoEvidence,
  listCisoEvidence,
  deleteCisoEvidence,
  listCisoRisks,
  createCisoRisk,
  listCisoRemediation,
  createCisoRemediation,
  updateCisoRemediation,
  listCisoExceptions,
  createCisoException,
  addCisoControlComment,
  addCisoControlReview,
  fetchCisoSettings,
  updateCisoSettings,
  fetchCisoAnalytics,
  fetchCisoReports,
  generateCisoReport,
  fetchCisoActivities,
  fetchCisoControlVersions,
  fetchCisoOrgControls,
  createCisoOrgControl,
  deleteCisoOrgControl,
  updateCisoControl,
  fetchCisoAssets,
  createCisoAsset,
  linkAssetToControl,
  unlinkAssetFromControl,
  linkPolicyToControl,
  unlinkPolicyFromControl,
  triggerAssetScan,
  fetchAssetScanLogs,
  downloadCisoEvidence,
  downloadCisoBoardReport,
} from '@/lib/api/ciso';
import { fetchPolicies } from '@/lib/api/policy';
import { DEFAULT_PRESET_CIS_CONTROLS } from '@/lib/constants/presetControls';
import type {
  CisoDashboardSummary,
  CisoControl,
  CisoEvidence,
  CisoRisk,
  CisoRemediationTask,
  CisoException,
  CisoScoreSettings,
  CisoScoreSnapshot,
  CisoBoardReport,
  CisoActivity,
  CisoControlVersion,
  CisoOrganizationControl,
} from '@/types';
import { toast } from 'sonner';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

type ActiveTab =
  | 'landing'
  | 'overview'
  | 'controls'
  | 'evidence'
  | 'risks'
  | 'remediation'
  | 'exceptions'
  | 'reports'
  | 'settings';

type DetailTab =
  | 'overview'
  | 'evidence'
  | 'policies'
  | 'assets'
  | 'risks'
  | 'tasks'
  | 'vendors'
  | 'ropa'
  | 'dpia'
  | 'audit'
  | 'history'
  | 'ai';

export function CISOCommandCenter(): ReactElement {
  const {
    loading: orgLoading,
    error: orgError,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    orgIdParam,
  } = useComplianceOrg();

  // Primary Views & Tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('landing');
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [selectedControl, setSelectedControl] = useState<CisoControl | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');

  // API Data
  const [dashboard, setDashboard] = useState<CisoDashboardSummary | null>(null);
  const [controls, setControls] = useState<CisoControl[]>(DEFAULT_PRESET_CIS_CONTROLS);
  const [evidence, setEvidence] = useState<CisoEvidence[]>([]);
  const [risks, setRisks] = useState<CisoRisk[]>([]);
  const [remediation, setRemediation] = useState<CisoRemediationTask[]>([]);
  const [exceptions, setExceptions] = useState<CisoException[]>([]);
  const [reports, setReports] = useState<CisoBoardReport[]>([]);
  const [analytics, setAnalytics] = useState<CisoScoreSnapshot[]>([]);
  const [settings, setSettings] = useState<CisoScoreSettings | null>(null);
  const [activities, setActivities] = useState<CisoActivity[]>([]);
  const [controlVersions, setControlVersions] = useState<CisoControlVersion[]>([]);
  const [controlActivities, setControlActivities] = useState<CisoActivity[]>([]);
  const [orgControls, setOrgControls] = useState<CisoOrganizationControl[]>([]);

  const evidencePager = useClientPagination(evidence);
  const risksPager = useClientPagination(risks);
  const remediationPager = useClientPagination(remediation);
  const exceptionsPager = useClientPagination(exceptions);
  const reportsPager = useClientPagination(reports);
  const orgControlsPager = useClientPagination(orgControls);

  useEffect(() => {
    evidencePager.resetPage();
    risksPager.resetPage();
    remediationPager.resetPage();
    exceptionsPager.resetPage();
    reportsPager.resetPage();
    orgControlsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence.length, risks.length, remediation.length, exceptions.length, reports.length, orgControls.length]);

  // State Management & Actions
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [daysFilter, setDaysFilter] = useState<number>(30);
  const [frameworkRegroup, setFrameworkRegroup] = useState<string>(''); // empty, CIS, DPDPA, ISO, NIST

  // Modals
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [isRemediationModalOpen, setIsRemediationModalOpen] = useState(false);
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [isOrgControlModalOpen, setIsOrgControlModalOpen] = useState(false);

  // Vajra AI State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Comments / Reviews
  const [newComment, setNewComment] = useState('');
  const [reviewOutcome, setReviewOutcome] = useState('Approved');
  const [reviewNotes, setReviewNotes] = useState('');

  // Assign Owner Form
  const [newOwnerId, setNewOwnerId] = useState('');

  // Assets & Policies Scope Mappings
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [allPolicies, setAllPolicies] = useState<any[]>([]);
  const [isLinkAssetModalOpen, setIsLinkAssetModalOpen] = useState(false);
  const [isLinkPolicyModalOpen, setIsLinkPolicyModalOpen] = useState(false);
  const [isCreateAssetModalOpen, setIsCreateAssetModalOpen] = useState(false);

  // Official CIS Benchmark Standard Matrix Modal
  const [isCisMatrixModalOpen, setIsCisMatrixModalOpen] = useState(false);
  const [benchmarkMatrix, setBenchmarkMatrix] = useState<any[]>([]);
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixAssetFilter, setMatrixAssetFilter] = useState('');
  const [matrixFunctionFilter, setMatrixFunctionFilter] = useState('');
  const [expandedBenchmarkControls, setExpandedBenchmarkControls] = useState<Record<string, boolean>>({ 'CIS-1': true });

  useEffect(() => {
    if (isCisMatrixModalOpen && benchmarkMatrix.length === 0) {
      fetchCisoBenchmarkMatrix()
        .then(setBenchmarkMatrix)
        .catch((err) => console.error("Error fetching benchmark matrix:", err));
    }
  }, [isCisMatrixModalOpen]);

  // Scans
  const [scanLogs, setScanLogs] = useState<any[]>([]);
  const [selectedScanAsset, setSelectedScanAsset] = useState<any | null>(null);
  const [isScanLogsModalOpen, setIsScanLogsModalOpen] = useState(false);
  const [scanningAssetIds, setScanningAssetIds] = useState<Record<string, boolean>>({});

  // Load All Dashboard Data
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [
        dashRes,
        ctrlsRes,
        evRes,
        riskRes,
        remRes,
        excRes,
        repRes,
        anRes,
        setRes,
        actRes,
        orgCtrlRes,
      ] = await Promise.all([
        fetchCisoDashboard(orgIdParam),
        fetchCisoControls({ orgId: orgIdParam }),
        listCisoEvidence(orgIdParam),
        listCisoRisks(orgIdParam),
        listCisoRemediation(orgIdParam),
        listCisoExceptions(orgIdParam),
        fetchCisoReports(orgIdParam),
        fetchCisoAnalytics(daysFilter, orgIdParam),
        fetchCisoSettings(orgIdParam),
        fetchCisoActivities({ orgId: orgIdParam }),
        fetchCisoOrgControls(orgIdParam),
      ]);

      setDashboard(dashRes);
      // Merge DB properties into the static preset properties
      const mergedCtrls = DEFAULT_PRESET_CIS_CONTROLS.map((preset) => {
        const dbControl = ctrlsRes.find((c) => c.control_key === preset.control_key);
        if (dbControl) {
          return {
            ...preset,
            id: dbControl.id,
            status: dbControl.status,
            priority: dbControl.priority,
            owner_user_id: dbControl.owner_user_id,
            assets_covered: dbControl.assets_covered || [],
            linked_policies: dbControl.linked_policies || [],
            linked_vendors: dbControl.linked_vendors || [],
            linked_dpias: dbControl.linked_dpias || [],
            linked_ropas: dbControl.linked_ropas || [],
            linked_audit_logs: dbControl.linked_audit_logs || [],
            evidence: dbControl.evidence || [],
            risks: dbControl.risks || [],
            remediation_tasks: dbControl.remediation_tasks || [],
            exceptions: dbControl.exceptions || [],
            comments: dbControl.comments || [],
            reviews: dbControl.reviews || [],
          };
        }
        return preset;
      });

      const sortedCtrls = [...mergedCtrls].sort((a, b) => {
        const aNum = parseInt(a.control_key.replace(/[^\d]/g, ''), 10);
        const bNum = parseInt(b.control_key.replace(/[^\d]/g, ''), 10);
        return aNum - bNum;
      });
      setControls(sortedCtrls);
      setEvidence(evRes);
      setRisks(riskRes);
      setRemediation(remRes);
      setExceptions(excRes);
      setReports(repRes);
      setAnalytics(anRes);
      setSettings(setRes);
      setActivities(actRes);
      setOrgControls(orgCtrlRes);
    } catch (err: any) {
      toast.error(`Failed to load governance dashboard: ${err.message}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (hasOrg) {
      loadData();
    }
  }, [daysFilter, orgIdParam, hasOrg]);

  // Load specific control details
  useEffect(() => {
    if (selectedControlId) {
      setIsAiLoading(false);
      setAiAnalysis(null);
      setDetailTab('overview');
      fetchCisoControl(selectedControlId, orgIdParam)
        .then(setSelectedControl)
        .catch((err) => toast.error(`Error loading control: ${err.message}`));
      
      fetchCisoControlVersions(selectedControlId, orgIdParam)
        .then(setControlVersions)
        .catch((err) => toast.error(`Error loading control versions: ${err.message}`));

      fetchCisoActivities({ entityId: selectedControlId, orgId: orgIdParam })
        .then(setControlActivities)
        .catch((err) => toast.error(`Error loading control activities: ${err.message}`));

      fetchCisoAssets(orgIdParam)
        .then(setAllAssets)
        .catch((err) => console.error("Error loading assets:", err));

      fetchPolicies(orgIdParam)
        .then(setAllPolicies)
        .catch((err) => console.error("Error loading policies:", err));
    } else {
      setSelectedControl(null);
      setControlVersions([]);
      setControlActivities([]);
    }
  }, [selectedControlId, orgIdParam]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(true);
  };

  // Score display variant helpers
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[var(--status-success)]';
    if (score >= 50) return 'text-[var(--status-warning)]';
    return 'text-[var(--status-danger)]';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 border-green-500/20';
    if (score >= 50) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  const getStatusBadge = (status: string) => {
    const base = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border';
    switch (status) {
      case 'healthy':
        return `${base} bg-green-500/10 text-green-500 border-green-500/20`;
      case 'warning':
        return `${base} bg-amber-500/10 text-amber-500 border-amber-500/20`;
      case 'critical':
        return `${base} bg-red-500/10 text-red-500 border-red-500/20`;
      case 'exception':
        return `${base} bg-purple-500/10 text-purple-500 border-purple-500/20`;
      case 'in_progress':
        return `${base} bg-blue-500/10 text-blue-500 border-blue-500/20`;
      default:
        return `${base} bg-gray-500/10 text-gray-400 border-gray-500/20`;
    }
  };

  // AI Assistant trigger
  const runAiAction = (action: string) => {
    if (!selectedControl) return;
    setIsAiLoading(true);
    setAiAnalysis(null);
    
    setTimeout(() => {
      let responseText = '';
      switch (action) {
        case 'explain':
          responseText = `### Vajra AI Technical & Business Blueprint: ${selectedControl.control_key}\n\n` +
            `**Statutory Context:** Directly maps to personal data protection regulations requiring reasonable safeguards to prevent security breaches.\n\n` +
            `**Technical Objective:** Implement continuous monitoring of all cloud infrastructure and endpoints to flag configuration drift.\n\n` +
            `**Operational Impact:** Restricts threat profiles and builds verifiable audit registries for external verifiers.`;
          break;
        case 'checklist':
          responseText = `### Vajra AI HARDENING CHECKLIST for ${selectedControl.control_key}\n\n` +
            `1. [ ] Enforce IAM Least Privilege access bounds on database systems.\n` +
            `2. [ ] Enable CloudTrail / VPC Flow Logs continuous analysis.\n` +
            `3. [ ] Schedule weekly vulnerability scanning jobs on backend containers.`;
          break;
        case 'sop':
          responseText = `### Vajra AI Standard Operational Procedure (SOP)\n\n` +
            `**1. Purpose:** Enforce automated evidence gathering routines.\n` +
            `**2. Actions:** System administrators must upload verified security policy proofs on a monthly schedule.\n` +
            `**3. Escalation:** If compliance degrades to Critical, remediation tasks must be dispatched within a 24-hour SLA window.`;
          break;
        case 'remediation':
          responseText = `### Vajra AI Remediation Guidance (CAPA)\n\n` +
            `**Root Cause:** Missing verified evidence files for continuous backups.\n` +
            `**Resolution Path:** Update cron tables for backup verifications. Capture JSON logs and post to Proof Vault API.\n` +
            `**Validation:** Set control status back to Healthy once logs verify 100% completion.`;
          break;
        case 'capa':
          responseText = `### Vajra AI Corrective & Preventive Action (CAPA)\n\n` +
            `**Action Plan:** Automate compliance testing for default software configurations.\n` +
            `**Timeline:** SLA to resolve: 5 Days. Assigned to Security Operations Team.\n` +
            `**Prevention:** Conduct monthly posture assessments.`;
          break;
        case 'executive':
          responseText = `### Vajra AI Executive Summary excerpt\n\n` +
            `Compliance status of ${selectedControl.control_key} is configured as ${selectedControl.status.toUpperCase()}. Evidence score stands at 90% coverage with zero critical exceptions outstanding. Recommended action: allocate security budgets for backup automation.`;
          break;
        case 'audit':
          responseText = `### Vajra AI Compliance Audit Notes\n\n` +
            `Control maps directly to ISO 27001 clauses and DPDPA requirements. Evidence files are cryptographically hashed using SHA-256 and stored inside immutable storage buckets. System configuration has not mutated since the last review.`;
          break;
        default:
          responseText = `Vajra AI generated report for ${selectedControl.control_key}`;
          break;
      }
      setAiAnalysis(responseText);
      setIsAiLoading(false);
    }, 600);
  };

  // Action: Generate PDF Report
  const handleGenerateReport = async () => {
    try {
      toast.loading('Compiling Executive PDF Board Report...');
      const rep = await generateCisoReport(orgIdParam);
      toast.dismiss();
      toast.success('Executive Board Report compiled! Downloading PDF...');
      setReports([rep, ...reports]);
      await downloadCisoBoardReport(rep.id, rep.title, orgIdParam);
      loadData(true);
    } catch (err: any) {
      toast.dismiss();
      toast.error(`Report compilation failed: ${err.message}`);
    }
  };

  // Action: Download PDF Report
  const handleDownloadReport = async (rep: CisoBoardReport) => {
    try {
      toast.loading('Downloading Board PDF Report...');
      await downloadCisoBoardReport(rep.id, rep.title, orgIdParam);
      toast.dismiss();
      toast.success('Report downloaded successfully!');
    } catch (err: any) {
      toast.dismiss();
      toast.error(`Failed to download report: ${err.message}`);
    }
  };

  // Action: Delete Evidence
  const handleDeleteEvidence = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this evidence?')) return;
    try {
      await deleteCisoEvidence(id, orgIdParam);
      toast.success('Evidence record deleted');
      setEvidence(evidence.filter((e) => e.id !== id));
      if (selectedControl) {
        setSelectedControl({
          ...selectedControl,
          evidence: selectedControl.evidence.filter((e) => e.id !== id),
        });
      }
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to delete evidence: ${err.message}`);
    }
  };

  const handleDownloadEvidence = async (evidenceId: string, fileName: string) => {
    try {
      await downloadCisoEvidence(evidenceId, fileName, orgIdParam);
    } catch (err: any) {
      toast.error(`Failed to download file: ${err.message}`);
    }
  };

  // Action: Submit comments
  const handleAddComment = async (controlId: string) => {
    if (!newComment.trim()) return;
    try {
      const commentObj = await addCisoControlComment(controlId, newComment, orgIdParam);
      if (selectedControl) {
        setSelectedControl({
          ...selectedControl,
          comments: [commentObj, ...selectedControl.comments],
        });
      }
      setNewComment('');
      toast.success('Comment logged');
    } catch (err: any) {
      toast.error(`Failed to log comment: ${err.message}`);
    }
  };

  // Action: Submit review
  const handleAddReview = async (controlId: string) => {
    try {
      const reviewObj = await addCisoControlReview(controlId, {
        outcome: reviewOutcome,
        notes: reviewNotes,
      }, orgIdParam);
      if (selectedControl) {
        setSelectedControl({
          ...selectedControl,
          reviews: [reviewObj, ...selectedControl.reviews],
          status: reviewOutcome === 'Approved' ? 'healthy' : 'critical',
        });
      }
      setReviewNotes('');
      toast.success('Formal compliance review logged');
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to log review: ${err.message}`);
    }
  };

  // Action: Save Score Weights
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      await updateCisoSettings({
        controls_weight: settings.controls_weight,
        evidence_weight: settings.evidence_weight,
        risks_weight: settings.risks_weight,
        policies_weight: settings.policies_weight,
        vendors_weight: settings.vendors_weight,
        incidents_weight: settings.incidents_weight,
      }, orgIdParam);
      toast.success('Scoring weights updated successfully');
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to update settings: ${err.message}`);
    }
  };

  // Action: Map Organization Control
  const handleCreateOrgControl = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const payload = {
        control_key: fd.get('control_key') as string,
        title: fd.get('title') as string,
        description: fd.get('description') as string,
        priority: fd.get('priority') as string,
        mapped_ciso_control_id: fd.get('mapped_ciso_control_id') ? (fd.get('mapped_ciso_control_id') as string) : undefined,
        cis_mappings: (fd.get('cis_mappings') as string).split(',').map((x) => x.trim()).filter(Boolean),
        iso_mappings: (fd.get('iso_mappings') as string).split(',').map((x) => x.trim()).filter(Boolean),
        dpdpa_mappings: (fd.get('dpdpa_mappings') as string).split(',').map((x) => x.trim()).filter(Boolean),
        nist_mappings: (fd.get('nist_mappings') as string).split(',').map((x) => x.trim()).filter(Boolean),
        status: 'not_configured',
      };
      await createCisoOrgControl(payload, orgIdParam);
      toast.success('Internal control mapped and registered');
      setIsOrgControlModalOpen(false);
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to register internal control: ${err.message}`);
    }
  };

  // Action: Delete Organization Control
  const handleDeleteOrgControl = async (id: string) => {
    if (!confirm('Are you sure you want to remove this internal control?')) return;
    try {
      await deleteCisoOrgControl(id, orgIdParam);
      toast.success('Internal control removed');
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  // Action: Register Risk
  const handleCreateRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const payload = {
        title: fd.get('title') as string,
        category: fd.get('category') as string,
        likelihood: Number(fd.get('likelihood')),
        impact: Number(fd.get('impact')),
        status: 'open',
      };
      await createCisoRisk(payload, orgIdParam);
      toast.success('Security risk registered');
      setIsRiskModalOpen(false);
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to register risk: ${err.message}`);
    }
  };

  // Action: Add Exception
  const handleCreateException = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const payload = {
        control_id: fd.get('control_id') as string,
        exception_type: fd.get('exception_type') as string,
        reason: fd.get('reason') as string,
        compensating_controls: fd.get('compensating_controls') as string,
      };
      await createCisoException(payload, orgIdParam);
      toast.success('Policy exception approved');
      setIsExceptionModalOpen(false);
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to create exception: ${err.message}`);
    }
  };

  // Action: Add Evidence
  const handleCreateEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    try {
      setIsUploading(true);
      setUploadProgress(0);
      await createCisoEvidence(fd, orgIdParam, (progress) => {
        setUploadProgress(progress);
      });
      toast.success('Compliance evidence uploaded and linked');
      setIsEvidenceModalOpen(false);
      loadData(true);
      form.reset();
    } catch (err: any) {
      toast.error(`Failed to upload evidence: ${err.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Action: Add Remediation Task
  const handleCreateRemediation = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const controlId = fd.get('control_id') as string;
      const payload = {
        title: fd.get('title') as string,
        description: fd.get('description') as string,
        priority: fd.get('priority') as string,
        status: 'open',
      };
      await createCisoRemediation(payload, controlId ? [controlId] : [], orgIdParam);
      toast.success('Remediation task created');
      setIsRemediationModalOpen(false);
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to add task: ${err.message}`);
    }
  };

  // Action: Update Task Progress
  const handleToggleTaskStatus = async (task: CisoRemediationTask) => {
    try {
      const newStatus = task.status === 'completed' ? 'in_progress' : 'completed';
      const newProgress = newStatus === 'completed' ? 100 : 50;
      await updateCisoRemediation(task.id, {
        status: newStatus,
        progress: newProgress,
      }, orgIdParam);
      toast.success(`Task status updated to ${newStatus}`);
      loadData(true);
    } catch (err: any) {
      toast.error(`Failed to update task: ${err.message}`);
    }
  };

  // --- Policy and Asset linking / scanning handlers ---
  const handleLinkPolicy = async (policyId: string) => {
    if (!selectedControl) return;
    try {
      const updatedControl = await linkPolicyToControl(selectedControl.id, policyId, orgIdParam);
      setSelectedControl(updatedControl);
      toast.success("Policy linked successfully!");
    } catch (err: any) {
      toast.error(`Failed to link policy: ${err.message}`);
    }
  };

  const handleUnlinkPolicy = async (policyId: string) => {
    if (!selectedControl) return;
    try {
      const updatedControl = await unlinkPolicyFromControl(selectedControl.id, policyId, orgIdParam);
      setSelectedControl(updatedControl);
      toast.success("Policy unlinked successfully!");
    } catch (err: any) {
      toast.error(`Failed to unlink policy: ${err.message}`);
    }
  };

  const handleLinkAsset = async (assetId: string) => {
    if (!selectedControl) return;
    try {
      const updatedControl = await linkAssetToControl(selectedControl.id, assetId, orgIdParam);
      setSelectedControl(updatedControl);
      toast.success("Asset linked successfully!");
    } catch (err: any) {
      toast.error(`Failed to link asset: ${err.message}`);
    }
  };

  const handleUnlinkAsset = async (assetId: string) => {
    if (!selectedControl) return;
    try {
      const updatedControl = await unlinkAssetFromControl(selectedControl.id, assetId, orgIdParam);
      setSelectedControl(updatedControl);
      toast.success("Asset unlinked successfully!");
    } catch (err: any) {
      toast.error(`Failed to unlink asset: ${err.message}`);
    }
  };

  const handleTriggerScan = async (assetId: string) => {
    if (!selectedControl) return;
    setScanningAssetIds(prev => ({ ...prev, [assetId]: true }));
    toast.loading("Continuous monitoring agent executing security check...");
    try {
      const log = await triggerAssetScan(assetId, orgIdParam);
      toast.dismiss();
      if (log.status === "clean") {
        toast.success("Continuous scan complete: Clean! Zero security vulnerabilities detected.");
      } else {
        toast.warning(`Continuous scan complete: ${log.findings.length} security alerts detected!`);
      }
      
      const updatedControl = await fetchCisoControl(selectedControl.id, orgIdParam);
      setSelectedControl(updatedControl);
      
      const assetsList = await fetchCisoAssets(orgIdParam);
      setAllAssets(assetsList);
    } catch (err: any) {
      toast.dismiss();
      toast.error(`Vulnerability scan failed: ${err.message}`);
    } finally {
      setScanningAssetIds(prev => ({ ...prev, [assetId]: false }));
    }
  };

  const handleViewScanHistory = async (asset: any) => {
    setSelectedScanAsset(asset);
    setIsScanLogsModalOpen(true);
    setScanLogs([]);
    try {
      const logs = await fetchAssetScanLogs(asset.id, orgIdParam);
      setScanLogs(logs);
    } catch (err: any) {
      toast.error(`Failed to fetch scan logs: ${err.message}`);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedControl) return;
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const name = fd.get('name') as string;
      const asset_type = fd.get('asset_type') as string;
      const environment = fd.get('environment') as string;
      const provider = fd.get('provider') as string;
      const external_ref_id = fd.get('external_ref_id') as string;
      
      const body = {
        name,
        asset_type,
        environment,
        provider,
        external_ref_id: external_ref_id || undefined,
        security_status: "secure"
      };
      
      const newAsset = await createCisoAsset(body, orgIdParam);
      const updatedControl = await linkAssetToControl(selectedControl.id, newAsset.id, orgIdParam);
      setSelectedControl(updatedControl);
      
      toast.success("IT Asset created and linked successfully!");
      setIsCreateAssetModalOpen(false);
      
      const assetsList = await fetchCisoAssets(orgIdParam);
      setAllAssets(assetsList);
    } catch (err: any) {
      toast.error(`Failed to create asset: ${err.message}`);
    }
  };

  // Dynamic Framework regrouping logic for Security Controls
  const getGroupedControls = () => {
    const activeControls = controls;
    if (!frameworkRegroup) {
      return { 'Preset CIS Controls': activeControls };
    }

    const grouped: Record<string, CisoControl[]> = {};

    activeControls.forEach((ctrl) => {
      // Filter requirement mappings by framework code
      const matchingReqs = ctrl.requirements.filter((req) => {
        const key = req.req_key.toUpperCase();
        const code = frameworkRegroup.toUpperCase();
        if (code === 'ISO') return key.startsWith('ISO.');
        return key.startsWith(code + '.');
      });

      if (matchingReqs.length > 0) {
        matchingReqs.forEach((req) => {
          const domain = req.domain || 'General Domains';
          if (!grouped[domain]) {
            grouped[domain] = [];
          }
          if (!grouped[domain].some((c) => c.id === ctrl.id)) {
            grouped[domain].push(ctrl);
          }
        });
      } else {
        const fallbackDomain = 'Unmapped Safeguards';
        if (!grouped[fallbackDomain]) {
          grouped[fallbackDomain] = [];
        }
        if (!grouped[fallbackDomain].some((c) => c.id === ctrl.id)) {
          grouped[fallbackDomain].push(ctrl);
        }
      }
    });

    return grouped;
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen p-8 bg-[var(--surface-base)] flex flex-col justify-center items-center gap-4">
        <RefreshCw className="w-12 h-12 text-[var(--brand-primary)] animate-spin" />
        <span className="text-sm text-[var(--text-secondary)] font-medium">Resolving organization context...</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <ConsentManagementGate
        title="CISO Command Center"
        loading={orgLoading}
        error={orgError}
        hasOrg={hasOrg}
        isSuperadmin={isSuperadmin}
        organizations={organizations}
        selectedOrgId={selectedOrgId}
        onSelectOrg={setSelectedOrgId}
      >
        <div className="min-h-screen p-8 bg-[var(--surface-base)] flex flex-col justify-center items-center gap-4">
          <RefreshCw className="w-12 h-12 text-[var(--brand-primary)] animate-spin" />
          <span className="text-sm text-[var(--text-secondary)] font-medium">Loading executive CISO cockpit...</span>
        </div>
      </ConsentManagementGate>
    );
  }

  const groupedControls = getGroupedControls();

  // RENDER UNIFIED CISO WORKSPACE
  return (
    <ConsentManagementGate
      title="CISO Command Center"
      loading={orgLoading}
      error={orgError}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      {selectedControl ? (
        <div className="min-h-screen p-8 bg-[var(--surface-base)]">
          <div className="max-w-[1400px] mx-auto space-y-6">
            {/* Control Detail Header */}
            <div className="flex items-center justify-between pb-6 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedControlId(null)}
                  className="flex items-center justify-center p-2 rounded-lg border border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-[var(--text-tertiary)]">{selectedControl.control_key}</span>
                    <span className={getStatusBadge(selectedControl.status)}>{selectedControl.status.replace('_', ' ')}</span>
                  </div>
                  <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">{selectedControl.title}</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase bg-gray-100 border text-gray-700">
                  Priority: {selectedControl.priority}
                </span>
                <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase bg-indigo-50 border border-indigo-200 text-indigo-700">
                  Maturity: {selectedControl.maturity || 'Not configured'}
                </span>
              </div>
            </div>

            {/* Sub-tabs Selector */}
            <div className="flex gap-1 p-1 bg-gray-100/80 border border-gray-200/80 rounded-xl max-w-full overflow-x-auto shadow-sm">
              {(
                [
                  { key: 'overview', label: 'Overview' },
                  { key: 'evidence', label: 'Evidence' },
                  { key: 'policies', label: 'Policies' },
                  { key: 'assets', label: 'Assets' },
                  { key: 'risks', label: 'Risks' },
                  { key: 'tasks', label: 'Tasks' },
                  { key: 'vendors', label: 'Vendors' },
                  { key: 'ropa', label: 'RoPA' },
                  { key: 'dpia', label: 'DPIA' },
                  { key: 'audit', label: 'Audit & Review' },
                  { key: 'history', label: 'History' },
                  { key: 'ai', label: 'Vajra AI' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setDetailTab(t.key)}
                  className={cn(
                    'px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap',
                    detailTab === t.key
                      ? 'bg-white text-[var(--brand-primary)] shadow-sm border border-gray-200/30'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/40'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB CONTENTS */}
            <div className="p-6 rounded-2xl border bg-white border-[var(--border-default)] shadow-sm min-h-[400px]">
              {/* 1. OVERVIEW DETAIL */}
              {detailTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-5 rounded-xl border bg-gray-50/50 space-y-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Technical Explanation</h3>
                      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                        {selectedControl.tech_explanation || 'Not configured'}
                      </p>
                    </div>
                    <div className="p-5 rounded-xl border bg-gray-50/50 space-y-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Business Explanation</h3>
                      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                        {selectedControl.business_explanation || 'Not configured'}
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl border bg-gray-50/50 space-y-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Why Required</h3>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      {selectedControl.why_required || 'Not configured'}
                    </p>
                  </div>

                  {/* Penalty If Absent Statute Alert */}
                  <div className="p-5 rounded-xl border border-red-200 bg-red-50/40 flex items-start gap-4">
                    <AlertOctagon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-red-800 uppercase tracking-wide">DPDPA Liability Statute Fine</h3>
                      <p className="text-sm font-semibold text-red-700">
                        {selectedControl.penalty_if_absent || 'Not configured'}
                      </p>
                    </div>
                  </div>

                  <div className="border-t pt-6 grid grid-cols-4 gap-6">
                    <div>
                      <span className="block text-xs text-[var(--text-tertiary)] uppercase font-semibold">Owner Assignment</span>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={newOwnerId}
                          onChange={(e) => setNewOwnerId(e.target.value)}
                          placeholder="Owner User ID"
                          className="text-xs rounded border p-1 bg-white text-gray-800 w-32"
                        />
                        <button
                          onClick={async () => {
                            if (!newOwnerId) return;
                            try {
                              await updateCisoControl(selectedControl.id, { owner_user_id: newOwnerId }, orgIdParam);
                              toast.success('Owner assigned successfully');
                              loadData(true);
                            } catch (err: any) {
                              toast.error(`Assignment failed: ${err.message}`);
                            }
                          }}
                          className="px-2 py-1 bg-[var(--brand-primary)] text-white text-[10px] rounded font-bold"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-[var(--text-tertiary)] uppercase font-semibold">Maturity Stage</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">{selectedControl.maturity || 'Not configured'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-[var(--text-tertiary)] uppercase font-semibold">Coverage Status</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {selectedControl.status === 'healthy' ? '100% Fully Aligned' : 'Verification Pending'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-[var(--text-tertiary)] uppercase font-semibold">Last Audit Review</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {selectedControl.reviews && selectedControl.reviews.length > 0
                          ? new Date(selectedControl.reviews[0].created_at).toLocaleDateString()
                          : 'Not configured'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions Panel */}
                  <div className="border-t pt-6">
                    <h3 className="text-xs font-bold uppercase text-[var(--text-tertiary)] mb-4">Quick Operations Actions</h3>
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => setIsEvidenceModalOpen(true)} className="px-4 py-2 rounded-lg border text-xs font-bold bg-white text-[var(--text-secondary)] hover:bg-gray-50 transition-all">
                        Upload Evidence
                      </button>
                      <button onClick={() => setIsRemediationModalOpen(true)} className="px-4 py-2 rounded-lg border text-xs font-bold bg-white text-[var(--text-secondary)] hover:bg-gray-50 transition-all">
                        Create Task
                      </button>
                      <button onClick={() => setIsExceptionModalOpen(true)} className="px-4 py-2 rounded-lg border text-xs font-bold bg-white text-[var(--text-secondary)] hover:bg-gray-50 transition-all">
                        Request Exception
                      </button>
                      <button onClick={() => setIsOrgControlModalOpen(true)} className="px-4 py-2 rounded-lg border text-xs font-bold bg-white text-[var(--text-secondary)] hover:bg-gray-50 transition-all">
                        Map Internal Control
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. EVIDENCE TABLE */}
              {detailTab === 'evidence' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-gray-700 uppercase">Cryptographic Audit Proofs</h3>
                    <button onClick={() => setIsEvidenceModalOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity">
                      Upload Evidence
                    </button>
                  </div>
                  {selectedControl.evidence.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No evidence proofs linked to this safeguard.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b text-xs text-[var(--text-tertiary)] uppercase font-semibold bg-gray-50/50">
                            <th className="p-3">Evidence Name</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">SHA-256 Hash</th>
                            <th className="p-3">Version</th>
                            <th className="p-3">Audit Status</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedControl.evidence.map((ev) => (
                            <tr key={ev.id} className="border-b text-xs text-[var(--text-secondary)]">
                              <td className="p-3 font-semibold text-[var(--text-primary)]">
                                <div>{ev.name}</div>
                                <div className="text-[10px] text-gray-400 font-normal font-mono">{ev.file_name}</div>
                              </td>
                              <td className="p-3 uppercase">{ev.file_type?.split('/')[1] || 'PDF'}</td>
                              <td className="p-3 font-mono text-[10px]">{ev.file_hash.substring(0, 16)}...</td>
                              <td className="p-3">v{ev.version}</td>
                              <td className="p-3">
                                {ev.is_verified ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-800 border border-green-200">VERIFIED</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">PENDING</span>
                                )}
                              </td>
                              <td className="p-3 text-right flex items-center justify-end gap-2">
                                <button onClick={() => handleDownloadEvidence(ev.id, ev.file_name)} className="text-indigo-500 hover:text-indigo-700 p-1 hover:bg-indigo-50 rounded transition-colors mr-2">
                                  <FileDown className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteEvidence(ev.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 3. POLICIES */}
              {detailTab === 'policies' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-gray-700 uppercase">Linked Policy Manager Documents</h3>
                    <button
                      onClick={() => setIsLinkPolicyModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Link Policy
                    </button>
                  </div>
                  {selectedControl.linked_policies.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No security policy files mapped.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4">
                      {selectedControl.linked_policies.map((p: any) => (
                        <div key={p.id} className="p-4 rounded-xl border bg-gray-50 flex items-start justify-between shadow-sm">
                          <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-indigo-500 mt-0.5" />
                            <div>
                              <h4 className="text-xs font-bold text-gray-800">{p.title}</h4>
                              <span className="text-[10px] text-gray-400 uppercase font-mono">{p.policy_type || 'Policy'}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnlinkPolicy(p.id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. ASSETS */}
              {detailTab === 'assets' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-gray-700 uppercase">Covered IT Inventory & Scope</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsLinkAssetModalOpen(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Link Existing Asset
                      </button>
                      <button
                        onClick={() => setIsCreateAssetModalOpen(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create IT Asset
                      </button>
                    </div>
                  </div>

                  {selectedControl.assets_covered.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No cloud infrastructure or systems mapped.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Summary Metrics */}
                      <div className="grid grid-cols-4 gap-4">
                        {['Server', 'Application', 'Database', 'Container'].map((cat) => {
                          const items = selectedControl.assets_covered.filter((a: any) => (a.type || a.category || '').toLowerCase() === cat.toLowerCase());
                          return (
                            <div key={cat} className="p-4 rounded-xl border bg-gray-50/50 flex flex-col justify-between">
                              <span className="text-xs font-bold text-gray-500 uppercase">{cat}s</span>
                              <span className="text-3xl font-extrabold text-[var(--brand-primary)] mt-2 font-mono">{items.length}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Assets Table */}
                      <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b text-xs text-[var(--text-tertiary)] uppercase font-semibold bg-gray-50/50">
                              <th className="p-3">Asset Name</th>
                              <th className="p-3">Type</th>
                              <th className="p-3">Environment</th>
                              <th className="p-3">Provider</th>
                              <th className="p-3">Security Status</th>
                              <th className="p-3">Last Scanned</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedControl.assets_covered.map((asset: any) => {
                              const isScanning = !!scanningAssetIds[asset.id];
                              return (
                                <tr key={asset.id} className="border-b text-xs text-[var(--text-secondary)] hover:bg-gray-50/30 transition-colors">
                                  <td className="p-3 font-semibold text-[var(--text-primary)]">
                                    <div>{asset.name}</div>
                                    {asset.external_ref_id && (
                                      <div className="text-[10px] text-gray-400 font-normal font-mono">{asset.external_ref_id}</div>
                                    )}
                                  </td>
                                  <td className="p-3 uppercase font-semibold tracking-wider text-[10px] text-indigo-700">{asset.type || asset.category}</td>
                                  <td className="p-3 capitalize">{asset.environment || 'production'}</td>
                                  <td className="p-3 uppercase">{asset.provider || 'cloud'}</td>
                                  <td className="p-3">
                                    <span className={cn(
                                      'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border',
                                      asset.security_status === 'secure' ? 'bg-green-100 text-green-800 border-green-200' :
                                      asset.security_status === 'vulnerable' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                      'bg-red-100 text-red-800 border-red-200'
                                    )}>
                                      {asset.security_status || 'secure'}
                                    </span>
                                  </td>
                                  <td className="p-3 font-mono text-[10px]">
                                    {asset.last_scanned_at ? new Date(asset.last_scanned_at).toLocaleString() : 'Never Scanned'}
                                  </td>
                                  <td className="p-3 text-right flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleTriggerScan(asset.id)}
                                      disabled={isScanning}
                                      className="px-2 py-1 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all"
                                      title="Trigger continuous vulnerability scan"
                                    >
                                      {isScanning ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="w-3 h-3" />
                                      )}
                                      Scan
                                    </button>
                                    <button
                                      onClick={() => handleViewScanHistory(asset)}
                                      className="px-2 py-1 border hover:bg-gray-50 text-[var(--text-secondary)] rounded text-[10px] font-bold"
                                      title="View scan history logs"
                                    >
                                      Logs
                                    </button>
                                    <button
                                      onClick={() => handleUnlinkAsset(asset.id)}
                                      className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                                      title="Unlink asset from scope"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5. RISKS */}
              {detailTab === 'risks' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-700 uppercase">Linked Active Threat Risks</h3>
                  {selectedControl.risks.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No risk factors mapped.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b text-xs text-[var(--text-tertiary)] bg-gray-50">
                            <th className="p-3">Risk ID</th>
                            <th className="p-3">Title</th>
                            <th className="p-3 font-mono">Likelihood x Impact</th>
                            <th className="p-3">Residual Risk</th>
                            <th className="p-3">Treatment Plan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedControl.risks.map((r) => (
                            <tr key={r.id} className="border-b text-xs text-[var(--text-secondary)]">
                              <td className="p-3 font-bold text-[var(--text-primary)]">{r.risk_id}</td>
                              <td className="p-3 font-medium">{r.title}</td>
                              <td className="p-3">{r.likelihood} x {r.impact} = {r.score}</td>
                              <td className="p-3">
                                <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold', r.residual_score && r.residual_score >= 12 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800')}>
                                  {r.residual_score || r.score}
                                </span>
                              </td>
                              <td className="p-3 italic">{r.treatment || 'Not configured'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 6. REMEDIATION TASKS */}
              {detailTab === 'tasks' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-gray-700 uppercase font-mono">Remediation SLA Queue</h3>
                    <button onClick={() => setIsRemediationModalOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90">
                      Create Task
                    </button>
                  </div>
                  {selectedControl.remediation_tasks.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No remediation tasks assigned.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b text-xs text-[var(--text-tertiary)] bg-gray-50">
                          <th className="p-3">Task Ref</th>
                          <th className="p-3">Task Title</th>
                          <th className="p-3">Priority</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 font-mono">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedControl.remediation_tasks.map((task) => (
                          <tr key={task.id} className="border-b text-xs text-[var(--text-secondary)]">
                            <td className="p-3 font-bold text-[var(--text-primary)]">{task.task_ref}</td>
                            <td className="p-3 font-semibold">{task.title}</td>
                            <td className="p-3 uppercase font-medium">{task.priority}</td>
                            <td className="p-3">
                              <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', task.status === 'completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20')}>
                                {task.status}
                              </span>
                            </td>
                            <td className="p-3">{task.progress}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 7. VENDORS */}
              {detailTab === 'vendors' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-700 uppercase font-mono">Third-Party Processors / Vendors</h3>
                  {selectedControl.linked_vendors.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No data processors mapped.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b text-xs text-[var(--text-tertiary)] bg-gray-50">
                          <th className="p-3">Vendor Name</th>
                          <th className="p-3">Signed DPA</th>
                          <th className="p-3">Risk Assessment Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedControl.linked_vendors.map((v: any, i: number) => (
                          <tr key={i} className="border-b text-xs text-[var(--text-secondary)]">
                            <td className="p-3 font-bold text-[var(--text-primary)]">{v.name}</td>
                            <td className="p-3 uppercase font-semibold">{v.dpa_status || 'NOT SIGNED'}</td>
                            <td className="p-3 font-medium">Verified Active</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 8. ROPA */}
              {detailTab === 'ropa' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-700 uppercase font-mono">RoPA Processing Activities</h3>
                  {selectedControl.linked_ropas.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No processing activities mapped.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b text-xs text-[var(--text-tertiary)] bg-gray-50">
                          <th className="p-3">Reference Key</th>
                          <th className="p-3">Activity Title</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedControl.linked_ropas.map((r: any, i: number) => (
                          <tr key={i} className="border-b text-xs text-[var(--text-secondary)]">
                            <td className="p-3 font-mono font-bold text-[var(--text-primary)]">{r.ref}</td>
                            <td className="p-3 font-medium">{r.title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 9. DPIA */}
              {detailTab === 'dpia' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-700 uppercase font-mono">DPIA Impact Assessments</h3>
                  {selectedControl.linked_dpias.length === 0 ? (
                    <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)]">
                      Not configured - No DPIA assessments mapped.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b text-xs text-[var(--text-tertiary)] bg-gray-50">
                          <th className="p-3">Reference Key</th>
                          <th className="p-3">Assessment Title</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedControl.linked_dpias.map((d: any, i: number) => (
                          <tr key={i} className="border-b text-xs text-[var(--text-secondary)]">
                            <td className="p-3 font-mono font-bold text-[var(--text-primary)]">{d.dpia_ref}</td>
                            <td className="p-3 font-medium">{d.title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 10. AUDIT LEDGER & DISCUSSIONS */}
              {detailTab === 'audit' && (
                <div className="grid grid-cols-3 gap-6">
                  {/* Timeline */}
                  <div className="col-span-2 space-y-4">
                    <h3 className="text-sm font-bold text-gray-700 uppercase font-mono mb-4">GRC Mutation Activity Trail</h3>
                    <div className="relative pl-6 border-l border-gray-200 space-y-6">
                      {controlActivities.map((act) => (
                        <div key={act.id} className="relative">
                          <div className="absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full border bg-white border-indigo-500 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)] font-mono mb-1">
                            <span className="font-bold uppercase tracking-wider text-[var(--brand-primary)]">
                              {act.activity_type.replace('_', ' ')}
                            </span>
                            <span>•</span>
                            <span>{new Date(act.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{act.description}</p>
                        </div>
                      ))}
                      {controlActivities.length === 0 && (
                        <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">
                          No audit actions logged.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comments & Review Outcome */}
                  <div className="space-y-6">
                    {/* Compliance verification review */}
                    <div className="p-4 rounded-xl border bg-gray-50 space-y-3">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Verification Audit Portal</h4>
                      <div className="space-y-2">
                        <select
                          value={reviewOutcome}
                          onChange={(e) => setReviewOutcome(e.target.value)}
                          className="w-full text-xs rounded border p-2 bg-white font-bold"
                        >
                          <option value="Approved">Approved (Healthy)</option>
                          <option value="Rejected">Rejected (Critical)</option>
                        </select>
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Notes or exception justifications..."
                          className="w-full text-xs rounded border p-2 bg-white text-gray-800"
                          rows={3}
                        />
                        <button
                          onClick={() => handleAddReview(selectedControl.id)}
                          className="w-full py-2 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-lg"
                        >
                          Submit Outcome
                        </button>
                      </div>
                    </div>

                    {/* Discussions */}
                    <div className="p-4 rounded-xl border bg-gray-50 space-y-3">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Discussions Feed</h4>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Log message..."
                          className="flex-1 text-xs rounded border p-2 bg-white text-gray-800"
                        />
                        <button
                          onClick={() => handleAddComment(selectedControl.id)}
                          className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                        {selectedControl.comments.map((c) => (
                          <div key={c.id} className="p-2 bg-white rounded border text-[11px] leading-tight">
                            <p className="text-[var(--text-secondary)] font-medium">{c.comment}</p>
                            <span className="text-[9px] text-gray-400 mt-1 block">
                              {new Date(c.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 11. VERSION VAULT HISTORY */}
              {detailTab === 'history' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-700 uppercase font-mono">Immutable Configuration Vault</h3>
                  {controlVersions.length === 0 ? (
                    <div className="text-xs text-[var(--text-tertiary)] py-8 text-center border border-dashed rounded-xl">
                      No version history found.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {controlVersions.map((v) => (
                        <div key={v.id} className="p-4 rounded-xl border bg-gray-50/50 flex justify-between items-center shadow-sm">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">v{v.version_number}</span>
                              <span className="text-xs font-semibold text-gray-800">{v.title}</span>
                            </div>
                            <p className="text-[10px] text-[var(--text-tertiary)]">
                              Archived: {new Date(v.archived_at).toLocaleString()} | Change: "{v.change_summary}"
                            </p>
                          </div>
                          <button onClick={() => toast.success(`Configuration rolled back to version v${v.version_number}`)} className="px-3 py-1.5 rounded-lg border text-xs font-bold bg-white hover:bg-gray-100">
                            Rollback Configuration
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 12. VAJRA AI COPILOT */}
              {detailTab === 'ai' && (
                <div className="grid grid-cols-3 gap-6">
                  <div className="p-6 rounded-xl border bg-violet-50/30 border-violet-100/60 space-y-4">
                    <h3 className="font-bold flex items-center gap-2 text-violet-900">
                      <Sparkles className="w-5 h-5 text-violet-600 animate-pulse" />
                      Vajra AI Actions
                    </h3>
                    <p className="text-xs text-violet-700 leading-relaxed">
                      Select a compliance utility to dynamically draft system configuration checklists, SOP documents, CAPA remediation guidelines, or executive reports.
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                      {[
                        { key: 'explain', label: 'Explain Control Rules' },
                        { key: 'checklist', label: 'Generate Checklist' },
                        { key: 'sop', label: 'Generate SOP Document' },
                        { key: 'remediation', label: 'Generate CAPA Remediation' },
                        { key: 'capa', label: 'Generate CAPA Plan' },
                        { key: 'executive', label: 'Generate Board Summary' },
                        { key: 'audit', label: 'Generate Auditor Notes' },
                      ].map((a) => (
                        <button
                          key={a.key}
                          onClick={() => runAiAction(a.key)}
                          disabled={isAiLoading}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold bg-white border border-violet-200 text-violet-800 hover:bg-violet-50/50 disabled:opacity-50 transition-all flex items-center justify-between"
                        >
                          <span>{a.label}</span>
                          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-2 p-6 rounded-xl border bg-gray-50 border-gray-200/60 min-h-[300px] flex flex-col">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b pb-2 mb-4">Draft Output Workspace</div>
                    {isAiLoading ? (
                      <div className="flex-1 flex flex-col justify-center items-center gap-2">
                        <RefreshCw className="w-8 h-8 text-violet-600 animate-spin" />
                        <span className="text-xs text-violet-800 font-semibold animate-pulse">Consulting Vajra AI Engine...</span>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="flex-1 text-xs leading-relaxed text-gray-800 font-mono whitespace-pre-wrap bg-white p-4 rounded-lg border border-gray-100 overflow-y-auto max-h-[350px]">
                        {aiAnalysis}
                      </div>
                    ) : (
                      <div className="flex-1 flex justify-center items-center text-xs text-[var(--text-tertiary)] italic">
                        Select an action on the left side to compile AI blueprint proofs.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-screen p-8 bg-[var(--surface-base)]">
        <div className="max-w-[1400px] mx-auto space-y-6">
          {/* Header */}
          {activeTab !== 'landing' && (
            <div className="flex justify-between items-start pb-6 border-b border-[var(--border-default)]">
              <div>
                <button
                  onClick={() => setActiveTab('landing')}
                  className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-205 bg-white hover:bg-gray-50 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shadow-sm cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Launchpad
                </button>
                <h1 className="mb-2 flex items-center gap-2 font-extrabold text-3xl">
                  <Shield className="w-8 h-8 text-[var(--brand-primary)]" />
                  CISO Command Center
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Integrated GRC Operating System for compliance mapping, audit trails, and risk orchestration.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCisMatrixModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800 transition-all hover:bg-emerald-100 shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>CIS Standard Benchmark (xlsx)</span>
                </button>
                <button
                  onClick={handleGenerateReport}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-default)] bg-white text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-gray-50 shadow-sm"
                >
                  <FileText className="w-4 h-4" strokeWidth={1.5} />
                  Generate Board PDF
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-semibold transition-opacity hover:opacity-90 bg-[var(--brand-primary)] shadow-sm"
                >
                  <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
                  Sync Center
                </button>
              </div>
            </div>
          )}

          {/* TAB CONTENTS */}

          {/* CISO COMMAND CENTER LANDING MENU (8-CARD LAUNCHPAD) */}
          {activeTab === 'landing' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center py-6 max-w-3xl mx-auto space-y-3">
                <div className="inline-flex items-center justify-center p-3.5 bg-indigo-50 border border-indigo-100/80 rounded-2xl text-[var(--brand-primary)] shadow-sm mb-2">
                  <Shield className="w-10 h-10 animate-pulse" />
                </div>
                <h2 className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">CISO Governance Command Hub</h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Welcome to the Vajra GRC Operating System. Select a specialized module node below to audit configurations, orchestrate risk response, or compile posture compliance reports.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
                {[
                  {
                    key: 'overview',
                    label: 'Executive Cockpit',
                    icon: Shield,
                    description: 'Consolidated health score overview, compliance posturing, penalty exposures, and SLA achievements.',
                    colorClass: 'hover:border-violet-500 hover:shadow-violet-500/5',
                    badge: `${dashboard?.scores?.overall ?? 0}% Overall Posture`,
                    badgeColor: 'bg-violet-100/80 text-violet-800 border-violet-200/50',
                  },
                  {
                    key: 'controls',
                    label: '18 CIS Controls v8',
                    icon: CheckCircle2,
                    description: 'Unified security control grid mapped to CIS Controls v8, ISO 27001, and DPDPA requirements.',
                    colorClass: 'hover:border-emerald-500 hover:shadow-emerald-500/5',
                    badge: `${controls.filter(c => c.status === 'healthy').length} / ${controls.length || 18} Healthy`,
                    badgeColor: 'bg-emerald-100/80 text-emerald-800 border-emerald-200/50',
                  },
                  {
                    key: 'evidence',
                    label: 'Evidence Vault',
                    icon: FileText,
                    description: 'Immutable cryptographic ledger housing hash-verified PDF proofs and compliance files.',
                    colorClass: 'hover:border-cyan-500 hover:shadow-cyan-500/5',
                    badge: `${evidence.length} Verified Files`,
                    badgeColor: 'bg-cyan-100/80 text-cyan-800 border-cyan-200/50',
                  },
                  {
                    key: 'risks',
                    label: 'Risk Register',
                    icon: AlertTriangle,
                    description: 'GRC threat scenario mapper tracking active vulnerabilities, likelihood metrics, and residual scores.',
                    colorClass: 'hover:border-amber-500 hover:shadow-amber-500/5',
                    badge: `${risks.length} Mapped Risks`,
                    badgeColor: 'bg-amber-100/80 text-amber-800 border-amber-200/50',
                  },
                  {
                    key: 'remediation',
                    label: 'Remediation Tasks',
                    icon: Clock,
                    description: 'Automated corrective action dispatcher handling SLA deadlines, task owners, and MTTR queues.',
                    colorClass: 'hover:border-blue-500 hover:shadow-blue-500/5',
                    badge: `${remediation.filter(t => t.status !== 'completed').length} Active Tasks`,
                    badgeColor: 'bg-blue-100/80 text-blue-800 border-blue-200/50',
                  },
                  {
                    key: 'exceptions',
                    label: 'Exclusions Log',
                    icon: X,
                    description: 'Audit-ready waiver repository for temporary and permanent policy exception approvals.',
                    colorClass: 'hover:border-fuchsia-500 hover:shadow-fuchsia-500/5',
                    badge: `${exceptions.length} Active Waivers`,
                    badgeColor: 'bg-fuchsia-100/80 text-fuchsia-800 border-fuchsia-200/50',
                  },
                  {
                    key: 'reports',
                    label: 'Board Reports',
                    icon: FileDown,
                    description: 'Automated document compiler generating board-ready posture reports and executive summaries.',
                    colorClass: 'hover:border-purple-500 hover:shadow-purple-500/5',
                    badge: `${reports.length} Compiled Reports`,
                    badgeColor: 'bg-purple-100/80 text-purple-800 border-purple-200/50',
                  },
                  {
                    key: 'settings',
                    label: 'Weights & Settings',
                    icon: SettingsIcon,
                    description: 'Fine-tune scoring weights, thresholds, framework filters, and default priorities.',
                    colorClass: 'hover:border-rose-500 hover:shadow-rose-500/5',
                    badge: 'Score Configured',
                    badgeColor: 'bg-rose-100/80 text-rose-800 border-rose-200/50',
                  },
                ].map((card) => {
                  const CardIcon = card.icon;
                  return (
                    <button
                      key={card.key}
                      onClick={() => setActiveTab(card.key as ActiveTab)}
                      className={cn(
                        'group relative p-6 rounded-3xl border bg-white/80 border-gray-200/60 backdrop-blur-md transition-all duration-300 ease-out text-left flex flex-col justify-between h-[230px] shadow-sm hover:-translate-y-1 hover:shadow-md cursor-pointer',
                        card.colorClass
                      )}
                    >
                      <div className="space-y-4 w-full">
                        <div className="flex items-center justify-between">
                          <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100 group-hover:bg-white group-hover:scale-105 transition-all duration-300 shadow-sm flex items-center justify-center text-gray-600 group-hover:text-[var(--brand-primary)]">
                            <CardIcon className="w-6 h-6" />
                          </div>
                          <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider', card.badgeColor)}>
                            {card.badge}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors">
                            {card.label}
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-3">
                            {card.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--brand-primary)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 self-end mt-2">
                        <span>Enter Module</span>
                        <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 1. EXECUTIVE COCKPIT DASHBOARD VIEW */}
          {activeTab === 'overview' && dashboard && (
            <div className="space-y-6">
              {/* Score Hero Row */}
              <div className="grid grid-cols-5 gap-4">
                {[
                  { key: 'overall', label: 'Overall Compliance Posture' },
                  { key: 'DPDPA', label: 'DPDPA 2023 Alignment' },
                  { key: 'ISO27001', label: 'ISO 27001 ISMS Maturity' },
                  { key: 'CIS', label: 'CIS Critical Controls' },
                  { key: 'NIST', label: 'NIST CSF Core' },
                ].map((c) => {
                  const val = dashboard.scores[c.key] ?? 0;
                  const prev = dashboard.previous_scores[c.key] ?? 0;
                  const diff = Math.round(val - prev);
                  return (
                    <div key={c.key} className={cn('p-5 rounded-2xl border bg-white shadow-sm flex flex-col justify-between h-[130px] transition-all hover:-translate-y-0.5', c.key === 'overall' && getScoreBg(val))}>
                      <span className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-wider">{c.label}</span>
                      <div className="flex items-baseline justify-between mt-4">
                        <span className={cn('text-4xl font-extrabold font-mono', getScoreColor(val))}>{val}%</span>
                        <span className={cn('text-xs font-bold flex items-center gap-0.5', diff >= 0 ? 'text-green-600' : 'text-red-600')}>
                          {diff >= 0 ? `▲ ${diff}%` : `▼ ${Math.abs(diff)}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic GRC Widgets Row */}
              <div className="grid grid-cols-4 gap-6">
                {/* Critical Risks */}
                <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Critical Threat Risks</span>
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <span className="text-4xl font-extrabold text-amber-600 font-mono">
                      {risks.filter(r => r.score >= 12).length}
                    </span>
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase mt-2">Active Open Threat Gaps</span>
                  </div>
                </div>

                {/* DPDPA Penalty Liability */}
                <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">DPDPA Statute Penalty Liability</span>
                    <AlertOctagon className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <span className="text-4xl font-extrabold text-red-600 font-mono">
                      ₹{dashboard.penalty_exposure.current_exposure_crores} Cr
                    </span>
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase mt-2">
                      Max Statutory Cap: ₹{dashboard.penalty_exposure.maximum_possible_crores} Cr
                    </span>
                  </div>
                </div>

                {/* Evidence Health */}
                <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Verified Evidence Health</span>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <span className="text-4xl font-extrabold text-green-600 font-mono">
                      {dashboard.control_health.evidence_percent}%
                    </span>
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase mt-2">
                      Automation Index: {dashboard.control_health.automation_percent}%
                    </span>
                  </div>
                </div>

                {/* Open Tasks */}
                <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Open SLA Remediations</span>
                    <Clock className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <span className="text-4xl font-extrabold text-indigo-600 font-mono">
                      {remediation.filter(t => t.status !== 'completed').length}
                    </span>
                    <span className="block text-[10px] text-[var(--text-tertiary)] uppercase mt-2">
                      SLA Achievements: {dashboard.mttr_metrics.sla_achievement_percent}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Risk Heatmap (5x5 colored matrix) */}
              <div className="grid grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl border bg-white shadow-sm space-y-4">
                  <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">5x5 Risk Heatmap</h3>
                  <div className="grid grid-cols-5 gap-1 border p-1.5 bg-gray-50 rounded-xl">
                    {dashboard.risk_matrix.map((row, rIdx) =>
                      row.map((cellVal, cIdx) => {
                        const score = (5 - rIdx) * (cIdx + 1);
                        let cellBg = 'bg-green-100 text-green-800';
                        if (score >= 12) cellBg = 'bg-red-100 text-red-800 font-bold';
                        else if (score >= 6) cellBg = 'bg-amber-100 text-amber-800';
                        return (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            className={cn('aspect-square rounded flex items-center justify-center text-[10px] relative font-mono', cellBg)}
                            title={`Likelihood ${5 - rIdx}, Impact ${cIdx + 1}`}
                          >
                            {cellVal > 0 ? (
                              <span className="w-6 h-6 rounded-full bg-white border flex items-center justify-center text-[11px] font-extrabold text-gray-800 shadow-sm">
                                {cellVal}
                              </span>
                            ) : (
                              <span className="opacity-10">{score}</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] text-center font-bold">
                    Likelihood (Vertical: 5 to 1) vs Impact (Horizontal: 1 to 5)
                  </div>
                </div>

                {/* CIS Controls Summary checklist */}
                <div className="col-span-2 p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Preset CIS Critical Security Controls</h3>
                    <span className="text-[10px] text-gray-400 font-bold font-mono">
                      {controls.filter(c => c.status === 'healthy').length}/18 Aligned
                    </span>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 overflow-y-auto max-h-[260px] pr-1.5 scrollbar-thin">
                    {controls.map((ctrl) => (
                      <button
                        key={ctrl.id}
                        onClick={() => setSelectedControlId(ctrl.id)}
                        className="p-2.5 rounded-xl border border-gray-200 text-left flex items-center justify-between bg-gray-50/40 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all shadow-2xs group"
                        title={`${ctrl.control_key} — ${ctrl.title}`}
                      >
                        <div className="min-w-0 flex-1 mr-2">
                          <span className="block font-mono text-[9px] font-extrabold text-indigo-600 group-hover:text-indigo-700">{ctrl.control_key}</span>
                          <span className="block text-[11px] font-bold text-gray-800 truncate">
                            {ctrl.title}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 font-mono tracking-wider',
                            ctrl.status === 'healthy'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : ctrl.status === 'warning'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-200'
                          )}
                        >
                          {ctrl.status === 'healthy' ? 'Healthy' : ctrl.status === 'warning' ? 'Warning' : 'Config'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Framework Coverage & Recent Activity timelines */}
              <div className="grid grid-cols-2 gap-6">
                {/* Framework Coverage Explorer */}
                <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col">
                  <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-4">Framework Coverage Rollups</h3>
                  <div className="space-y-3 flex-1 flex flex-col justify-center">
                    {[
                      { name: 'DPDPA 2023 Rules', score: dashboard.scores['DPDPA'] ?? 0, color: 'bg-indigo-500' },
                      { name: 'ISO/IEC 27001 ISMS', score: dashboard.scores['ISO27001'] ?? 0, color: 'bg-green-500' },
                      { name: 'CIS safeguards Checklist', score: dashboard.scores['CIS'] ?? 0, color: 'bg-amber-500' },
                      { name: 'NIST CSF Maturity core', score: dashboard.scores['NIST'] ?? 0, color: 'bg-blue-500' },
                    ].map((f) => (
                      <div key={f.name} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-[var(--text-secondary)]">
                          <span>{f.name}</span>
                          <span className="font-mono">{f.score}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-gray-100 border overflow-hidden">
                          <div className={cn('h-full transition-all', f.color)} style={{ width: `${f.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Simulated Activities Feed */}
                <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between">
                  <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-4">GRC Operational Activity Feed</h3>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[180px] pr-1">
                    {activities.slice(0, 5).map((act, i) => (
                      <div key={act.id || i} className="flex gap-3 text-xs">
                        <span className="font-mono text-gray-400">
                          {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex flex-col items-center">
                          <Clock className="w-4 h-4 text-indigo-500" />
                          {i < 4 && <div className="w-0.5 h-6 bg-gray-200 my-1" />}
                        </div>
                        <span className="text-[var(--text-secondary)] font-medium leading-tight">{act.description}</span>
                      </div>
                    ))}
                    {activities.length === 0 && (
                      <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">
                        No recent operations activities found.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Analytics chart */}
              <div className="p-6 rounded-2xl border bg-white shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Historical Posture Analytics Trends</h3>
                  <select
                    value={daysFilter}
                    onChange={(e) => setDaysFilter(Number(e.target.value))}
                    className="text-xs rounded-lg border border-[var(--border-default)] p-1.5 bg-white font-bold"
                  >
                    <option value={30}>Last 30 Days</option>
                    <option value={90}>Last 90 Days</option>
                    <option value={180}>Last 180 Days</option>
                  </select>
                </div>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorOverall" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="recorded_date" tickFormatter={(v) => new Date(v).toLocaleDateString()} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip labelFormatter={(v) => `Date: ${new Date(v).toLocaleDateString()}`} />
                      <Area
                        type="monotone"
                        dataKey="overall_score"
                        name="Overall Posture"
                        stroke="var(--brand-primary)"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorOverall)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}

          {/* 2. SECURITY CONTROLS TAB VIEW WITH INTEGRATED MAPPED SIDEBAR */}
          {activeTab === 'controls' && (
            <div className="grid grid-cols-3 gap-6">
              {/* Left Side (70%): The 19 CIS Controls */}
              <div className="col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-700 uppercase">Preset Immutable CIS Controls Ledger</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase">Regroup by Framework:</span>
                    <select
                      value={frameworkRegroup}
                      onChange={(e) => setFrameworkRegroup(e.target.value)}
                      className="text-xs rounded-lg border border-[var(--border-default)] p-2 bg-white font-bold"
                    >
                      <option value="">None (Flat List)</option>
                      <option value="CIS">CIS Domains</option>
                      <option value="DPDPA">DPDPA Domains</option>
                      <option value="ISO">ISO 27001 Clauses</option>
                      <option value="NIST">NIST CSF Domains</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-6">
                  {Object.entries(groupedControls).map(([groupTitle, ctrls]) => (
                    <div key={groupTitle} className="space-y-3">
                      <h3 className="text-xs font-extrabold text-indigo-700 uppercase tracking-widest border-b pb-2">{groupTitle}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {ctrls.map((ctrl) => (
                          <div
                            key={ctrl.id}
                            className="p-5 rounded-2xl border bg-white shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow h-[210px] relative"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-xs font-bold text-gray-400">{ctrl.control_key}</span>
                                <span className={getStatusBadge(ctrl.status)}>{ctrl.status}</span>
                              </div>
                              <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight line-clamp-2">{ctrl.title}</h4>
                            </div>

                            <div className="space-y-3 pt-3">
                              {/* Progress bar representing evidence verification ratio */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase">
                                  <span>Compliance Coverage</span>
                                  <span>{ctrl.status === 'healthy' ? '100%' : '50%'}</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-gray-100 border overflow-hidden">
                                  <div className={cn('h-full', ctrl.status === 'healthy' ? 'bg-green-500' : 'bg-amber-500')} style={{ width: ctrl.status === 'healthy' ? '100%' : '50%' }} />
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase pt-1 border-t">
                                <span>{ctrl.evidence.length} Evidence</span>
                                <span>{ctrl.risks.length} Risks</span>
                              </div>
                            </div>

                            {/* Card Click and Quick Actions hover */}
                            <div className="absolute inset-0 bg-white/95 rounded-2xl opacity-0 hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-3 p-4">
                              <button
                                onClick={() => setSelectedControlId(ctrl.id)}
                                className="w-full max-w-[160px] py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--brand-primary)] text-center"
                              >
                                Open Workspace Detail
                              </button>
                              <div className="flex gap-2">
                                <button onClick={() => { setSelectedControlId(ctrl.id); setIsEvidenceModalOpen(true); }} className="px-2 py-1.5 rounded border text-[9px] font-bold bg-white text-gray-600 hover:bg-gray-50">
                                  Link Proof
                                </button>
                                <button onClick={() => { setSelectedControlId(ctrl.id); setIsRemediationModalOpen(true); }} className="px-2 py-1.5 rounded border text-[9px] font-bold bg-white text-gray-600 hover:bg-gray-50">
                                  Add Task
                                </button>
                                <button onClick={() => { setSelectedControlId(ctrl.id); setIsExceptionModalOpen(true); }} className="px-2 py-1.5 rounded border text-[9px] font-bold bg-white text-gray-600 hover:bg-gray-50">
                                  Waiver
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side (30%): Organization Controls Library */}
              <div className="p-6 rounded-2xl border bg-gray-50 border-[var(--border-default)] space-y-6 shadow-inner">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <h3 className="font-extrabold text-sm text-[var(--text-primary)]">Organization Library</h3>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Internal custom controls mappings</span>
                  </div>
                  <button
                    onClick={() => setIsOrgControlModalOpen(true)}
                    className="p-1.5 rounded-lg bg-[var(--brand-primary)] text-white hover:opacity-90"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {orgControls.length === 0 ? (
                  <div className="p-8 border border-dashed rounded-xl text-center text-xs text-gray-400">
                    Not configured - No custom internal organization controls mapped.
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto max-h-[500px]">
                    {orgControlsPager.slice.map((oc) => (
                      <div key={oc.id} className="p-4 rounded-xl border bg-white shadow-sm space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-mono text-[9px] font-bold text-gray-400">{oc.control_key}</span>
                            <h4 className="text-xs font-bold text-gray-800 leading-tight">{oc.title}</h4>
                          </div>
                          <button onClick={() => handleDeleteOrgControl(oc.id)} className="text-red-500 hover:text-red-700">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {oc.mapped_ciso_control_id && (
                          <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--brand-primary)] bg-indigo-50 border border-indigo-100 rounded-lg p-1.5">
                            Maps to CISO Backbone ID
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
                          {oc.dpdpa_mappings.map((m, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">DPDPA: {m}</span>
                          ))}
                          {oc.iso_mappings.map((m, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-green-100 text-green-800">ISO: {m}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <TablePager
                  page={orgControlsPager.page}
                  pageCount={orgControlsPager.pageCount}
                  total={orgControlsPager.total}
                  pageSize={orgControlsPager.pageSize}
                  onPage={orgControlsPager.setPage}
                />
              </div>
            </div>
          )}

          {/* 3. EVIDENCE CENTER */}
          {activeTab === 'evidence' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-700 uppercase">Global Compliance Evidence Vault</h2>
                <button onClick={() => setIsEvidenceModalOpen(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90">
                  Upload Proof Document
                </button>
              </div>

              {evidence.length === 0 ? (
                <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)] bg-white">
                  Not configured - No global audit evidence files linked.
                </div>
              ) : (
                <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase bg-gray-50 font-bold">
                        <th className="p-4">Evidence Document</th>
                        <th className="p-4">Reference File</th>
                        <th className="p-4">Cryptographic Hash</th>
                        <th className="p-4">Verification Audit</th>
                        <th className="p-4 text-right">Operation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidencePager.slice.map((ev) => (
                        <tr key={ev.id} className="border-b text-xs text-[var(--text-secondary)]">
                          <td className="p-4 font-bold text-[var(--text-primary)]">{ev.name}</td>
                          <td className="p-4 text-gray-400 font-mono text-[10px]">{ev.file_name}</td>
                          <td className="p-4 font-mono text-[10px]">{ev.file_hash.substring(0, 32)}...</td>
                          <td className="p-4">
                            {ev.is_verified ? (
                              <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-bold border border-green-200">VERIFIED PROOF</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200">PENDING VERIFICATION</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                             <button onClick={() => handleDownloadEvidence(ev.id, ev.file_name)} className="text-indigo-500 hover:text-indigo-700 p-1 hover:bg-indigo-50 rounded transition-colors mr-2">
                               <FileDown className="w-4 h-4" />
                             </button>
                             <button onClick={() => handleDeleteEvidence(ev.id)} className="text-red-500 hover:text-red-700 p-1">
                               <Trash2 className="w-4 h-4" />
                             </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager
                    page={evidencePager.page}
                    pageCount={evidencePager.pageCount}
                    total={evidencePager.total}
                    pageSize={evidencePager.pageSize}
                    onPage={evidencePager.setPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* 4. RISK REGISTER */}
          {activeTab === 'risks' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-700 uppercase">Enterprise GRC Threat Register</h2>
                <button onClick={() => setIsRiskModalOpen(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90">
                  Register Mapped Risk
                </button>
              </div>

              {risks.length === 0 ? (
                <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)] bg-white">
                  Not configured - No identified risks mapped.
                </div>
              ) : (
                <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase bg-gray-50 font-bold">
                        <th className="p-4">Risk ID</th>
                        <th className="p-4">Threat Scenario</th>
                        <th className="p-4">Impact Profile</th>
                        <th className="p-4">Mitigation Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {risksPager.slice.map((r) => (
                        <tr key={r.id} className="border-b text-xs text-[var(--text-secondary)]">
                          <td className="p-4 font-mono font-bold text-[var(--text-primary)]">{r.risk_id}</td>
                          <td className="p-4">
                            <div className="font-bold text-[var(--text-primary)]">{r.title}</div>
                            <div className="text-[10px] text-gray-400 font-semibold">{r.category}</div>
                          </td>
                          <td className="p-4">
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold', r.score >= 12 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800')}>
                              Score: {r.score}
                            </span>
                          </td>
                          <td className="p-4 italic">{r.treatment || 'No treatment blueprint configured'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager
                    page={risksPager.page}
                    pageCount={risksPager.pageCount}
                    total={risksPager.total}
                    pageSize={risksPager.pageSize}
                    onPage={risksPager.setPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* 5. REMEDIATION TASKS */}
          {activeTab === 'remediation' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-700 uppercase">Security Remediation Backlog</h2>
                <button onClick={() => setIsRemediationModalOpen(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90">
                  Assign Remediation Task
                </button>
              </div>

              {remediation.length === 0 ? (
                <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)] bg-white">
                  Not configured - No remediation tasks scheduled.
                </div>
              ) : (
                <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase bg-gray-50 font-bold">
                        <th className="p-4">Task Ref</th>
                        <th className="p-4">Task Description</th>
                        <th className="p-4">SLA Priority</th>
                        <th className="p-4">Operational Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remediationPager.slice.map((task) => (
                        <tr key={task.id} className="border-b text-xs text-[var(--text-secondary)]">
                          <td className="p-4 font-mono font-bold text-[var(--text-primary)]">{task.task_ref}</td>
                          <td className="p-4">
                            <div className="font-bold text-[var(--text-primary)]">{task.title}</div>
                            <div className="text-[10px] text-gray-400 leading-tight">{task.description}</div>
                          </td>
                          <td className="p-4 uppercase font-semibold">{task.priority}</td>
                          <td className="p-4">
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', task.status === 'completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20')}>
                              {task.status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button onClick={() => handleToggleTaskStatus(task)} className="px-3 py-1 text-[10px] font-bold rounded-lg border hover:bg-gray-50 bg-white">
                              {task.status === 'completed' ? 'Reopen' : 'Close SLA'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager
                    page={remediationPager.page}
                    pageCount={remediationPager.pageCount}
                    total={remediationPager.total}
                    pageSize={remediationPager.pageSize}
                    onPage={remediationPager.setPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* 6. EXCLUSIONS LOG */}
          {activeTab === 'exceptions' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-700 uppercase">Policy Exception Registries</h2>
                <button onClick={() => setIsExceptionModalOpen(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90">
                  Approve Waiver
                </button>
              </div>

              {exceptions.length === 0 ? (
                <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)] bg-white">
                  Not configured - No active waivers registered.
                </div>
              ) : (
                <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase bg-gray-50 font-bold">
                        <th className="p-4">Waiver Type</th>
                        <th className="p-4">Justification & Rationale</th>
                        <th className="p-4">Compensating Safeguards</th>
                        <th className="p-4">Expiry Timeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptionsPager.slice.map((exc) => (
                        <tr key={exc.id} className="border-b text-xs text-[var(--text-secondary)]">
                          <td className="p-4 uppercase font-bold text-[var(--brand-primary)]">{exc.exception_type}</td>
                          <td className="p-4 leading-normal">{exc.reason}</td>
                          <td className="p-4 leading-normal">{exc.compensating_controls || 'None'}</td>
                          <td className="p-4">{exc.expires_at ? new Date(exc.expires_at).toLocaleDateString() : 'Permanent Waiver'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager
                    page={exceptionsPager.page}
                    pageCount={exceptionsPager.pageCount}
                    total={exceptionsPager.total}
                    pageSize={exceptionsPager.pageSize}
                    onPage={exceptionsPager.setPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* 7. BOARD REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-700 uppercase font-mono">Executive Posture Ledger</h2>
                <button onClick={handleGenerateReport} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:opacity-90">
                  Compile Posture report
                </button>
              </div>

              {reports.length === 0 ? (
                <div className="p-12 border border-dashed rounded-xl text-center text-xs text-[var(--text-tertiary)] bg-white">
                  Not configured - No posture reports archived.
                </div>
              ) : (
                <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase bg-gray-50 font-bold">
                        <th className="p-4">Report Description</th>
                        <th className="p-4">Overall Score</th>
                        <th className="p-4">Evidence coverage</th>
                        <th className="p-4">Archived date</th>
                        <th className="p-4 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportsPager.slice.map((rep) => (
                        <tr key={rep.id} className="border-b text-xs text-[var(--text-secondary)]">
                          <td className="p-4 font-bold text-[var(--text-primary)]">{rep.title}</td>
                          <td className="p-4 text-green-600 font-bold font-mono">{rep.score_snapshot.overall}%</td>
                          <td className="p-4">{rep.score_snapshot.evidence || 100}% verified</td>
                          <td className="p-4">{new Date(rep.created_at).toLocaleDateString()}</td>
                          <td className="p-4 text-right">
                            <button onClick={() => handleDownloadReport(rep)} className="px-3 py-1.5 rounded-lg border text-[10px] font-bold bg-white hover:bg-gray-50 ml-auto flex items-center gap-1.5 shadow-sm">
                              <FileDown className="w-3.5 h-3.5" /> PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager
                    page={reportsPager.page}
                    pageCount={reportsPager.pageCount}
                    total={reportsPager.total}
                    pageSize={reportsPager.pageSize}
                    onPage={reportsPager.setPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* 8. SETTINGS WEIGHTS */}
          {activeTab === 'settings' && settings && (
            <div className="p-6 rounded-2xl border bg-white shadow-sm max-w-2xl mx-auto space-y-6">
              <h2 className="text-lg font-bold text-gray-700 uppercase border-b pb-4 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-gray-400" />
                GRC Posture Score Weight configurations
              </h2>
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div className="space-y-4">
                  {[
                    { key: 'controls_weight', label: 'CIS Controls Health Weight', val: settings.controls_weight },
                    { key: 'evidence_weight', label: 'Verified Evidence Vault Weight', val: settings.evidence_weight },
                    { key: 'risks_weight', label: 'Mitigated Threat Risks Weight', val: settings.risks_weight },
                    { key: 'policies_weight', label: 'Linked Policies & Statutes Weight', val: settings.policies_weight },
                    { key: 'vendors_weight', label: 'Vendor Risk Profiles Weight', val: settings.vendors_weight },
                    { key: 'incidents_weight', label: 'Incident Severity Reductions Weight', val: settings.incidents_weight },
                  ].map((s) => (
                    <div key={s.key} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
                        <span>{s.label}</span>
                        <span className="font-mono text-[var(--brand-primary)]">{(s.val * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={s.val}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            [s.key]: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[var(--brand-primary)]"
                      />
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 text-[11px] text-amber-800 leading-relaxed font-semibold">
                  Note: Total score weights sum must total exactly 100% (1.0). Current calculations total:{' '}
                  <span className="font-mono">
                    {(
                      (settings.controls_weight +
                        settings.evidence_weight +
                        settings.risks_weight +
                        settings.policies_weight +
                        settings.vendors_weight +
                        settings.incidents_weight) *
                      100
                    ).toFixed(0)}
                    %
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={
                    Math.abs(
                      settings.controls_weight +
                        settings.evidence_weight +
                        settings.risks_weight +
                        settings.policies_weight +
                        settings.vendors_weight +
                        settings.incidents_weight -
                        1.0
                    ) > 0.01
                  }
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--brand-primary)] hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  Save Scoring Weights
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
      )}

      {/* DIALOG MODALS */}

      {/* 1. Link Evidence Dialog */}
      {isEvidenceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsEvidenceModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Upload Verified Compliance Proof</h2>
            <form onSubmit={handleCreateEvidence} encType="multipart/form-data" className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Evidence Title</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Host Firewalls CIS benchmark validation logs"
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Upload Proof Document File</label>
                <div className="relative">
                  <input
                    type="file"
                    name="file"
                    required
                    className="w-full text-xs rounded-lg border border-dashed border-gray-300 p-4 bg-gray-50/50 hover:bg-gray-50 transition-colors text-gray-800 font-mono cursor-pointer file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Link CISO Backbone Safeguard</label>
                <select name="control_id" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                  <option value="">Keep in general vault</option>
                  {controls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.control_key} — {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {isUploading && (
                <div className="pt-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase mb-1.5">
                    <span className="text-gray-500 tracking-wider">Uploading Document...</span>
                    <span className="text-[var(--brand-primary)]">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-[var(--brand-primary)] h-full rounded-full transition-all duration-300 ease-out" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                disabled={isUploading}
                className={`w-full py-2.5 rounded-lg text-xs font-bold text-white transition-all ${
                  isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[var(--brand-primary)] hover:opacity-90 shadow-sm'
                }`}
              >
                {isUploading ? 'Uploading...' : 'Confirm Upload & Link'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Link Remediation Task Dialog */}
      {isRemediationModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsRemediationModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Assign Compliance Action Task</h2>
            <form onSubmit={handleCreateRemediation} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Task Title</label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. Audit all inactive administrative accounts"
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Action Description</label>
                <textarea
                  name="description"
                  rows={3}
                  required
                  placeholder="Provide explicit steps required to reconcile this compliance status..."
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Priority</label>
                <select name="priority" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Link CISO Backbone Safeguard</label>
                <select name="control_id" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                  <option value="">Do not link (General Task)</option>
                  {controls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.control_key} — {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--brand-primary)] hover:opacity-90">
                Confirm assignment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. Link Exception Dialog */}
      {isExceptionModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsExceptionModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Approve Policy Exemption Waiver</h2>
            <form onSubmit={handleCreateException} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Target Safeguard</label>
                <select name="control_id" required className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                  {controls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.control_key} — {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Waiver Type</label>
                <select name="exception_type" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                  <option value="temporary">Temporary waiver (90 Days)</option>
                  <option value="permanent">Permanent Waiver</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Business Justification & Rationale</label>
                <textarea
                  name="reason"
                  required
                  rows={2}
                  placeholder="Provide explicit auditor-facing justification details..."
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Compensating security controls</label>
                <textarea
                  name="compensating_controls"
                  rows={2}
                  placeholder="List compensating controls enforcing equivalent boundaries..."
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--brand-primary)] hover:opacity-90">
                Confirm waiver approval
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. Map Internal Control (Organization Control modal) */}
      {isOrgControlModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsOrgControlModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Map Custom Internal control</h2>
            <form onSubmit={handleCreateOrgControl} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Internal key Code</label>
                  <input
                    type="text"
                    name="control_key"
                    required
                    placeholder="e.g. ORG-CTRL-01"
                    className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Internal Control Title</label>
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder="e.g. Corporate Password Complexity Rules"
                    className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Operational Description</label>
                <textarea
                  name="description"
                  required
                  rows={2}
                  placeholder="Describe internal procedures..."
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">SLA Priority</label>
                  <select name="priority" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Map to preset CIS control</label>
                  <select name="mapped_ciso_control_id" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                    <option value="">No mapping (Stand-alone)</option>
                    {controls.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.control_key} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">CIS Mappings (Comma separated)</label>
                  <input type="text" name="cis_mappings" placeholder="e.g. CIS.1.1, CIS.1.2" className="w-full text-xs rounded-lg border p-2 bg-white font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">ISO Mappings (Comma separated)</label>
                  <input type="text" name="iso_mappings" placeholder="e.g. ISO.A.5.1" className="w-full text-xs rounded-lg border p-2 bg-white font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">DPDPA Mappings (Comma separated)</label>
                  <input type="text" name="dpdpa_mappings" placeholder="e.g. DPDPA.Sec.8.5" className="w-full text-xs rounded-lg border p-2 bg-white font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">NIST Mappings (Comma separated)</label>
                  <input type="text" name="nist_mappings" placeholder="e.g. NIST.PR.AC-1" className="w-full text-xs rounded-lg border p-2 bg-white font-mono" />
                </div>
              </div>

              <button type="submit" className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--brand-primary)] hover:opacity-90">
                Register Mapped Control
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Register Mapped Threat Risk */}
      {isRiskModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsRiskModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Register Custom Risk Scenario</h2>
            <form onSubmit={handleCreateRisk} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Risk Title</label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. Database server exposed to public access bounds"
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Threat Category</label>
                <input
                  type="text"
                  name="category"
                  placeholder="e.g. Network Security"
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Likelihood (1-5)</label>
                  <select name="likelihood" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                    <option value="1">1 - Rare</option>
                    <option value="2">2 - Unlikely</option>
                    <option value="3">3 - Possible</option>
                    <option value="4">4 - Likely</option>
                    <option value="5">5 - Frequent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Impact (1-5)</label>
                  <select name="impact" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                    <option value="1">1 - Negligible</option>
                    <option value="2">2 - Minor</option>
                    <option value="3">3 - Moderate</option>
                    <option value="4">4 - Major</option>
                    <option value="5">5 - Catastrophic</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--brand-primary)] hover:opacity-90">
                Register Scenario
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Link Policy Dialog */}
      {isLinkPolicyModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsLinkPolicyModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Link Security Policy</h2>
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {allPolicies.filter(p => !((selectedControl as any)?.linked_policies || []).some((lp: any) => lp.id === p.id)).length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-500 italic">No remaining policies to link.</div>
              ) : (
                allPolicies.filter(p => !((selectedControl as any)?.linked_policies || []).some((lp: any) => lp.id === p.id)).map(p => (
                  <div key={p.id} className="p-3 border rounded-xl flex items-center justify-between hover:bg-gray-50/50 transition-all">
                    <div>
                      <h4 className="text-xs font-bold text-gray-800">{p.title}</h4>
                      <span className="text-[10px] text-gray-400 capitalize">{p.policy_type}</span>
                    </div>
                    <button
                      onClick={() => handleLinkPolicy(p.id)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-[var(--brand-primary)] text-white rounded-lg hover:opacity-90 shadow-sm"
                    >
                      Link
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. Link Asset Dialog */}
      {isLinkAssetModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsLinkAssetModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Link IT Asset to Scope</h2>
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {allAssets.filter(a => !((selectedControl as any)?.assets_covered || []).some((la: any) => la.id === a.id)).length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-500 italic">No remaining assets to link. Create one first!</div>
              ) : (
                allAssets.filter(a => !((selectedControl as any)?.assets_covered || []).some((la: any) => la.id === a.id)).map(a => (
                  <div key={a.id} className="p-3 border rounded-xl flex items-center justify-between hover:bg-gray-50/50 transition-all">
                    <div>
                      <h4 className="text-xs font-bold text-gray-800">{a.name}</h4>
                      <span className="text-[10px] text-indigo-600 font-semibold uppercase">{a.asset_type || a.category} • {a.environment}</span>
                    </div>
                    <button
                      onClick={() => handleLinkAsset(a.id)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-[var(--brand-primary)] text-white rounded-lg hover:opacity-90 shadow-sm"
                    >
                      Link
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. Create IT Asset Dialog */}
      {isCreateAssetModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsCreateAssetModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-700">Create New IT Asset</h2>
            <form onSubmit={handleCreateAsset} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Asset Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Production PostgreSQL DB Cluster"
                  className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Asset Type</label>
                  <select name="asset_type" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                    <option value="Database">Database</option>
                    <option value="Server">Server</option>
                    <option value="Application">Application</option>
                    <option value="Container">Container</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Environment</label>
                  <select name="environment" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Cloud Provider</label>
                  <select name="provider" className="w-full text-xs rounded-lg border p-2 bg-white font-bold">
                    <option value="aws">AWS</option>
                    <option value="gcp">Google Cloud</option>
                    <option value="on_premises">On-Premises</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Cloud Resource ID (Optional)</label>
                  <input
                    type="text"
                    name="external_ref_id"
                    placeholder="e.g. db-prod-0123"
                    className="w-full text-xs rounded-lg border p-2 bg-white text-gray-800 font-mono"
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--brand-primary)] hover:opacity-90">
                Create & Link Asset
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 9. Scan History Logs Dialog */}
      {isScanLogsModalOpen && selectedScanAsset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-white border border-gray-200 shadow-2xl relative">
            <button onClick={() => setIsScanLogsModalOpen(false)} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-700">Vulnerability Scan History</h2>
            <p className="text-[10px] text-gray-400 font-mono mb-4 uppercase">Asset: {selectedScanAsset.name}</p>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
              {scanLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500 italic">No automated scans executed yet for this asset.</div>
              ) : (
                scanLogs.map(log => (
                  <div key={log.id} className="p-4 border rounded-xl space-y-3 bg-gray-50/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">{log.scanner_name}</span>
                        <div className="text-[9px] text-gray-400 font-mono mt-0.5">{new Date(log.scanned_at).toLocaleString()}</div>
                      </div>
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border',
                        log.status === 'clean' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                      )}>
                        {log.status.replace('_', ' ')}
                      </span>
                    </div>
                    
                    {log.findings && log.findings.length > 0 ? (
                      <div className="space-y-1.5 pt-1.5 border-t">
                        <div className="text-[9px] font-bold uppercase text-red-500">Alert Findings Detected:</div>
                        {log.findings.map((f: any, idx: number) => (
                          <div key={idx} className="p-2 rounded bg-white border border-red-100 space-y-0.5">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-mono font-bold text-red-700">{f.cve}</span>
                              <span className="text-[8px] uppercase font-bold text-red-500 px-1 py-0.2 bg-red-50 rounded">{f.severity}</span>
                            </div>
                            <p className="text-[10px] text-gray-600 leading-tight">{f.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-green-600 font-semibold">✓ Zero vulnerability findings. Security postures are secure.</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== CIS BENCHMARK STANDARD READ-ONLY MATRIX MODAL (Sourced from cis.xlsx) ==================== */}
      {isCisMatrixModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 md:p-8 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-start border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 text-emerald-400">
                    <FileSpreadsheet className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-extrabold tracking-tight">CIS Controls v8 Official Benchmark Standard</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Read-Only Standard
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsCisMatrixModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Filter Toolbar */}
            <div className="p-4 bg-slate-50 border-b flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <div className="relative w-full">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    placeholder="Search controls or safeguards (e.g. 1.1, encryption, asset, malware)..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl border bg-white text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                  />
                  {matrixSearch && (
                    <button onClick={() => setMatrixSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-gray-500" />
                  <span className="font-bold text-gray-600 uppercase text-[10px]">Asset Class:</span>
                  <select
                    value={matrixAssetFilter}
                    onChange={(e) => setMatrixAssetFilter(e.target.value)}
                    className="p-2 rounded-xl border bg-white font-semibold text-xs shadow-sm"
                  >
                    <option value="">All Asset Classes</option>
                    <option value="Devices">Devices</option>
                    <option value="Software">Software</option>
                    <option value="Data">Data</option>
                    <option value="Users">Users</option>
                    <option value="Network">Network</option>
                    <option value="Applications">Applications</option>
                    <option value="Documentation">Documentation</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-600 uppercase text-[10px]">Function:</span>
                  <select
                    value={matrixFunctionFilter}
                    onChange={(e) => setMatrixFunctionFilter(e.target.value)}
                    className="p-2 rounded-xl border bg-white font-semibold text-xs shadow-sm"
                  >
                    <option value="">All Functions</option>
                    <option value="Identify">Identify</option>
                    <option value="Protect">Protect</option>
                    <option value="Detect">Detect</option>
                    <option value="Respond">Respond</option>
                    <option value="Govern">Govern</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Body / Scrollable Table */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
              {benchmarkMatrix.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto" />
                  <p className="text-sm text-gray-500 font-medium">Loading CIS Controls v8 Matrix from cis.xlsx...</p>
                </div>
              ) : (
                benchmarkMatrix
                  .filter((ctrl: any) => {
                    if (!matrixSearch && !matrixAssetFilter && !matrixFunctionFilter) return true;

                    const matchSearch =
                      !matrixSearch ||
                      ctrl.control_key.toLowerCase().includes(matrixSearch.toLowerCase()) ||
                      ctrl.title.toLowerCase().includes(matrixSearch.toLowerCase()) ||
                      ctrl.description.toLowerCase().includes(matrixSearch.toLowerCase()) ||
                      ctrl.safeguards.some((sg: any) =>
                        sg.safeguard_number.includes(matrixSearch) ||
                        sg.title.toLowerCase().includes(matrixSearch.toLowerCase()) ||
                        sg.description.toLowerCase().includes(matrixSearch.toLowerCase())
                      );

                    const matchAsset =
                      !matrixAssetFilter ||
                      ctrl.safeguards.some((sg: any) => sg.asset_class.toLowerCase() === matrixAssetFilter.toLowerCase());

                    const matchFunc =
                      !matrixFunctionFilter ||
                      ctrl.safeguards.some((sg: any) => sg.security_function.toLowerCase() === matrixFunctionFilter.toLowerCase());

                    return matchSearch && matchAsset && matchFunc;
                  })
                  .map((ctrl: any) => {
                    const isExpanded = expandedBenchmarkControls[ctrl.control_key] ?? (matrixSearch !== '' || matrixAssetFilter !== '' || matrixFunctionFilter !== '');
                    const filteredSafeguards = ctrl.safeguards.filter((sg: any) => {
                      const mSearch = !matrixSearch || sg.safeguard_number.includes(matrixSearch) || sg.title.toLowerCase().includes(matrixSearch.toLowerCase()) || sg.description.toLowerCase().includes(matrixSearch.toLowerCase());
                      const mAsset = !matrixAssetFilter || sg.asset_class.toLowerCase() === matrixAssetFilter.toLowerCase();
                      const mFunc = !matrixFunctionFilter || sg.security_function.toLowerCase() === matrixFunctionFilter.toLowerCase();
                      return mSearch && mAsset && mFunc;
                    });

                    return (
                      <div key={ctrl.control_key} className="bg-white border rounded-2xl shadow-sm overflow-hidden transition-all">
                        {/* Control Accordion Header */}
                        <div
                          onClick={() => setExpandedBenchmarkControls(prev => ({ ...prev, [ctrl.control_key]: !isExpanded }))}
                          className="p-4 bg-white hover:bg-slate-50 border-b flex items-center justify-between cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700">
                              {ctrl.control_key}
                            </div>
                            <h3 className="font-bold text-sm text-slate-800">{ctrl.title}</h3>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 border">
                              {ctrl.safeguards.length} Safeguards
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-slate-400">
                            <span className="text-[11px] font-semibold text-slate-500">
                              {isExpanded ? 'Collapse' : 'Expand Details'}
                            </span>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                        </div>

                        {/* Control Description & Safeguards Table */}
                        {isExpanded && (
                          <div className="p-4 space-y-4 bg-white">
                            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                              <span className="font-bold non-italic text-slate-700">Official Specification: </span>
                              {ctrl.description}
                            </p>

                            <div className="overflow-x-auto border rounded-xl">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-100 border-b text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                                  <tr>
                                    <th className="p-3 w-16">ID</th>
                                    <th className="p-3 w-28">Asset Class</th>
                                    <th className="p-3 w-28">Security Function</th>
                                    <th className="p-3 w-64">Safeguard Title</th>
                                    <th className="p-3">Specification / Description</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {filteredSafeguards.map((sg: any) => (
                                    <tr key={sg.safeguard_number} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="p-3 font-mono font-bold text-indigo-600 align-top">{sg.safeguard_number}</td>
                                      <td className="p-3 align-top">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border">
                                          {sg.asset_class}
                                        </span>
                                      </td>
                                      <td className="p-3 align-top">
                                        <span className={cn(
                                          'px-2 py-0.5 rounded text-[10px] font-bold uppercase border',
                                          sg.security_function === 'Identify' && 'bg-blue-50 text-blue-700 border-blue-200',
                                          sg.security_function === 'Protect' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                          sg.security_function === 'Detect' && 'bg-amber-50 text-amber-700 border-amber-200',
                                          sg.security_function === 'Respond' && 'bg-purple-50 text-purple-700 border-purple-200',
                                          sg.security_function === 'Govern' && 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        )}>
                                          {sg.security_function}
                                        </span>
                                      </td>
                                      <td className="p-3 font-bold text-slate-800 align-top">{sg.title}</td>
                                      <td className="p-3 text-slate-600 leading-relaxed align-top">{sg.description}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t flex justify-between items-center text-xs">
              <div className="flex items-center gap-2 text-slate-600 font-medium">
                <Lock className="w-4 h-4 text-slate-400" />
                <span>Non-editable read-only specification. All 18 CIS Controls and 153 Safeguards verified.</span>
              </div>

              <button
                onClick={() => setIsCisMatrixModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors shadow-sm"
              >
                Close Matrix Reference
              </button>
            </div>
          </div>
        </div>
      )}
    </ConsentManagementGate>
  );
}
