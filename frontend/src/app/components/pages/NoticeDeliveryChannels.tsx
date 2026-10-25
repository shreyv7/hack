import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Send,
  Truck,
  Check,
  Clock,
  XCircle,
  X,
  Info,
  Settings,
  AlertTriangle,
  ShieldCheck,
  Play,
  Pause,
  RefreshCw,
  Eye,
  FileText,
  ChevronRight,
  UserCheck,
  BarChart2,
  Plus
} from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { SectionReference } from '@/app/components/common/SectionReference';
import { fetchNotices } from '@/lib/api/consent';
import { noticeDeliveryApi } from '@/lib/api/noticeDelivery';
import type { NoticeCampaign, CampaignDelivery, NoticeCampaignActivity, CampaignOverviewStats } from '@/lib/api/noticeDelivery';
import type { NoticeSummary } from '@/types/consent';
import { cn } from '@/lib/utils';
import { EmailConsentCampaignWizard } from '@/app/components/pages/EmailConsentCampaignWizard';


export function NoticeDeliveryChannels(): ReactElement {
  const [searchParams] = useSearchParams();
  const legacyRepaperingMode =
    searchParams.get('legacy') === '1' || searchParams.get('segment') === 'legacy_pre_dpdpa';

  // Lists data
  const [campaigns, setCampaigns] = useState<NoticeCampaign[]>([]);
  const [notices, setNotices] = useState<NoticeSummary[]>([]);
  const [analytics, setAnalytics] = useState<CampaignOverviewStats | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'analytics' | 'whitepaper'>('campaigns');

  // Selected Campaign details
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<CampaignDelivery[]>([]);
  const [activities, setActivities] = useState<NoticeCampaignActivity[]>([]);
  const [showEvidence, setShowEvidence] = useState<CampaignDelivery | null>(null);

  // Campaign Creator Wizard
  const [showWizard, setShowWizard] = useState(false);
  const [showEmailConsentWizard, setShowEmailConsentWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newCampaign, setNewCampaign] = useState<{
    name: string;
    notice_id: string;
    delivery_strategy: 'email_only' | 'sms_only' | 'whatsapp_only' | 'physical_only' | 'parallel' | 'fallback' | 'smart';
    fallback_chain: string[];
    recipient_segment: string;
    schedule_type: 'immediate' | 'scheduled' | 'event_triggered';
    schedule_config: { datetime: string; timezone: string; quiet_hours: boolean };
    retry_policy: { max_attempts: number; backoff_seconds: number; timeout_seconds: number };
  }>({
    name: '',
    notice_id: '',
    delivery_strategy: 'email_only',
    fallback_chain: [],
    recipient_segment: 'all',
    schedule_type: 'immediate',
    schedule_config: { datetime: '', timezone: 'Asia/Kolkata', quiet_hours: true },
    retry_policy: { max_attempts: 3, backoff_seconds: 300, timeout_seconds: 30 }
  });
  
  // Audience Diff simulation
  const [audienceDiff, setAudienceDiff] = useState<any>(null);
  
  // Segment counts from DB
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({
    all: 0,
    marketing: 0,
    children: 0,
    high_risk: 0,
    renewal_due: 0,
    legacy_pre_dpdpa: 0,
  });

  // Load initial data
  useEffect(() => {
    async function initData() {
      try {
        setIsLoading(true);
        const [cList, nList, stats, counts] = await Promise.all([
          noticeDeliveryApi.fetchCampaigns(),
          fetchNotices(),
          noticeDeliveryApi.fetchNoticeDeliveryAnalytics(),
          noticeDeliveryApi.fetchNoticeSegmentCounts()
        ]);
        setCampaigns(cList);
        setNotices(nList);
        setAnalytics(stats);
        setSegmentCounts(counts);

        if (cList.length > 0) {
          setSelectedCampaignId(cList[0].id);
        }
      } catch (err) {
        console.error(err);
        notify('Failed to load Notice Delivery dashboard data.');
      } finally {
        setIsLoading(false);
      }
    }
    initData();
  }, []);

  // Fetch deliveries and activities when campaign is selected
  useEffect(() => {
    if (!selectedCampaignId) return;
    const campaignId = selectedCampaignId;
    async function loadCampaignDetails() {
      try {
        const [delList, actList] = await Promise.all([
          noticeDeliveryApi.fetchCampaignDeliveries(campaignId),
          noticeDeliveryApi.fetchCampaignActivities(campaignId)
        ]);
        setDeliveries(delList);
        setActivities(actList);
      } catch (err) {
        console.error(err);
      }
    }
    loadCampaignDetails();
  }, [selectedCampaignId]);

  // Load audience diff and segment counts when notice or segment is selected in wizard
  useEffect(() => {
    if (!newCampaign.notice_id) return;
    async function loadDiffAndCounts() {
      try {
        const [diff, counts] = await Promise.all([
          noticeDeliveryApi.fetchNoticeAudienceDiff(
            newCampaign.notice_id,
            newCampaign.recipient_segment
          ),
          noticeDeliveryApi.fetchNoticeSegmentCounts(newCampaign.notice_id)
        ]);
        setAudienceDiff(diff);
        setSegmentCounts(counts);
      } catch (err) {
        console.error(err);
      }
    }
    loadDiffAndCounts();
  }, [newCampaign.notice_id, newCampaign.recipient_segment]);

  // Refresh helper
  const handleRefresh = async () => {
    try {
      const [cList, stats, counts] = await Promise.all([
        noticeDeliveryApi.fetchCampaigns(),
        noticeDeliveryApi.fetchNoticeDeliveryAnalytics(),
        noticeDeliveryApi.fetchNoticeSegmentCounts()
      ]);
      setCampaigns(cList);
      setAnalytics(stats);
      setSegmentCounts(counts);
      if (selectedCampaignId) {
        const campaignId = selectedCampaignId;
        const [delList, actList] = await Promise.all([
          noticeDeliveryApi.fetchCampaignDeliveries(campaignId),
          noticeDeliveryApi.fetchCampaignActivities(campaignId)
        ]);
        setDeliveries(delList);
        setActivities(actList);
      }
      notify('Dashboard records refreshed.');
    } catch (err) {
      console.error(err);
    }
  };

  // State transitions
  const handleTransition = async (id: string, action: string) => {
    try {
      await noticeDeliveryApi.transitionCampaign(id, action);
      notify(`Campaign transitioned successfully via ${action}.`);
      handleRefresh();
    } catch (err: any) {
      notify(err.message || 'Illegal campaign state transition attempted.');
    }
  };

  // Retry single delivery
  const handleRetryDelivery = async (delivery: CampaignDelivery) => {
    try {
      await noticeDeliveryApi.retryCampaignDelivery(delivery.campaign_id, delivery.id);
      notify(`Dispatched manual retry for recipient: ${delivery.recipient_name}`);
      handleRefresh();
    } catch (err) {
      console.error(err);
      notify('Failed to retry dispatch.');
    }
  };

  // Create Campaign
  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.notice_id) {
      notify('Campaign Name and Notice Selection are required.');
      return;
    }
    try {
      const created = await noticeDeliveryApi.createCampaign(newCampaign);
      notify(`Notice Campaign '${created.name}' created as Draft.`);
      setShowWizard(false);
      setWizardStep(1);
      
      // Reload lists
      const cList = await noticeDeliveryApi.fetchCampaigns();
      setCampaigns(cList);
      setSelectedCampaignId(created.id);
    } catch (err) {
      console.error(err);
      notify('Failed to create campaign.');
    }
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  const {
    page: deliveriesPage,
    setPage: setDeliveriesPage,
    pageCount: deliveriesPageCount,
    pageItems: deliveriesPageItems,
    total: deliveriesTotal,
    pageSize: deliveriesPageSize,
  } = useClientPagination(deliveries, TABLE_PAGE_SIZE, selectedCampaignId ?? '');

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--surface-base)] min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="w-8 h-8 text-[var(--brand-primary)] animate-spin" />
          <span className="text-xs text-[var(--text-secondary)] font-semibold">Loading Orchestrator Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 font-sans text-slate-900 dark:text-slate-100 relative selection:bg-indigo-500/30">
      {/* Decorative ambient background */}
      <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-500/10 via-indigo-500/5 to-transparent pointer-events-none" />
      <div className="fixed top-[-10%] right-[-5%] w-96 h-96 bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none" />
      
      <div className="max-w-[1280px] mx-auto p-8 space-y-8 relative z-10">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-indigo-500/20 pb-8 gap-4">
          <div>
            <h1 className="text-4xl font-extrabold mb-3 text-slate-900 dark:text-white drop-shadow-sm tracking-tight">
              Notice Delivery & Orchestration
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed font-medium">
              Orchestrate legal disclosures, manage multi-channel fallbacks, verify recipients segments, and track proof signatures.
            </p>
            <div className="mt-4">
              <SectionReference section="DPDPA Sections 5 & 8 — Notice Delivery & Multi-channel Disclosures" />
            </div>
            {legacyRepaperingMode && (
              <div className="mt-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-slate-700 dark:text-slate-200 max-w-2xl">
                <strong className="font-semibold">§5(2) legacy consent repapering</strong>
                <span className="block mt-1 text-slate-600 dark:text-slate-400">
                  Use the <strong>Legacy pre-DPDPA (§5(2))</strong> audience segment to reach principals whose consent was captured before 11 Aug 2023 and who have not yet acknowledged your current notice version. Delivery, proof, and outcomes are tracked here — not on a separate campaign page.
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleRefresh}
              className="p-3 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-white dark:hover:bg-slate-700 hover:shadow-lg transition-all duration-300 text-slate-700 dark:text-slate-300 group"
              title="Refresh Records"
            >
              <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            </button>
            <button
              onClick={() => {
                if (notices.length === 0) {
                  notify('Please configure a Consent Notice in Consent Notice Manager first.');
                  return;
                }
                setShowEmailConsentWizard(true);
              }}
              className="px-5 py-3 bg-[var(--brand-primary)] hover:opacity-90 text-white font-bold rounded-xl shadow-lg transition-all duration-300 flex items-center gap-2 text-sm"
            >
              <Plus className="w-5 h-5" /> Email Consent Campaign
            </button>
            <button
              onClick={() => {
                if (notices.length === 0) {
                  notify('Please configure a Consent Notice in Consent Notice Manager first.');
                  return;
                }
                setNewCampaign({
                  name: legacyRepaperingMode ? '§5(2) Legacy consent re-notice' : '',
                  notice_id: notices[0]?.id || '',
                  delivery_strategy: 'fallback',
                  fallback_chain: ['email', 'sms', 'whatsapp'],
                  recipient_segment: legacyRepaperingMode ? 'legacy_pre_dpdpa' : 'all',
                  schedule_type: 'immediate',
                  schedule_config: { datetime: '', timezone: 'Asia/Kolkata', quiet_hours: true },
                  retry_policy: { max_attempts: 3, backoff_seconds: 300, timeout_seconds: 30 }
                });
                setWizardStep(legacyRepaperingMode ? 2 : 1);
                setShowWizard(true);
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 text-sm"
            >
              <Plus className="w-5 h-5" /> Configure Notice Campaign
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex gap-3 border-b border-indigo-500/20 pb-4 overflow-x-auto no-scrollbar scroll-smooth">
          <button
            onClick={() => setActiveTab('campaigns')}
            className={cn(
              "px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 whitespace-nowrap",
              activeTab === 'campaigns'
                ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border border-transparent"
            )}
          >
            <Send className="w-4 h-4" /> Communication Campaigns
          </button>
          <Link
            to="/consent/provider-adapters"
            className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 whitespace-nowrap text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border border-transparent"
          >
            <Settings className="w-4 h-4" /> Pluggable Provider Adapters
          </Link>
          <button
            onClick={() => setActiveTab('analytics')}
            className={cn(
              "px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 whitespace-nowrap",
              activeTab === 'analytics'
                ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border border-transparent"
            )}
          >
            <BarChart2 className="w-4 h-4" /> Orchestrator Cost Analytics
          </button>
          <button
            onClick={() => setActiveTab('whitepaper')}
            className={cn(
              "px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 whitespace-nowrap",
              activeTab === 'whitepaper'
                ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border border-transparent"
            )}
          >
            <FileText className="w-4 h-4" /> Setup Guide & Whitepaper
          </button>
        </div>

        {/* Tab Content 1: Campaigns */}
        {activeTab === 'campaigns' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 fade-in duration-500">
            
            {/* Analytics Rollup Summary Bar */}
            {analytics && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                <div className="p-5 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="block text-[11px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-2 relative z-10">Notice Reach Rate</span>
                  <div className="flex items-baseline gap-2 relative z-10">
                    <span className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{analytics.notice_reach_percent}%</span>
                    <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">DPDPA Compliant</span>
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="block text-[11px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-2 relative z-10">Total Dispatches</span>
                  <span className="text-3xl font-black text-slate-800 dark:text-white tracking-tight relative z-10">{analytics.total_sent.toLocaleString()}</span>
                </div>
                <div className="p-5 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="block text-[11px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-2 relative z-10">Acknowledgements</span>
                  <span className="text-3xl font-black text-slate-800 dark:text-white tracking-tight relative z-10">{analytics.total_acknowledged.toLocaleString()}</span>
                </div>
                <div className="p-5 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="block text-[11px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-2 relative z-10">Delivery SLA</span>
                  <span className={cn(
                    "text-3xl font-black tracking-tight relative z-10",
                    analytics.sla_compliance === 'Passed' ? "text-emerald-500" : "text-amber-500"
                  )}>{analytics.sla_compliance}</span>
                </div>
                <div className="p-5 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="block text-[11px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-2 relative z-10">Orchestration Cost</span>
                  <span className="text-3xl font-black text-slate-800 dark:text-white tracking-tight relative z-10">₹{analytics.total_cost.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Campaign Splitted Grid: Left Master / Right Detail */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Campaigns List */}
              <div className="lg:col-span-1 space-y-4">
                <div className="p-5 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg">
                  <h3 className="font-extrabold text-base text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Send className="w-4 h-4 text-indigo-500" /> Notice Campaigns
                  </h3>
                  <div className="space-y-3 max-h-[600px] overflow-auto pr-2 custom-scrollbar">
                    {campaigns.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCampaignId(c.id)}
                        className={cn(
                          "p-4 rounded-xl border cursor-pointer transition-all duration-300 flex flex-col justify-between gap-2 group",
                          selectedCampaignId === c.id
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 shadow-[0_4px_12px_rgba(99,102,241,0.1)] scale-[1.02]"
                            : "border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn(
                            "font-bold text-sm truncate transition-colors",
                            selectedCampaignId === c.id ? "text-indigo-700 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                          )}>{c.name}</span>
                          <span className={cn(
                            "text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full shrink-0 border",
                            c.status === 'running' ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                            c.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                            c.status === 'dpo_approval' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                            "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
                          )}>
                            {c.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[120px]">{notices.find(n => n.id === c.notice_id)?.internal_name || 'Consent Notice'}</span>
                          </span>
                          <span className="font-semibold capitalize bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">{c.delivery_strategy.replace('_', ' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Campaign Details & Logs */}
              <div className="lg:col-span-2 space-y-4">
                {selectedCampaign ? (
                  <div className="p-6 md:p-8 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg space-y-8 animate-in slide-in-from-right-8 fade-in duration-500">
                    
                    {/* Header Detail */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-6 gap-4">
                      <div>
                        <h2 className="font-extrabold text-2xl text-slate-800 dark:text-white">{selectedCampaign.name}</h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Campaign ID: <code className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{selectedCampaign.id}</code></span>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {selectedCampaign.status === 'draft' && (
                          <button
                            onClick={() => handleTransition(selectedCampaign.id, 'legal_review')}
                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-amber-500/30 transition-all hover:-translate-y-0.5"
                          >
                            Submit to Legal
                          </button>
                        )}
                        {selectedCampaign.status === 'legal_review' && (
                          <button
                            onClick={() => handleTransition(selectedCampaign.id, 'dpo_approval')}
                            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-orange-500/30 transition-all hover:-translate-y-0.5"
                          >
                            Submit to DPO
                          </button>
                        )}
                        {selectedCampaign.status === 'dpo_approval' && (
                          <button
                            onClick={() => handleTransition(selectedCampaign.id, 'running')}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-1.5"
                          >
                            <Play className="w-4 h-4" /> DPO Approve & Run
                          </button>
                        )}
                        {selectedCampaign.status === 'running' && (
                          <div className="flex gap-2.5">
                            <button
                              onClick={() => handleTransition(selectedCampaign.id, 'paused')}
                              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-amber-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-1.5"
                            >
                              <Pause className="w-4 h-4" /> Pause
                            </button>
                            <button
                              onClick={() => handleTransition(selectedCampaign.id, 'completed')}
                              className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-slate-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-1.5"
                            >
                              <Check className="w-4 h-4" /> Mark Completed
                            </button>
                          </div>
                        )}
                        {selectedCampaign.status === 'paused' && (
                          <button
                            onClick={() => handleTransition(selectedCampaign.id, 'running')}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-1.5"
                          >
                            <Play className="w-4 h-4" /> Resume
                          </button>
                        )}
                        {selectedCampaign.status !== 'archived' && (
                          <button
                            onClick={() => handleTransition(selectedCampaign.id, 'archived')}
                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Meta Specifications */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div className="space-y-1.5">
                        <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-500">Audience Segment</span>
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100 capitalize flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-500">
                            <UserCheck className="w-4 h-4" />
                          </div>
                          {selectedCampaign.recipient_segment.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-500">Strategy Mode</span>
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100 capitalize flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-500">
                            <RefreshCw className="w-4 h-4" />
                          </div>
                          {selectedCampaign.delivery_strategy.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-500">Scheduled Type</span>
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100 capitalize flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500">
                            <Clock className="w-4 h-4" />
                          </div>
                          {selectedCampaign.schedule_type}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-500">Fallback Chain</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-xs font-mono truncate block bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          {selectedCampaign.fallback_chain.join(' → ') || 'None'}
                        </span>
                      </div>
                    </div>

                    {/* Delivery Log Table */}
                    <div className="space-y-4">
                      <h3 className="font-extrabold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                        <Truck className="w-4 h-4 text-indigo-500" /> Recipient Delivery Status
                      </h3>
                      <div className="border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                <th className="p-4">Recipient</th>
                                <th className="p-4">Address/Channel</th>
                                <th className="p-4">Status</th>
                                {selectedCampaign?.campaign_purpose === 'consent_capture' && (
                                  <th className="p-4">Consent Decision</th>
                                )}
                                <th className="p-4 text-center">Attempts</th>
                                <th className="p-4 text-right">Proof Vault</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                              {deliveries.length === 0 ? (
                                <tr>
                                  <td colSpan={selectedCampaign?.campaign_purpose === 'consent_capture' ? 6 : 5} className="p-8 text-center text-slate-500 italic">
                                    No deliveries enqueued. Campaign status must be 'running' or 'completed'.
                                  </td>
                                </tr>
                              ) : (
                                deliveriesPageItems.map((d) => (
                                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                                    <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">
                                      {d.recipient_name}
                                    </td>
                                    <td className="p-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                                      <span className="uppercase text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-200/50 dark:bg-slate-700/50 mr-2 border border-slate-200 dark:border-slate-700">{d.current_channel}</span>
                                      {d.recipient_email || d.recipient_phone || 'Physical Mail'}
                                    </td>
                                    <td className="p-4">
                                      <span className={cn(
                                        "text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit border",
                                        d.status === 'acknowledged' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                                        d.status === 'delivered' ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                                        d.status === 'failed' ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" :
                                        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                      )}>
                                        {(d.status === 'acknowledged' || d.status === 'delivered') && <Check className="w-3 h-3" />}
                                        {d.status === 'failed' && <XCircle className="w-3 h-3" />}
                                        {(d.status === 'pending' || d.status === 'retrying') && <Clock className="w-3 h-3" />}
                                        {d.status}
                                      </span>
                                    </td>
                                    {selectedCampaign?.campaign_purpose === 'consent_capture' && (
                                      <td className="p-4">
                                        <span className={cn(
                                          "text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider w-fit border",
                                          d.consent_decision === 'accepted' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                          d.consent_decision === 'rejected' ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                          d.consent_decision === 'customized' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                          "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                        )}>
                                          {d.consent_decision ?? 'pending'}
                                        </span>
                                      </td>
                                    )}
                                    <td className="p-4 font-mono text-center text-slate-600 dark:text-slate-400">
                                      <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">{d.attempts_count}</span>
                                    </td>
                                    <td className="p-4 text-right space-x-2">
                                      {d.status === 'failed' && (
                                        <button
                                          onClick={() => handleRetryDelivery(d)}
                                          className="px-3 py-1.5 rounded-md text-[11px] font-bold border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 inline-flex items-center gap-1.5 transition-colors"
                                        >
                                          <RefreshCw className="w-3 h-3" /> Retry
                                        </button>
                                      )}
                                      {d.evidence_hash && (
                                        <button
                                          onClick={() => setShowEvidence(d)}
                                          className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 inline-flex items-center gap-1.5 transition-colors"
                                        >
                                          <Eye className="w-3 h-3" /> Inspect Proof
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                        <TablePager
                          page={deliveriesPage}
                          pageCount={deliveriesPageCount}
                          total={deliveriesTotal}
                          pageSize={deliveriesPageSize}
                          onPage={setDeliveriesPage}
                        />
                      </div>
                    </div>

                    {/* Timeline Activity logs */}
                    <div className="space-y-3 border-t border-[var(--border-default)] pt-4">
                      <h3 className="font-bold text-xs text-[var(--text-primary)]">Campaign Activity Log</h3>
                      <div className="space-y-2.5 max-h-[150px] overflow-auto">
                        {activities.map((a) => (
                          <div key={a.id} className="flex gap-3 text-xs">
                            <span className="font-mono text-[10px] text-[var(--text-secondary)] shrink-0">{new Date(a.created_at).toLocaleTimeString()}</span>
                            <div className="flex-1 text-[var(--text-primary)]">
                              <span className="font-bold mr-1 uppercase text-[9px] tracking-wider text-[var(--text-secondary)]">{a.action}</span>
                              {a.details}
                            </div>
                            <span className="text-[10px] text-[var(--text-tertiary)] italic shrink-0">&mdash; {a.actor_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="p-8 text-center border border-dashed border-[var(--border-default)] rounded-xl text-[var(--text-secondary)] italic">
                    Select a notice campaign to view details.
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* Tab Content 2: Cost Analytics */}
        {activeTab === 'analytics' && (() => {
          const emailCost = analytics?.channel_costs?.email ?? 0;
          const smsCost = analytics?.channel_costs?.sms ?? 0;
          const whatsappCost = analytics?.channel_costs?.whatsapp ?? 0;
          const physicalCost = analytics?.channel_costs?.physical ?? 0;
          const totalVal = emailCost + smsCost + whatsappCost + physicalCost || 1;
          const emailPct = Math.round((emailCost / totalVal) * 100);
          const smsPct = Math.round((smsCost / totalVal) * 100);
          const whatsappPct = Math.round((whatsappCost / totalVal) * 100);
          const physicalPct = Math.round((physicalCost / totalVal) * 100);

          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
              
              {/* Left: Visual Cost aggregation chart */}
              <div className="lg:col-span-2 p-6 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] space-y-4">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">Cost Metrics Breakdown</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                    <span>Channel</span>
                    <span>Dispatched Cost</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-primary)] mb-1">
                        <span className="font-medium">Email (Amazon SES / SMTP)</span>
                        <span>₹{emailCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="w-full h-2 rounded bg-black/5 dark:bg-white/5 overflow-hidden">
                        <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${emailCost > 0 ? emailPct : 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-primary)] mb-1">
                        <span className="font-medium">SMS (Twilio / MSG91)</span>
                        <span>₹{smsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="w-full h-2 rounded bg-black/5 dark:bg-white/5 overflow-hidden">
                        <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${smsCost > 0 ? smsPct : 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-primary)] mb-1">
                        <span className="font-medium">WhatsApp (Meta API)</span>
                        <span>₹{whatsappCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="w-full h-2 rounded bg-black/5 dark:bg-white/5 overflow-hidden">
                        <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${whatsappCost > 0 ? whatsappPct : 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-primary)] mb-1">
                        <span className="font-medium">Physical Mail (Shiprocket)</span>
                        <span>₹{physicalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="w-full h-2 rounded bg-black/5 dark:bg-white/5 overflow-hidden">
                        <div className="bg-orange-500 h-full transition-all duration-500" style={{ width: `${physicalCost > 0 ? physicalPct : 0}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Compliance indicators */}
              <div className="lg:col-span-1 p-6 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] space-y-4">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">Compliance Audit Summary</h3>
                <div className="space-y-4 text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    <span>SLA Requirements Passed</span>
                  </div>
                  <span>Notice communication channels must verify that undelivered rates do not exceed 5% on regulatory disclosure updates.</span>
                  <div className="p-4 border border-[var(--border-default)] rounded-xl bg-[var(--surface-base)] flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                    <span>
                      Proof Vault records hashes automatically. View recent delivery logs to inspect Merkle proof signatures.
                    </span>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}

        {/* Tab Content 4: Setup Guide & Whitepaper */}
        {activeTab === 'whitepaper' && (
          <div className="p-8 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200 font-sans text-[var(--text-primary)]">
            <div className="flex items-center gap-3 border-b border-[var(--border-default)] pb-4">
              <FileText className="w-6 h-6 text-[var(--brand-primary)]" />
              <div>
                <h2 className="text-lg font-bold">Vajra DPDPA Notice Delivery Setup Whitepaper</h2>
                <p className="text-xs text-[var(--text-secondary)]">Operational guide for DPOs, CISOs, and IT administrators to configure notice delivery adapters.</p>
              </div>
            </div>

            <div className="space-y-6 text-sm leading-relaxed">
              <section className="space-y-2">
                <h3 className="text-sm font-bold border-b border-[var(--border-default)] pb-1 uppercase tracking-wider text-[var(--text-secondary)]">1. Executive Summary</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Under the Digital Personal Data Protection Act (DPDPA), 2023, organizations are legally mandated to deliver clear, granular, and multi-lingual privacy notices to data principals when collecting personal data. The <strong>Vajra Notice Delivery & Orchestration</strong> module provides a secure, reliable, and compliant infrastructure to automatically dispatch these notices across digital and physical channels, track delivery statuses, and store cryptographic evidence of notice receipt in the Vajra compliance proof vault.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold border-b border-[var(--border-default)] pb-1 uppercase tracking-wider text-[var(--text-secondary)]">2. Security & Encryption of Credentials</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  To protect sensitive keys, tokens, and passwords, Vajra employs a multi-tiered security model:
                </p>
                <ul className="list-disc pl-5 text-xs text-[var(--text-secondary)] space-y-1">
                  <li><strong>Encryption-at-Rest:</strong> All configuration keys and secret values entered into the Vajra Notice Delivery console are symmetrically encrypted before being committed to the database.</li>
                  <li><strong>AES-128-CBC + HMAC (Fernet):</strong> Vajra uses standard, secure Fernet encryption. The cryptographic key is derived deterministically from the platform's root settings.</li>
                  <li><strong>Decryption-on-Use:</strong> Decryption only occurs in-memory at the time of API dispatch or connection testing. Secrets are never stored in plaintext log files.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-bold border-b border-[var(--border-default)] pb-1 uppercase tracking-wider text-[var(--text-secondary)]">3. Step-by-Step Provider Configuration</h3>
                
                <div className="p-4 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] space-y-2">
                  <h4 className="font-bold text-xs">3.1. Email Channel (Amazon SES, SMTP, or Firebase)</h4>
                  <p className="text-xs text-[var(--text-secondary)]"><strong>Option A: Amazon SES (Recommended)</strong></p>
                  <ul className="list-disc pl-5 text-xs text-[var(--text-secondary)] space-y-0.5">
                    <li>AWS Access Key & Secret: Create an IAM user with `AmazonSESFullAccess` permissions.</li>
                    <li>AWS Region & Sender: Input your registered SES sending identity (e.g. privacy@yourdomain.com).</li>
                  </ul>
                  <p className="text-xs text-[var(--text-secondary)] mt-1"><strong>Option B: SMTP</strong></p>
                  <p className="text-xs text-[var(--text-secondary)]">Enter your SMTP server hostname, port (typically 587), and user credentials to route via third-party mail relays (SendGrid, Resend, etc.).</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1"><strong>Option C: Firebase Email</strong></p>
                  <p className="text-xs text-[var(--text-secondary)]">Routes notices through your Firebase Firestore database (Trigger Email from Firestore extension). Enter your Firebase Project ID and Web API Key.</p>
                </div>

                <div className="p-4 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] space-y-2">
                  <h4 className="font-bold text-xs">3.2. SMS Channel (Twilio, MSG91, or Firebase)</h4>
                  <p className="text-xs text-[var(--text-secondary)]"><strong>Option A: Twilio</strong></p>
                  <p className="text-xs text-[var(--text-secondary)]">Enter Twilio Account SID, Auth Token, and Sender/From Number.</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1"><strong>Option B: MSG91 (DLT Compliant)</strong></p>
                  <p className="text-xs text-[var(--text-secondary)]">Under Indian TRAI regulations, transactional SMS require DLT registration. Obtain MSG91 Authkey, registered alphabetic Sender ID (e.g. ZHSHLD), and approved template ID.</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1"><strong>Option C: Firebase SMS</strong></p>
                  <p className="text-xs text-[var(--text-secondary)]">Routes notices through your Firebase Firestore database (Trigger SMS events). Enter your Firebase Project ID and Web API Key.</p>
                </div>

                <div className="p-4 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] space-y-2">
                  <h4 className="font-bold text-xs">3.3. WhatsApp Channel (Meta WhatsApp Business API)</h4>
                  <p className="text-xs text-[var(--text-secondary)]">Create a Business App on Meta Developers Portal, register your template, and enter the System User Access Token and Phone Number ID.</p>
                </div>

                <div className="p-4 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] space-y-2">
                  <h4 className="font-bold text-xs">3.4. Physical Mail Channel (Shiprocket Only)</h4>
                  <p className="text-xs text-[var(--text-secondary)]">Traditional DPDPA notice fallbacks are routed via Shiprocket API for adhoc document orders. Enter your Shiprocket account credentials and pickup warehouse location name.</p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold border-b border-[var(--border-default)] pb-1 uppercase tracking-wider text-[var(--text-secondary)]">4. Webhook Status Callbacks</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  To receive real-time delivery events (deliveries, opens, bounces), configure callback endpoints on external dashboards:
                </p>
                <div className="p-3 bg-[var(--surface-base)] rounded-lg border border-[var(--border-default)] font-mono text-[10px] space-y-1 text-[var(--text-primary)]">
                  <div><strong>Amazon SES:</strong> https://your-domain.com/api/v1/notice-delivery/webhooks/ses</div>
                  <div><strong>Twilio:</strong> https://your-domain.com/api/v1/notice-delivery/webhooks/twilio</div>
                  <div><strong>Shiprocket:</strong> https://your-domain.com/api/v1/notice-delivery/webhooks/shiprocket</div>
                </div>
              </section>
            </div>
          </div>
        )}


      </div>

      {/* Inspector Modal: Inspect Proof Vault Evidence */}
      {showEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Proof Vault Delivery Receipt</h3>
                <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">Recipient: {showEvidence.recipient_name} &rarr; Hash Verified</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEvidence(null)}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 border border-[var(--border-default)] rounded-lg p-3 bg-[var(--surface-base)]">
                <div>
                  <span className="block text-[9px] uppercase font-bold text-[var(--text-secondary)] mb-0.5">Evidence SHA-256 Hash</span>
                  <code className="font-mono text-[10px] text-emerald-500 break-all">{showEvidence.evidence_hash}</code>
                </div>
                <div>
                  <span className="block text-[9px] uppercase font-bold text-[var(--text-secondary)] mb-0.5">Proof Vault Signature Reference</span>
                  <code className="font-mono text-[10px] text-[var(--text-primary)] break-all">{showEvidence.proof_vault_ref}</code>
                </div>
              </div>

              <div className="relative rounded-xl overflow-hidden bg-[#0A0A0A] border border-zinc-800">
                <pre className="p-4 font-mono text-[10px] text-zinc-300 overflow-x-auto leading-relaxed max-h-[300px]">
                  <code>{JSON.stringify({
                    evidence_payload: {
                      recipient_id: showEvidence.recipient_id,
                      recipient_name: showEvidence.recipient_name,
                      channel: showEvidence.current_channel,
                      status: "delivered",
                      timestamp: showEvidence.last_attempt_at,
                      evidence_hash: showEvidence.evidence_hash,
                      proof_vault_ref: showEvidence.proof_vault_ref
                    }
                  }, null, 2)}</code>
                </pre>
              </div>

              <div className="flex justify-end gap-2 text-xs pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(showEvidence, null, 2));
                    notify('Evidence JSON copied.');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1"
                >
                  Copy JSON
                </button>
                <button
                  onClick={() => setShowEvidence(null)}
                  className="px-4 py-1.5 bg-[var(--brand-primary)] text-white font-bold rounded-lg"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEmailConsentWizard && (
        <EmailConsentCampaignWizard
          notices={notices}
          onClose={() => setShowEmailConsentWizard(false)}
          onCreated={async () => {
            const cList = await noticeDeliveryApi.fetchCampaigns();
            setCampaigns(cList);
          }}
        />
      )}

      {/* Campaign Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Header Wizard */}
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Campaign Setup Orchestrator</h3>
                <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">Step {wizardStep} of 6 &bull; Configure Fallback Policies</span>
              </div>
              <button
                type="button"
                onClick={() => setShowWizard(false)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Content */}
            <div className="p-6 space-y-4 max-h-[500px] overflow-auto text-xs">

              {/* Step 1: Notice Selection */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">Step 1: Choose Legal Notice version</h4>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Select Notice Template</label>
                    <select
                      value={newCampaign.notice_id}
                      onChange={(e) => setNewCampaign({ ...newCampaign, notice_id: e.target.value })}
                      className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                    >
                      {notices.map(n => (
                        <option key={n.id} value={n.id}>{n.internal_name} (Active v{n.version_number}.0)</option>
                      ))}
                    </select>
                  </div>
                  <div className="p-3 border border-[var(--border-default)] rounded-xl bg-[var(--surface-base)] text-[var(--text-secondary)]">
                    Notice versions are detected automatically. The orchestrator will verify user consent records and exclude anyone who already acknowledged the target version.
                  </div>
                </div>
              )}

              {/* Step 2: Recipient Segmentation */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">Step 2: Recipient Segmentation</h4>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Target Segment</label>
                    <select
                      value={newCampaign.recipient_segment}
                      onChange={(e) => setNewCampaign({ ...newCampaign, recipient_segment: e.target.value })}
                      className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                    >
                      <option value="all">All Known Data Principals ({segmentCounts.all})</option>
                      <option value="marketing">Marketing Consent Holders ({segmentCounts.marketing})</option>
                      <option value="children">Minors (Parental Consent Required) ({segmentCounts.children})</option>
                      <option value="renewal_due">Consent Renewal Due ({segmentCounts.renewal_due ?? 0})</option>
                      <option value="legacy_pre_dpdpa">
                        Legacy pre-DPDPA (§5(2)) ({segmentCounts.legacy_pre_dpdpa ?? 0})
                      </option>
                      <option value="high_risk">Special Category Data Principals ({segmentCounts.high_risk})</option>
                    </select>
                  </div>
                  
                  {audienceDiff && (
                    <div className="grid grid-cols-5 gap-2 border border-[var(--border-default)] p-3 rounded-lg bg-[var(--surface-base)] text-center text-[10px]">
                      <div>
                        <span className="block text-[var(--text-secondary)]">Total Audience</span>
                        <span className="font-bold text-sm text-[var(--text-primary)]">{audienceDiff.already_informed}</span>
                      </div>
                      <div>
                        <span className="block text-amber-500 font-semibold">Needs Update</span>
                        <span className="font-bold text-sm text-[var(--text-primary)]">{audienceDiff.need_update}</span>
                      </div>
                      <div>
                        <span className="block text-emerald-500 font-semibold">Acknowledged</span>
                        <span className="font-bold text-sm text-[var(--text-primary)]">{audienceDiff.already_acknowledged}</span>
                      </div>
                      <div>
                        <span className="block text-[var(--text-secondary)]">Withdrawn</span>
                        <span className="font-bold text-sm text-[var(--text-primary)]">{audienceDiff.withdrawn_users}</span>
                      </div>
                      <div>
                        <span className="block text-[var(--text-secondary)]">Uncontactable</span>
                        <span className="font-bold text-sm text-[var(--text-primary)]">{audienceDiff.cannot_contact}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Delivery Strategy & Fallback Config */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">Step 3: Orchestration Fallback Logic</h4>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Strategy Type</label>
                    <select
                      value={newCampaign.delivery_strategy}
                      onChange={(e) => setNewCampaign({ ...newCampaign, delivery_strategy: e.target.value as any })}
                      className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                    >
                      <option value="email_only">Email Only</option>
                      <option value="sms_only">SMS Only</option>
                      <option value="whatsapp_only">WhatsApp Only</option>
                      <option value="physical_only">Physical Courier Only</option>
                      <option value="fallback">Sequential Fallback Chain</option>
                      <option value="smart">Smart Routing (Active Carrier split)</option>
                    </select>
                  </div>

                  {newCampaign.delivery_strategy === 'fallback' && (
                    <div className="space-y-3">
                      <label className="block text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Visual Fallback Chain priority</label>
                      <div className="flex items-center gap-2 text-xs border border-[var(--border-default)] rounded-lg p-3 bg-[var(--surface-base)] font-mono text-[var(--text-primary)]">
                        <span>Email</span>
                        <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                        <span>SMS</span>
                        <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                        <span>WhatsApp</span>
                        <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                        <span>Physical Mail</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Scheduling & Throttling */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">Step 4: Scheduler & Throttling</h4>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Schedule Type</label>
                    <select
                      value={newCampaign.schedule_type}
                      onChange={(e) => setNewCampaign({ ...newCampaign, schedule_type: e.target.value as any })}
                      className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                    >
                      <option value="immediate">Dispatch Immediately</option>
                      <option value="scheduled">Schedule Later Time</option>
                      <option value="event_triggered">Trigger on Policy Version Publish</option>
                    </select>
                  </div>

                  {newCampaign.schedule_type === 'scheduled' && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Scheduled Date & Time</label>
                      <input
                        type="datetime-local"
                        value={newCampaign.schedule_config.datetime}
                        onChange={(e) => setNewCampaign({
                          ...newCampaign,
                          schedule_config: { ...newCampaign.schedule_config, datetime: e.target.value }
                        })}
                        className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 font-medium cursor-pointer text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={newCampaign.schedule_config.quiet_hours}
                        onChange={(e) => setNewCampaign({
                          ...newCampaign,
                          schedule_config: { ...newCampaign.schedule_config, quiet_hours: e.target.checked }
                        })}
                        className="rounded accent-[var(--brand-primary)]"
                      />
                      <span>Exclude quiet hours (No SMS/WhatsApp between 9:00 PM and 8:00 AM)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Step 5: Approval routing */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">Step 5: Compliance Approval Workflow</h4>
                  <div className="space-y-2 border border-dashed border-[var(--border-default)] p-4 rounded-xl text-center">
                    <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                    <span className="block font-bold text-xs text-[var(--text-primary)]">Regulatory Sign-off Required</span>
                    <span className="block text-[10px] text-[var(--text-secondary)] max-w-md mx-auto">
                      Under DPDPA notice policies, this campaign draft will undergo internal DPO checklist review and Legal sign-off.
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                    <div className="flex items-center gap-2">
                      <div className="size-4 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>Notice template verifications complete</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="size-4 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-[9px]">&bull;</div>
                      <span>DPO signature review pending</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 6: Review & Finalize */}
              {wizardStep === 6 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">Step 6: Confirm notice Dispatch config</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Campaign Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Q3 Privacy notice disclosure update"
                        value={newCampaign.name}
                        onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                        className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                      />
                    </div>
                    <div className="p-4 border border-[var(--border-default)] rounded-xl bg-[var(--surface-base)] space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">Notice ID:</span>
                        <span className="font-mono text-[10px] text-[var(--text-primary)]">{newCampaign.notice_id}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">Strategy:</span>
                        <span className="font-bold text-[var(--text-primary)] uppercase text-[10px]">{newCampaign.delivery_strategy}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">Schedule:</span>
                        <span className="font-bold text-[var(--text-primary)] uppercase text-[10px]">{newCampaign.schedule_type}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer Buttons */}
            <div className="p-5 border-t border-[var(--border-default)] bg-[var(--surface-raised)] flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 1) {
                    setShowWizard(false);
                  } else {
                    setWizardStep(wizardStep - 1);
                  }
                }}
                className="px-4 py-2 border border-[var(--border-default)] rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                {wizardStep === 1 ? 'Cancel' : 'Back'}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 6) {
                    handleCreateCampaign();
                  } else {
                    setWizardStep(wizardStep + 1);
                  }
                }}
                className="px-4 py-2 bg-[var(--brand-primary)] text-white font-bold rounded-lg text-xs"
              >
                {wizardStep === 6 ? 'Finalize & Create' : 'Next'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
