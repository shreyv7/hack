import type { ReactElement } from 'react';
import { useState, useEffect, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Archive, Code, Edit2, Eye, Globe, Plus, Smartphone, Tag, X, Monitor, Tablet, Copy, BarChart2, ShieldCheck, Calendar, AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateBannerWizard, getTemplateCSS } from './CreateBannerWizard';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination, TABLE_PAGE_SIZE } from '@/app/hooks/useClientPagination';
import { MappingDiagram } from '@/app/components/common/MappingDiagram';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { BannerPurposeChips } from '@/app/components/common/BannerPurposeChips';
import { getBannerPurposeLabels } from '@/lib/consent/bannerPurposeTypes';

import { fetchBanners, archiveBanner, unarchiveBanner, fetchActivities, fetchBannerAbSummary } from '@/lib/api/consent';
import type { ConsentBanner, ConsentActivity } from '@/types/consent';
import { integrationsApi } from '@/lib/api/integrations';
import { ApiError } from '@/lib/api/client';
import type { Property } from '@/types/integrations';
import { notify } from '@/app/utils/notify';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

interface BannerBuilderDashboardProps {
  onNavigateToTechnicalIntegration?: (bannerId: string) => void;
}

interface DeployedPlatform {
  type: string;
  label: string;
  icon: LucideIcon;
}

interface BannerItem {
  id: string;
  name: string;
  version: string;
  status: 'Live' | 'Draft';
  consents: number;
  lastUpdated: string;
  deployedOn: DeployedPlatform[];
  languages: number;
  purposes: number;
  bannerPurposeType?: string[];
  bannerPurposeCustom?: string | null;
  theme?: string;
  display_style?: string;
  position?: string;
  heading?: string;
  body_text?: string;
  cta_accept?: string;
  cta_reject?: string;
  cta_customize?: string;
  privacy_policy_url?: string;
  cookie_policy_url?: string;
  dpo_email?: string;
  show_language_switcher?: boolean;
  ab_test_enabled?: boolean;
  ab_variant_theme?: string;
  ab_variant_display_style?: string;
  ab_variant_position?: string;
  ab_variant_template?: string;
  ab_variant_custom_css?: string | null;
  ab_traffic_split?: number;
  ab_test_duration_days?: number;
  developer_mode?: boolean;
  custom_css?: string | null;
  properties?: string[];
  template?: string;
  createdAtRaw?: string;
  updatedAtRaw?: string;
  archivedAtRaw?: string | null;
}

interface BannerActivity {
  id: string;
  banner: string;
  action: string;
  timestamp: string;
  timestampRaw: Date;
  deployedOn: DeployedPlatform[];
  user?: string;
}

const BANNERS: BannerItem[] = [];



/**
 * Banner builder dashboard with banner list, deployment targets, and activity.
 */
export function BannerBuilderDashboard({
  onNavigateToTechnicalIntegration,
}: BannerBuilderDashboardProps): ReactElement {
  const { user } = useAuth();
  const orgIdParam = getOrgIdParamForRole(user?.role);
  const [banners, setBanners] = useState<BannerItem[]>(BANNERS);
  const [selectedBanner, setSelectedBanner] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [previewBanner, setPreviewBanner] = useState<BannerItem | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewVariant, setPreviewVariant] = useState<'A' | 'B'>('A');

  useEffect(() => {
    if (previewBanner) {
      setPreviewVariant('A');
    }
  }, [previewBanner]);
  const [deployBanner, setDeployBanner] = useState<BannerItem | null>(null);
  const [deployTargets, setDeployTargets] = useState<Property[]>([]);
  const [selectedDeployPropertyId, setSelectedDeployPropertyId] = useState('');
  const [isLoadingDeployTargets, setIsLoadingDeployTargets] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'Live' | 'Draft'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [abSummaries, setAbSummaries] = useState<Record<string, { a: number; b: number }>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [disconnectingBanner, setDisconnectingBanner] = useState<BannerItem | null>(null);
  const [disconnectConfirmationText, setDisconnectConfirmationText] = useState('');
  const [disconnectActionType, setDisconnectActionType] = useState<'disconnect' | 'archive'>('disconnect');
  const [activityPage, setActivityPage] = useState(1);
  const [editingConnectedBanner, setEditingConnectedBanner] = useState<BannerItem | null>(null);
  const [editConfirmationText, setEditConfirmationText] = useState('');
  const [activities, setActivities] = useState<ConsentActivity[]>([]);

  const currentTheme = previewBanner?.ab_test_enabled && previewVariant === 'B' ? previewBanner.ab_variant_theme : previewBanner?.theme;
  const currentDisplayStyle = previewBanner?.ab_test_enabled && previewVariant === 'B' ? previewBanner.ab_variant_display_style : previewBanner?.display_style;
  const currentPosition = previewBanner?.ab_test_enabled && previewVariant === 'B' ? previewBanner.ab_variant_position : previewBanner?.position;
  const currentTemplate = previewBanner?.ab_test_enabled && previewVariant === 'B' ? previewBanner.ab_variant_template : previewBanner?.template;
  const currentCustomCss = previewBanner?.ab_test_enabled && previewVariant === 'B' ? previewBanner.ab_variant_custom_css : previewBanner?.custom_css;

  const visibleBanners = useMemo(
    () =>
      banners
        .filter((b) => showArchived || !b.archivedAtRaw)
        .filter((b) => filterStatus === 'all' || b.status === filterStatus),
    [banners, showArchived, filterStatus],
  );
  const bannersPager = useClientPagination(visibleBanners, TABLE_PAGE_SIZE, `${showArchived}|${filterStatus}`);

  const handleArchiveBanner = async (bannerId: string) => {
    try {
      const orgId = orgIdParam;
      await archiveBanner(bannerId, orgId);
      notify('Banner archived successfully');
      await loadBanners();
    } catch (error) {
      console.error('Failed to archive banner:', error);
      notify('Failed to archive banner');
    }
  };

  const handleUnarchiveBanner = async (bannerId: string) => {
    try {
      const orgId = orgIdParam;
      await unarchiveBanner(bannerId, orgId);
      notify('Banner unarchived successfully');
      await loadBanners();
    } catch (error) {
      console.error('Failed to unarchive/restore banner:', error);
      notify('Failed to restore banner');
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await loadBanners();
      notify('Banners synchronized successfully');
    } catch {
      notify('Failed to sync banners');
    } finally {
      setIsSyncing(false);
    }
  };

  const PLATFORM_ICONS: Record<string, LucideIcon> = {
    website: Globe,
    ios: Smartphone,
    android: Smartphone,
    gtm: Tag,
    api: Code,
  };

  const recentActivities: BannerActivity[] = activities.map((act) => {
    const actDate = new Date(act.created_at);
    const dateStr = actDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    
    return {
      id: act.id,
      banner: `${act.banner_name} ${act.banner_version}`,
      action: act.action,
      timestamp: dateStr,
      timestampRaw: actDate,
      deployedOn: (act.deployed_on || []).map((p: any) => ({
        type: p.type,
        label: p.label || p.type,
        icon: PLATFORM_ICONS[p.type] || Globe,
      })),
      user: act.user_name,
    };
  });

  // Pagination for activities
  const itemsPerPage = 10;
  const totalActivityPages = Math.ceil(recentActivities.length / itemsPerPage);
  const currentPage = Math.min(activityPage, Math.max(1, totalActivityPages));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedActivities = recentActivities.slice(startIndex, startIndex + itemsPerPage);

  const mapApiBannerToItem = (apiBanner: ConsentBanner): BannerItem => {
    return {
      id: apiBanner.id,
      name: apiBanner.name,
      version: apiBanner.version,
      status: apiBanner.status as 'Live' | 'Draft',
      consents: apiBanner.consents,
      lastUpdated: apiBanner.updated_at
        ? new Date(apiBanner.updated_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Just now',
      deployedOn: (apiBanner.deployed_on || []).map((p) => ({
        type: p.type,
        label: p.label || p.type,
        icon: PLATFORM_ICONS[p.type] || Globe,
      })),
      languages: apiBanner.languages,
      purposes: apiBanner.purposes,
      bannerPurposeType: apiBanner.banner_purpose_type,
      bannerPurposeCustom: apiBanner.banner_purpose_custom,
      display_style: apiBanner.display_style || undefined,
      position: apiBanner.position || undefined,
      theme: apiBanner.theme || undefined,
      heading: apiBanner.heading || undefined,
      body_text: apiBanner.body_text || undefined,
      cta_accept: apiBanner.cta_accept || undefined,
      cta_reject: apiBanner.cta_reject || undefined,
      cta_customize: apiBanner.cta_customize || undefined,
      privacy_policy_url: apiBanner.privacy_policy_url || undefined,
      cookie_policy_url: apiBanner.cookie_policy_url || undefined,
      dpo_email: apiBanner.dpo_email || undefined,
      show_language_switcher: apiBanner.show_language_switcher,
      ab_test_enabled: apiBanner.ab_test_enabled,
      ab_variant_theme: apiBanner.ab_variant_theme || undefined,
      ab_variant_display_style: apiBanner.ab_variant_display_style || undefined,
      ab_variant_position: apiBanner.ab_variant_position || undefined,
      ab_variant_template: apiBanner.ab_variant_template || undefined,
      ab_variant_custom_css: apiBanner.ab_variant_custom_css ?? null,
      ab_traffic_split: apiBanner.ab_traffic_split,
      ab_test_duration_days: apiBanner.ab_test_duration_days,
      developer_mode: apiBanner.developer_mode,
      custom_css: apiBanner.custom_css ?? null,
      properties: apiBanner.properties,
      template: apiBanner.template || 'classic',
      createdAtRaw: apiBanner.created_at,
      updatedAtRaw: apiBanner.updated_at,
      archivedAtRaw: apiBanner.archived_at,
    };
  };

  const loadBanners = async () => {
    try {
      const orgId = orgIdParam;
      const apiBanners = await fetchBanners(orgId, true);
      
      let propsList: Property[] = [];
      try {
        propsList = await integrationsApi.listProperties();
      } catch (err) {
        console.error('Failed to load properties list:', err);
      }

      const mappedBanners = apiBanners.map((apiBanner) => {
        const item = mapApiBannerToItem(apiBanner);
        
        // Find properties associated with this banner
        const linkedProps = propsList.filter((p) => p.active_banner?.banner_id === apiBanner.id);
        
        // Override status dynamically: associated -> 'Live', else -> 'Draft'
        item.status = linkedProps.length > 0 ? 'Live' : 'Draft';
        item.properties = linkedProps.map((p) => p.domain);
        
        // Save richer details for rendering
        (item as any).createdAt = apiBanner.created_at
          ? new Date(apiBanner.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'Just now';
        (item as any).linkedProperties = linkedProps;
        
        return item;
      });

      const apiIds = new Set(mappedBanners.map((b) => b.id));
      const filteredMocks = BANNERS.filter((b) => !apiIds.has(b.id));
      setBanners([...filteredMocks, ...mappedBanners]);

      const summaryEntries = await Promise.all(
        apiBanners
          .filter((b) => b.ab_test_enabled)
          .map(async (b) => {
            try {
              const summary = await fetchBannerAbSummary(b.id, orgId);
              return [b.id, { a: summary.assigned_variant_a, b: summary.assigned_variant_b }] as const;
            } catch {
              return null;
            }
          })
      );
      const nextSummaries: Record<string, { a: number; b: number }> = {};
      for (const entry of summaryEntries) {
        if (entry) nextSummaries[entry[0]] = entry[1];
      }
      setAbSummaries(nextSummaries);
      
      try {
        const apiActivities = await fetchActivities(orgId);
        setActivities(apiActivities);
      } catch (err) {
        console.error('Failed to load activities:', err);
      }
    } catch (error) {
      console.error('Failed to load banners:', error);
    }
  };

  useEffect(() => {
    loadBanners();
  }, []);

  const openDeployModal = async (banner: BannerItem) => {
    setDeployBanner(banner);
    setSelectedDeployPropertyId('');
    setIsLoadingDeployTargets(true);
    try {
      const props = await integrationsApi.listProperties();
      setDeployTargets(props);
      const matchingProperty = props.find((prop) => prop.active_banner?.banner_id === banner.id);
      if (matchingProperty) {
        setSelectedDeployPropertyId(matchingProperty.id);
      }
    } catch (error) {
      console.error('Failed to load deploy targets:', error);
      notify(error instanceof ApiError ? error.message : 'Failed to load properties for deployment');
    } finally {
      setIsLoadingDeployTargets(false);
    }
  };

  const handleDeploy = async () => {
    if (!deployBanner || !selectedDeployPropertyId) {
      return;
    }

    setIsDeploying(true);
    try {
      await integrationsApi.setPropertyBanner(selectedDeployPropertyId, deployBanner.id);
      notify(`Attached ${deployBanner.name} ${deployBanner.version} to the selected property`);
      await loadBanners();
      setDeployBanner(null);
      onNavigateToTechnicalIntegration?.(selectedDeployPropertyId);
    } catch (error) {
      console.error('Failed to deploy banner:', error);
      notify(error instanceof ApiError ? error.message : 'Failed to attach banner to property');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto">

        <div className="p-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Banner Builder</h1>
            </div>
            <p className="text-base mb-1 text-[var(--text-secondary)]">
              Design, deploy, and A/B test consent banners across all your properties. DPDPA Section 5 + 6 compliant by
              default
            </p>
            <div className="flex items-center gap-3 mt-3">
              <DPDPAChip
                sections={[
                  {
                    chapter: 2,
                    section: 5,
                    name: 'Notice',
                    url: '/dpdpa2023/chapter-2/section5.html',
                    excerpt: 'Notice shall be clear, specific and plain...',
                  },
                  {
                    chapter: 2,
                    section: 6,
                    name: 'Consent',
                    url: '/dpdpa2023/chapter-2/section6.html',
                    excerpt: 'Consent shall be free, specific, informed...',
                  },
                ]}
                size="detailed"
              />
              <PenaltyChip amount={150} />
            </div>
          </div>

          <div className="mb-6">
            <MappingDiagram />
          </div>

          <div className="flex gap-3 mb-6">
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="flex-grow h-12 rounded-lg flex items-center justify-center gap-2 transition-all hover:opacity-90 bg-[#4F46E5] text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span className="text-sm font-semibold">Create New Banner</span>
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 h-12 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              title="Sync Banners"
            >
              <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="text-sm font-semibold">Sync</span>
            </button>
            <label className="h-12 flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none bg-[var(--surface-card)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg px-4 transition-all">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded cursor-pointer accent-indigo-600"
              />
              <span className="font-semibold text-sm">Show Archived</span>
            </label>
          </div>

          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">View Banners</h2>
              
              {/* Categorization Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] w-fit">
                {(['all', 'Live', 'Draft'] as const).map((tab) => {
                  const count = banners
                    .filter(b => showArchived || !b.archivedAtRaw)
                    .filter(b => tab === 'all' || b.status === tab).length;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterStatus(tab)}
                      className={cn(
                        'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
                        filterStatus === tab
                          ? 'bg-[var(--surface-card)] text-[var(--brand-primary)] shadow-sm border border-[var(--border-default)]'
                          : 'text-[var(--text-secondary)] hover:opacity-85'
                      )}
                    >
                      <span className="capitalize">{tab === 'all' ? 'All' : tab}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[var(--surface-raised)] text-[var(--text-tertiary)] border border-[var(--border-default)] font-normal">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {bannersPager.slice.map((banner) => {
                const linkedProps = (banner as any).linkedProperties as Property[] || [];
                const createdAt = (banner as any).createdAt || banner.lastUpdated;

                return (
                  <div
                    key={banner.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedBanner(banner.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedBanner(banner.id);
                    }}
                    className={cn(
                      'p-4 rounded-xl border cursor-pointer transition-all duration-200 bg-[var(--surface-card)] hover:border-[var(--brand-primary)]/50 hover:shadow-md flex flex-col gap-4',
                      selectedBanner === banner.id ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/10' : 'border-[var(--border-default)]',
                    )}
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                          {banner.name || 'Untitled Banner'}
                        </h3>
                        <span className="text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
                          {banner.version}
                        </span>
                        {banner.archivedAtRaw ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Archived
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 border',
                              banner.status === 'Live'
                                ? 'bg-[var(--status-success-bg)] text-[var(--status-success)] border-emerald-500/10'
                                : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-default)]',
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', banner.status === 'Live' ? 'bg-[var(--status-success)] animate-pulse' : 'bg-[var(--text-tertiary)]')} />
                            {banner.status}
                          </span>
                        )}
                        {banner.ab_test_enabled && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/30">
                            A/B Test
                            {abSummaries[banner.id] ? (
                              <span className="ml-1 opacity-80">
                                (A:{abSummaries[banner.id].a} B:{abSummaries[banner.id].b})
                              </span>
                            ) : null}
                          </span>
                        )}
                        {/* Copyable ID */}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(banner.id);
                            notify('Banner ID copied to clipboard');
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--surface-raised)] hover:bg-[var(--border-default)] text-[9px] font-mono text-[var(--text-tertiary)] cursor-pointer transition-colors border border-[var(--border-default)]"
                          title="Click to copy full ID"
                        >
                          <span>{banner.id.substring(0, 8)}...</span>
                          <Copy className="w-2.5 h-2.5 opacity-60" />
                        </div>

                        {/* Target Platforms */}
                        {banner.deployedOn.length > 0 && (
                          <div className="flex items-center gap-1">
                            {banner.deployedOn.map((platform) => (
                              <span
                                key={`${banner.id}-${platform.type}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigateToTechnicalIntegration?.(banner.id);
                                }}
                                className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-default)] text-[9px] font-semibold text-[var(--text-primary)] flex items-center gap-1 cursor-pointer hover:opacity-85 transition-opacity"
                                title={`Navigate to ${platform.label} integration`}
                              >
                                <platform.icon className="w-2.5 h-2.5 text-[var(--brand-primary)]" />
                                {platform.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                        <Calendar className="w-3 h-3" />
                        <span>Created: {createdAt}</span>
                        {createdAt !== banner.lastUpdated && (
                          <>
                            <span>•</span>
                            <span>Updated: {banner.lastUpdated}</span>
                          </>
                        )}
                      </div>

                      <BannerPurposeChips
                        purposeTypes={banner.bannerPurposeType}
                        customText={banner.bannerPurposeCustom}
                        className="mt-1"
                      />
                    </div>

                    {/* Metric Cards Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)]/20 flex items-center gap-2.5">
                        <div className="p-2 rounded bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]">
                          <BarChart2 className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-0.5">Consents Today</div>
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            {banner.consents.toLocaleString()} events
                          </div>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)]/20 flex items-center gap-2.5">
                        <div className="p-2 rounded bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]">
                          <Globe className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-0.5">Languages</div>
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            {banner.languages} active
                          </div>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)]/20 flex items-center gap-2.5 col-span-2 md:col-span-1">
                        <div className="p-2 rounded bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]">
                          <ShieldCheck className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-0.5">Banner Purpose</div>
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate" title={getBannerPurposeLabels(banner.bannerPurposeType, banner.bannerPurposeCustom).join(', ')}>
                            {getBannerPurposeLabels(banner.bannerPurposeType, banner.bannerPurposeCustom).join(', ') || 'Not set'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Row */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-[var(--border-default)]/60">
                      <div className="flex-1">
                        {linkedProps.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
                            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">
                              <Globe className="w-3 h-3" />
                              <span>Live on {linkedProps[0].domain}</span>
                            </div>
                            <span className="text-[var(--text-tertiary)]">•</span>
                            <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                              <span className="font-medium text-[var(--text-tertiary)]">Env:</span>
                              <span className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-default)] font-semibold capitalize text-[10px]">
                                {linkedProps[0].environment}
                              </span>
                            </div>
                            <span className="text-[var(--text-tertiary)]">•</span>
                            <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                              <span className="font-medium text-[var(--text-tertiary)]">Activated:</span>
                              <span className="font-medium text-[var(--text-primary)]">
                                {linkedProps[0].active_banner?.activated_at
                                  ? new Date(linkedProps[0].active_banner.activated_at).toLocaleDateString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : createdAt}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                            <AlertCircle className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                            <span>This banner is a draft. Click <strong>Deploy</strong> to connect it to a property.</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 self-end lg:self-auto flex-wrap">
                        {linkedProps.length > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDisconnectActionType('disconnect');
                              setDisconnectConfirmationText('');
                              setDisconnectingBanner(banner);
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white border border-red-500/20 shadow-sm transition-all hover:-translate-y-0.5 duration-150 active:translate-y-0 cursor-pointer"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openDeployModal(banner);
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-sm transition-all hover:-translate-y-0.5 duration-150 active:translate-y-0 cursor-pointer"
                          >
                            Deploy →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (linkedProps.length > 0) {
                              setEditConfirmationText('');
                              setEditingConnectedBanner(banner);
                            } else {
                              setEditingBannerId(banner.id);
                              setShowWizard(true);
                            }
                          }}
                          className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                          aria-label="Edit banner"
                          title="Edit banner"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewBanner(banner);
                            setPreviewDevice('desktop');
                          }}
                          className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                          aria-label="Preview banner"
                          title="Preview banner"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {banner.archivedAtRaw ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleUnarchiveBanner(banner.id);
                            }}
                            className="p-1.5 rounded-lg border border-emerald-500/20 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer"
                            aria-label="Restore banner"
                            title="Restore banner"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (linkedProps.length > 0) {
                                setDisconnectActionType('archive');
                                setDisconnectConfirmationText('');
                                setDisconnectingBanner(banner);
                              } else {
                                void handleArchiveBanner(banner.id);
                              }
                            }}
                            className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                            aria-label="Archive banner"
                            title="Archive banner"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <TablePager
                page={bannersPager.page}
                pageCount={bannersPager.pageCount}
                total={bannersPager.total}
                pageSize={bannersPager.pageSize}
                onPage={bannersPager.setPage}
              />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">Recent Activity</h2>
            <div className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]">
              {recentActivities.length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
                  No recent activity. Create or deploy a banner to see logs here.
                </div>
              ) : (
                paginatedActivities.map((activity, idx) => (
                  <div
                    key={activity.id}
                    className={cn('p-4', idx !== paginatedActivities.length - 1 && 'border-b border-[var(--border-default)]')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-sm mb-1 text-[var(--text-primary)]">{activity.banner}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--text-secondary)]">{activity.action}</span>
                          {activity.user && (
                            <>
                              <span className="text-sm text-[var(--text-tertiary)]">·</span>
                              <span className="text-xs text-[var(--text-tertiary)] font-medium">by {activity.user}</span>
                            </>
                          )}
                          {activity.deployedOn.length > 0 ? (
                            <>
                              <span className="text-sm text-[var(--text-tertiary)]">·</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-[var(--text-tertiary)]">Deployed on:</span>
                                {activity.deployedOn.map((platform) => (
                                  <platform.icon key={`${activity.id}-${platform.type}`} className="w-3 h-3 text-[var(--text-tertiary)]" />
                                ))}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-sm text-[var(--text-tertiary)]">{activity.timestamp}</div>
                    </div>
                  </div>
                ))
              )}
              {totalActivityPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-default)] bg-[var(--surface-raised)]/20">
                  <div className="text-xs text-[var(--text-secondary)]">
                    Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                    <span className="font-semibold">
                      {Math.min(startIndex + itemsPerPage, recentActivities.length)}
                    </span>{' '}
                    of <span className="font-semibold">{recentActivities.length}</span> activities
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setActivityPage((prev) => Math.max(prev - 1, 1))}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-xs font-semibold hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      Page {currentPage} of {totalActivityPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage === totalActivityPages}
                      onClick={() => setActivityPage((prev) => Math.min(prev + 1, totalActivityPages))}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-xs font-semibold hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showWizard ? (
        <CreateBannerWizard
          editingBannerId={editingBannerId || undefined}
          onClose={() => {
            setShowWizard(false);
            setEditingBannerId(null);
            loadBanners();
          }}
          onNavigateToTechnicalIntegration={(bannerId) => {
            setShowWizard(false);
            setEditingBannerId(null);
            loadBanners();
            onNavigateToTechnicalIntegration?.(bannerId);
          }}
        />
      ) : null}

      {previewBanner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewBanner(null)}
        >
          <div
            className="w-full max-w-4xl rounded-3xl overflow-hidden flex flex-col bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-8 py-6 flex items-center justify-between border-b border-[var(--border-default)]">
              <div>
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                  Preview: {previewBanner.name} {previewBanner.version}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  ID: {previewBanner.id} • {previewBanner.status} Banner
                </p>
              </div>
              <button
                onClick={() => setPreviewBanner(null)}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-raised)] transition-colors"
                aria-label="Close preview"
              >
                <X className="w-5 h-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-8 flex flex-col md:flex-row gap-8 overflow-y-auto max-h-[500px]">
              {/* Left Side: Device Preview */}
              <div className="flex-1 flex flex-col items-center">
                {/* Switchers */}
                <div className="flex items-center gap-4 mb-4">
                  {previewBanner.ab_test_enabled && (
                    <div className="flex bg-[var(--surface-raised)] p-1 rounded-lg">
                      <button
                        onClick={() => setPreviewVariant('A')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          previewVariant === 'A'
                            ? 'bg-white shadow-sm text-[var(--brand-primary)]'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        Variant A
                      </button>
                      <button
                        onClick={() => setPreviewVariant('B')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          previewVariant === 'B'
                            ? 'bg-white shadow-sm text-[var(--brand-primary)]'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        Variant B
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {(['desktop', 'tablet', 'mobile'] as const).map((device) => {
                      const Icon = device === 'desktop' ? Monitor : device === 'tablet' ? Tablet : Smartphone;
                      return (
                        <button
                          key={device}
                          type="button"
                          onClick={() => setPreviewDevice(device)}
                          className={cn(
                            'p-2 rounded-lg transition-all cursor-pointer',
                            previewDevice === device
                              ? 'bg-[var(--brand-primary)] text-white'
                              : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:opacity-80'
                          )}
                          aria-label={`Switch to ${device} preview`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Device Wrapper */}
                <div
                  className={cn(
                    'flex flex-col border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--surface-raised)] transition-all duration-300',
                    previewDevice === 'desktop' && 'w-full max-w-xl h-64',
                    previewDevice === 'tablet' && 'w-80 h-96',
                    previewDevice === 'mobile' && 'w-64 h-96'
                  )}
                >
                  {/* Browser/Device Header */}
                  <div className="bg-[var(--surface-card)] px-3 py-2 flex items-center gap-2 border-b border-[var(--border-default)]">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <div className="w-2 h-2 rounded-full bg-yellow-400" />
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 text-center text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-raised)] py-0.5 rounded truncate">
                      {previewBanner.properties?.[0] || 'yourwebsite.com'}
                    </div>
                  </div>

                  {/* Device Screen Area */}
                  <div className="relative w-full flex-1 bg-white text-gray-800 p-4 flex flex-col justify-between overflow-hidden">
                    {getTemplateCSS(currentTemplate || 'classic', currentTheme || '#4F46E5') && (
                      <style dangerouslySetInnerHTML={{ __html: getTemplateCSS(currentTemplate || 'classic', currentTheme || '#4F46E5') }} />
                    )}
                    {currentCustomCss && (
                      <style dangerouslySetInnerHTML={{ __html: currentCustomCss }} />
                    )}
                    <div className="text-[10px] text-gray-400">Website Content Mock...</div>

                    {/* Banner Layout */}
                    {currentDisplayStyle === 'banner' && (
                      <div
                        id="zs-banner-preview"
                        className={cn(
                          'absolute left-0 right-0 p-3 flex flex-col gap-1.5 shadow-lg transition-all border-t border-b',
                          currentPosition === 'top' ? 'top-0 border-b-gray-200' : 'bottom-0 border-t-gray-200',
                          `zs-tpl-${currentTemplate}`
                        )}
                      >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="zs-heading text-[10px] font-semibold mb-0.5">
                                {previewBanner.heading || 'We value your privacy'}
                              </div>
                              <div className="zs-body-text text-[8px] opacity-95 line-clamp-2 leading-relaxed">
                                {previewBanner.body_text || 'We use cookies and similar technologies...'}
                              </div>
                            {(previewBanner.privacy_policy_url || previewBanner.cookie_policy_url) && (
                              <div className="flex gap-1.5 mt-0.5 opacity-80">
                                {previewBanner.privacy_policy_url && <span className="underline text-[7px]">Privacy Policy</span>}
                                {previewBanner.privacy_policy_url && previewBanner.cookie_policy_url && <span className="text-[7px]">·</span>}
                                {previewBanner.cookie_policy_url && <span className="underline text-[7px]">Cookie Policy</span>}
                              </div>
                            )}
                          </div>
                          {previewBanner.show_language_switcher && (
                            <select className="text-[7px] bg-white/20 text-white rounded px-1 py-0.5 border-none outline-none cursor-pointer" defaultValue="en">
                              <option value="en">EN</option>
                              <option value="hi">हिन्दी</option>
                              <option value="ta">தமிழ்</option>
                            </select>
                          )}
                        </div>
                        <div className="flex justify-end gap-1 mt-0.5">
                          <button className="zs-cta-btn zs-cta-reject px-1.5 py-0.5 rounded text-[7px] font-medium bg-white/20 hover:bg-white/30 text-white truncate max-w-[80px]">
                            {previewBanner.cta_reject || 'Reject All'}
                          </button>
                          <button className="zs-cta-btn zs-cta-customize px-1.5 py-0.5 rounded text-[7px] font-medium bg-white/20 hover:bg-white/30 text-white truncate max-w-[80px]">
                            {previewBanner.cta_customize || 'Customize'}
                          </button>
                          <button className="zs-cta-btn zs-cta-accept px-1.5 py-0.5 rounded text-[7px] font-medium bg-white text-gray-900 hover:opacity-90 truncate max-w-[80px]">
                            {previewBanner.cta_accept || 'Accept'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Modal Layout */}
                    {currentDisplayStyle === 'modal' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4">
                        <div
                          id="zs-modal-preview"
                          className={cn(
                            'w-11/12 max-w-[200px] p-3 rounded-lg shadow-xl flex flex-col gap-1.5',
                            `zs-tpl-${currentTemplate}`
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1">
                              <div className="zs-heading text-[10px] font-semibold mb-0.5">
                                {previewBanner.heading || 'We value your privacy'}
                              </div>
                              <div className="zs-body-text text-[8px] opacity-95 line-clamp-3 leading-relaxed">
                                {previewBanner.body_text || 'We use cookies and similar technologies...'}
                              </div>
                              {(previewBanner.privacy_policy_url || previewBanner.cookie_policy_url) && (
                                <div className="flex gap-1 mt-0.5 opacity-80">
                                  {previewBanner.privacy_policy_url && <span className="underline text-[6px]">Privacy Policy</span>}
                                  {previewBanner.privacy_policy_url && previewBanner.cookie_policy_url && <span className="text-[6px]">·</span>}
                                  {previewBanner.cookie_policy_url && <span className="underline text-[6px]">Cookie Policy</span>}
                                </div>
                              )}
                            </div>
                            {previewBanner.show_language_switcher && (
                              <select className="text-[6px] bg-white/20 text-white rounded px-0.5 py-0.5 border-none outline-none cursor-pointer" defaultValue="en">
                                <option value="en">EN</option>
                                <option value="hi">हिन्दी</option>
                                <option value="ta">தமிழ்</option>
                              </select>
                            )}
                          </div>
                          <div className="flex justify-end gap-1.5 mt-0.5">
                            <button className="zs-cta-btn zs-cta-reject px-1.5 py-0.5 rounded text-[7px] font-medium bg-white/20 hover:bg-white/30 text-white truncate max-w-[65px]">
                              {previewBanner.cta_reject || 'Reject All'}
                            </button>
                            <button className="zs-cta-btn zs-cta-customize px-1.5 py-0.5 rounded text-[7px] font-medium bg-white/20 hover:bg-white/30 text-white truncate max-w-[65px]">
                              {previewBanner.cta_customize || 'Customize'}
                            </button>
                            <button className="zs-cta-btn zs-cta-accept px-1.5 py-0.5 rounded text-[7px] font-medium bg-white text-gray-900 hover:opacity-90 truncate max-w-[65px]">
                              {previewBanner.cta_accept || 'Accept'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Details */}
              <div className="w-full md:w-80 flex flex-col gap-4">
                <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)]">
                  <h4 className="text-sm font-semibold mb-3">Banner Settings</h4>
                  <div className="space-y-2.5 text-xs text-[var(--text-secondary)]">
                    <div className="flex justify-between">
                      <span>Style:</span>
                      <span className="font-medium capitalize text-[var(--text-primary)]">
                        {currentDisplayStyle || 'banner'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Position:</span>
                      <span className="font-medium capitalize text-[var(--text-primary)]">
                        {currentPosition || 'bottom'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Languages:</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {previewBanner.languages} configured
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span>Banner Purpose:</span>
                      <BannerPurposeChips
                        purposeTypes={previewBanner.bannerPurposeType}
                        customText={previewBanner.bannerPurposeCustom}
                      />
                    </div>
                    <div className="flex justify-between">
                      <span>Consents Today:</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {previewBanner.consents.toLocaleString()} events
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)]">
                  <h4 className="text-sm font-semibold mb-2">Theme Color</h4>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded border border-[var(--border-default)]"
                      style={{ background: currentTheme || '#4F46E5' }}
                    />
                    <span className="font-mono text-xs">{currentTheme || '#4F46E5'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-6 flex justify-end border-t border-[var(--border-default)] bg-[var(--surface-raised)]">
              <button
                onClick={() => setPreviewBanner(null)}
                className="px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 bg-[var(--brand-primary)] text-white cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {deployBanner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => {
            if (!isDeploying) {
              setDeployBanner(null);
            }
          }}
        >
          <div
            className="w-full max-w-2xl rounded-3xl overflow-hidden bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-6 flex items-center justify-between border-b border-[var(--border-default)]">
              <div>
                <h3 className="text-xl font-semibold">Deploy {deployBanner.name} {deployBanner.version}</h3>
                <p className="text-sm mt-1 text-[var(--text-secondary)]">
                  Choose which property should serve this banner and receive the install snippet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeployBanner(null)}
                disabled={isDeploying}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50"
                aria-label="Close deploy modal"
              >
                <X className="w-5 h-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-8 py-6 space-y-4">
              {isLoadingDeployTargets ? (
                <div className="text-sm text-[var(--text-secondary)]">Loading properties…</div>
              ) : deployTargets.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-default)] p-4 text-sm text-[var(--text-secondary)]">
                  No properties available yet. Add a property in Technical Integration first.
                </div>
              ) : (
                deployTargets.map((property) => (
                  <label
                    key={property.id}
                    className={cn(
                      'flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-all',
                      selectedDeployPropertyId === property.id
                        ? 'border-[var(--brand-primary)] bg-[var(--surface-raised)]'
                        : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
                    )}
                  >
                    <input
                      type="radio"
                      name="deploy-property"
                      value={property.id}
                      checked={selectedDeployPropertyId === property.id}
                      onChange={() => setSelectedDeployPropertyId(property.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {property.display_name || property.domain}
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--surface-raised)] text-[var(--text-secondary)] uppercase">
                          {property.environment}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--text-secondary)]">{property.domain}</div>
                      <div className="text-xs mt-2 text-[var(--text-tertiary)]">
                        Current banner: {property.active_banner_name || 'No banner attached'}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="px-8 py-6 flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--surface-raised)]">
              <div className="text-sm text-[var(--text-secondary)]">
                This will set the active banner for the selected property and open its technical integration page.
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeployBanner(null)}
                  disabled={isDeploying}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-primary)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeploy()}
                  disabled={!selectedDeployPropertyId || isDeploying}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white disabled:opacity-50"
                >
                  {isDeploying ? 'Deploying…' : 'Deploy to Property'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {disconnectingBanner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => {
            setDisconnectingBanner(null);
            setDisconnectConfirmationText('');
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl overflow-hidden flex flex-col bg-[var(--surface-card)] text-[var(--text-primary)] border border-red-500/20 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-default)] bg-red-500/5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {disconnectActionType === 'archive' ? 'Disconnect & Archive Banner' : 'Disconnect Banner'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setDisconnectingBanner(null);
                  setDisconnectConfirmationText('');
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-raised)] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                This banner is currently actively deployed to{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {(disconnectingBanner as any).linkedProperties?.[0]?.domain || disconnectingBanner.properties?.[0] || 'the property'}
                </span>
                .
                {disconnectActionType === 'archive'
                  ? ' To archive it, it must first be disconnected from the property. This action is disruptive.'
                  : ' Disconnecting it will stop consent banners from showing up on your property.'}
              </p>

              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4">
                <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-2">
                  Required Statement to Confirm:
                </div>
                <div
                  className="font-mono text-xs bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-[var(--border-default)] select-none text-red-500 dark:text-red-400 font-semibold break-all"
                  style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  disconnect "{disconnectingBanner.name}" from "{(disconnectingBanner as any).linkedProperties?.[0]?.domain || disconnectingBanner.properties?.[0] || 'property'}"
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="disconnect-confirm-input" className="text-xs font-semibold text-[var(--text-secondary)]">
                  Type the statement above to confirm
                </label>
                <input
                  id="disconnect-confirm-input"
                  type="text"
                  placeholder='Type statement here...'
                  value={disconnectConfirmationText}
                  onChange={(e) => setDisconnectConfirmationText(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm transition-all font-mono"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border-default)] bg-[var(--surface-raised)]/30">
              <button
                type="button"
                onClick={() => {
                  setDisconnectingBanner(null);
                  setDisconnectConfirmationText('');
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  disconnectConfirmationText !==
                  `disconnect "${disconnectingBanner.name}" from "${(disconnectingBanner as any).linkedProperties?.[0]?.domain || disconnectingBanner.properties?.[0] || 'property'}"`
                }
                onClick={async () => {
                  try {
                    const properties = (disconnectingBanner as any).linkedProperties || [];
                    for (const p of properties) {
                      await integrationsApi.removePropertyBanner(p.id);
                    }
                    notify('Banner disconnected successfully');
                    
                    if (disconnectActionType === 'archive') {
                      await archiveBanner(disconnectingBanner.id, orgIdParam);
                      notify('Banner archived successfully');
                    }
                    
                    setDisconnectingBanner(null);
                    setDisconnectConfirmationText('');
                    await loadBanners();
                  } catch (error) {
                    console.error('Failed to process action:', error);
                    notify(error instanceof Error ? error.message : 'Action failed');
                  }
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {disconnectActionType === 'archive' ? 'Disconnect & Archive' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingConnectedBanner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => {
            setEditingConnectedBanner(null);
            setEditConfirmationText('');
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl overflow-hidden flex flex-col bg-[var(--surface-card)] text-[var(--text-primary)] border border-indigo-500/20 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-default)] bg-indigo-500/5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-indigo-500 animate-pulse" />
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Confirm Editing Active Banner
                </h3>
              </div>
              <button
                onClick={() => {
                  setEditingConnectedBanner(null);
                  setEditConfirmationText('');
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-raised)] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                This banner is currently actively deployed to{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {(editingConnectedBanner as any).linkedProperties?.[0]?.domain || editingConnectedBanner.properties?.[0] || 'the property'}
                </span>
                . Editing it will immediately affect the live banner served on that property.
              </p>

              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4">
                <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-2">
                  Required Statement to Confirm:
                </div>
                <div
                  className="font-mono text-xs bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-[var(--border-default)] select-none text-indigo-600 dark:text-indigo-400 font-semibold break-all"
                  style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  edit "{editingConnectedBanner.name}" for "{(editingConnectedBanner as any).linkedProperties?.[0]?.domain || editingConnectedBanner.properties?.[0] || 'property'}"
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-confirm-input" className="text-xs font-semibold text-[var(--text-secondary)]">
                  Type the statement above to confirm
                </label>
                <input
                  id="edit-confirm-input"
                  type="text"
                  placeholder='Type statement here...'
                  value={editConfirmationText}
                  onChange={(e) => setEditConfirmationText(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm transition-all font-mono"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border-default)] bg-[var(--surface-raised)]/30">
              <button
                type="button"
                onClick={() => {
                  setEditingConnectedBanner(null);
                  setEditConfirmationText('');
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  editConfirmationText !==
                  `edit "${editingConnectedBanner.name}" for "${(editingConnectedBanner as any).linkedProperties?.[0]?.domain || editingConnectedBanner.properties?.[0] || 'property'}"`
                }
                onClick={() => {
                  setEditingBannerId(editingConnectedBanner.id);
                  setShowWizard(true);
                  setEditingConnectedBanner(null);
                  setEditConfirmationText('');
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Confirm Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
