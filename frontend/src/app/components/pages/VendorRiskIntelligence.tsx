import { Plus, AlertTriangle, Check, Building, FileText, Search, X, Shield, Globe, Upload, Activity, Loader2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/app/utils/notify';
import {
  fetchProcessors,
  createProcessor,
  updateProcessor,
  fetchDiscoveredProcessors,
  scanDiscoveredProcessors,
  blockDiscoveredProcessor,
  investigateDiscoveredProcessor,
  fetchVendorDataFlows,
  fetchVendorEvidence,
  linkVendorEvidence,
  triggerVendorAssessment,
  submitVendorAssessment,
  runVendorMonitorCheck
} from '@/lib/api/workspace';
import { listCisoEvidence, createCisoEvidence } from '@/lib/api/ciso';
import type { DataProcessor, DiscoveredProcessor, DpaStatus } from '@/types/workspace';
import type { CisoEvidence } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';
import { TablePager } from '@/app/components/common/TablePager';

const DISCOVERED_PAGE_SIZE = 10;

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');

  const formatText = (text: string) => {
    let currentText = text;
    const regex = /(\*\*.*?\*\*|`.*?`|❌ GAP-\d+.*?|⚠️ GAP-\d+.*?|✅.*?)/g;
    const tokens = currentText.split(regex);

    return tokens.map((token, idx) => {
      if (token.startsWith('**') && token.endsWith('**')) {
        return <strong key={idx} className="font-bold text-[var(--text-primary)]">{token.slice(2, -2)}</strong>;
      }
      if (token.startsWith('`') && token.endsWith('`')) {
        return <code key={idx} className="font-mono text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded text-xs">{token.slice(1, -1)}</code>;
      }
      if (token.includes('❌') || token.includes('⚠️') || token.includes('✅')) {
        return <span key={idx} className="font-bold">{token}</span>;
      }
      return token;
    });
  };

  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-base font-bold text-[var(--text-primary)] mt-3 border-b border-[var(--border-default)] pb-1 flex items-center gap-1.5">
              {formatText(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith('#### ')) {
          return (
            <h4 key={idx} className="text-sm font-bold text-[var(--text-primary)] mt-2.5">
              {formatText(trimmed.slice(5))}
            </h4>
          );
        }

        if (trimmed === '---') {
          return <hr key={idx} className="border-[var(--border-default)] my-3" />;
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex gap-2 pl-2 text-sm text-[var(--text-secondary)] leading-relaxed mt-1">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
              <span className="break-words w-full">{formatText(trimmed.slice(2))}</span>
            </div>
          );
        }

        if (/^\d+\./.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+/);
          const num = match ? match[1] : '1';
          const contentStr = trimmed.replace(/^\d+\.\s+/, '');
          return (
            <div key={idx} className="flex gap-2 pl-2 text-sm text-[var(--text-secondary)] leading-relaxed mt-1">
              <span className="text-indigo-400 font-bold shrink-0">{num}.</span>
              <span className="break-words w-full">{formatText(contentStr)}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="text-sm text-[var(--text-secondary)] leading-relaxed break-words">
            {formatText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Continuous vendor risk scoring, DPA tracking, and security posture monitoring.
 */
export function VendorRiskIntelligence(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const [vendors, setVendors] = useState<DataProcessor[]>([]);
  const [discoveredVendors, setDiscoveredVendors] = useState<DiscoveredProcessor[]>([]);
  const [discoveredPage, setDiscoveredPage] = useState(0);
  const [cisoEvidence, setCisoEvidence] = useState<CisoEvidence[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showStatsDetail, setShowStatsDetail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Add Vendor Form State
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorCategory, setNewVendorCategory] = useState('');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [newVendorPurpose, setNewVendorPurpose] = useState('');
  const [newVendorDpaStatus, setNewVendorDpaStatus] = useState<DpaStatus>('none');
  const [newVendorLocation, setNewVendorLocation] = useState('');
  const [newVendorEncryption, setNewVendorEncryption] = useState('');
  const [newVendorCertifications, setNewVendorCertifications] = useState<string[]>([]);

  // Details Modal Sub-state
  const [activeTab, setActiveTab] = useState<'overview' | 'dataflows' | 'assessments' | 'evidence'>('overview');
  const [dataFlows, setDataFlows] = useState<Array<{ activity_ref: string; title: string; recipient_type: string; data_shared: string }>>([]);
  const [linkedEvidence, setLinkedEvidence] = useState<any[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Assessment Form State
  const [assessSoc2, setAssessSoc2] = useState(false);
  const [assessIso, setAssessIso] = useState(false);
  const [assessEncryption, setAssessEncryption] = useState(false);
  const [assessIndia, setAssessIndia] = useState(false);
  const [assessDeletion, setAssessDeletion] = useState(false);

  // Evidence Link State
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
  const [showNewEvidenceForm, setShowNewEvidenceForm] = useState(false);
  const [newEvidenceName, setNewEvidenceName] = useState('');
  const [newEvidenceFileName, setNewEvidenceFileName] = useState('');

  // Discovered investigation detail
  const [investigationReport, setInvestigationReport] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const vList = await fetchProcessors(orgId);
      const dList = await fetchDiscoveredProcessors(orgId);
      const eList = await listCisoEvidence(orgId);
      setVendors(vList);
      setDiscoveredVendors(dList);
      setCisoEvidence(eList);
    } catch (err) {
      notify('Failed to load vendor risk data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const selectedVendor = vendors.find(v => v.id === selectedVendorId) || null;

  // Load details when active vendor changes
  useEffect(() => {
    if (selectedVendor) {
      setIsDetailLoading(true);
      Promise.all([
        fetchVendorDataFlows(selectedVendor.id),
        fetchVendorEvidence(selectedVendor.id)
      ])
        .then(([flows, evidence]) => {
          setDataFlows(flows);
          setLinkedEvidence(evidence);
          // Set initial assessment checks based on vendor certifications
          setAssessSoc2(selectedVendor.certifications?.includes('SOC 2 Type II') ?? false);
          setAssessIso(selectedVendor.certifications?.includes('ISO 27001') ?? false);
          setAssessEncryption(selectedVendor.encryption?.includes('AES') ?? false);
          setAssessIndia(selectedVendor.location?.toLowerCase().includes('india') ?? false);
          setAssessDeletion(selectedVendor.assessment_status === 'completed');
        })
        .catch(() => {
          notify('Failed to load vendor details.');
        })
        .finally(() => {
          setIsDetailLoading(false);
        });
    }
  }, [selectedVendorId, selectedVendor]);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName || !newVendorCategory || !newVendorPurpose) {
      notify('Please fill out all required fields marked with *');
      return;
    }

    try {
      setIsActionLoading(true);
      await createProcessor({
        name: newVendorName,
        category: newVendorCategory,
        purpose: newVendorPurpose,
        contact_email: newVendorContact || null,
        dpa_status: newVendorDpaStatus,
        location: newVendorLocation || null,
        encryption: newVendorEncryption || null,
        certifications: newVendorCertifications,
      }, orgId);
      notify('Vendor registered successfully! Automated scoring and tiering completed.');
      setShowAddVendorModal(false);
      // Reset form
      setNewVendorName('');
      setNewVendorCategory('');
      setNewVendorContact('');
      setNewVendorPurpose('');
      setNewVendorDpaStatus('none');
      setNewVendorLocation('');
      setNewVendorEncryption('');
      setNewVendorCertifications([]);
      loadData();
    } catch {
      notify('Failed to register vendor.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateDpa = async (statusVal: DpaStatus) => {
    if (!selectedVendor) return;
    try {
      setIsActionLoading(true);
      await updateProcessor(selectedVendor.id, {
        dpa_status: statusVal,
        dpa_signed_date: statusVal === 'signed' ? new Date().toISOString().split('T')[0] : null
      }, orgId);
      notify(`DPA status updated to ${statusVal}. Recalculating scores and updating risk register...`);
      // Reload lists
      const updatedList = await fetchProcessors(orgId);
      setVendors(updatedList);
    } catch {
      notify('Failed to update DPA status.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleTriggerAssessment = async () => {
    if (!selectedVendor) return;
    try {
      setIsActionLoading(true);
      await triggerVendorAssessment(selectedVendor.id, orgId);
      notify('Assessment questionnaire dispatched to vendor contact.');
      // Refresh
      const updatedList = await fetchProcessors(orgId);
      setVendors(updatedList);
    } catch {
      notify('Failed to trigger assessment.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSubmitAssessment = async () => {
    if (!selectedVendor) return;
    try {
      setIsActionLoading(true);
      const res = await submitVendorAssessment(selectedVendor.id, {
        soc2_audited: assessSoc2,
        iso_certified: assessIso,
        data_encryption: assessEncryption,
        india_hosting: assessIndia,
        data_deletion: assessDeletion
      });
      notify(`Assessment submitted! New Security Score: ${res.security_score}/100, Tier: ${res.tier}`);
      const updatedList = await fetchProcessors(orgId);
      setVendors(updatedList);
    } catch {
      notify('Failed to submit assessment.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLinkEvidence = async () => {
    if (!selectedVendor || !selectedEvidenceId) return;
    try {
      setIsActionLoading(true);
      await linkVendorEvidence(selectedVendor.id, selectedEvidenceId);
      notify('Evidence linked successfully.');
      const evidence = await fetchVendorEvidence(selectedVendor.id);
      setLinkedEvidence(evidence);
      setSelectedEvidenceId('');
    } catch {
      notify('Failed to link evidence.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateAndLinkEvidence = async () => {
    if (!selectedVendor || !newEvidenceName || !newEvidenceFileName) {
      notify('Please fill out name and filename.');
      return;
    }
    try {
      setIsActionLoading(true);
      const fd = new FormData();
      fd.append('name', newEvidenceName);
      const mockFile = new File(['mock content'], newEvidenceFileName, { type: 'application/pdf' });
      fd.append('file', mockFile);
      const ev = await createCisoEvidence(fd, orgId);
      await linkVendorEvidence(selectedVendor.id, ev.id);
      notify('Evidence uploaded and linked successfully.');
      
      const evidenceList = await fetchVendorEvidence(selectedVendor.id);
      const cisoList = await listCisoEvidence(orgId);
      setLinkedEvidence(evidenceList);
      setCisoEvidence(cisoList);
      
      setShowNewEvidenceForm(false);
      setNewEvidenceName('');
      setNewEvidenceFileName('');
    } catch {
      notify('Failed to upload evidence.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRunMonitor = async () => {
    if (!selectedVendor) return;
    try {
      setIsActionLoading(true);
      const res = await runVendorMonitorCheck(selectedVendor.id);
      notify(`Continuous monitor check passed! Domain status: ${res.monitoring_status.toUpperCase()}`);
      const updatedList = await fetchProcessors(orgId);
      setVendors(updatedList);
    } catch {
      notify('Failed to run monitoring scan.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleScanDiscovered = async () => {
    try {
      setIsActionLoading(true);
      const res = await scanDiscoveredProcessors(orgId);
      setDiscoveredVendors(res);
      notify('Shield AI scanned API logs and OAuth gateways. Discovered new shadow IT entries.');
    } catch {
      notify('Failed to scan for discovered vendors.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleInvestigateDiscovered = async (name: string) => {
    try {
      setIsActionLoading(true);
      const res = await investigateDiscoveredProcessor(name, orgId);
      setInvestigationReport(res.report);
    } catch {
      notify('Investigation failed.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleBlockDiscovered = async (name: string) => {
    try {
      setIsActionLoading(true);
      await blockDiscoveredProcessor(name, orgId);
      notify(`Domain tracker for ${name} has been blocked successfully.`);
      const res = await fetchDiscoveredProcessors(orgId);
      setDiscoveredVendors(res);
    } catch {
      notify('Failed to block tracker.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePrefillAddVendor = (name: string, category: string) => {
    setNewVendorName(name);
    setNewVendorCategory(category);
    setShowAddVendorModal(true);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'var(--status-success)';
    if (score >= 60) return 'var(--status-warning)';
    return 'var(--status-danger)';
  };

  const getLogoEmoji = (category: string) => {
    const c = category.toLowerCase();
    if (c.includes('crm')) return '🏢';
    if (c.includes('infra') || c.includes('cloud')) return '☁️';
    if (c.includes('logistics') || c.includes('ship')) return '📦';
    if (c.includes('support') || c.includes('call')) return '📞';
    if (c.includes('email')) return '✉️';
    if (c.includes('sms') || c.includes('whatsapp') || c.includes('chat')) return '💬';
    if (c.includes('analytics') || c.includes('report') || c.includes('plot')) return '📊';
    return '🏢';
  };

  // Stats
  const totalVendors = vendors.length;
  const dpasSigned = vendors.filter(v => v.dpa_status === 'signed').length;
  const dpaPercent = totalVendors > 0 ? Math.round((dpasSigned / totalVendors) * 100) : 0;
  const highRiskCount = vendors.filter(v => v.security_score < 60).length;
  const avgSecurityScore = totalVendors > 0 ? Math.round(vendors.reduce((acc, v) => acc + v.security_score, 0) / totalVendors) : 0;
  const unmanagedCount = discoveredVendors.length;
  const discoveredPageCount = Math.max(1, Math.ceil(discoveredVendors.length / DISCOVERED_PAGE_SIZE));
  const paginatedDiscoveredVendors = useMemo(
    () =>
      discoveredVendors.slice(
        discoveredPage * DISCOVERED_PAGE_SIZE,
        discoveredPage * DISCOVERED_PAGE_SIZE + DISCOVERED_PAGE_SIZE,
      ),
    [discoveredVendors, discoveredPage],
  );

  useEffect(() => {
    setDiscoveredPage(0);
  }, [discoveredVendors]);

  useEffect(() => {
    if (discoveredPage >= discoveredPageCount) {
      setDiscoveredPage(Math.max(0, discoveredPageCount - 1));
    }
  }, [discoveredPage, discoveredPageCount]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[var(--brand-primary)] animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading Vendor Risk Intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-[var(--surface-base)]" >
      <div className="max-w-[1280px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="mb-2">Vendor Risk Intelligence</h1>
              <p className="text-sm text-[var(--text-secondary)]" >
                Continuous risk scoring, DPA tracking, and security posture monitoring for all third-party data processors
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAddVendorModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors hover:bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Add Vendor
              </button>
              <button
                onClick={handleScanDiscovered}
                disabled={isActionLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90 bg-gradient-to-r from-[var(--status-ai)] to-[var(--brand-primary)] disabled:opacity-50"
                style={{background: 'linear-gradient(90deg, var(--status-ai), var(--brand-primary))'}}
              >
                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" strokeWidth={1.5} />}
                Auto-discover from API logs
              </button>
            </div>
          </div>
        </div>

        {/* Hero Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div
            onClick={() => setShowStatsDetail('total')}
            className="p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow bg-[var(--surface-card)] border-[var(--border-default)]"
          >
            <div className="text-2xl font-semibold mb-1 text-[var(--text-primary)]" >{totalVendors}</div>
            <div className="text-sm text-[var(--text-secondary)]" >Total vendors</div>
          </div>
          <div
            onClick={() => setShowStatsDetail('dpas-signed')}
            className="p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow bg-[var(--surface-card)] border-[var(--border-default)]"
          >
            <div className="flex items-baseline gap-1 mb-1">
              <div className="text-2xl font-semibold text-[var(--status-success)]" >{dpasSigned}</div>
              <div className="text-sm text-[var(--text-secondary)]" >({dpaPercent}%)</div>
            </div>
            <div className="text-sm text-[var(--text-secondary)]" >DPAs signed</div>
          </div>
          <div
            onClick={() => setShowStatsDetail('high-risk')}
            className="p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow bg-[var(--surface-card)] border-[var(--border-default)]"
          >
            <div className="text-2xl font-semibold mb-1 text-[var(--status-danger)]" >{highRiskCount}</div>
            <div className="text-sm text-[var(--text-secondary)]" >High risk</div>
          </div>
          <div
            onClick={() => setShowStatsDetail('avg-score')}
            className="p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow bg-[var(--surface-card)] border-[var(--border-default)]"
          >
            <div className="text-2xl font-semibold mb-1 text-[var(--text-primary)]" >{avgSecurityScore}</div>
            <div className="text-sm text-[var(--text-secondary)]" >Average security score</div>
          </div>
          <div
            onClick={() => setShowStatsDetail('discovered')}
            className="p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow bg-[var(--surface-card)] border-[var(--border-default)]"
          >
            <div className="text-2xl font-semibold mb-1 text-[var(--status-warning)]" >{unmanagedCount}</div>
          </div>
        </div>

        {/* Vendor Table */}
        <div className="mb-6">
          <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-default)' }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-raised)', borderBottom: '1px solid var(--border-default)' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Vendor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Tier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Data Shared</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Risk Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >DPA Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Last Audit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Monitoring</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]" >Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr
                      key={vendor.id}
                      className="cursor-pointer hover:bg-[var(--surface-raised)] transition-colors border-b border-[var(--border-default)]"
                      onClick={() => {
                        setSelectedVendorId(vendor.id);
                        setActiveTab('overview');
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded flex items-center justify-center text-lg" style={{ backgroundColor: 'var(--surface-raised)' }}>
                            {vendor.logo || getLogoEmoji(vendor.category)}
                          </div>
                          <span className="text-sm font-medium text-[var(--text-primary)]" >{vendor.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          vendor.tier?.includes('1') ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]' :
                          vendor.tier?.includes('2') ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]' :
                          'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                        }`}>
                          {vendor.tier ?? 'Tier 3'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--text-secondary)]" >{vendor.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--text-secondary)]" >{vendor.purpose || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-semibold" style={{ color: getScoreColor(vendor.security_score) }}>
                            {vendor.security_score}
                          </div>
                          <div className="w-20">
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-raised)' }}>
                              <div
                                className="h-full rounded-full"
                                style={{width: `${vendor.security_score}%`, backgroundColor: getScoreColor(vendor.security_score)}}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {vendor.dpa_status === 'signed' ? (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Check className="w-4 h-4 text-[var(--status-success)]"  strokeWidth={2} />
                              <span className="text-sm font-medium text-[var(--status-success)]" >Signed</span>
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)]" >Renewed {vendor.dpa_signed_date || 'recently'}</div>
                          </div>
                        ) : vendor.dpa_status === 'expired' ? (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]"  strokeWidth={2} />
                              <span className="text-sm font-medium text-[var(--status-warning)]" >Expired</span>
                            </div>
                          </div>
                        ) : vendor.dpa_status === 'under_review' ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-[var(--status-info-bg)] text-[var(--status-info)]">Under review</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-[var(--status-danger)]"  strokeWidth={2} />
                            <span className="text-sm font-medium text-[var(--status-danger)]" >No DPA</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--text-secondary)]" >{vendor.last_audit_date || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${vendor.monitoring === 'Continuous' ? 'text-[var(--status-success)]' : 'text-[var(--text-secondary)]'}`}>
                          {vendor.monitoring ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="px-3 py-1.5 rounded text-sm font-medium text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)]">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Auto-Discovery */}
        <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-default)' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="mb-1">Auto-discovered Shadow IT Vendors</h3>
              <p className="text-sm text-[var(--text-secondary)]" >
                Third-party processors detected from API gateway routing logs, OAuth integrations, and crawler scripts
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {paginatedDiscoveredVendors.map((vendor) => (
              <div key={vendor.name} className="flex items-center justify-between p-3 rounded" style={{ backgroundColor: 'var(--surface-raised)' }}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Building className="w-4 h-4 text-[var(--text-tertiary)]"  strokeWidth={1.5} />
                    <span className="text-sm font-medium text-[var(--text-primary)]" >{vendor.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium bg-[var(--border-default)] text-[var(--text-secondary)]`}>
                      {vendor.category || 'Other'}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]" >Detected from {vendor.source}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleInvestigateDiscovered(vendor.name)}
                    className="px-3 py-1.5 rounded text-sm font-medium border transition-colors hover:bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    Investigate
                  </button>
                  <button
                    onClick={() => handlePrefillAddVendor(vendor.name, vendor.category || 'Other')}
                    className="px-3 py-1.5 rounded text-sm font-medium text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)]"
                  >
                    Add to registry
                  </button>
                  <button
                    onClick={() => handleBlockDiscovered(vendor.name)}
                    className="px-3 py-1.5 rounded text-sm font-medium border transition-colors hover:bg-[var(--surface-raised)] text-[var(--status-danger)] border-[var(--border-default)]"
                  >
                    Block
                  </button>
                </div>
              </div>
            ))}
          </div>
          {discoveredVendors.length > DISCOVERED_PAGE_SIZE ? (
            <div className="mt-4 -mx-6 -mb-6">
              <TablePager
                page={discoveredPage}
                pageCount={discoveredPageCount}
                total={discoveredVendors.length}
                pageSize={DISCOVERED_PAGE_SIZE}
                onPage={setDiscoveredPage}
              />
            </div>
          ) : null}
        </div>

        {/* Vendor Details Modal */}
        {selectedVendorId && selectedVendor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--surface-card)] rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-[var(--border-default)] text-[var(--text-primary)]">
              {/* Modal Header */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-default)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded flex items-center justify-center text-2xl bg-[var(--surface-raised)]">
                    {selectedVendor.logo || getLogoEmoji(selectedVendor.category)}
                  </div>
                  <div>
                    <h2 className="font-semibold text-[var(--text-primary)]">{selectedVendor.name}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">{selectedVendor.category}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        selectedVendor.tier?.includes('1') ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]' :
                        selectedVendor.tier?.includes('2') ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]' :
                        'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                      }`}>
                        {selectedVendor.tier ?? 'Tier 3'}
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedVendorId(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <X className="size-5" />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="flex border-b border-[var(--border-default)] bg-[var(--surface-raised)] px-6">
                {(['overview', 'dataflows', 'assessments', 'evidence'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                      activeTab === tab
                        ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab === 'dataflows' ? 'Data Flows (RoPA)' : tab}
                  </button>
                ))}
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6 min-h-[350px]">
                {isDetailLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-primary)]" />
                    <p className="text-sm text-[var(--text-secondary)]">Loading details...</p>
                  </div>
                ) : (
                  <>
                    {/* Tab: Overview */}
                    {activeTab === 'overview' && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Security Score</label>
                            <div className="flex items-center gap-3">
                              <span className="text-3xl font-bold" style={{ color: getScoreColor(selectedVendor.security_score) }}>
                                {selectedVendor.security_score}/100
                              </span>
                              <div className="flex-1 h-3 bg-[var(--surface-raised)] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${selectedVendor.security_score}%`, backgroundColor: getScoreColor(selectedVendor.security_score) }} />
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Encryption Protocol</label>
                            <span className="text-base font-medium text-[var(--text-primary)] block">
                              {selectedVendor.encryption || 'No encryption policy specified'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 border-t border-[var(--border-default)] pt-4">
                          <div>
                            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Continuous Monitoring</label>
                            <div className="flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full bg-[var(--status-success)] ${
                                selectedVendor.monitoring_status === 'alert' ? 'bg-[var(--status-danger)]' :
                                selectedVendor.monitoring_status === 'warning' ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-success)]'
                              }`} />
                              <span className="capitalize font-medium">{selectedVendor.monitoring_status}</span>
                              <span className="text-xs text-[var(--text-tertiary)]">
                                (Last check: {selectedVendor.last_monitored_at ? new Date(selectedVendor.last_monitored_at).toLocaleTimeString() : 'Never'})
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Data Hosting Location</label>
                            <div className="flex items-center gap-1.5">
                              <Globe className="w-4 h-4 text-[var(--text-tertiary)]" />
                              <span className="font-medium">{selectedVendor.location || 'Unknown'}</span>
                            </div>
                          </div>
                        </div>

                        {selectedVendor.monitoring_details && Object.keys(selectedVendor.monitoring_details).length > 0 && (
                          <div className="p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)]">
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 text-[var(--text-secondary)]">Automated Scanner Details</h4>
                            <div className="grid grid-cols-3 gap-2 text-sm text-[var(--text-primary)]">
                              <div>SSL Certificate: <span className="text-[var(--status-success)] font-medium">✔ Valid</span></div>
                              <div>DNS check: <span className="text-[var(--status-success)] font-medium">✔ Secure</span></div>
                              <div>Scan latency: <span className="font-medium">120ms</span></div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={handleRunMonitor}
                            disabled={isActionLoading}
                            className="px-4 py-2 text-sm font-medium border border-[var(--border-strong)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)] flex items-center gap-1.5"
                          >
                            {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <Activity className="w-4 h-4" />
                            Run Continuous Scan
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab: Data Flows */}
                    {activeTab === 'dataflows' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-base font-semibold mb-1">RoPA / Data-flow Mapping</h3>
                          <p className="text-xs text-[var(--text-secondary)]">
                            India DPDPA compliance ledger tracing processing activities exchanging personal data with this processor
                          </p>
                        </div>
                        {dataFlows.length === 0 ? (
                          <div className="p-8 text-center text-[var(--text-tertiary)] border border-dashed rounded-lg">
                            No active data-flow mappings found for this vendor. Link this processor in the RoPA registry.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {dataFlows.map((flow) => (
                              <div key={flow.activity_ref} className="p-3 border rounded-lg bg-[var(--surface-raised)] flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-sm text-[var(--text-primary)]">{flow.title}</div>
                                  <div className="text-xs text-[var(--text-tertiary)]">Reference: {flow.activity_ref} | Category: {flow.recipient_type}</div>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-medium bg-[var(--surface-card)] border px-2 py-1 rounded">
                                    {flow.data_shared}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: Assessments */}
                    {activeTab === 'assessments' && (
                      <div className="space-y-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-base font-semibold mb-1">Security Questionnaire & Assessments</h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Validate compliance assertions and complete security audits to automatically update vendor score
                            </p>
                          </div>
                          <div>
                            <span className={`text-xs px-2 py-1 rounded font-medium ${
                              selectedVendor.assessment_status === 'completed' ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' :
                              selectedVendor.assessment_status === 'sent' ? 'bg-[var(--status-info-bg)] text-[var(--status-info)]' :
                              'bg-[var(--border-default)] text-[var(--text-secondary)]'
                            }`}>
                              Assessment: {(selectedVendor.assessment_status ?? 'not_started').replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4 border rounded-lg p-4 bg-[var(--surface-card)]">
                          <h4 className="text-sm font-semibold mb-3">Auditor Compliance Checklists</h4>
                          
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={assessSoc2} onChange={(e) => setAssessSoc2(e.target.checked)} className="rounded text-[var(--brand-primary)] border-[var(--border-strong)] focus:ring-[var(--brand-primary)] size-4" />
                            <div>
                              <span className="text-sm font-medium">Vendor is SOC 2 Type II audited</span>
                              <p className="text-xs text-[var(--text-secondary)]">Confirms security controls validation over a 6-month observation window</p>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={assessIso} onChange={(e) => setAssessIso(e.target.checked)} className="rounded text-[var(--brand-primary)] border-[var(--border-strong)] focus:ring-[var(--brand-primary)] size-4" />
                            <div>
                              <span className="text-sm font-medium">Vendor is ISO/IEC 27001 certified</span>
                              <p className="text-xs text-[var(--text-secondary)]">Certified Information Security Management System (ISMS)</p>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={assessEncryption} onChange={(e) => setAssessEncryption(e.target.checked)} className="rounded text-[var(--brand-primary)] border-[var(--border-strong)] focus:ring-[var(--brand-primary)] size-4" />
                            <div>
                              <span className="text-sm font-medium">Enforces end-to-end transport and storage encryption</span>
                              <p className="text-xs text-[var(--text-secondary)]">TLS 1.3 for in-transit and AES-256 for resting database partitions</p>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={assessIndia} onChange={(e) => setAssessIndia(e.target.checked)} className="rounded text-[var(--brand-primary)] border-[var(--border-strong)] focus:ring-[var(--brand-primary)] size-4" />
                            <div>
                              <span className="text-sm font-medium">Customer data is hosted locally in India</span>
                              <p className="text-xs text-[var(--text-secondary)]">Complies with localized storage requirements and adequacy guidelines</p>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={assessDeletion} onChange={(e) => setAssessDeletion(e.target.checked)} className="rounded text-[var(--brand-primary)] border-[var(--border-strong)] focus:ring-[var(--brand-primary)] size-4" />
                            <div>
                              <span className="text-sm font-medium">Enforces data deletion SLAs matching DPDPA retention limits</span>
                              <p className="text-xs text-[var(--text-secondary)]">Data is permanently expunged when purpose of collection is completed</p>
                            </div>
                          </label>

                          <div className="flex gap-2 pt-2 border-t border-[var(--border-default)]">
                            <button
                              onClick={handleSubmitAssessment}
                              disabled={isActionLoading}
                              className="px-4 py-2 text-sm font-medium text-white rounded bg-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Submit Security Questionnaire
                            </button>
                            <button
                              onClick={handleTriggerAssessment}
                              disabled={isActionLoading}
                              className="px-4 py-2 text-sm font-medium border border-[var(--border-strong)] rounded hover:bg-[var(--surface-raised)] text-[var(--text-primary)]"
                            >
                              Dispatch Vendor Audit Questionnaire
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab: Evidence */}
                    {activeTab === 'evidence' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-semibold mb-1">Evidence Management</h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Link SOC 2 reports, certificates, or DPA contracts directly from the central CISO evidence vault
                            </p>
                          </div>
                          <button
                            onClick={() => setShowNewEvidenceForm(!showNewEvidenceForm)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium border hover:bg-[var(--surface-raised)] border-[var(--border-default)]"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Upload & Link New Evidence
                          </button>
                        </div>

                        {showNewEvidenceForm && (
                          <div className="p-4 border rounded bg-[var(--surface-raised)] space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider">New Audit Document</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold mb-1">Document Name *</label>
                                <input type="text" placeholder="e.g., Salesforce SOC 2 Type II" value={newEvidenceName} onChange={(e) => setNewEvidenceName(e.target.value)} className="w-full text-sm border bg-[var(--surface-card)] rounded px-3 py-2" />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold mb-1">File Name *</label>
                                <input type="text" placeholder="salesforce_soc2_2026.pdf" value={newEvidenceFileName} onChange={(e) => setNewEvidenceFileName(e.target.value)} className="w-full text-sm border bg-[var(--surface-card)] rounded px-3 py-2" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={handleCreateAndLinkEvidence} disabled={isActionLoading} className="px-3 py-1.5 bg-[var(--brand-primary)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50">
                                Save Document
                              </button>
                              <button onClick={() => setShowNewEvidenceForm(false)} className="px-3 py-1.5 border text-sm rounded hover:bg-neutral-100">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Link existing dropdown */}
                        <div className="flex gap-3 items-end p-4 border rounded bg-[var(--surface-raised)]">
                          <div className="flex-1">
                            <label className="block text-xs font-semibold mb-1">Link existing Central CISO Evidence</label>
                            <select
                              value={selectedEvidenceId}
                              onChange={(e) => setSelectedEvidenceId(e.target.value)}
                              className="w-full border bg-[var(--surface-card)] text-sm rounded px-3 py-2"
                            >
                              <option value="">Select CISO evidence file...</option>
                              {cisoEvidence.map((ev) => (
                                <option key={ev.id} value={ev.id}>{ev.name} ({ev.file_name})</option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={handleLinkEvidence}
                            disabled={!selectedEvidenceId || isActionLoading}
                            className="px-4 py-2 bg-[var(--brand-primary)] text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50"
                          >
                            Link Document
                          </button>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold">Linked Audit Evidence</h4>
                          {linkedEvidence.length === 0 ? (
                            <div className="p-6 text-center text-[var(--text-tertiary)] border border-dashed rounded-lg">
                              No evidence documents linked. Link certificates or contracts to satisfy GRC controls.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {linkedEvidence.map((ev) => (
                                <div key={ev.id} className="p-3 border rounded-lg bg-[var(--surface-card)] flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-[var(--brand-primary)]" />
                                    <div>
                                      <div className="font-medium text-sm">{ev.name}</div>
                                      <div className="text-xs text-[var(--text-secondary)]">{ev.file_name}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {ev.is_verified ? (
                                      <span className="text-xs font-medium text-[var(--status-success)] bg-[var(--status-success-bg)] px-2 py-0.5 rounded">
                                        Verified
                                      </span>
                                    ) : (
                                      <span className="text-xs font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] px-2 py-0.5 rounded">
                                        Pending
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal Footer DPA Action Controls */}
              <div className="px-6 py-4 border-t border-[var(--border-default)] flex items-center gap-3">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">DPA Actions:</span>
                {selectedVendor.dpa_status === 'signed' ? (
                  <button
                    onClick={() => handleUpdateDpa('expired')}
                    disabled={isActionLoading}
                    className="px-3 py-1.5 text-xs font-semibold border border-[var(--status-warning)] text-[var(--status-warning)] rounded hover:bg-[var(--status-warning-bg)] disabled:opacity-50"
                  >
                    Mark DPA Expired
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleUpdateDpa('signed')}
                      disabled={isActionLoading}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--status-success)] rounded hover:opacity-90 disabled:opacity-50"
                    >
                      Verify Signed DPA
                    </button>
                    <button
                      onClick={() => handleUpdateDpa('under_review')}
                      disabled={isActionLoading}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--status-info)] rounded hover:opacity-90 disabled:opacity-50"
                    >
                      Put DPA Under Legal Review
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Investigation Report Modal */}
        {investigationReport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-2xl w-full">
              <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[var(--brand-primary)]" />
                  Shield AI Vendor Profiler
                </h3>
                <button onClick={() => setInvestigationReport(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-[var(--surface-raised)] p-5 rounded-md border border-[var(--border-default)] w-full overflow-y-auto max-h-[60vh]">
                  <MarkdownRenderer content={investigationReport} />
                </div>
                <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)]/30 rounded-lg p-3 text-xs">
                  <strong>Shield AI:</strong> Audited domain registers. Verified compliance records matches standard checklists.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Detail Modal */}
        {showStatsDetail && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-[var(--surface-card)] border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
                <h2 className="font-semibold text-[var(--text-primary)]">
                  {showStatsDetail === 'total' && `All Vendors (${totalVendors})`}
                  {showStatsDetail === 'dpas-signed' && `Vendors with Signed DPAs (${dpasSigned})`}
                  {showStatsDetail === 'high-risk' && `High Risk Vendors (${highRiskCount})`}
                  {showStatsDetail === 'avg-score' && 'Security Score Distribution'}
                  {showStatsDetail === 'discovered' && `Auto-discovered Vendors (${unmanagedCount})`}
                </h2>
                <button onClick={() => setShowStatsDetail(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <X className="size-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {showStatsDetail === 'high-risk' && vendors.filter(v => v.security_score < 60).map(vendor => (
                    <div
                      key={vendor.id}
                      onClick={() => {
                        setShowStatsDetail(null);
                        setSelectedVendorId(vendor.id);
                      }}
                      className="border border-[var(--border-default)] rounded-lg p-4 hover:bg-[var(--surface-raised)] cursor-pointer bg-[var(--surface-card)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded flex items-center justify-center text-2xl bg-[var(--surface-raised)]">{vendor.logo || getLogoEmoji(vendor.category)}</div>
                          <div>
                            <div className="font-medium text-[var(--text-primary)]">{vendor.name}</div>
                            <div className="text-sm text-[var(--text-secondary)]">{vendor.category}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-[var(--status-danger)]">{vendor.security_score}</div>
                          <div className="text-xs text-[var(--text-secondary)]">Risk Score</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {showStatsDetail === 'dpas-signed' && vendors.filter(v => v.dpa_status === 'signed').map(vendor => (
                    <div
                      key={vendor.id}
                      onClick={() => {
                        setShowStatsDetail(null);
                        setSelectedVendorId(vendor.id);
                      }}
                      className="border border-[var(--border-default)] rounded-lg p-4 hover:bg-[var(--surface-raised)] cursor-pointer bg-[var(--surface-card)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded flex items-center justify-center text-2xl bg-[var(--surface-raised)]">{vendor.logo || getLogoEmoji(vendor.category)}</div>
                          <div>
                            <div className="font-medium text-[var(--text-primary)]">{vendor.name}</div>
                            <div className="text-sm text-[var(--text-secondary)]">Renewed {vendor.dpa_signed_date || 'recently'}</div>
                          </div>
                        </div>
                        <Check className="size-6 text-[var(--status-success)]" />
                      </div>
                    </div>
                  ))}
                  {showStatsDetail === 'discovered' && discoveredVendors.map(vendor => (
                    <div key={vendor.name} className="border border-[var(--border-default)] rounded-lg p-4 bg-[var(--surface-card)]">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium text-[var(--text-primary)]">{vendor.name}</div>
                          <div className="text-sm text-[var(--text-secondary)]">Detected from {vendor.source}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            handleInvestigateDiscovered(vendor.name);
                            setShowStatsDetail(null);
                          }}
                          className="px-3 py-1.5 text-sm border border-[var(--border-strong)] rounded hover:bg-[var(--surface-raised)] text-[var(--text-primary)] bg-transparent"
                        >
                          Investigate
                        </button>
                        <button
                          onClick={() => {
                            handlePrefillAddVendor(vendor.name, vendor.category || 'Other');
                            setShowStatsDetail(null);
                          }}
                          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
                        >
                          Add to Registry
                        </button>
                      </div>
                    </div>
                  ))}
                  {(showStatsDetail === 'total' || showStatsDetail === 'avg-score') && (
                    <div className="text-center text-[var(--text-secondary)] py-8">
                      <p className="mb-2">Detailed statistics and breakdown available</p>
                      <p className="text-sm">Click on any vendor in the table below for full details</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Vendor Modal */}
        {showAddVendorModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleCreateVendor} className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
              <div className="sticky top-0 bg-[var(--surface-card)] border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between z-10">
                <h2 className="font-semibold text-[var(--text-primary)]">Add New Vendor</h2>
                <button type="button" onClick={() => setShowAddVendorModal(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <X className="size-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Vendor Name *</label>
                    <input type="text" placeholder="e.g., Salesforce" value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Category *</label>
                    <select value={newVendorCategory} onChange={(e) => setNewVendorCategory(e.target.value)} className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] text-sm">
                      <option value="" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Select category...</option>
                      <option value="CRM" className="bg-[var(--surface-card)] text-[var(--text-primary)]">CRM</option>
                      <option value="Infrastructure" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Infrastructure</option>
                      <option value="Email delivery" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Email delivery</option>
                      <option value="Analytics" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Analytics</option>
                      <option value="Payment processing" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Payment processing</option>
                      <option value="Customer support" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Customer support</option>
                      <option value="Other" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Vendor Contact Email</label>
                    <input type="email" placeholder="vendor@example.com" value={newVendorContact} onChange={(e) => setNewVendorContact(e.target.value)} className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Data Shared / Purpose *</label>
                    <textarea
                      placeholder="Describe what personal data is shared with this vendor"
                      value={newVendorPurpose}
                      onChange={(e) => setNewVendorPurpose(e.target.value)}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 h-20 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">DPA Status</label>
                    <select value={newVendorDpaStatus} onChange={(e) => setNewVendorDpaStatus(e.target.value as DpaStatus)} className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] text-sm">
                      <option value="none" className="bg-[var(--surface-card)] text-[var(--text-primary)]">No DPA</option>
                      <option value="under_review" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Under review</option>
                      <option value="signed" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Signed</option>
                      <option value="expired" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Expired</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Data Location</label>
                    <input type="text" placeholder="e.g., India, Singapore, USA" value={newVendorLocation} onChange={(e) => setNewVendorLocation(e.target.value)} className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] text-sm" />
                  </div>
                </div>

                <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)]/30 rounded-lg p-3 text-xs">
                  <strong>Shield AI:</strong> After adding the vendor, we'll run automated checks to score security posture and sync CISO compliance status.
                </div>
              </div>

              <div className="sticky bottom-0 bg-[var(--surface-card)] border-t border-[var(--border-default)] p-4 flex gap-3 z-10">
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Register Vendor
                </button>
                <button type="button" onClick={() => setShowAddVendorModal(false)} className="px-4 py-2 border border-[var(--border-strong)] rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-primary)] bg-transparent text-sm font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
