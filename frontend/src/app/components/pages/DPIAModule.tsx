import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import {
  Plus, Clock, X, ChevronRight,
  ArrowLeft, FileText, Check, AlertCircle, RefreshCw, BarChart2,
  AlertTriangle, Shield, Sliders, Compass,
  CheckCircle2, User, Sparkles,
  BookOpen, Send, FileSpreadsheet, Link2, ExternalLink
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { notify } from '@/app/utils/notify';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { useNavigationGuard } from '@/router/NavigationGuardContext';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import {
  fetchDPIASummary, fetchDPIAs, fetchDPIATemplates, fetchDPIADetail, fetchControlLibrary,
  createDPIA, checkoutNewVersion, saveStepAnswer,
  addDPIARisk, deleteDPIARisk, addMitigationControl,
  verifyControl, submitForApproval, processApprovalDecision, fetchDPIAApprovals,
  fetchDPIAComments, addDPIAComment, fetchDPIAEvents, evaluateRules, evaluateCompliance,
  analyzeDpiaWithAI, fetchDpiaAiRecommendations, fetchDpiaScannerResults, fetchDPIAAssets, exportDpiaPdf,
  DPIARecord, DPIADetail, DPIASummaryStats, DPIATemplate, DPIARisk, DPIAApproval,
  DPIAComment, DPIAEvent, DPIAAsset, DPIAControlLibrary
} from '@/lib/api/dpia';

function MarkdownRenderer({ content }: { content: string }) {
  // Line-by-line markdown processor to handle elements individually and wrap text correctly
  const lines = content.split('\n');

  const formatText = (text: string) => {
    // Process **bold** and `code` patterns
    let currentText = text;
    
    // Quick regex to tokenize inline markdown
    const regex = /(\*\*.*?\*\*|`.*?`|❌ GAP-\d+.*?|⚠️ GAP-\d+.*?|✅.*?)/g;
    const tokens = currentText.split(regex);

    return tokens.map((token, idx) => {
      if (token.startsWith('**') && token.endsWith('**')) {
        return <strong key={idx} className="font-bold text-[var(--text-primary)]">{token.slice(2, -2)}</strong>;
      }
      if (token.startsWith('`') && token.endsWith('`')) {
        return <code key={idx} className="font-mono text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded text-[11px]">{token.slice(1, -1)}</code>;
      }
      if (token.includes('❌') || token.includes('⚠️') || token.includes('✅')) {
        return <span key={idx} className="font-bold">{token}</span>;
      }
      return token;
    });
  };

  return (
    <div className="space-y-2 text-xs leading-relaxed text-[var(--text-secondary)]">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Headings
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-sm font-bold text-[var(--text-primary)] mt-3 border-b border-[var(--border-default)] pb-1 flex items-center gap-1.5">
              {formatText(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith('#### ')) {
          return (
            <h4 key={idx} className="text-xs font-bold text-[var(--text-primary)] mt-2.5">
              {formatText(trimmed.slice(5))}
            </h4>
          );
        }
        if (trimmed.startsWith('##### ')) {
          return (
            <h5 key={idx} className="text-xs font-bold text-indigo-400 mt-2 flex items-center gap-1.5">
              {formatText(trimmed.slice(6))}
            </h5>
          );
        }

        // Horizontal rule
        if (trimmed === '---') {
          return <hr key={idx} className="border-[var(--border-default)] my-3" />;
        }

        // Bullet lists
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex gap-2 pl-2 text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
              <span className="break-words w-full">{formatText(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered lists
        if (/^\d+\./.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+/);
          const num = match ? match[1] : '1';
          const contentStr = trimmed.replace(/^\d+\.\s+/, '');
          return (
            <div key={idx} className="flex gap-2 pl-2 text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
              <span className="text-indigo-400 font-bold shrink-0">{num}.</span>
              <span className="break-words w-full">{formatText(contentStr)}</span>
            </div>
          );
        }

        // Default paragraph
        return (
          <p key={idx} className="text-xs text-[var(--text-secondary)] leading-relaxed break-words">
            {formatText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export function DPIAModule(): ReactElement {
  const {
    orgIdParam,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    hasOrg,
    loading: orgLoading,
    error: orgError,
  } = useComplianceOrg();
  const { registerGuard } = useNavigationGuard();

  const [view, setView] = useState<'dashboard' | 'builder'>('dashboard');
  const [summary, setSummary] = useState<DPIASummaryStats | null>(null);
  const [dpias, setDpias] = useState<DPIARecord[]>([]);
  const [selectedDpia, setSelectedDpia] = useState<DPIADetail | null>(null);
  const [templates, setTemplates] = useState<DPIATemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const dpiasPager = useClientPagination(dpias);

  useEffect(() => {
    dpiasPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, dpias.length]);

  // Active View Tab on Dashboard (All Cases, High Risk, My Tasks)
  const [dashboardTab, setDashboardTab] = useState<'all' | 'high_risk' | 'my_tasks'>('all');

  // Filter coordinates for the 5x5 Heatmap
  const [filterLike, setFilterLike] = useState<number | null>(null);
  const [filterImp, setFilterImp] = useState<number | null>(null);

  // Tab state in the Right Context Panel
  const [contextTab, setContextTab] = useState<'profile' | 'ai' | 'risks' | 'comments' | 'history'>('profile');

  // Risk card explainability states (stores IDs of risks currently showing score breakdown)
  const [expandedRiskScores, setExpandedRiskScores] = useState<Record<string, boolean>>({});

  // AI States
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<string[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Scanner States
  const [scannerResults, setScannerResults] = useState<any | null>(null);
  const [isScannerLoading, setIsScannerLoading] = useState(false);

  // Builder Wizard State
  const [builderStep, setBuilderStep] = useState(1);
  const [formAnswers, setFormAnswers] = useState<Record<string, string>>({});
  const [formReasons, setFormReasons] = useState<Record<string, string>>({});
  const [formEvidence, setFormEvidence] = useState<Record<string, string>>({});
  const [formPrivacyPolicyUrls, setFormPrivacyPolicyUrls] = useState<Record<string, string>>({});
  const [showPrivacyPolicyModal, setShowPrivacyPolicyModal] = useState(false);
  const [privacyPolicyUrlInput, setPrivacyPolicyUrlInput] = useState('');
  const [risks, setRisks] = useState<DPIARisk[]>([]);
  const [comments, setComments] = useState<DPIAComment[]>([]);
  const [events, setEvents] = useState<DPIAEvent[]>([]);
  const [approvals, setApprovals] = useState<DPIAApproval[]>([]);
  const [assets, setAssets] = useState<DPIAAsset[]>([]);
  const [controlLib, setControlLib] = useState<DPIAControlLibrary[]>([]);

  // Dynamic risk input
  const [riskTitle, setRiskTitle] = useState('');
  const [riskDesc, setRiskDesc] = useState('');
  const [riskLike, setRiskLike] = useState(3);
  const [riskImp, setRiskImp] = useState(3);
  const [riskCat, setRiskCat] = useState('security');

  // Comment input
  const [commentText, setCommentText] = useState('');

  const flushDraftAnswers = useCallback(async (): Promise<boolean> => {
    if (!selectedDpia || Object.keys(formAnswers).length === 0) return true;
    try {
      await Promise.all(
        Object.entries(formAnswers).map(([key, val]) => {
          const idx = key.indexOf('_');
          if (idx === -1) return Promise.resolve();
          const stepKey = key.slice(0, idx);
          const questionKey = key.slice(idx + 1);
          return saveStepAnswer(selectedDpia.id, {
            step_key: stepKey,
            question_key: questionKey,
            answer_text: val,
            answer_json: {
              justification: formReasons[key] || '',
              evidence: formEvidence[key] || '',
              privacy_policy_url: formPrivacyPolicyUrls[key] || '',
            },
          });
        }),
      );
      return true;
    } catch (err) {
      console.error('Failed to flush DPIA draft answers:', err);
      return false;
    }
  }, [selectedDpia, formAnswers, formReasons, formEvidence, formPrivacyPolicyUrls]);

  const builderStateRef = useRef({
    view,
    selectedDpia,
    flushDraftAnswers,
  });
  useEffect(() => {
    builderStateRef.current = { view, selectedDpia, flushDraftAnswers };
  });

  useEffect(() => {
    const guard = async (): Promise<boolean> => {
      const { view: currentView, selectedDpia: dpia, flushDraftAnswers: flush } = builderStateRef.current;
      if (currentView !== 'builder' || !dpia) return true;
      await flush();
      return true;
    };
    registerGuard(guard);
    return () => {
      registerGuard(null);
    };
  }, [registerGuard]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const { view: currentView, selectedDpia: dpia } = builderStateRef.current;
      if (currentView === 'builder' && dpia && Object.keys(formAnswers).length > 0) {
        void builderStateRef.current.flushDraftAnswers();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formAnswers]);

  useEffect(() => {
    if (isSuperadmin && !hasOrg) return;
    loadDashboardData();
  }, [searchQuery, statusFilter, orgIdParam, hasOrg, isSuperadmin]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const sumData = await fetchDPIASummary(orgIdParam);
      setSummary(sumData);
      const list = await fetchDPIAs(searchQuery, statusFilter, orgIdParam);
      setDpias(list);
      const temps = await fetchDPIATemplates(orgIdParam);
      setTemplates(temps);
      const libs = await fetchControlLibrary(orgIdParam);
      setControlLib(libs);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load DPIA summary data.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDpia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const newDpia = await createDPIA({
        title: newTitle,
        description: newDesc,
        template_key: 'standard_v1'
      }, orgIdParam);
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      notify('DPIA Case file initialized successfully');
      loadDpiaIntoBuilder(newDpia.id);
    } catch (err: any) {
      notify(err?.message || 'Failed to create DPIA');
    }
  };

  const loadDpiaIntoBuilder = async (id: string) => {
    setLoading(true);
    try {
      const detail = await fetchDPIADetail(id);
      setSelectedDpia(detail);
      
      // Setup answers Map
      const answers: Record<string, string> = {};
      const reasons: Record<string, string> = {};
      const evidence: Record<string, string> = {};
      const privacyPolicyUrls: Record<string, string> = {};
      
      if (detail.current_version?.step_answers) {
        detail.current_version.step_answers.forEach(ans => {
          answers[`${ans.step_key}_${ans.question_key}`] = ans.answer_text || '';
          
          // Parse reasoning and evidence from JSON payload if present
          if (ans.answer_json) {
            reasons[`${ans.step_key}_${ans.question_key}`] = ans.answer_json.justification || '';
            evidence[`${ans.step_key}_${ans.question_key}`] = ans.answer_json.evidence || '';
            privacyPolicyUrls[`${ans.step_key}_${ans.question_key}`] =
              ans.answer_json.privacy_policy_url || '';
          }
        });
      }
      setFormAnswers(answers);
      setFormReasons(reasons);
      setFormEvidence(evidence);
      setFormPrivacyPolicyUrls(privacyPolicyUrls);
      setRisks(detail.current_version?.risks || []);
      
      // Load extra sections
      const listComments = await fetchDPIAComments(id);
      setComments(listComments);
      const listEvents = await fetchDPIAEvents(id);
      setEvents(listEvents);
      const listApprovals = await fetchDPIAApprovals(id);
      setApprovals(listApprovals);
      const listAssets = await fetchDPIAAssets(id);
      setAssets(listAssets);
      if (controlLib.length === 0) {
        const libs = await fetchControlLibrary(orgIdParam);
        setControlLib(libs);
      }

      setView('builder');
      setBuilderStep(1);
      setFilterLike(null);
      setFilterImp(null);
    } catch (err: any) {
      notify(err?.message || 'Failed to open case file details');
    } finally {
      setLoading(false);
    }
  };

  // Debounced/Direct save step answer
  const handleSaveAnswer = async (
    stepKey: string,
    questionKey: string,
    val: string,
    justification?: string,
    fileEvidence?: string,
    privacyPolicyUrl?: string
  ) => {
    if (!selectedDpia) return;
    const key = `${stepKey}_${questionKey}`;
    
    // Update local state reactively
    setFormAnswers(prev => ({ ...prev, [key]: val }));
    if (justification !== undefined) {
      setFormReasons(prev => ({ ...prev, [key]: justification }));
    }
    if (fileEvidence !== undefined) {
      setFormEvidence(prev => ({ ...prev, [key]: fileEvidence }));
    }
    if (privacyPolicyUrl !== undefined) {
      setFormPrivacyPolicyUrls(prev => ({ ...prev, [key]: privacyPolicyUrl }));
    }

    try {
      // Save combined JSON layout to backend answer_json fields to support justification & evidence files
      await saveStepAnswer(selectedDpia.id, {
        step_key: stepKey,
        question_key: questionKey,
        answer_text: val,
        answer_json: {
          justification: justification !== undefined ? justification : (formReasons[key] || ''),
          evidence: fileEvidence !== undefined ? fileEvidence : (formEvidence[key] || ''),
          privacy_policy_url: privacyPolicyUrl !== undefined
            ? privacyPolicyUrl
            : (formPrivacyPolicyUrls[key] || '')
        }
      });
    } catch (err: any) {
      console.error('Autosave answer error:', err);
    }
  };

  const handleBackToDashboard = async () => {
    if (view === 'builder' && selectedDpia) {
      await flushDraftAnswers();
    }
    setView('dashboard');
    loadDashboardData();
  };

  const openPrivacyPolicyModal = () => {
    setPrivacyPolicyUrlInput(formPrivacyPolicyUrls['project_activity_name'] || '');
    setShowPrivacyPolicyModal(true);
  };

  const handleSavePrivacyPolicyUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = privacyPolicyUrlInput.trim();
    if (!trimmed) {
      notify('Please enter a privacy policy URL');
      return;
    }

    try {
      await handleSaveAnswer(
        'project',
        'activity_name',
        formAnswers['project_activity_name'] || '',
        formReasons['project_activity_name'] || '',
        formEvidence['project_activity_name'] || '',
        trimmed
      );
      setShowPrivacyPolicyModal(false);
      notify('Privacy policy link saved');
    } catch (err: any) {
      notify(err?.message || 'Failed to save privacy policy link');
    }
  };

  // Add Custom Risk
  const handleAddRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDpia || !riskTitle.trim()) return;
    try {
      await addDPIARisk(selectedDpia.id, {
        title: riskTitle,
        description: riskDesc,
        category: riskCat,
        likelihood: riskLike,
        impact: riskImp
      });
      notify('Risk node added successfully');
      setRiskTitle('');
      setRiskDesc('');
      setRiskLike(3);
      setRiskImp(3);
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
      setRisks(updated.current_version?.risks || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to add risk entry');
    }
  };

  // Remove Risk
  const handleRemoveRisk = async (rid: string) => {
    if (!selectedDpia) return;
    try {
      await deleteDPIARisk(selectedDpia.id, rid);
      notify('Risk node archived successfully');
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
      setRisks(updated.current_version?.risks || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to remove risk item');
    }
  };

  // Add Mitigation control to risk
  const handleAddMitigation = async (rid: string, libId: string) => {
    if (!selectedDpia) return;
    try {
      await addMitigationControl(selectedDpia.id, rid, {
        control_library_id: libId
      });
      notify('Governance control mapped to risk');
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
      setRisks(updated.current_version?.risks || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to map control mitigation');
    }
  };

  // Toggle Control verified state
  const handleVerifyControl = async (cid: string, currentStatus: string) => {
    if (!selectedDpia) return;
    try {
      const isVerified = currentStatus !== 'active';
      await verifyControl(selectedDpia.id, cid, isVerified);
      notify(isVerified ? 'Safeguard verified as actively implemented' : 'Safeguard verification status revoked');
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
      setRisks(updated.current_version?.risks || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to change verification status');
    }
  };

  // Rule Evaluation trigger
  const handleRunRuleChecks = async () => {
    if (!selectedDpia) return;
    try {
      const res = await evaluateRules(selectedDpia.id);
      notify(`Evaluated rules. Detected ${res.rules_triggered} potential non-compliance escalations.`);
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
      setRisks(updated.current_version?.risks || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to evaluate rules');
    }
  };

  // Compliance evaluation
  const handleRunComplianceEvaluation = async () => {
    if (!selectedDpia) return;
    try {
      const res = await evaluateCompliance(selectedDpia.id);
      notify(`Compliance check complete. Calculated Rollup: ${res.compliance_score}%`);
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
      const sumData = await fetchDPIASummary(orgIdParam);
      setSummary(sumData);
    } catch (err: any) {
      notify(err?.message || 'Failed to run compliance check');
    }
  };

  // Vajra AI Analysis
  const handleAnalyzeAI = async () => {
    if (!selectedDpia) return;
    setIsAiLoading(true);
    setAiAnalysis(null);
    setAiRecommendations([]);
    try {
      const [analysisRes, recRes] = await Promise.all([
        analyzeDpiaWithAI(selectedDpia.id),
        fetchDpiaAiRecommendations(selectedDpia.id)
      ]);
      setAiAnalysis(analysisRes.analysis);
      setAiRecommendations(recRes.recommendations);
      notify('Vajra AI Analysis complete');
    } catch (err: any) {
      notify(err?.message || 'Failed to run Vajra AI analysis');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run PII Scanner
  const handleRunScanner = async () => {
    if (!selectedDpia) return;
    setIsScannerLoading(true);
    try {
      const res = await fetchDpiaScannerResults(selectedDpia.id);
      setScannerResults(res.scanner_results);
      notify('Data Discovery Scan complete.');
    } catch (err: any) {
      notify(err?.message || 'Failed to run data discovery scan');
    } finally {
      setIsScannerLoading(false);
    }
  };

  // Approve a discovered field from the PII scanner
  const handleApproveField = (fieldKey: string) => {
    if (!scannerResults) return;
    const fieldObj = scannerResults.discovered_fields.find((f: any) => f.field === fieldKey);
    if (!fieldObj) return;

    // Move from discovered_fields to existing_fields
    const updatedDiscovered = scannerResults.discovered_fields.filter((f: any) => f.field !== fieldKey);
    const updatedExisting = [
      ...scannerResults.existing_fields,
      { ...fieldObj, status: 'mapped' }
    ];

    setScannerResults({
      discovered_fields: updatedDiscovered,
      existing_fields: updatedExisting
    });
    notify(`Approved discovery field "${fieldKey}" as category "${fieldObj.category}".`);
  };

  // Submit workflow
  const handleSubmitDpia = async () => {
    if (!selectedDpia) return;
    try {
      const list = await submitForApproval(selectedDpia.id);
      setApprovals(list);
      notify('DPIA submitted to the workflow pipeline');
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
    } catch (err: any) {
      notify(err?.message || 'Failed to submit workflow');
    }
  };

  // PDF Export
  const handleExportPdf = async () => {
    if (!selectedDpia) return;
    try {
      notify('Generating Certified PDF Report...');
      const blob = await exportDpiaPdf(selectedDpia.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dpia_${selectedDpia.dpia_ref}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      notify('PDF generated successfully');
    } catch (err: any) {
      notify(err?.message || 'Failed to generate PDF');
    }
  };

  // Approve node decision
  const handleProcessApprovalNode = async (aid: string, decision: 'approved' | 'rejected') => {
    if (!selectedDpia) return;
    try {
      await processApprovalDecision(aid, {
        status: decision,
        comments: `Governance sign-off processed in compliance workspace.`
      });
      notify(`Workflow pipeline node processed: ${decision}`);
      const updated = await fetchDPIADetail(selectedDpia.id);
      setSelectedDpia(updated);
      const list = await fetchDPIAApprovals(selectedDpia.id);
      setApprovals(list);
    } catch (err: any) {
      notify(err?.message || 'Failed to process approval node');
    }
  };

  // Comments submit
  const handleAddCommentText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDpia || !commentText.trim()) return;
    try {
      await addDPIAComment(selectedDpia.id, {
        content: commentText
      });
      setCommentText('');
      const listComments = await fetchDPIAComments(selectedDpia.id);
      setComments(listComments);
    } catch (err: any) {
      notify(err?.message || 'Failed to add comment');
    }
  };

  // Checkout version update
  const handleCheckoutNewVersion = async () => {
    if (!selectedDpia) return;
    try {
      await checkoutNewVersion(selectedDpia.id, 'Creating revised iteration draft.');
      notify('Case checkout complete. Version iteration bumped.');
      loadDpiaIntoBuilder(selectedDpia.id);
    } catch (err: any) {
      notify(err?.message || 'Failed to checkout new version');
    }
  };

  // 5x5 Matrix Cell mapping helper
  const getCellRiskScore = (likelihood: number, impact: number) => {
    const raw = likelihood * impact;
    if (raw >= 20) return 'critical';
    if (raw >= 12) return 'high';
    if (raw >= 6) return 'medium';
    return 'low';
  };

  // Compute maximum inherent & residual risks for display
  const getDpiaRiskStats = () => {
    const defaultLevel = { text: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (risks.length === 0) return { inherent: defaultLevel, residual: defaultLevel };
    const maxInherent = Math.max(...risks.map(r => r.inherent_score));
    const maxResidual = Math.max(...risks.map(r => r.residual_score || 0));

    const getLevelText = (score: number) => {
      if (score >= 20) return { text: 'Critical', color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/30' };
      if (score >= 12) return { text: 'High', color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/30' };
      if (score >= 6) return { text: 'Medium', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/30' };
      return { text: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    };

    return {
      inherent: getLevelText(maxInherent),
      residual: getLevelText(maxResidual)
    };
  };

  const riskStats = getDpiaRiskStats();

  // Helper to toggle score breakdown view for specific risk
  const toggleScoreBreakdown = (riskId: string) => {
    setExpandedRiskScores(prev => ({
      ...prev,
      [riskId]: !prev[riskId]
    }));
  };

  if (loading || orgLoading) {
    return (
      <ConsentManagementGate
        title="Privacy Impact Assessment"
        loading
        error={orgError}
        hasOrg={hasOrg}
        isSuperadmin={isSuperadmin}
        organizations={organizations}
        selectedOrgId={selectedOrgId}
        onSelectOrg={setSelectedOrgId}
      >
        <div />
      </ConsentManagementGate>
    );
  }

  return (
    <ConsentManagementGate
      title="Privacy Impact Assessment"
      loading={false}
      error={orgError}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
    <div className="w-full min-h-screen bg-[var(--surface-base)] text-[var(--text-primary)] transition-colors duration-200">
      {error && (
        <div className="mx-8 mt-6 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="size-5 shrink-0" />
          <div>{error}</div>
        </div>
      )}
      {view === 'dashboard' ? (
        /* Executive Case Registry & Dashboard View */
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-default)] pb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="p-1.5 rounded bg-indigo-500/10 text-indigo-400"><Shield className="size-5" /></span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">DPDPA Compliance Hub</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">Privacy Impact & Governance Registry</h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Mandatory framework under Section 10 for Significant Data Fiduciaries.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <DPDPAChip
                sections={{
                  chapter: 2,
                  section: 10,
                  subsection: '2(c)',
                  name: 'Data Protection Impact Assessment',
                  url: '/dpdpa2023/chapter-2/section10.html',
                  excerpt: 'Mandatory for Significant Data Fiduciaries...',
                }}
                size="detailed"
              />
              <PenaltyChip amount={250} />
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2.5 rounded-lg bg-[var(--brand-primary)] text-white hover:opacity-90 transition font-semibold flex items-center gap-2 shadow-lg shadow-indigo-500/20 cursor-pointer"
              >
                <Plus className="size-4" />
                Initialize DPIA
              </button>
            </div>
          </div>

          {/* Executive Insights Panel */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-default)] p-5 shadow-sm hover:shadow-md transition flex items-center gap-4">
                <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400"><FileText className="size-6" /></div>
                <div>
                  <div className="text-2xl font-bold tracking-tight">{summary.total_dpias}</div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Total Investigations</div>
                </div>
              </div>
              <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-default)] p-5 shadow-sm hover:shadow-md transition flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400"><Clock className="size-6" /></div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-blue-400">{summary.pending_reviews}</div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Pending DPO Reviews</div>
                </div>
              </div>
              <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-default)] p-5 shadow-sm hover:shadow-md transition flex items-center gap-4">
                <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400"><AlertTriangle className="size-6" /></div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-rose-500">{summary.high_risk + summary.critical_risk}</div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Active Critical Risks</div>
                </div>
              </div>
              <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-default)] p-5 shadow-sm hover:shadow-md transition flex items-center gap-4">
                <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400"><CheckCircle2 className="size-6" /></div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-emerald-500">{summary.compliance_score}%</div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Compliance Score Rollup</div>
                </div>
              </div>
            </div>
          )}

          {/* Filter, Search & Groupings Bar */}
          <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-default)] p-6 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Tabs for Views */}
              <div className="flex gap-1 border-b border-[var(--border-default)] lg:border-b-0 pb-2 lg:pb-0">
                {(['all', 'high_risk', 'my_tasks'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDashboardTab(tab)}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer capitalize ${
                      dashboardTab === tab
                        ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]/55'
                    }`}
                  >
                    {tab.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Advanced Search & Filtering options */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative max-w-xs w-full">
                  <input
                    type="text"
                    placeholder="Search Reference, Name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <button
                  onClick={() => notify('Audit data report generated')}
                  className="px-3 py-2 rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="size-4 text-[var(--text-secondary)]" /> Export
                </button>
              </div>
            </div>

            {/* Redesigned Registry Table */}
            {dpias.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-[var(--border-default)] rounded-xl">
                <FileText className="size-12 text-[var(--text-secondary)] mb-3 opacity-30" />
                <p className="font-semibold text-sm mb-1 text-[var(--text-primary)]">No Active Case Files Found</p>
                <p className="text-xs text-[var(--text-secondary)]">Initialize a new Data Protection Impact Assessment to begin audit logging.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] uppercase tracking-wider font-semibold">
                      <th className="pb-3 pl-2">Case Reference</th>
                      <th className="pb-3">Processing Activity</th>
                      <th className="pb-3">Risk Assessment</th>
                      <th className="pb-3">Workflow State</th>
                      <th className="pb-3">Audit Date</th>
                      <th className="pb-3 text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]/70">
                    {dpiasPager.slice.map((d) => (
                      <tr key={d.id} className="hover:bg-[var(--surface-raised)]/30 transition-colors">
                        <td className="py-4 pl-2 font-mono font-bold text-indigo-400">{d.dpia_ref}</td>
                        <td className="py-4">
                          <div className="font-bold text-sm text-[var(--text-primary)]">{d.title}</div>
                          {d.description && <div className="text-xs text-[var(--text-secondary)] truncate max-w-lg mt-0.5">{d.description}</div>}
                        </td>
                        <td className="py-4">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-bold border border-rose-500/20 bg-rose-500/5 text-rose-400`}>
                            High Score
                          </span>
                        </td>
                        <td className="py-4">
                          <span className={`px-2.5 py-0.5 text-[10px] rounded-full font-bold border ${
                            d.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            d.status === 'under_review' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                            d.status === 'rejected' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                            'bg-slate-500/10 border-slate-500/20 text-slate-400'
                          }`}>
                            {d.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-4 text-[var(--text-secondary)]">{new Date(d.created_at).toLocaleDateString()}</td>
                        <td className="py-4 text-right pr-2">
                          <button
                            onClick={() => loadDpiaIntoBuilder(d.id)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition cursor-pointer inline-flex items-center gap-1 font-semibold"
                          >
                            Investigate <ChevronRight className="size-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TablePager
                  page={dpiasPager.page}
                  pageCount={dpiasPager.pageCount}
                  total={dpiasPager.total}
                  pageSize={dpiasPager.pageSize}
                  onPage={dpiasPager.setPage}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Redesigned Three-Column Case Workspace */
        selectedDpia && (
          <div className="flex flex-col w-full h-full min-h-screen">
            
            {/* Header Area */}
            <div className="bg-[var(--surface-card)] border-b border-[var(--border-default)] px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void handleBackToDashboard()}
                  className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)] transition cursor-pointer"
                  title="Back to Case Registry"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-400">{selectedDpia.dpia_ref}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)]">V{selectedDpia.current_version?.version_number}</span>
                  </div>
                  <h2 className="text-lg font-bold tracking-tight">{selectedDpia.title}</h2>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAnalyzeAI}
                  disabled={isAiLoading}
                  className={`px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    isAiLoading ? 'opacity-50 cursor-not-allowed bg-[var(--surface-raised)]' : 'hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 cursor-pointer'
                  }`}
                >
                  <Sparkles className={`size-3.5 ${isAiLoading ? 'animate-pulse' : 'text-indigo-400'}`} />
                  {isAiLoading ? 'Analyzing...' : 'Vajra AI Analysis'}
                </button>
                <button
                  onClick={handleRunRuleChecks}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--surface-raised)] cursor-pointer"
                >
                  <RefreshCw className="size-3.5" /> Rule Scan
                </button>
                <button
                  onClick={handleRunComplianceEvaluation}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--surface-raised)] cursor-pointer"
                >
                  <BarChart2 className="size-3.5" /> Compliance Audit
                </button>
                {selectedDpia.status === 'approved' && (
                  <button
                    onClick={handleCheckoutNewVersion}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-500 cursor-pointer"
                  >
                    Checkout Iteration
                  </button>
                )}
              </div>
            </div>

            {/* Pinned Case Summary Bar */}
            <div className="bg-[var(--surface-raised)]/50 border-b border-[var(--border-default)] px-8 py-3 grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-11 gap-4 text-[10px] font-semibold text-[var(--text-secondary)]">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Case ID</div>
                <div className="font-mono font-bold text-[var(--text-primary)]">{selectedDpia.dpia_ref}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Workflow Status</div>
                <div className="font-bold text-[var(--text-primary)]">{selectedDpia.status.toUpperCase()}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Case Owner</div>
                <div className="font-bold text-[var(--text-primary)]">Compliance DPO</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Department</div>
                <div className="font-bold text-[var(--text-primary)]">AI & Eng</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Version</div>
                <div className="font-bold text-[var(--text-primary)]">v{selectedDpia.current_version?.version_number}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Inherent Risk</div>
                <div className={`font-bold ${riskStats.inherent?.color || 'text-emerald-400'}`}>{riskStats.inherent?.text || 'Low'}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Residual Risk</div>
                <div className={`font-bold ${riskStats.residual?.color || 'text-emerald-400'}`}>{riskStats.residual?.text || 'Low'}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Compliance %</div>
                <div className="font-bold text-emerald-500">{summary?.compliance_score || 100}%</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Created Date</div>
                <div className="font-bold text-[var(--text-primary)]">{new Date(selectedDpia.created_at).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Updated Date</div>
                <div className="font-bold text-[var(--text-primary)]">{new Date(selectedDpia.updated_at).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Due Date</div>
                <div className="font-bold text-indigo-400">30 Days</div>
              </div>
            </div>

            {/* Three Column Investigation Area */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch min-h-0 overflow-hidden">
              
              {/* Column 1: Left Step Navigation (Span 2) */}
              <div className="lg:col-span-2 bg-[var(--surface-card)] border-r border-[var(--border-default)] p-4.5 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-4.5">
                  <div className="text-xs uppercase font-bold tracking-wider text-[var(--text-tertiary)] pl-2">Investigation Steps</div>
                  
                  <div className="space-y-1.5 relative">
                    {/* Vertical connector line */}
                    <div className="absolute left-[23px] top-5 bottom-5 w-0.5 bg-[var(--border-default)]/60 z-0" />

                    {[
                      { step: 1, key: 'project', label: 'Project Info', effort: '5 min' },
                      { step: 2, key: 'processing', label: 'Processing Profile', effort: '15 min' },
                      { step: 3, key: 'necessity', label: 'Necessity Check', effort: '10 min' },
                      { step: 4, key: 'risks', label: 'Risks & Heatmap', effort: '15 min' },
                      { step: 5, key: 'mitigations', label: 'Mitigations / Controls', effort: '15 min' },
                      { step: 6, key: 'approvals', label: 'Workflow Approvals', effort: '5 min' },
                      { step: 7, key: 'review', label: 'Final Sign-off', effort: '5 min' },
                    ].map((s) => {
                      const isActive = builderStep === s.step;
                      const stepPercentage = selectedDpia.steps.find(st => st.step_key === s.key)?.completion_percentage || 0;
                      const isComplete = stepPercentage === 100 || s.step > 5;
                      
                      return (
                        <button
                          key={s.step}
                          onClick={() => setBuilderStep(s.step)}
                          className={`w-full text-left p-3 rounded-xl flex items-center gap-3.5 transition-colors relative z-10 cursor-pointer ${
                            isActive
                              ? 'bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20 shadow-sm'
                              : 'text-[var(--text-primary)] hover:bg-[var(--surface-raised)]/60 border border-transparent'
                          }`}
                        >
                          <div className={`size-6 rounded-full flex items-center justify-center text-xs shrink-0 font-bold ${
                            isActive ? 'bg-indigo-500 text-white' :
                            isComplete ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)]'
                          }`}>
                            {isComplete ? <Check className="size-3.5" /> : s.step}
                          </div>
                          <div className="min-w-0 grow">
                            <div className="text-xs font-semibold truncate text-[var(--text-primary)]">{s.label}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-[var(--text-secondary)] font-normal">{s.effort}</span>
                              <span className="text-[11px] text-[var(--text-tertiary)] font-normal">•</span>
                              <span className="text-[11px] text-emerald-400 font-semibold">{stepPercentage}%</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Regulation Excerpt Panel */}
                <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] mt-6">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 mb-1.5">
                    <BookOpen className="size-4" /> DPDPA Section 10(2)
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Significant Data Fiduciary shall undertake Data Protection Impact Assessment and Periodic Audits...
                  </p>
                </div>
              </div>

              {/* Column 2: Main Workspace (Span 7) */}
              <div className="lg:col-span-7 p-6 overflow-y-auto space-y-6">
                
                {/* Guided Case Card framework */}
                <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-default)] p-6 shadow-sm space-y-6">
                  
                  {/* Step 1: Project Info */}
                  {builderStep === 1 && (
                    <div className="space-y-6">
                      <div className="border-b border-[var(--border-default)] pb-4">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Step 1</span>
                        <h3 className="text-lg font-bold">Project Information Scope</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Define business rationale, stakeholders, and scoping context.</p>
                      </div>

                      {/* Question Card 1 */}
                      <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/20 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-xs font-bold text-[var(--text-primary)]">Processing Activity Name</div>
                            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Provide a unique operational name for this data flow.</div>
                          </div>
                          <span className="px-1.5 py-0.5 text-[8px] bg-slate-500/10 rounded font-mono text-[var(--text-secondary)] border border-slate-500/20">REQ-PROJ-01</span>
                        </div>
                        
                        <input
                          type="text"
                          value={formAnswers['project_activity_name'] || ''}
                          onChange={(e) => handleSaveAnswer('project', 'activity_name', e.target.value)}
                          placeholder="e.g. Behavioral Profiling AI for Personalised Feeds"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                        />

                        {/* Rationale and reasoning fields */}
                        <div className="space-y-1.5 pt-2 border-t border-[var(--border-default)]/60">
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] flex items-center gap-1">
                            <Compass className="size-3" /> Compliance Justification & Rationale
                          </label>
                          <textarea
                            value={formReasons['project_activity_name'] || ''}
                            onChange={(e) => handleSaveAnswer('project', 'activity_name', formAnswers['project_activity_name'] || '', e.target.value)}
                            placeholder="Provide regulatory justification under DPDPA Chapter II obligations..."
                            rows={2}
                            className="w-full px-3 py-2 text-[11px] rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          />
                        </div>

                        {/* Privacy policy link attachment */}
                        <div className="flex items-center justify-between text-[10px] pt-1">
                          <div className="flex items-center gap-1 text-[var(--text-secondary)] min-w-0">
                            <Link2 className="size-3 shrink-0" />
                            {formPrivacyPolicyUrls['project_activity_name'] ? (
                              <a
                                href={formPrivacyPolicyUrls['project_activity_name']}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:text-indigo-500 truncate flex items-center gap-1"
                                title={formPrivacyPolicyUrls['project_activity_name']}
                              >
                                <span className="truncate">{formPrivacyPolicyUrls['project_activity_name']}</span>
                                <ExternalLink className="size-2.5 shrink-0" />
                              </a>
                            ) : (
                              <span className="italic">No privacy policy link attached</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={openPrivacyPolicyModal}
                            className="text-indigo-400 hover:text-indigo-500 font-semibold shrink-0 ml-2"
                          >
                            {formPrivacyPolicyUrls['project_activity_name'] ? 'Edit Privacy Policy Link' : 'Attach Privacy Policy Link'}
                          </button>
                        </div>
                      </div>

                      {/* Question Card 2 */}
                      <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/20 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-xs font-bold text-[var(--text-primary)]">Business Justification / Processing Purpose</div>
                            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Elaborate on why this processing is required by the business.</div>
                          </div>
                          <span className="px-1.5 py-0.5 text-[8px] bg-slate-500/10 rounded font-mono text-[var(--text-secondary)] border border-slate-500/20">REQ-PROJ-02</span>
                        </div>
                        
                        <textarea
                          value={formAnswers['project_business_purpose'] || ''}
                          onChange={(e) => handleSaveAnswer('project', 'business_purpose', e.target.value)}
                          rows={4}
                          placeholder="Outline operational need, business benefits, and DPDPA lawful grounds map..."
                          className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 2: Processing Profile */}
                  {builderStep === 2 && (
                    <div className="space-y-6">
                      <div className="border-b border-[var(--border-default)] pb-4">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Step 2</span>
                        <h3 className="text-lg font-bold">Processing Profile & Risk Indicators</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Determine specific operational details like children's data and cross-border elements.</p>
                      </div>

                      {/* Grouped guided cards */}
                      <div className="space-y-4">
                        
                        {/* Children data card */}
                        <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/20 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-xs font-bold text-[var(--text-primary)]">Processes data of minors under 18?</div>
                              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Section 9 mandates verifiable parental consent for children.</div>
                            </div>
                            <span className="px-1.5 py-0.5 text-[8px] bg-slate-500/10 rounded font-mono text-[var(--text-secondary)] border border-slate-500/20">DPDPA Sec 9</span>
                          </div>

                          <select
                            value={formAnswers['processing_child_data'] || ''}
                            onChange={(e) => handleSaveAnswer('processing', 'child_data', e.target.value)}
                            className="px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          >
                            <option value="">Select Answer</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>

                          {/* Vajra AI Dynamic context panel */}
                          <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-2.5">
                            <Sparkles className="size-4 text-indigo-400 shrink-0 mt-0.5" />
                            <div className="text-[10px] leading-relaxed">
                              <span className="font-bold text-indigo-400">Vajra AI Assistant:</span> Selecting 'Yes' automatically escalates compliance score checks and triggers verification requirement for verified parental consent.
                            </div>
                          </div>
                        </div>

                        {/* Verified consent flow */}
                        <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/20 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-xs font-bold text-[var(--text-primary)]">Parental Consent Flow Implemented?</div>
                              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Confirm if verified consent mechanisms are present.</div>
                            </div>
                          </div>

                          <select
                            value={formAnswers['processing_parental_consent_flow'] || ''}
                            onChange={(e) => handleSaveAnswer('processing', 'parental_consent_flow', e.target.value)}
                            className="px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          >
                            <option value="">Select Option</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                            <option value="N/A">N/A</option>
                          </select>
                        </div>

                        {/* Cross border data flow */}
                        <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/20 space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-xs font-bold text-[var(--text-primary)]">Transfers data outside territorial boundaries of India?</div>
                              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Analyze boundaries against Whitelisted Territories list.</div>
                            </div>
                          </div>

                          <select
                            value={formAnswers['processing_cross_border'] || ''}
                            onChange={(e) => handleSaveAnswer('processing', 'cross_border', e.target.value)}
                            className="px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          >
                            <option value="">Select Option</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* Step 3: Necessity Check */}
                  {builderStep === 3 && (
                    <div className="space-y-6">
                      <div className="border-b border-[var(--border-default)] pb-4">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Step 3</span>
                        <h3 className="text-lg font-bold">Necessity & Proportionality</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Evaluate data minimization and look for less intrusive processing alternatives.</p>
                      </div>

                      <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/20 space-y-4">
                        <label className="block text-xs font-bold text-[var(--text-primary)]">Is processing limited to the minimum necessary data?</label>
                        <textarea
                          value={formAnswers['necessity_data_minimization'] || ''}
                          onChange={(e) => handleSaveAnswer('necessity', 'data_minimization', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          placeholder="Map individual data elements to active business functions..."
                        />
                      </div>

                      <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/20 space-y-4">
                        <label className="block text-xs font-bold text-[var(--text-primary)]">Are there other less intrusive ways to achieve the same goal?</label>
                        <textarea
                          value={formAnswers['necessity_less_intrusive'] || ''}
                          onChange={(e) => handleSaveAnswer('necessity', 'less_intrusive', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          placeholder="Explain why other methods (anonymisation, pseudonymisation) are not viable..."
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 4: Risks & Heatmap (Redesigned as center piece) */}
                  {builderStep === 4 && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center border-b border-[var(--border-default)] pb-4">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-indigo-400">Step 4</span>
                          <h3 className="text-lg font-bold">Interactive Risk Matrix & Heatmap</h3>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Click cells in the 5x5 matrix below to filter calculated risks.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                        
                        {/* Interactive 5x5 Heatmap Matrix */}
                        <div className="bg-[var(--surface-raised)]/35 p-5 border border-[var(--border-default)] rounded-xl flex flex-col items-center justify-center">
                          <div className="flex items-center justify-between w-full mb-4 px-2">
                            <span className="text-xs font-bold text-[var(--text-secondary)]">5x5 Risk Matrix</span>
                            {(filterLike !== null || filterImp !== null) && (
                              <button
                                onClick={() => {
                                  setFilterLike(null);
                                  setFilterImp(null);
                                }}
                                className="text-[10px] text-indigo-400 hover:text-indigo-500 font-semibold cursor-pointer"
                              >
                                Reset Filter
                              </button>
                            )}
                          </div>

                          <div className="relative w-64 h-64 border-l-2 border-b-2 border-slate-700 flex flex-wrap-reverse">
                            {[5, 4, 3, 2, 1].map((like) => (
                              <div key={like} className="w-full flex h-[20%]">
                                {[1, 2, 3, 4, 5].map((imp) => {
                                  const level = getCellRiskScore(like, imp);
                                  const cellRisks = risks.filter(r => r.likelihood === like && r.impact === imp);
                                  const isSelected = filterLike === like && filterImp === imp;

                                  return (
                                    <button
                                      key={imp}
                                      type="button"
                                      onClick={() => {
                                        setFilterLike(like);
                                        setFilterImp(imp);
                                      }}
                                      className={`w-[20%] border border-slate-800/10 relative flex items-center justify-center transition hover:scale-[1.04] z-10 cursor-pointer ${
                                        level === 'critical' ? 'bg-rose-500/25 hover:bg-rose-500/35' :
                                        level === 'high' ? 'bg-orange-500/20 hover:bg-orange-500/30' :
                                        level === 'medium' ? 'bg-amber-500/15 hover:bg-amber-500/25' :
                                        'bg-emerald-500/10 hover:bg-emerald-500/20'
                                      } ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[var(--surface-card)]' : ''}`}
                                    >
                                      {cellRisks.length > 0 && (
                                        <div className="size-5 rounded-full bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900 text-[10px] font-extrabold flex items-center justify-center shadow-md">
                                          {cellRisks.length}
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>

                          <div className="w-64 flex justify-between text-[9px] text-[var(--text-secondary)] mt-2.5 font-bold">
                            <span>Impact (1-5)</span>
                            <span>Likelihood (1-5)</span>
                          </div>
                        </div>

                        {/* Add Manual Risk Input */}
                        <form onSubmit={handleAddRisk} className="p-4 bg-[var(--surface-raised)]/20 border border-[var(--border-default)] rounded-xl space-y-3">
                          <div className="text-xs font-bold text-[var(--text-primary)]">Add Custom Risk Node</div>
                          
                          <input
                            type="text"
                            placeholder="Risk Title (e.g. Identity Leakage)..."
                            value={riskTitle}
                            onChange={(e) => setRiskTitle(e.target.value)}
                            required
                            className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          />

                          <textarea
                            placeholder="Describe how risk occurs..."
                            value={riskDesc}
                            onChange={(e) => setRiskDesc(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                          />

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">Category</label>
                              <select
                                value={riskCat}
                                onChange={(e) => setRiskCat(e.target.value)}
                                className="w-full px-2 py-1 text-xs rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                              >
                                <option value="security">Security</option>
                                <option value="children_data">Children</option>
                                <option value="cross_border">Cross-Border</option>
                                <option value="ai_profiling">AI/ML</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">Likelihood (1-5)</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                value={riskLike}
                                onChange={(e) => setRiskLike(Number(e.target.value))}
                                className="w-full px-2 py-1 text-xs rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">Impact (1-5)</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                value={riskImp}
                                onChange={(e) => setRiskImp(Number(e.target.value))}
                                className="w-full px-2 py-1 text-xs rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none font-bold"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2 bg-[var(--brand-primary)] text-white font-bold rounded-lg hover:opacity-90 transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
                          >
                            <Plus className="size-4" /> Add Risk Node
                          </button>
                        </form>
                      </div>

                      {/* Display Filtered Risks */}
                      <div className="space-y-3">
                        <div className="text-sm font-bold flex items-center justify-between">
                          <span>Identified Risks</span>
                          {(filterLike !== null || filterImp !== null) && (
                            <span className="text-[10px] text-amber-500 font-semibold">Filtered by cell L:{filterLike} I:{filterImp}</span>
                          )}
                        </div>

                        {risks.length === 0 ? (
                          <div className="p-6 text-center border border-dashed border-[var(--border-default)] rounded-xl text-[var(--text-secondary)]">
                            No risks identified yet. Run rule scan or use input card to declare manual risk nodes.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {risks
                              .filter(r => (filterLike === null || r.likelihood === filterLike) && (filterImp === null || r.impact === filterImp))
                              .map((r) => {
                                const isScoreExpanded = !!expandedRiskScores[r.id];
                                return (
                                  <div key={r.id} className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)]/20 hover:border-[var(--border-strong)] transition-all space-y-3">
                                    <div className="flex justify-between items-start gap-4">
                                      <div>
                                        <div className="font-bold text-xs flex items-center gap-2">
                                          {r.is_auto_escalated && (
                                            <span className="bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded text-[8px] uppercase font-extrabold border border-rose-500/20">Auto Risk</span>
                                          )}
                                          {r.title}
                                        </div>
                                        {r.description && <p className="text-[11px] text-[var(--text-secondary)] mt-1">{r.description}</p>}
                                      </div>
                                      <button
                                        onClick={() => handleRemoveRisk(r.id)}
                                        className="text-rose-400 hover:text-rose-500 text-xs font-semibold cursor-pointer"
                                      >
                                        Archive
                                      </button>
                                    </div>

                                    {/* Risk score tags & explainability toggle */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] pt-2 border-t border-[var(--border-default)]/60">
                                      <div className="flex gap-4">
                                        <span>Inherent: <strong className="text-rose-400">{r.inherent_score}</strong></span>
                                        {r.residual_score !== null && <span>Residual: <strong className="text-emerald-400">{r.residual_score}</strong></span>}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleScoreBreakdown(r.id)}
                                        className="text-indigo-400 hover:text-indigo-500 font-semibold cursor-pointer"
                                      >
                                        {isScoreExpanded ? 'Hide Score Breakdown' : 'View Score Breakdown'}
                                      </button>
                                    </div>

                                    {/* Risk explainability visual graph */}
                                    {isScoreExpanded && (
                                      <div className="p-3 bg-slate-900/10 rounded-lg border border-[var(--border-default)] space-y-2 text-[10px]">
                                        <div className="font-bold text-[var(--text-secondary)]">Risk Score Formula Breakdown</div>
                                        <div className="space-y-1">
                                          <div className="flex justify-between">
                                            <span>Base Matrix Score (Likelihood × Impact)</span>
                                            <span className="font-mono">{r.likelihood * r.impact}</span>
                                          </div>
                                          {r.is_auto_escalated && (
                                            <div className="flex justify-between text-rose-400">
                                              <span>+ Sensitive Data Factor (DPDPA Category)</span>
                                              <span className="font-mono">+12</span>
                                            </div>
                                          )}
                                          {r.controls.length > 0 && (
                                            <div className="flex justify-between text-emerald-400 font-semibold">
                                              <span>- Mitigations Applied ({r.controls.filter(c => c.status === 'active').length} Safeguards verified)</span>
                                              <span className="font-mono">-{r.controls.filter(c => c.status === 'active').reduce((acc, curr) => acc + (curr.library_control?.mitigation_weight || 0.2) * 10, 0)}</span>
                                            </div>
                                          )}
                                          <div className="flex justify-between border-t border-[var(--border-default)] pt-1.5 font-bold">
                                            <span>Residual Risk Score Rollup</span>
                                            <span className="font-mono">{r.residual_score || r.inherent_score}</span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 5: Mitigations */}
                  {builderStep === 5 && (
                    <div className="space-y-6">
                      <div className="border-b border-[var(--border-default)] pb-4">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Step 5</span>
                        <h3 className="text-lg font-bold">Mitigation & Safeguards Mapping</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Map corporate security controls to active risk items and verify safeguards.</p>
                      </div>

                      {risks.length === 0 ? (
                        <div className="p-6 text-center border border-dashed border-[var(--border-default)] rounded-xl text-[var(--text-secondary)]">
                          Configure identified risks in Step 4 before assigning mitigation safeguards.
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {risks.map((r) => (
                            <div key={r.id} className="p-4 border border-[var(--border-default)] rounded-xl bg-[var(--surface-raised)]/20 space-y-4">
                              <div className="flex justify-between items-start border-b border-[var(--border-default)]/60 pb-3">
                                <div>
                                  <div className="text-xs font-bold">{r.title}</div>
                                  <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Inherent Risk: {r.inherent_score} | Residual: {r.residual_score || r.inherent_score}</div>
                                </div>
                                <span className={`px-2 py-0.5 text-[9px] rounded font-bold ${
                                  (r.residual_score || r.inherent_score) < 6 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                }`}>
                                  Risk Level: {getCellRiskScore(r.likelihood, r.impact).toUpperCase()}
                                </span>
                              </div>

                              {/* Safeguard metrics - Inherent vs Residual risk reduction visual */}
                              <div className="flex items-center gap-4 text-xs font-semibold">
                                <div className="grow">
                                  <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-1">
                                    <span>Mitigation Safeguard Progress</span>
                                    <span>{r.controls.filter(c => c.status === 'active').length} of {r.controls.length} Verified</span>
                                  </div>
                                  <div className="w-full bg-[var(--surface-base)] rounded-full h-2 overflow-hidden border border-[var(--border-default)]">
                                    <div
                                      className="bg-emerald-500 h-full transition-all duration-300"
                                      style={{
                                        width: `${r.controls.length ? (r.controls.filter(c => c.status === 'active').length / r.controls.length) * 100 : 0}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Active control mappings */}
                              <div className="space-y-2.5">
                                <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">Mapped Control Safeguards</div>
                                {r.controls.length === 0 ? (
                                  <p className="text-xs text-[var(--text-secondary)] italic">No safeguards linked to this risk node.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {r.controls.map((c) => (
                                      <div key={c.id} className="p-3 border border-[var(--border-default)] rounded-lg bg-[var(--surface-card)] flex justify-between items-center text-xs">
                                        <div>
                                          <div className="font-bold text-xs flex items-center gap-1.5">
                                            <span className="font-mono text-[9px] text-[var(--text-secondary)] px-1 py-0.2 rounded bg-[var(--surface-raised)]">{c.library_control?.control_code}</span>
                                            {c.library_control?.title}
                                          </div>
                                          <div className="text-[10px] text-[var(--text-secondary)] mt-1">
                                            Safeguard Status: <strong className={c.status === 'active' ? 'text-emerald-400' : 'text-amber-500'}>{c.status.toUpperCase()}</strong>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => handleVerifyControl(c.id, c.status)}
                                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                            c.status === 'active'
                                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                              : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-650'
                                          }`}
                                        >
                                          {c.status === 'active' ? 'Verified Safeguard' : 'Verify Control'}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Add Control from Library */}
                              <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-default)]/60">
                                <select
                                  id={`select-ctrl-${r.id}`}
                                  className="px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none grow max-w-sm"
                                >
                                  <option value="">Map Reusable Safeguard Control...</option>
                                  {controlLib.map(lib => (
                                    <option key={lib.id} value={lib.id}>{lib.control_code} - {lib.title}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => {
                                    const selectEl = document.getElementById(`select-ctrl-${r.id}`) as HTMLSelectElement;
                                    if (selectEl && selectEl.value) {
                                      handleAddMitigation(r.id, selectEl.value);
                                      selectEl.value = '';
                                    }
                                  }}
                                  className="px-4 py-2 text-xs bg-[var(--brand-primary)] text-white font-bold rounded-lg hover:opacity-90 cursor-pointer"
                                >
                                  Map
                                </button>
                              </div>

                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 6: Workflow Approvals */}
                  {builderStep === 6 && (
                    <div className="space-y-6">
                      <div className="border-b border-[var(--border-default)] pb-4">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Step 6</span>
                        <h3 className="text-lg font-bold">Stakeholder Decisions & Approvals</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Audit sequence chain mapping business and security sign-offs.</p>
                      </div>

                      {/* Visual approval sequence pipeline */}
                      <div className="flex justify-between items-center bg-[var(--surface-raised)]/20 p-4 rounded-xl border border-[var(--border-default)] mb-4">
                        {approvals.map((a, idx) => (
                          <div key={a.id || idx} className="flex items-center grow last:grow-0">
                            <div className="flex flex-col items-center">
                              <div className={`size-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                a.status === 'approved' ? 'bg-emerald-500 text-white' :
                                a.status === 'rejected' ? 'bg-rose-500 text-white' :
                                a.status === 'pending' ? 'bg-blue-500 text-white' :
                                'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)]'
                              }`}>
                                {a.status === 'approved' ? <Check className="size-3" /> : idx + 1}
                              </div>
                              <span className="text-[8px] uppercase tracking-wider font-bold mt-1 text-[var(--text-secondary)]">{a.role_required.replace('_', ' ')}</span>
                            </div>
                            {idx < approvals.length - 1 && (
                              <div className="grow h-0.5 mx-2 bg-[var(--border-default)]" />
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {approvals.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-[var(--text-secondary)] mb-4">Approval pipeline nodes not initialized.</p>
                          <button
                            onClick={handleSubmitDpia}
                            className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:opacity-90 font-bold text-xs cursor-pointer shadow-md"
                          >
                            Initiate Approval Pipeline
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="font-bold text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Active Sign-off Nodes</div>
                          {approvals.map((a, i) => (
                            <div key={a.id} className="p-4 border border-[var(--border-default)] rounded-xl bg-[var(--surface-raised)]/20 flex justify-between items-center text-xs">
                              <div>
                                <div className="font-bold text-xs">Step {i+1}: {a.role_required.replace('_', ' ').toUpperCase()}</div>
                                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Workflow Status: <strong className="text-indigo-400">{a.status.toUpperCase()}</strong></div>
                                {a.comments && <p className="mt-2 text-[10px] text-[var(--text-secondary)] italic">Reasoning: "{a.comments}"</p>}
                              </div>
                              {a.status === 'pending' && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleProcessApprovalNode(a.id, 'approved')}
                                    className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg font-bold hover:bg-emerald-500/20 transition cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleProcessApprovalNode(a.id, 'rejected')}
                                    className="px-3 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg font-bold hover:bg-rose-500/20 transition cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 7: Final Sign-off */}
                  {builderStep === 7 && (
                    <div className="space-y-6">
                      <div className="border-b border-[var(--border-default)] pb-4">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Step 7</span>
                        <h3 className="text-lg font-bold">DPO Compliance Sign-off & Audit Log</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Verify case integrity, evaluate regulatory scores, and lock final output.</p>
                      </div>
                      
                      <div className="bg-[var(--surface-raised)]/20 p-5 rounded-xl border border-[var(--border-default)] space-y-4">
                        <div className="font-bold text-xs text-[var(--text-primary)]">Pre-submission Compliance Checklist</div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="p-0.5 rounded bg-emerald-500/10 text-emerald-400"><Check className="size-3.5" /></span>
                            <span>All mandatory project descriptor questions filled.</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="p-0.5 rounded bg-emerald-500/10 text-emerald-400"><Check className="size-3.5" /></span>
                            <span>Processing Profile answers fully synchronized.</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="p-0.5 rounded bg-emerald-500/10 text-emerald-400"><Check className="size-3.5" /></span>
                            <span>Necessity and proportionality check completed.</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--border-default)]/60">
                        <button
                          onClick={handleRunComplianceEvaluation}
                          className="px-4 py-2 text-xs rounded-lg border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] font-semibold transition cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <BarChart2 className="size-4" /> Recalculate Compliance Score
                        </button>
                        <button
                          onClick={handleExportPdf}
                          className="px-4 py-2 text-xs rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition cursor-pointer flex items-center gap-1.5"
                        >
                          <FileText className="size-4" /> Download Certified PDF Report
                        </button>
                      </div>
                    </div>
                  )}

                </div>

              </div>

                 {/* Column 3: Context Panel (Span 3) */}
              <div className="lg:col-span-3 bg-[var(--surface-card)] border-l border-[var(--border-default)] flex flex-col min-h-0 overflow-y-auto">
                {/* Tabs for Context Panel */}
                <div className="flex border-b border-[var(--border-default)] shrink-0">
                  {(['profile', 'ai', 'risks', 'comments', 'history'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setContextTab(tab as any)}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center border-b-2 cursor-pointer transition-colors ${
                        contextTab === tab
                          ? 'border-indigo-500 text-indigo-400'
                          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex-1 p-4.5 overflow-y-auto">
                  
                  {/* Profile Tab */}
                  {contextTab === 'profile' && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">Processing Scope Parameters</h4>
                        <div className="p-3.5 rounded-xl bg-[var(--surface-raised)]/30 border border-[var(--border-default)] space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Children's Data:</span>
                            <span className="font-bold text-[var(--text-primary)]">{formAnswers['processing_child_data'] || 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Cross Border Transfers:</span>
                            <span className="font-bold text-[var(--text-primary)]">{formAnswers['processing_cross_border'] || 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Automated AI Profiling:</span>
                            <span className="font-bold text-[var(--text-primary)]">{formAnswers['processing_ai_profiling'] || 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Retention Period:</span>
                            <span className="font-bold text-[var(--text-primary)]">{formAnswers['processing_retention'] || 'Fixed'}</span>
                          </div>
                        </div>
                      </div>

                      {formAnswers['processing_cross_border'] === 'Yes' && (
                        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-600 dark:text-amber-400 space-y-2">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="size-4 shrink-0" />
                            Cross-Border Data Transfer Warning
                          </div>
                          <p className="leading-relaxed text-[var(--text-secondary)]">
                            This processing activity transfers data outside India. Under DPDPA Section 16, you must register a corresponding transfer case and execute a signed Data Processing Agreement (DPA).
                          </p>
                          <div className="pt-1">
                            <a
                              href="/governance/cross-border-transfer"
                              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-600 hover:underline"
                            >
                              Go to Cross-Border Transfers module &rarr;
                            </a>
                          </div>
                        </div>
                      )}

                      {/* PII Scanner Diff/Review UI */}
                      <div className="p-4 rounded-xl border border-[var(--border-default)] space-y-3.5 bg-[var(--surface-card)]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-indigo-400 text-xs">
                            <Sliders className="size-4" /> Data Discovery Scanner
                          </div>
                          <button
                            onClick={handleRunScanner}
                            disabled={isScannerLoading}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${
                              isScannerLoading 
                                ? 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-default)] cursor-not-allowed'
                                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20 cursor-pointer'
                            }`}
                          >
                            {isScannerLoading ? 'Scanning...' : 'Run Full Schema Scan'}
                          </button>
                        </div>

                        {!scannerResults ? (
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            Run a schema scan to identify sensitive fields automatically stored in databases.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <div className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] mb-2 flex items-center justify-between">
                                <span>Newly Discovered Fields</span>
                                <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded">Requires Review</span>
                              </div>
                              <div className="space-y-2">
                                {scannerResults.discovered_fields.map((f: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-xs">
                                    <div className="font-mono text-[var(--text-primary)]">{f.field}</div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[var(--text-secondary)]">{f.category}</span>
                                      <button
                                        onClick={() => handleApproveField(f.field)}
                                        className="text-emerald-400 hover:text-emerald-500 font-bold px-2 py-0.5 rounded border border-emerald-500/30 cursor-pointer"
                                      >
                                        Approve
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <div>
                              <div className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] mb-2">Existing Mapped Fields</div>
                              <div className="space-y-2">
                                {scannerResults.existing_fields.map((f: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] text-xs">
                                    <div className="font-mono text-[var(--text-secondary)]">{f.field}</div>
                                    <span className="text-emerald-400 font-semibold">{f.category}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Assets / Vendors list */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">Mapped Infrastructure Assets</h4>
                        <div className="space-y-2 text-xs">
                          {assets.length === 0 ? (
                            <div className="text-[var(--text-secondary)] italic">No infrastructure assets or vendors mapped yet.</div>
                          ) : (
                            assets.map((asset) => (
                              <div key={asset.id} className="p-3 rounded-xl border border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]/20">
                                <span className="font-mono font-semibold text-indigo-400">{asset.asset_id}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase font-bold">{asset.asset_type.replace('_', ' ')}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Analysis Tab */}
                  {contextTab === 'ai' && (
                    <div className="space-y-4 text-xs">
                      <h4 className="text-sm font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                        <Sparkles className="size-4.5 text-indigo-400" />
                        Vajra AI Governance Analysis
                      </h4>
                      
                      {!aiAnalysis ? (
                        <div className="p-5 rounded-xl border border-dashed border-[var(--border-default)] text-center text-xs text-[var(--text-secondary)] bg-[var(--surface-raised)]/10">
                          Run a Vajra AI Analysis from the header to see dynamic insights against Indian DPDPA regulations.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-4 rounded-xl bg-[var(--surface-raised)]/50 border border-[var(--border-default)] leading-relaxed shadow-sm">
                            <MarkdownRenderer content={aiAnalysis} />
                          </div>
                          
                          {aiRecommendations.length > 0 && (
                            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] space-y-3">
                              <h5 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Automated Recommendations</h5>
                              <ul className="space-y-2.5">
                                {aiRecommendations.map((rec, i) => (
                                  <li key={i} className="flex gap-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                                    <Shield className="size-4 text-indigo-400 shrink-0 mt-0.5" />
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Risks Tab */}
                  {contextTab === 'risks' && (
                    <div className="space-y-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Risk Reduction Summary</h4>
                      
                      {/* Comparison Gauges */}
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="p-3.5 rounded-xl border border-[var(--border-default)] text-center bg-[var(--surface-card)]">
                          <div className="text-xs text-[var(--text-secondary)] mb-1">Max Inherent Risk</div>
                          <div className={`text-base font-bold uppercase ${riskStats.inherent?.color || 'text-emerald-400'}`}>
                            {riskStats.inherent?.text || 'Low'}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl border border-[var(--border-default)] text-center bg-[var(--surface-card)]">
                          <div className="text-xs text-[var(--text-secondary)] mb-1">Max Residual Risk</div>
                          <div className={`text-base font-bold uppercase ${riskStats.residual?.color || 'text-emerald-400'}`}>
                            {riskStats.residual?.text || 'Low'}
                          </div>
                        </div>
                      </div>

                      {/* Risk level list */}
                      <div className="space-y-2.5 text-xs">
                        {risks.map(r => (
                          <div key={r.id} className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)]/20 flex justify-between items-center">
                            <span className="font-semibold text-[var(--text-primary)] truncate max-w-[130px]">{r.title}</span>
                            <span className="font-mono text-xs text-[var(--text-secondary)]">Inherent: {r.inherent_score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discussion Tab */}
                  {contextTab === 'comments' && (
                    <div className="flex flex-col h-full min-h-[300px]">
                      <div className="flex-1 space-y-3.5 max-h-96 overflow-y-auto pr-1">
                        {comments.length === 0 ? (
                          <p className="text-xs text-[var(--text-secondary)] text-center py-8 italic">No comments on this case yet.</p>
                        ) : (
                          comments.map((c) => (
                            <div key={c.id} className="p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)]/35 space-y-2 text-xs">
                              <div className="flex items-center justify-between font-bold text-[var(--text-secondary)]">
                                <span className="flex items-center gap-1.5"><User className="size-4 text-indigo-400" /> Compliance Auditor</span>
                                <span>{new Date(c.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="leading-relaxed text-[var(--text-primary)]">{c.content}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={handleAddCommentText} className="pt-4 border-t border-[var(--border-default)] flex gap-2 shrink-0">
                        <input
                          type="text"
                          placeholder="Type comment..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          className="grow px-3 py-2 text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="p-2 rounded-lg bg-[var(--brand-primary)] text-white hover:opacity-90 transition cursor-pointer flex items-center justify-center"
                        >
                          <Send className="size-4" />
                        </button>
                      </form>
                    </div>
                  )}

                  {/* History / Audit Timeline Tab */}
                  {contextTab === 'history' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Chained Activity Logs</h4>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-lg font-mono">Sec 65B compliant</span>
                      </div>
                      
                      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                        {events.map((e) => (
                          <div key={e.id} className="text-xs border-l-2 border-slate-700 pl-3.5 py-1.5 space-y-1.5">
                            <div className="font-bold flex justify-between text-[var(--text-primary)]">
                              <span>{e.event_type.replace('_', ' ').toUpperCase()}</span>
                              <span className="font-normal text-[var(--text-secondary)]">{new Date(e.created_at).toLocaleDateString()}</span>
                            </div>
                            {e.details && <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{JSON.stringify(e.details)}</p>}
                            
                            {/* Expandable hash details */}
                            <details className="cursor-pointer text-[10px] text-[var(--text-tertiary)] pt-1">
                              <summary className="hover:text-[var(--text-primary)] transition">Security Hash Proof</summary>
                              <div className="mt-1.5 font-mono break-all p-1.5 bg-slate-900/10 border border-[var(--border-default)] rounded-lg text-[10px]">
                                {e.chain_hash}
                              </div>
                            </details>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Privacy Policy Link Modal */}
      {showPrivacyPolicyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button
              type="button"
              onClick={() => setShowPrivacyPolicyModal(false)}
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="size-4" />
            </button>
            <h3 className="text-lg font-bold mb-2 tracking-tight">Attach Privacy Policy Link</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Enter the URL to your organization&apos;s privacy policy. This link is saved with the DPIA assessment for audit evidence.
            </p>

            <form onSubmit={handleSavePrivacyPolicyUrl} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Privacy Policy URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/privacy-policy"
                  value={privacyPolicyUrlInput}
                  onChange={(e) => setPrivacyPolicyUrlInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrivacyPolicyModal(false)}
                  className="flex-1 py-2.5 border border-[var(--border-default)] text-[var(--text-secondary)] font-semibold rounded-lg hover:bg-[var(--surface-raised)] transition cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[var(--brand-primary)] text-white font-bold rounded-lg hover:opacity-90 transition cursor-pointer text-sm shadow-md"
                >
                  Save Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New DPIA Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="size-4" />
            </button>
            <h3 className="text-lg font-bold mb-2 tracking-tight">Initialize Compliance Case</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">Start a new Data Protection Impact Assessment audit profile.</p>
            
            <form onSubmit={handleCreateDpia} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Processing Activity Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aadhaar Verification Service mapping"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Brief Description / Scope</label>
                <textarea
                  placeholder="Scope details..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Audit Template</label>
                <select
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] focus:outline-none"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.key}>{t.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[var(--brand-primary)] text-white font-bold rounded-lg hover:opacity-90 transition cursor-pointer text-sm shadow-md"
              >
                Create and Proceed to Case file
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
    </ConsentManagementGate>
  );
}
