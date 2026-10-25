import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Send,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Mail,
  Smartphone,
  ShieldCheck,
  BarChart3,
  Users,
  FileText,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { noticeDeliveryApi, type NoticeCampaign, type CampaignOverviewStats } from '@/lib/api/noticeDelivery';
import { fetchNotices } from '@/lib/api/consent';
import type { NoticeSummary } from '@/types/consent';
import { EmailConsentCampaignWizard } from '@/app/components/pages/EmailConsentCampaignWizard';
import { cn } from '@/lib/utils';

export function ConsentCampaignsPage(): ReactElement {
  const [campaigns, setCampaigns] = useState<NoticeCampaign[]>([]);
  const [stats, setStats] = useState<CampaignOverviewStats | null>(null);
  const [notices, setNotices] = useState<NoticeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<NoticeCampaign | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cList, sData, nList] = await Promise.all([
        noticeDeliveryApi.fetchCampaigns(),
        noticeDeliveryApi.fetchNoticeDeliveryAnalytics().catch(() => null),
        fetchNotices(),
      ]);
      setCampaigns(cList);
      setStats(sData);
      setNotices(nList);
    } catch {
      notify('Failed to load consent campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesQuery =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.recipient_segment.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" />
            Paused
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            {status}
          </span>
        );
    }
  };

  const getChannelBadge = (strategy: string) => {
    if (strategy.includes('sms') && strategy.includes('email')) {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
          <Mail className="w-3.5 h-3.5" /> + <Smartphone className="w-3.5 h-3.5" /> Dual OTP
        </span>
      );
    }
    if (strategy.includes('sms')) {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          <Smartphone className="w-3.5 h-3.5" /> SMS OTP
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
        <Mail className="w-3.5 h-3.5" /> Email OTP
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--surface-card)] p-6 rounded-2xl border border-[var(--border-default)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-xl">
              <Send className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Consent Campaigns</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> DPDPA 2023 Compliant
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Dispatch standalone DPDPA privacy notices via Email or SMS. Data Principals authenticate via Email/SMS OTP before consent is recorded into the Proof Vault.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadData()}
            className="p-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all text-[var(--text-secondary)]"
            title="Refresh List"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => {
              if (notices.length === 0) {
                notify('Please configure a Consent Notice in Consent Notice Manager first.');
                return;
              }
              setShowWizard(true);
            }}
            className="px-5 py-3 bg-[var(--brand-primary)] hover:opacity-90 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm"
          >
            <Plus className="w-5 h-5" /> Create Consent Campaign
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-tertiary)]">
            <span>TOTAL CAMPAIGNS</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{campaigns.length}</div>
          <p className="text-xs text-[var(--text-secondary)]">Dispatched notice requests</p>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-tertiary)]">
            <span>NOTICES DELIVERED</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {stats ? stats.total_delivered.toLocaleString() : '0'}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Via Email & SMS gateways</p>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-tertiary)]">
            <span>CONSENTS CAPTURED</span>
            <ShieldCheck className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {stats ? stats.total_acknowledged.toLocaleString() : '0'}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">OTP verified consent decisions</p>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-tertiary)]">
            <span>CONVERSION RATE</span>
            <BarChart3 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {stats ? `${stats.notice_reach_percent.toFixed(1)}%` : '0%'}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Authentic verification rate</p>
        </div>
      </div>

      {/* Campaign List Table Section */}
      <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search campaigns by name or recipient segment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            {['all', 'running', 'completed', 'paused'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                  statusFilter === st
                    ? 'bg-[var(--brand-primary)] text-white font-bold shadow-sm'
                    : 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="bg-[var(--surface-raised)] border-b border-[var(--border-default)] text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Campaign Name</th>
                <th className="py-3.5 px-4 font-semibold">Delivery Channels</th>
                <th className="py-3.5 px-4 font-semibold">Recipient Segment</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold">Created Date</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-tertiary)]">
                    <div className="max-w-xs mx-auto space-y-3">
                      <Send className="w-10 h-10 mx-auto text-[var(--text-tertiary)] opacity-40" />
                      <p className="font-semibold text-[var(--text-secondary)]">No consent campaigns found</p>
                      <p className="text-xs">Create your first Email/SMS consent campaign to request DPDPA compliant consent from Data Principals.</p>
                      <button
                        onClick={() => setShowWizard(true)}
                        className="px-4 py-2 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-xl"
                      >
                        Create Campaign Now
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                    <td className="py-4 px-4 font-medium">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[var(--text-primary)]">{c.name}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">Purpose: {c.campaign_purpose}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">{getChannelBadge(c.delivery_strategy)}</td>
                    <td className="py-4 px-4 text-xs">
                      <span className="px-2.5 py-1 rounded-md bg-[var(--surface-raised)] border border-[var(--border-default)] font-mono">
                        {c.recipient_segment}
                      </span>
                    </td>
                    <td className="py-4 px-4">{getStatusBadge(c.status)}</td>
                    <td className="py-4 px-4 text-xs text-[var(--text-secondary)]">
                      {new Date(c.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => setSelectedCampaign(c)}
                        className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-[var(--text-primary)] transition-all inline-flex items-center gap-1"
                      >
                        View Details <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Wizard Modal */}
      {showWizard && (
        <EmailConsentCampaignWizard
          notices={notices}
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            setShowWizard(false);
            void loadData();
          }}
        />
      )}

      {/* Campaign Details Drawer / Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">{selectedCampaign.name}</h3>
                <p className="text-xs text-[var(--text-secondary)]">Campaign ID: {selectedCampaign.id}</p>
              </div>
              {getStatusBadge(selectedCampaign.status)}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)]">
                <span className="text-xs text-[var(--text-tertiary)] block mb-1">Delivery Strategy</span>
                <span className="font-semibold">{selectedCampaign.delivery_strategy}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)]">
                <span className="text-xs text-[var(--text-tertiary)] block mb-1">Recipient Segment</span>
                <span className="font-semibold font-mono">{selectedCampaign.recipient_segment}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)]">
                <span className="text-xs text-[var(--text-tertiary)] block mb-1">Created At</span>
                <span className="font-semibold">{new Date(selectedCampaign.created_at).toLocaleString()}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)]">
                <span className="text-xs text-[var(--text-tertiary)] block mb-1">Campaign Purpose</span>
                <span className="font-semibold">{selectedCampaign.campaign_purpose}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-default)]">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="px-5 py-2.5 bg-[var(--brand-primary)] text-white font-bold rounded-xl text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
