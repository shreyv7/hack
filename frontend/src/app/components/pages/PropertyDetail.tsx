import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import {
  ArrowLeft,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Shield,
  Check,
  Copy,
  Key,
  Code,
  Play,
  ExternalLink,
  Settings,
  Plus,
  RotateCw,
  Trash2,
  History,
  ChevronDown,
  ChevronUp,
  Download,
  Mail,
  Info,
  Activity,
  ShieldCheck,
  TrendingUp,
  Users,
  MousePointerClick,
  Zap,
  Sparkles,
  Layers,
  Clock,
  BarChart3,
  Server,
  Globe,
  Smartphone
} from 'lucide-react';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchBanners } from '@/lib/api/consent';
import { tagManagerApi } from '@/lib/api/tagManager';
import { INSTALLATION_ADAPTERS } from '@/lib/adapters/installationAdapters';
import { notify } from '@/app/utils/notify';
import type { ConsentBanner } from '@/types/consent';
import type { PropertyDetail, SnippetOutput, IntegrationEvent } from '@/types/integrations';
import type { PageCoverageScan } from '@/types/integration_metrics';
import type { PropertyVerification } from '@/types/integration_verification';
import { DPDPALabelChip } from '../common/DPDPAChip';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

export function PropertyDetailView({ 
  propertyId, 
  onBack,
  onNavigateToBannerBuilder,
  onNavigateToTagManager
}: { 
  propertyId: string;
  onBack: () => void;
  onNavigateToBannerBuilder?: (bannerId: string) => void;
  onNavigateToTagManager?: () => void;
}): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  // Property and Snippet Data
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [snippet, setSnippet] = useState<SnippetOutput | null>(null);
  const [banners, setBanners] = useState<ConsentBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Workspace active tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'installation' | 'verification' | 'coverage' | 'analytics' | 'settings' | 'activity'>('overview');

  // Verification State
  const [latestVerification, setLatestVerification] = useState<PropertyVerification | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Coverage State
  const [latestScan, setLatestScan] = useState<PageCoverageScan | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<PageCoverageScan[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Events & Timeline
  const [propertyEvents, setPropertyEvents] = useState<IntegrationEvent[]>([]);

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90 | 365>(7);
  const [analyticsTab, setAnalyticsTab] = useState<'consent' | 'performance'>('consent');
  const [analyticsBanners, setAnalyticsBanners] = useState<any[]>([]);
  const [selectedBannerId, setSelectedBannerId] = useState<string | null>(null);

  // Deployment targets & Versions
  const [deployments, setDeployments] = useState<any[]>([]);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [deploymentVersions, setDeploymentVersions] = useState<any[]>([]);
  const [showAddDeploymentModal, setShowAddDeploymentModal] = useState(false);
  const [newDeploymentData, setNewDeploymentData] = useState({ name: '', platform: 'website', identifier: '' });
  const [isCreatingDeployment, setIsCreatingDeployment] = useState(false);

  // Tag Manager State
  const [tagStats, setTagStats] = useState({
    containers: 0,
    tags: 0,
    blocked: 0,
    health: 100,
  });

  // Snippet Installation Tab
  const [installTab, setInstallTab] = useState<'html' | 'react' | 'nextjs' | 'angular' | 'vue' | 'gtm' | 'wordpress' | 'manual' | 'ios' | 'android' | 'flutter' | 'react-native'>('html');
  const [copiedText, setCopiedText] = useState(false);
  const [emailDeveloper, setEmailDeveloper] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);

  // Modals state
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRotateKeyModal, setShowRotateKeyModal] = useState(false);
  const [showAgentPromptModal, setShowAgentPromptModal] = useState(false);
  const [copiedPromptText, setCopiedPromptText] = useState(false);
  
  // Rotating / Adding key output
  const [generatedKey, setGeneratedKey] = useState<{ key: string; prefix: string } | null>(null);
  const [keyLabel, setKeyLabel] = useState('Production Access Key');
  const [isRotating, setIsRotating] = useState(false);

  // Edit Settings Fields (Extended settings)
  const [editFields, setEditFields] = useState({
    displayName: '',
    propertyType: 'website' as 'website' | 'android' | 'ios' | 'tag_manager' | 'server' | 'api',
    environment: 'production' as 'production' | 'staging' | 'development',
    blockerMode: 'strict' as 'strict' | 'standard' | 'off',
    autoLanguage: true,
    defaultLanguage: 'en',
    allowedOrigins: '',
    advancedMetadata: '{}',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Delete property states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<any>(null);
  const [isLoadingDeleteImpact, setIsLoadingDeleteImpact] = useState(false);
  const [isDeletingProperty, setIsDeletingProperty] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Search filter for banners modal
  const [bannerSearchQuery, setBannerSearchQuery] = useState('');

  const scanPagesPager = useClientPagination(latestScan?.pages ?? []);
  const versionsPager = useClientPagination(deploymentVersions);

  useEffect(() => {
    versionsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeploymentId]);

  // Load all initial data
  const loadWorkspaceData = async () => {
    try {
      const propData = await integrationsApi.getProperty(propertyId, orgId);
      setProperty(propData);

      setEditFields({
        displayName: propData.display_name || '',
        propertyType: propData.property_type || 'website',
        environment: propData.settings?.environment || propData.environment || 'production',
        blockerMode: propData.settings?.blocker_mode || propData.blocker_mode || 'strict',
        autoLanguage: propData.settings?.auto_language ?? propData.auto_language ?? true,
        defaultLanguage: propData.settings?.default_language || propData.default_language || 'en',
        allowedOrigins: propData.settings?.allowed_origins?.join(', ') || '',
        advancedMetadata: JSON.stringify(propData.settings?.advanced_metadata || {}, null, 2),
      });

      const [
        snippetResult,
        bannersResult,
        verifResult,
        scanResult,
        historyResult,
        eventsResult,
        analyticsBannersResult,
        depsResult,
      ] = await Promise.allSettled([
        integrationsApi.getSnippet(propertyId, orgId),
        fetchBanners(propData.organization_id),
        integrationsApi.listVerifications(propertyId, orgId),
        integrationsApi.getCoverageScan(propertyId, orgId),
        integrationsApi.getCoverageHistory(propertyId, orgId),
        integrationsApi.getPropertyEvents(propertyId, 30, orgId),
        integrationsApi.getAnalyticsBanners(propertyId, orgId),
        integrationsApi.listDeployments(propertyId, orgId),
      ]);

      if (snippetResult.status === 'fulfilled') {
        setSnippet(snippetResult.value);
      } else {
        console.error('Failed to load snippet', snippetResult.reason);
      }

      setBanners(bannersResult.status === 'fulfilled' ? bannersResult.value : []);
      setAnalyticsBanners(analyticsBannersResult.status === 'fulfilled' ? analyticsBannersResult.value : []);

      const deps = depsResult.status === 'fulfilled' ? depsResult.value : [];
      setDeployments(deps);
      if (deps.length > 0 && !selectedDeploymentId) {
        setSelectedDeploymentId(deps[0].id);
      }
      if (propData.active_banner && !selectedBannerId) {
        setSelectedBannerId(propData.active_banner.banner_id);
      }

      if (verifResult.status === 'fulfilled' && verifResult.value.length > 0) {
        setLatestVerification(verifResult.value[0]);
      } else {
        setLatestVerification(null);
      }

      setLatestScan(scanResult.status === 'fulfilled' ? scanResult.value : null);
      setScanHistory(historyResult.status === 'fulfilled' ? historyResult.value : []);
      setPropertyEvents(eventsResult.status === 'fulfilled' ? eventsResult.value : []);

      const failedSecondary = [snippetResult, eventsResult, depsResult, historyResult].some(
        (r) => r.status === 'rejected',
      );
      if (failedSecondary) {
        notify('Some workspace sections failed to load');
      }
    } catch (err) {
      console.error('Failed to load property workspace data', err);
      notify('Failed to refresh workspace data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'superadmin' && !orgId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    loadWorkspaceData();
  }, [propertyId, orgId, user?.role]);

  // Load Tag Manager stats
  useEffect(() => {
    async function loadTagStats() {
      try {
        const [conts, mtags, overview] = await Promise.all([
          tagManagerApi.listContainers(orgId),
          tagManagerApi.listTags({ propertyId, orgId }),
          tagManagerApi.getOverviewStats(propertyId, orgId),
        ]);
        const filteredConts = conts.filter(c => c.property_id === propertyId);
        setTagStats({
          containers: filteredConts.length,
          tags: mtags.length,
          blocked: overview.blocked_today,
          health: overview.health_score,
        });
      } catch (err) {
        console.error(err);
      }
    }
    if (propertyId) {
      void loadTagStats();
    }
  }, [propertyId, orgId]);

  // Load Analytics
  const loadAnalytics = async () => {
    if (!propertyId) return;
    setIsLoadingAnalytics(true);
    try {
      const result = await integrationsApi.listAnalytics(propertyId, analyticsDays, selectedBannerId || undefined);
      setAnalyticsData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [propertyId, analyticsDays, selectedBannerId]);

  // Load Deployment Versions when selected deployment changes
  useEffect(() => {
    async function loadVersions() {
      if (!selectedDeploymentId) return;
      try {
        const list = await integrationsApi.listDeploymentVersions(selectedDeploymentId);
        setDeploymentVersions(list);
      } catch (err) {
        console.error(err);
      }
    }
    loadVersions();
  }, [selectedDeploymentId]);

  // Actions handlers
  const handleVerify = async () => {
    setIsVerifying(true);
    notify('Starting manual compliance verification scan...');
    try {
      const result = await integrationsApi.triggerVerification(propertyId);
      setLatestVerification(result);
      if (result.all_passed) {
        notify('Verification succeeded! CMP is configured correctly.');
      } else {
        notify('Verification failed: Checklist items are missing.');
      }
      
      // Reload timeline and property (health score and status changes)
      const [updatedProperty, eventsData] = await Promise.all([
        integrationsApi.getProperty(propertyId),
        integrationsApi.getPropertyEvents(propertyId, 30),
      ]);
      setProperty(updatedProperty);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Verification execution failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    notify('Starting domain crawling page scan...');
    try {
      const result = await integrationsApi.triggerCoverageScan(propertyId);
      setLatestScan(result);
      notify('Coverage scan completed successfully.');
      
      // Reload history, timeline and property (health score and status changes)
      const [updatedProperty, historyData, eventsData] = await Promise.all([
        integrationsApi.getProperty(propertyId),
        integrationsApi.getCoverageHistory(propertyId),
        integrationsApi.getPropertyEvents(propertyId, 30),
      ]);
      setProperty(updatedProperty);
      setScanHistory(historyData);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Domain scan failed to complete.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRotateKey = async () => {
    setIsRotating(true);
    try {
      const result = await integrationsApi.generateApiKey(propertyId, keyLabel);
      setGeneratedKey({ key: result.api_key, prefix: result.api_key_prefix });
      notify('API Access Key rotated successfully.');
      
      // Reload property to see the new prefix / revoked status of older keys
      const [updatedProperty, updatedSnippet, eventsData] = await Promise.all([
        integrationsApi.getProperty(propertyId),
        integrationsApi.getSnippet(propertyId),
        integrationsApi.getPropertyEvents(propertyId, 30),
      ]);
      setProperty(updatedProperty);
      setSnippet(updatedSnippet);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to generate key.');
    } finally {
      setIsRotating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Integrated clients using this prefix will block script executions.')) return;
    try {
      await integrationsApi.revokeApiKey(propertyId, keyId);
      notify('API key successfully revoked.');
      
      // Reload property & timeline
      const [updatedProperty, eventsData] = await Promise.all([
        integrationsApi.getProperty(propertyId),
        integrationsApi.getPropertyEvents(propertyId, 30),
      ]);
      setProperty(updatedProperty);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to revoke API key.');
    }
  };

  const handleCreateDeployment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeploymentData.name.trim() || !newDeploymentData.identifier.trim()) {
      notify('Please enter both name and identifier/bundle ID.');
      return;
    }
    setIsCreatingDeployment(true);
    try {
      const created = await integrationsApi.createDeployment(propertyId, {
        name: newDeploymentData.name,
        platform: newDeploymentData.platform,
        identifier: newDeploymentData.identifier,
        settings: {
          blockerMode: property?.settings?.blocker_mode || property?.blocker_mode || 'strict',
          heartbeatIntervalSeconds: 60,
        }
      });
      notify('Deployment target registered successfully.');
      setShowAddDeploymentModal(false);
      setNewDeploymentData({ name: '', platform: 'website', identifier: '' });
      
      // Reload deployments and select the new one
      const updatedDeps = await integrationsApi.listDeployments(propertyId);
      setDeployments(updatedDeps);
      setSelectedDeploymentId(created.id);
      
      const eventsData = await integrationsApi.getPropertyEvents(propertyId, 30);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to create deployment target.');
    } finally {
      setIsCreatingDeployment(false);
    }
  };

  const handlePublishVersion = async (deploymentId: string, versionId: string) => {
    try {
      await integrationsApi.publishDeploymentVersion(deploymentId, versionId);
      notify('Configuration version published successfully.');
      
      // Refresh deployments and versions
      const [updatedDeps, updatedVersions] = await Promise.all([
        integrationsApi.listDeployments(propertyId),
        integrationsApi.listDeploymentVersions(deploymentId)
      ]);
      setDeployments(updatedDeps);
      setDeploymentVersions(updatedVersions);
      
      const eventsData = await integrationsApi.getPropertyEvents(propertyId, 30);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to publish version.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      // Parse allowed origins
      const originsList = editFields.allowedOrigins
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0);

      // Parse advanced metadata JSON
      let metaObj = {};
      try {
        if (editFields.advancedMetadata.trim()) {
          metaObj = JSON.parse(editFields.advancedMetadata);
        }
      } catch (jsonErr) {
        notify('Advanced Metadata must be valid JSON.');
        setIsSavingSettings(false);
        return;
      }

      const updated = await integrationsApi.updateProperty(propertyId, {
        display_name: editFields.displayName,
        property_type: editFields.propertyType,
        status: property?.status,
        settings: {
          environment: editFields.environment,
          blocker_mode: editFields.blockerMode,
          auto_language: editFields.autoLanguage,
          default_language: editFields.defaultLanguage,
          geo_targeting: property?.settings?.geo_targeting || {},
          allowed_origins: originsList,
          advanced_metadata: metaObj,
        }
      });
      setProperty({
        ...property!,
        ...updated,
      });
      setShowSettingsModal(false);
      notify('Property settings saved successfully.');
      
      // Reload events
      const eventsData = await integrationsApi.getPropertyEvents(propertyId, 30);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to save settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDeletePropertyClick = async () => {
    setShowDeleteModal(true);
    setIsLoadingDeleteImpact(true);
    setDeleteConfirmText('');
    try {
      const impact = await integrationsApi.getPropertyDeleteImpact(propertyId, orgId);
      setDeleteImpact(impact);
    } catch (err) {
      console.error(err);
      notify('Failed to load deletion impact details.');
      setShowDeleteModal(false);
    } finally {
      setIsLoadingDeleteImpact(false);
    }
  };

  const handleDeleteProperty = async () => {
    setIsDeletingProperty(true);
    try {
      await integrationsApi.deleteProperty(propertyId, orgId);
      notify('Property permanently deleted.');
      setShowDeleteModal(false);
      onBack();
    } catch (err) {
      console.error(err);
      notify('Failed to delete property.');
    } finally {
      setIsDeletingProperty(false);
    }
  };

  const handleAssignBanner = async (bannerId: string) => {
    try {
      await integrationsApi.setPropertyBanner(propertyId, bannerId);
      setShowBannerModal(false);
      notify('Active banner linked to property.');
      
      // Reload property, snippet, and timeline
      const [updatedProperty, updatedSnippet, eventsData] = await Promise.all([
        integrationsApi.getProperty(propertyId),
        integrationsApi.getSnippet(propertyId),
        integrationsApi.getPropertyEvents(propertyId, 30),
      ]);
      setProperty(updatedProperty);
      setSnippet(updatedSnippet);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to set active property banner.');
    }
  };

  const handleRemoveBanner = async () => {
    if (!confirm('Are you sure you want to disconnect this banner? Vajra banner overlay will cease rendering on your domain.')) return;
    try {
      await integrationsApi.removePropertyBanner(propertyId);
      notify('Banner disconnected successfully.');
      
      // Reload property, snippet, and timeline
      const [updatedProperty, updatedSnippet, eventsData] = await Promise.all([
        integrationsApi.getProperty(propertyId),
        integrationsApi.getSnippet(propertyId),
        integrationsApi.getPropertyEvents(propertyId, 30),
      ]);
      setProperty(updatedProperty);
      setSnippet(updatedSnippet);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to disconnect banner.');
    }
  };

  const handleCopyCode = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
    notify('Copied integration snippet to clipboard.');
    try {
      await integrationsApi.logSnippetCopied(propertyId);
      // Refresh events
      const eventsData = await integrationsApi.getPropertyEvents(propertyId, 30);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadSnippet = () => {
    if (!snippet) return;
    const element = document.createElement("a");
    const file = new Blob([snippet.html], {type: 'text/html'});
    element.href = URL.createObjectURL(file);
    element.download = `vajra-snippet-${property?.domain.replace(/\./g, '_')}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    notify('Downloaded snippet HTML file.');
  };

  const handleEmailSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailDeveloper) return;
    setIsSendingEmail(true);
    try {
      await integrationsApi.emailSnippet(propertyId, emailDeveloper);
      notify(`Integration snippet emailed to ${emailDeveloper}`);
      setShowEmailInput(false);
      setEmailDeveloper('');
      // Refresh events
      const eventsData = await integrationsApi.getPropertyEvents(propertyId, 30);
      setPropertyEvents(eventsData);
    } catch (err) {
      console.error(err);
      notify('Failed to send email to developer.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Health Score Style & Colors mapping
  const getHealthColors = (grade: string) => {
    switch (grade) {
      case 'Excellent':
        return {
          bg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
          text: 'text-emerald-500',
          ring: 'ring-emerald-500/30'
        };
      case 'Good':
        return {
          bg: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
          text: 'text-teal-500',
          ring: 'ring-teal-500/30'
        };
      case 'Needs Attention':
        return {
          bg: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
          text: 'text-amber-500',
          ring: 'ring-amber-500/30'
        };
      case 'Critical':
      default:
        return {
          bg: 'bg-red-500/10 text-red-500 border-red-500/20',
          text: 'text-red-500',
          ring: 'ring-red-500/30'
        };
    }
  };

  const getCodeSnippetForTab = () => {
    if (!property || !snippet) return '';
    const blockerMode = property.settings?.blocker_mode || property.blocker_mode || 'strict';
    const language = (property.settings?.auto_language ?? property.auto_language) ? 'auto' : (property.settings?.default_language || property.default_language || 'en');
    const activeKeyPrefix = property.api_keys?.find(k => k.status === 'active')?.key_prefix;
    const activeKey = activeKeyPrefix
      ? (activeKeyPrefix === 'zsk_live_pending' ? 'zsk_live_pending' : `${activeKeyPrefix}-YOUR_API_KEY_SECRET`)
      : 'zsk_live_pending';
    const bannerId = property.active_banner?.banner_id || 'null';

    const adapter = INSTALLATION_ADAPTERS[installTab];
    if (adapter) {
      return adapter.generateSnippet(
        property.id,
        activeKey,
        blockerMode,
        language,
        bannerId === 'null' ? '' : bannerId
      );
    }
    return '';
  };

  const getAgentPromptText = () => {
    if (!property) return '';
    const blockerMode = property.settings?.blocker_mode || property.blocker_mode || 'strict';
    const language = (property.settings?.auto_language ?? property.auto_language) ? 'auto' : (property.settings?.default_language || property.default_language || 'en');
    const activeKeyPrefix = property.api_keys?.find(k => k.status === 'active')?.key_prefix;
    const activeKey = activeKeyPrefix
      ? (activeKeyPrefix === 'zsk_live_pending' ? 'zsk_live_pending' : `${activeKeyPrefix}-YOUR_API_KEY_SECRET`)
      : 'zsk_live_pending';
    const bannerId = property.active_banner?.banner_id || 'null';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dpdpashield-500607.web.app';
    const apiBaseUrl = origin.includes('localhost') ? 'http://localhost:8002/public/v1' : 'https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1';
    const scriptBaseUrl = origin.includes('localhost') ? 'http://localhost:5173/cmp.js' : 'https://dpdpashield-500607.web.app/cmp.js';

    return `Please integrate the Vajra DPDPA consent banner & SDK into our application codebase. Here are the configuration credentials and settings:

- Script / Web SDK URL: "${scriptBaseUrl}"
- Property ID: "${property.id}"
- API Key: "${activeKey}" (Note: Replace YOUR_API_KEY_SECRET with your actual Vajra API key secret)
- API Base URL: "${apiBaseUrl}"
- Default Language: "${language}"
- Blocker Mode: "${blockerMode}"
${bannerId !== 'null' ? `- Banner ID: "${bannerId}"` : ''}

Integration Instructions for Your Project Stack:

1. For Web / HTML / WordPress / GTM:
   - Inject the script tag into the HTML <head> as early as possible.
   - Set script attributes: data-property-id="${property.id}", data-api-key="${activeKey}", data-api-url="${apiBaseUrl}", data-blocker-mode="${blockerMode}", data-language="${language}"${bannerId !== 'null' ? `, data-banner-id="${bannerId}"` : ''}.
   - Tag third-party scripts with data-zs-purpose attributes (e.g. data-zs-purpose="analytics") for automatic cookie/tracker blocking.

2. For React / Next.js / Vue / Angular:
   - Import @vajra/react (or Next.js <Script strategy="afterInteractive">) and initialize <VajraProvider> at the root of the application (e.g., App.tsx, layout.tsx, or main.js).

3. For Mobile Applications (iOS / Swift, Android / Kotlin, Flutter, React Native):
   - Initialize the Vajra SDK on app startup (e.g. in AppDelegate.swift, MainApplication.kt, or root App component).
   - Configure with propertyId: "${property.id}", apiKey: "${activeKey}", apiUrl: "${apiBaseUrl}", blockerMode: "${blockerMode}"${bannerId !== 'null' ? `, bannerId: "${bannerId}"` : ''}.
   - Present the native CMP consent sheet or Webview modal on initial app launch before collecting any telemetry or initializing third-party SDKs (such as Firebase Analytics, Meta SDK, etc.).`;
  };

  const getGuideTip = () => {
    const adapter = INSTALLATION_ADAPTERS[installTab];
    return adapter ? adapter.getGuideTip() : '';
  };

  // Recharts Analytics Formatting
  const formatChartDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getConsentRate = (d: any) => {
    if (d.total_visitors === 0) return 0;
    return Math.round((d.consent_given / d.total_visitors) * 100);
  };

  const chartData = analyticsData.map(d => ({
    ...d,
    formattedDate: formatChartDate(d.date),
    consentRate: getConsentRate(d),
  }));

  const totalVisitors = analyticsData.reduce((sum, d) => sum + d.total_visitors, 0);
  const totalGiven = analyticsData.reduce((sum, d) => sum + d.consent_given, 0);
  const avgConsentRate = totalVisitors ? Math.round((totalGiven / totalVisitors) * 100) : 0;
  const avgLoadTime = analyticsData.length ? Math.round(analyticsData.reduce((sum, d) => sum + d.avg_load_time_ms, 0) / analyticsData.length) : 0;

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--surface-base)] text-[var(--text-secondary)] py-12 min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)] mb-3" />
        <span className="text-sm font-medium">Loading Property Workspace...</span>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--surface-base)] text-[var(--text-secondary)] py-12 min-h-screen">
        <AlertTriangle className="w-8 h-8 text-[var(--status-danger)] mb-3" />
        <span className="text-sm font-semibold mb-4">Property Workspace Not Found</span>
        <button onClick={onBack} className="px-4 py-2 border rounded-lg hover:bg-black/5 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  const healthColors = getHealthColors(property.health_grade);

  return (
    <div className="h-full flex flex-col bg-[var(--surface-base)]">

      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-[1400px] mx-auto p-6 lg:p-8 space-y-6">
          
          {/* Header section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-default)] pb-6">
            <div className="flex items-start gap-4">
              <button 
                onClick={onBack}
                className="mt-1 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all border border-[var(--border-default)]"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                  <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">
                    {property.display_name || property.domain}
                  </h1>
                  
                  {/* Status Badges */}
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border",
                    property.status === 'active' ? "bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success)]/20" :
                    property.status === 'paused' ? "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning)]/20" :
                    property.status === 'verification_failed' ? "bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger)]/20" :
                    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                  )}>
                    {property.status.replace('_', ' ')}
                  </span>

                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info)]/20">
                    {property.environment}
                  </span>

                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--status-ai-bg)] text-[var(--status-ai)] border border-[var(--status-ai)]/20">
                    {property.property_type || 'website'}
                  </span>

                  {/* Health Score Pill */}
                  <div className={cn("px-3 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 border", healthColors.bg)}>
                    <div className={cn("w-2 h-2 rounded-full", healthColors.text, "bg-current")} />
                    <span>Health Score: {property.health_score}% ({property.health_grade})</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)] font-medium">
                  <span className="underline hover:text-[var(--text-primary)] transition-colors cursor-pointer select-all">
                    {property.domain}
                  </span>
                  <span className="text-[var(--text-tertiary)]">•</span>
                  <span>Last Updated: {property.last_updated_time ? new Date(property.last_updated_time).toLocaleString() : 'Never'}</span>
                  <span className="text-[var(--text-tertiary)]">•</span>
                  <div className="inline-flex items-center gap-1">
                    <DPDPALabelChip text="Ch.2 §6(1)" />
                    <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">DPDPA Standard</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleVerify}
                disabled={isVerifying}
                className={cn(
                  "px-3.5 py-2 rounded-lg text-sm font-semibold border flex items-center gap-2 transition-all disabled:opacity-50",
                  property.status === 'verification_failed'
                    ? "bg-red-500 text-white border-transparent hover:bg-red-600 shadow-md animate-pulse"
                    : "border-[var(--border-default)] text-[var(--text-primary)] bg-[var(--surface-card)] hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <RefreshCw className={cn("w-4 h-4", property.status === 'verification_failed' ? "text-white" : "text-[var(--text-secondary)]", isVerifying && "animate-spin")} />
                {isVerifying ? 'Verifying...' : 'Verify Installation'}
              </button>

              <button
                onClick={handleScan}
                disabled={isScanning}
                className="px-3.5 py-2 rounded-lg text-sm font-semibold border border-[var(--border-default)] text-[var(--text-primary)] bg-[var(--surface-card)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Play className="w-4 h-4 text-[var(--text-secondary)]" />
                {isScanning ? 'Scanning...' : 'Scan Coverage'}
              </button>

              <a
                href={property.domain.startsWith('http') ? property.domain : `https://${property.domain}`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-lg text-sm font-semibold border border-[var(--border-default)] text-[var(--text-secondary)] bg-[var(--surface-card)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open Website
              </a>

              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 rounded-lg text-sm border border-[var(--border-default)] text-[var(--text-primary)] bg-[var(--surface-card)] hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                title="Property Workspace Settings"
              >
                <Settings className="w-5 h-5 text-[var(--text-secondary)]" />
              </button>
            </div>
          </div>

          {/* Workspace Tabs Navigation */}
          <div className="flex border-b border-[var(--border-default)] mb-6 overflow-x-auto">
            {([
              { id: 'overview', label: 'Overview', icon: Shield },
              { id: 'installation', label: 'Installation', icon: Code },
              { id: 'verification', label: 'Verification', icon: CheckCircle2 },
              { id: 'coverage', label: 'Page Coverage', icon: Layers },
              { id: 'analytics', label: 'Analytics', icon: BarChart3 },
              { id: 'settings', label: 'Settings', icon: Settings },
              { id: 'activity', label: 'Activity Logs', icon: Clock }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all shrink-0 whitespace-nowrap",
                  activeTab === tab.id
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Workspace Cards Layout (Organized by active tab) */}
          <div className="grid grid-cols-1 gap-6">

            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Active Banner and Notice Status */}
                <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-[var(--text-primary)]">Active Consent Banner</h3>
                        <p className="text-xs text-[var(--text-secondary)]">The cookie overlay deployed to this workspace.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {property.active_banner && (
                        <button
                          onClick={() => onNavigateToBannerBuilder?.(property.active_banner!.banner_id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit Layout
                        </button>
                      )}
                      <button
                        onClick={() => setShowBannerModal(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90 transition-all"
                      >
                        {property.active_banner ? 'Change Banner' : 'Link Banner'}
                      </button>
                    </div>
                  </div>

                  {property.active_banner ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Banner Configuration</span>
                        <span className="text-base font-bold text-[var(--text-primary)] mt-2 block truncate">
                          {property.active_banner_name || 'Consent Overlay'}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] mt-1">
                          Active since: {new Date(property.active_banner.activated_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Consent Notice Mapping</span>
                        <span className="text-base font-bold text-[var(--text-primary)] mt-2 block flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          Notice Associated
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] mt-1">
                          Purpose list dynamically updated
                        </span>
                      </div>

                      <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] flex flex-col justify-between items-start">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider">Actions</span>
                        <button
                          onClick={handleRemoveBanner}
                          className="mt-3 text-xs font-semibold text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Disconnect Banner
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-[var(--border-default)] rounded-xl bg-[var(--surface-base)]">
                      <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3 animate-pulse" />
                      <h4 className="font-semibold text-sm text-[var(--text-primary)] mb-1">No Active Banner Deployed</h4>
                      <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mb-4">
                        Deploying a banner is mandatory for DPDPA script enforcement compliance.
                      </p>
                      <button
                        onClick={() => setShowBannerModal(true)}
                        className="px-4 py-2 text-xs font-bold bg-[var(--brand-primary)] text-white rounded-lg shadow hover:opacity-90 transition-all"
                      >
                        Assign Banner Workspace
                      </button>
                    </div>
                  )}
                </div>

                {/* Tag Manager Summary Card */}
                <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-center border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
                      <h3 className="font-bold text-[var(--text-primary)]">Tag Manager</h3>
                    </div>
                    <button
                      onClick={onNavigateToTagManager}
                      className="text-xs font-bold text-[var(--brand-primary)] hover:underline animate-pulse"
                    >
                      Configure tags ↗
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] text-center">
                      <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block">Containers</span>
                      <span className="text-xl font-bold text-[var(--text-primary)] mt-1 block">{tagStats.containers}</span>
                    </div>
                    <div className="p-3.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] text-center">
                      <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block">Enforced Tags</span>
                      <span className="text-xl font-bold text-[var(--text-primary)] mt-1 block">{tagStats.tags}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--brand-primary)] animate-ping" />
                      <span className="text-[var(--text-secondary)] font-medium">Tag Rules Health</span>
                    </div>
                    <span className="font-bold text-[var(--brand-primary)]">{tagStats.health}%</span>
                  </div>
                </div>

              </div>
            )}

            {/* 2. INSTALLATION TAB */}
            {activeTab === 'installation' && (
              <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[var(--status-info-bg)] text-[var(--status-info)]">
                      <Code className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--text-primary)]">Deployment Snippet</h3>
                      <p className="text-xs text-[var(--text-secondary)]">Install the client libraries inside your framework of choice.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyCode(getCodeSnippetForTab())}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedText ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={handleDownloadSnippet}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download HTML
                    </button>
                    <button
                      onClick={() => setShowAgentPromptModal(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Prompt for Agent
                    </button>
                    <button
                      onClick={() => setShowEmailInput(!showEmailInput)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--brand-primary)] text-white hover:opacity-90 transition-all flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Email Dev
                    </button>
                  </div>
                </div>

                {/* Email Form */}
                {showEmailInput && (
                  <form onSubmit={handleEmailSnippet} className="mb-4 p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] flex items-center gap-3">
                    <input
                      type="email"
                      required
                      placeholder="developer@company.com"
                      value={emailDeveloper}
                      onChange={(e) => setEmailDeveloper(e.target.value)}
                      className="flex-1 bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                      type="submit"
                      disabled={isSendingEmail}
                      className="px-4 py-2 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-lg disabled:opacity-50"
                    >
                      {isSendingEmail ? 'Sending...' : 'Send Snippet'}
                    </button>
                  </form>
                )}

                 {/* Tab Selector */}
                 <div className="flex flex-wrap border-b border-[var(--border-default)] mb-4">
                   {(['html', 'react', 'nextjs', 'angular', 'vue', 'gtm', 'wordpress', 'ios', 'android', 'flutter', 'react-native'] as const).map((tab) => {
                     const label = INSTALLATION_ADAPTERS[tab]?.label || tab.toUpperCase();
                     return (
                       <button
                         key={tab}
                         onClick={() => setInstallTab(tab)}
                         className={cn(
                           "px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all",
                           installTab === tab
                             ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                             : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                         )}
                       >
                         {label}
                       </button>
                     );
                   })}
                 </div>

                {/* Dark Code Block */}
                <div className="relative rounded-xl overflow-hidden bg-[#0A0A0A] border border-zinc-800">
                  <pre className="p-5 font-mono text-[13px] text-zinc-300 overflow-x-auto leading-relaxed max-h-[300px]">
                    <code>{getCodeSnippetForTab()}</code>
                  </pre>
                </div>

                <div className="mt-3 flex items-start gap-2 text-xs text-[var(--text-secondary)] font-medium">
                  <Info className="w-4 h-4 text-[var(--brand-primary)] mt-0.5 shrink-0" />
                  <span>{getGuideTip()}</span>
                </div>
              </div>
            )}

            {/* 3. VERIFICATION TAB */}
            {activeTab === 'verification' && (
              <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                  <h3 className="font-bold text-[var(--text-primary)] text-base">Compliance Verification</h3>
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-4 h-4 text-[var(--text-secondary)]", isVerifying && "animate-spin")} />
                  </button>
                </div>

                {!latestVerification ? (
                  <div className="py-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Unverified</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1 mb-3">CMP deployment has not been verified yet.</p>
                    <button
                      onClick={handleVerify}
                      className="px-3 py-1.5 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-lg"
                    >
                      Run Checklist Verify
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className={cn(
                      "p-3 rounded-lg border flex items-center gap-2",
                      latestVerification.all_passed
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                    )}>
                      {latestVerification.all_passed ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0" />
                      )}
                      <div className="flex-1">
                        <span className="text-xs font-bold">
                          {latestVerification.all_passed ? 'All Checks Passed' : 'Verification Issue Found'}
                        </span>
                        <p className="text-[10px] opacity-90 mt-0.5">
                          Checked: {new Date(latestVerification.checked_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-[var(--border-default)] text-xs">
                      <div className="py-2.5 flex items-center justify-between">
                        <span className="text-[var(--text-secondary)] font-medium">Snippet Detected</span>
                        {latestVerification.snippet_detected ? (
                          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4.5 h-4.5 text-red-500" />
                        )}
                      </div>
                      <div className="py-2.5 flex items-center justify-between">
                        <span className="text-[var(--text-secondary)] font-medium">Correct Property ID</span>
                        {latestVerification.correct_property_id ? (
                          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4.5 h-4.5 text-red-500" />
                        )}
                      </div>
                      <div className="py-2.5 flex items-center justify-between">
                        <span className="text-[var(--text-secondary)] font-medium">Banner Render Check</span>
                        {latestVerification.banner_rendered ? (
                          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4.5 h-4.5 text-red-500" />
                        )}
                      </div>
                      <div className="py-2.5 flex items-center justify-between">
                        <span className="text-[var(--text-secondary)] font-medium">SSL / HTTPS Valid</span>
                        {latestVerification.ssl_valid ? (
                          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4.5 h-4.5 text-red-500" />
                        )}
                      </div>
                      <div className="py-2.5 flex items-center justify-between">
                        <span className="text-[var(--text-secondary)] font-medium">Script Load Order</span>
                        {latestVerification.loaded_before_trackers ? (
                          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4.5 h-4.5 text-red-500" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. COVERAGE TAB */}
            {activeTab === 'coverage' && (
              <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                  <div>
                    <h3 className="font-bold text-[var(--text-primary)]">Domain Page Coverage</h3>
                    <p className="text-[10px] text-[var(--text-secondary)]">Presence of Vajra scripts across pages.</p>
                  </div>
                  <button
                    onClick={handleScan}
                    disabled={isScanning}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-4 h-4 text-[var(--text-secondary)]", isScanning && "animate-spin")} />
                  </button>
                </div>

                {!latestScan ? (
                  <div className="py-6 text-center">
                    <p className="text-xs text-[var(--text-secondary)]">No crawler scans executed.</p>
                    <button
                      onClick={handleScan}
                      className="mt-3 px-3 py-1.5 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-lg"
                    >
                      Start Scan Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Progress slider bar */}
                    <div>
                      <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="text-[var(--text-primary)]">CMP Snippet Present</span>
                        <span className="text-emerald-500">{Math.round(latestScan.coverage_percentage)}%</span>
                      </div>
                      <div className="w-full bg-[var(--surface-base)] rounded-full h-2 overflow-hidden border border-[var(--border-default)]">
                        <div
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{ width: `${latestScan.coverage_percentage}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-[var(--text-secondary)] font-medium mt-1">
                        <span>Protected: {latestScan.pages_with_cmp} / {latestScan.total_pages_found} pages</span>
                        <span>Missing: {latestScan.pages_without_cmp}</span>
                      </div>
                    </div>

                    {latestScan.pages_without_cmp > 0 && (
                      <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)]">
                        <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          Unprotected Paths Found
                        </span>
                        <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1">
                          {latestScan.pages_missing_cmp_urls.map((path, i) => (
                            <div key={i} className="text-[10px] font-mono break-all text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                              {path}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Scan Pages Detailed Drill-down list */}
                    {latestScan.pages && latestScan.pages.length > 0 && (
                      <div className="border-t border-[var(--border-default)] pt-4">
                        <h4 className="text-xs font-bold text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-[var(--brand-primary)]" />
                          Scanned Pages Drill-down View
                        </h4>
                        <div className="overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)]">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-[var(--surface-raised)] border-b border-[var(--border-default)] font-bold text-[var(--text-secondary)]">
                              <tr>
                                <th className="p-3">Page URL</th>
                                <th className="p-3">Snippet status</th>
                                <th className="p-3 text-right">Load Speed</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-default)] text-[var(--text-secondary)]">
                              {scanPagesPager.slice.map((p) => (
                                <tr key={p.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                                  <td className="p-3 font-mono break-all max-w-xs">{p.url}</td>
                                  <td className="p-3">
                                    <span className={cn(
                                      "inline-flex items-center gap-1 font-semibold",
                                      p.snippet_detected ? "text-emerald-500" : "text-red-500"
                                    )}>
                                      {p.snippet_detected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                      {p.snippet_detected ? 'Detected' : 'Missing'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold text-[var(--text-primary)]">{p.load_time}ms</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <TablePager
                            page={scanPagesPager.page}
                            pageCount={scanPagesPager.pageCount}
                            total={scanPagesPager.total}
                            pageSize={scanPagesPager.pageSize}
                            onPage={scanPagesPager.setPage}
                          />
                        </div>
                      </div>
                    )}

                    {/* Historical scans accordion toggle */}
                    <div className="border-t border-[var(--border-default)] pt-3">
                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="w-full flex justify-between items-center text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <span className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5" />
                          Scan History ({scanHistory.length})
                        </span>
                        {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {showHistory && (
                        <div className="mt-3 space-y-2 max-h-[150px] overflow-y-auto pr-1">
                          {scanHistory.map((historyItem) => (
                            <div key={historyItem.id} className="p-2 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] text-[11px] flex justify-between items-center">
                              <div>
                                <span className="font-bold text-[var(--text-primary)]">
                                  {Math.round(historyItem.coverage_percentage)}% Coverage
                                </span>
                                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                  {new Date(historyItem.started_at).toLocaleDateString()} - {historyItem.total_pages_found} pages
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold uppercase tracking-wider text-[9px]">
                                {historyItem.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. ANALYTICS TAB */}
            {activeTab === 'analytics' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* Left: Main Analytics Card (3 columns wide) */}
                <div className="lg:col-span-3 p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[var(--status-ai-bg)] text-[var(--status-ai)]">
                        <Activity className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-[var(--text-primary)]">Consent Analytics & Performance</h3>
                        <p className="text-xs text-[var(--text-secondary)]">CMP load speeds, impressions and consent configurations.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={loadAnalytics}
                        disabled={isLoadingAnalytics}
                        className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50 shadow-sm"
                        title="Sync Analytics"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isLoadingAnalytics && "animate-spin")} />
                        <span>Sync</span>
                      </button>

                      <div className="flex bg-[var(--surface-base)] rounded-lg p-0.5 border border-[var(--border-default)]">
                        {([7, 30, 90, 365] as const).map((days) => (
                          <button
                            key={days}
                            onClick={() => setAnalyticsDays(days)}
                            className={cn(
                              "px-2.5 py-1 text-xs font-bold rounded-md transition-colors",
                              analyticsDays === days
                                ? "bg-[var(--surface-card)] shadow text-[var(--text-primary)]"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            )}
                          >
                            {days === 365 ? '1Y' : `${days}D`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] shadow-inner">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        Visitors
                      </span>
                      <div className="text-xl font-bold text-[var(--text-primary)] mt-1.5">{totalVisitors.toLocaleString()}</div>
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] shadow-inner">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                        Consent Rate
                      </span>
                      <div className="text-xl font-bold text-emerald-500 mt-1.5">{avgConsentRate}%</div>
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] shadow-inner">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] flex items-center gap-1">
                        <MousePointerClick className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        Opt-outs
                      </span>
                      <div className="text-xl font-bold text-[var(--text-primary)] mt-1.5">
                        {analyticsData.reduce((sum, d) => sum + d.consent_denied, 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] shadow-inner">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        Avg Load Speed
                      </span>
                      <div className="text-xl font-bold text-amber-500 mt-1.5">{avgLoadTime}ms</div>
                    </div>
                  </div>

                  <div className="flex gap-4 mb-4 border-b border-[var(--border-default)]">
                    <button
                      onClick={() => setAnalyticsTab('consent')}
                      className={cn(
                        "pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors px-1",
                        analyticsTab === 'consent' ? "border-[var(--brand-primary)] text-[var(--brand-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      Consent Trend
                    </button>
                    <button
                      onClick={() => setAnalyticsTab('performance')}
                      className={cn(
                        "pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors px-1",
                        analyticsTab === 'performance' ? "border-[var(--brand-primary)] text-[var(--brand-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      Load Speed (ms)
                    </button>
                  </div>

                  <div className="h-[250px] w-full">
                    {isLoadingAnalytics ? (
                      <div className="w-full h-full flex items-center justify-center opacity-50">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : chartData.length === 0 ? (
                      <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-secondary)] border border-dashed rounded-lg">
                        No analytics data records available for this time range.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        {analyticsTab === 'consent' ? (
                          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorConsentRate" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--status-success)" stopOpacity={0.25}/>
                                <stop offset="95%" stopColor="var(--status-success)" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
                            <XAxis 
                              dataKey="formattedDate" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} 
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                              tickFormatter={(val) => `${val}%`}
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: 12 }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="consentRate" 
                              stroke="var(--status-success)" 
                              strokeWidth={2}
                              fillOpacity={1} 
                              fill="url(#colorConsentRate)" 
                              name="Consent Rate"
                            />
                          </AreaChart>
                        ) : (
                          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
                            <XAxis 
                              dataKey="formattedDate" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} 
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                              tickFormatter={(val) => `${val}ms`}
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: 12 }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="avg_load_time_ms" 
                              stroke="var(--status-warning)" 
                              strokeWidth={2}
                              dot={{ r: 3, fill: 'var(--status-warning)', strokeWidth: 0 }}
                              name="Avg Load Time"
                            />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Right: Analytics of Expired Banners Column (1 column wide) */}
                <div className="lg:col-span-1 p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm flex flex-col">
                  <h3 className="font-bold text-sm text-[var(--text-primary)] border-b border-[var(--border-default)] pb-4 mb-4">
                    Analytics of Expired Banners
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-4">
                    Select a deployed or historical banner version to display its specific analytics logs.
                  </p>

                  <div className="flex flex-col gap-2 flex-grow overflow-y-auto max-h-[380px] pr-1">
                    {analyticsBanners.length === 0 ? (
                      <div className="text-xs text-[var(--text-secondary)] text-center py-8 border border-dashed border-[var(--border-default)] rounded-xl bg-[var(--surface-base)]">
                        No historical banners found.
                      </div>
                    ) : (
                      analyticsBanners.map((b) => {
                        const isActive = property?.active_banner?.banner_id === b.id;
                        const isSelected = selectedBannerId === b.id;
                        return (
                          <button
                            key={b.id}
                            onClick={() => setSelectedBannerId(b.id)}
                            className={cn(
                              "w-full text-left p-3 rounded-lg border text-xs transition-all flex flex-col gap-1.5",
                              isSelected 
                                ? "bg-[var(--brand-primary)]/10 border-[var(--brand-primary)] text-[var(--text-primary)]" 
                                : "bg-[var(--surface-base)] border-[var(--border-default)] hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-secondary)]"
                            )}
                          >
                            <div className="flex justify-between items-center w-full">
                              <span className="font-semibold truncate max-w-[150px]">{b.name}</span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                isActive 
                                  ? "bg-emerald-500/20 text-emerald-500" 
                                  : "bg-zinc-500/20 text-zinc-400"
                              )}>
                                {isActive ? 'Active' : 'Expired'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] opacity-75">
                              <span>Version {b.version}</span>
                              <span>{b.display_style} ({b.position})</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* 6. SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Extensible Settings configuration Card */}
                <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                  <div className="flex justify-between items-center border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
                      <h3 className="font-bold text-[var(--text-primary)]">Extensible Settings</h3>
                    </div>
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="px-2.5 py-1 text-xs font-semibold border border-[var(--border-default)] rounded hover:bg-black/5 text-[var(--text-primary)]"
                    >
                      Edit Workspace Settings
                    </button>
                  </div>

                  <div className="divide-y divide-[var(--border-default)] text-xs">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-[var(--text-secondary)] font-medium">Property Type</span>
                      <span className="font-bold text-[var(--text-primary)] uppercase">{property.property_type}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-[var(--text-secondary)] font-medium">Deployment Environment</span>
                      <span className="font-bold text-[var(--text-primary)] uppercase">{property.settings?.environment || property.environment}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-[var(--text-secondary)] font-medium">Enforcement Blocker Mode</span>
                      <span className="font-bold text-[var(--text-primary)] uppercase">{property.settings?.blocker_mode || property.blocker_mode}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-[var(--text-secondary)] font-medium">Compliance Language</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {property.settings?.default_language || property.default_language} 
                        {(property.settings?.auto_language ?? property.auto_language) ? ' (Auto Detect)' : ' (Fixed)'}
                      </span>
                    </div>
                    <div className="py-2.5 flex flex-col gap-1.5">
                      <span className="text-[var(--text-secondary)] font-medium">Allowed Domain Origins</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {property.settings?.allowed_origins && property.settings.allowed_origins.length > 0 ? (
                          property.settings.allowed_origins.map((org, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-default)] font-mono text-[10px]">
                              {org}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-[var(--text-tertiary)] italic">All origins allowed (*)</span>
                        )}
                      </div>
                    </div>
                    <div className="py-2.5 flex flex-col gap-1">
                      <span className="text-[var(--text-secondary)] font-medium">Advanced Metadata JSON</span>
                      <pre className="mt-1.5 p-3 rounded-lg bg-[#0F0F0F] text-zinc-300 font-mono text-[10px] overflow-x-auto leading-relaxed border border-zinc-800">
                        {JSON.stringify(property.settings?.advanced_metadata || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* SDK Security & Hardening Status Card */}
                <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-[var(--text-primary)]">CMP.js SDK Security & Hardening</h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Hardened (6/6 Layers)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] flex items-start gap-3">
                      <div className="p-2 rounded bg-indigo-500/10 text-indigo-500">
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">HMAC Session Token Exchange</div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Raw API key is scrubbed from <code className="font-mono text-[10px]">window.Vajra</code> after exchange for 30-min JWT.
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] flex items-start gap-3">
                      <div className="p-2 rounded bg-emerald-500/10 text-emerald-500">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">Domain Origin Guard</div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {(property.allowed_origins || property.settings?.allowed_origins)?.length
                            ? `Restricted to ${(property.allowed_origins || property.settings?.allowed_origins)?.length} authorized origin(s)`
                            : 'All origins allowed (Configure in Settings tab for strict domain locking)'}
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] flex items-start gap-3">
                      <div className="p-2 rounded bg-amber-500/10 text-amber-500">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">Minified Bundle & Headers</div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Served as minified <code className="font-mono text-[10px]">cmp.min.js</code> with immutable caching & CSP headers.
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] flex items-start gap-3">
                      <div className="p-2 rounded bg-purple-500/10 text-purple-500">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">Public Rate Limiting</div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Sliding window throttles on <code className="font-mono text-[10px]">/token</code> (30/min) & <code className="font-mono text-[10px]">/consent</code> (120/min).
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* API Access Key Card */}
                <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Key className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
                      <h3 className="font-bold text-[var(--text-primary)]">API Keys</h3>
                    </div>
                    <button
                      onClick={() => setShowRotateKeyModal(true)}
                      className="px-2.5 py-1 text-xs font-bold bg-[var(--brand-primary)] text-white rounded hover:opacity-90 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Rotate Key
                    </button>
                  </div>

                  <div className="space-y-3">
                    {property.api_keys?.length === 0 ? (
                      <div className="text-center py-4 text-xs text-[var(--text-secondary)]">
                        No active API keys setup.
                      </div>
                    ) : (
                      property.api_keys?.map((key) => (
                        <div key={key.id} className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[var(--text-primary)]">{key.label}</span>
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider",
                                key.status === 'active' ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              )}>
                                {key.status}
                              </span>
                            </div>
                             <div className="mt-1 flex items-center gap-1.5">
                              <span className="font-mono text-xs text-[var(--text-secondary)]">{key.key_prefix}*********</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(key.key_prefix);
                                  notify('Key prefix copied. Full secret key is hidden for security.');
                                }}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                title="Copy Prefix"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="text-[9px] text-[var(--text-tertiary)] block mt-1.5">
                              Created: {new Date(key.created_at).toLocaleDateString()}
                              {key.created_by && ` by user: ${key.created_by.substring(0, 8)}...`}
                            </span>
                          </div>
                          {key.status === 'active' && (
                            <button
                              onClick={() => handleRevokeKey(key.id)}
                              className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                              title="Revoke Key"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    {property.api_keys && property.api_keys.length > 0 && (
                      <div className="mt-4 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] text-[10px] leading-relaxed flex gap-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                        <div>
                          For security reasons, only the API key prefix is visible here. The full secret key is only displayed once when generated. If you have lost your secret key, please rotate it.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deployment Targets Card */}
                <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Server className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
                      <div>
                        <h3 className="font-bold text-[var(--text-primary)] text-sm">Deployment Targets</h3>
                        <p className="text-[11px] text-[var(--text-secondary)]">Create and manage multi-platform SDK configuration environments linked to this property.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddDeploymentModal(true)}
                      className="px-3 py-1.5 text-xs font-bold bg-[var(--brand-primary)] text-white rounded hover:opacity-90 flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Add Deployment Target
                    </button>
                  </div>

                  {deployments.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-[var(--border-default)] rounded-xl bg-[var(--surface-base)]">
                      <Layers className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-[var(--text-secondary)] font-medium">No deployment targets configured yet.</p>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Register Android, iOS, or separate Web environments to begin client configurations.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Left: Deployment List (1/3 width) */}
                      <div className="md:col-span-1 border-r border-[var(--border-default)] pr-6 space-y-2 max-h-[400px] overflow-y-auto">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block mb-1">Active Targets</span>
                        {deployments.map((dep) => {
                          const isSelected = selectedDeploymentId === dep.id;
                          return (
                            <button
                              key={dep.id}
                              onClick={() => setSelectedDeploymentId(dep.id)}
                              className={cn(
                                "w-full p-3 rounded-lg text-left border flex items-center gap-3 transition-all",
                                isSelected
                                  ? "bg-[var(--surface-raised)] border-[var(--brand-primary)] shadow-sm text-[var(--brand-primary)]"
                                  : "bg-[var(--surface-base)] border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
                              )}
                            >
                              <div className={cn(
                                "p-2 rounded-lg",
                                isSelected ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]" : "bg-black/5 text-[var(--text-secondary)] dark:bg-white/5"
                              )}>
                                {dep.platform === 'website' && <Globe className="w-4.5 h-4.5" />}
                                {['android', 'ios', 'flutter', 'react_native'].includes(dep.platform) && <Smartphone className="w-4.5 h-4.5" />}
                                {dep.platform === 'tag_manager' && <Layers className="w-4.5 h-4.5" />}
                                {!['website', 'android', 'ios', 'flutter', 'react_native', 'tag_manager'].includes(dep.platform) && <Server className="w-4.5 h-4.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-xs text-[var(--text-primary)] block truncate">{dep.name}</span>
                                <span className="text-[10px] text-[var(--text-secondary)] font-mono block truncate">{dep.identifier}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Right: Selected Deployment Details & Versions (2/3 width) */}
                      <div className="md:col-span-2 space-y-4">
                        {(() => {
                          const dep = deployments.find(d => d.id === selectedDeploymentId);
                          if (!dep) {
                            return (
                              <div className="text-center py-12 text-xs text-[var(--text-secondary)]">
                                Select a deployment target from the list to view version history and config status.
                              </div>
                            );
                          }

                          return (
                            <>
                              {/* Header info */}
                              <div className="p-4 rounded-xl bg-[var(--surface-base)] border border-[var(--border-default)] flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-xs text-[var(--text-primary)]">{dep.name}</h4>
                                    <span className={cn(
                                      "text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider",
                                      dep.status === 'published' ? "bg-emerald-500/10 text-emerald-500" :
                                      dep.status === 'verified' ? "bg-blue-500/10 text-blue-500" :
                                      "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                    )}>
                                      {dep.status}
                                    </span>
                                  </div>
                                  <div className="mt-1 space-y-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                                    <div>Platform: <span className="uppercase text-[var(--text-primary)]">{dep.platform.replace('_', ' ')}</span></div>
                                    <div>Identifier: <span className="text-[var(--text-primary)]">{dep.identifier}</span></div>
                                  </div>
                                </div>
                                <div className="text-right text-[10px] text-[var(--text-secondary)]">
                                  <span>Registered: {new Date(dep.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>

                              {/* Version History list */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)]">Configuration Versions</span>
                                </div>

                                <div className="border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--surface-base)] font-sans">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-default)] text-[10px] uppercase font-bold text-[var(--text-secondary)]">
                                        <th className="p-3">Version</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Updated</th>
                                        <th className="p-3 text-right">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-default)]">
                                      {deploymentVersions.length === 0 ? (
                                        <tr>
                                          <td colSpan={4} className="p-4 text-center text-[var(--text-secondary)] italic">
                                            No configuration versions found.
                                          </td>
                                        </tr>
                                      ) : (
                                        versionsPager.slice.map((v) => (
                                          <tr key={v.id} className="hover:bg-[var(--surface-raised)]/50">
                                            <td className="p-3 font-mono font-bold text-[var(--text-primary)]">
                                              v{v.version_number}
                                            </td>
                                            <td className="p-3">
                                              <span className={cn(
                                                "text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider",
                                                v.status === 'published' ? "bg-emerald-500/10 text-emerald-500" :
                                                v.status === 'draft' ? "bg-amber-500/10 text-amber-500" :
                                                "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                              )}>
                                                {v.status}
                                              </span>
                                            </td>
                                            <td className="p-3 text-[10px] text-[var(--text-secondary)]">
                                              {new Date(v.created_at).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right">
                                              {v.status !== 'published' ? (
                                                <button
                                                  onClick={() => handlePublishVersion(dep.id, v.id)}
                                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--brand-primary)] text-white hover:opacity-90"
                                                >
                                                  Publish
                                                </button>
                                              ) : (
                                                <span className="text-[10px] font-medium text-emerald-500 flex items-center gap-0.5 justify-end">
                                                  <Check className="w-3.5 h-3.5" /> Active
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                  <TablePager
                                    page={versionsPager.page}
                                    pageCount={versionsPager.pageCount}
                                    total={versionsPager.total}
                                    pageSize={versionsPager.pageSize}
                                    onPage={versionsPager.setPage}
                                  />
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="lg:col-span-2 p-6 rounded-xl bg-red-500/5 border border-red-500/20 shadow-sm mt-6">
                  <div className="flex items-center justify-between border-b border-red-500/10 pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <h3 className="font-bold text-red-600 text-sm">Danger Zone</h3>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">Delete Target Property</h4>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                        Permanently delete this property, its API keys, live banner associations, custom containers, scanned pages, and consent receipts. This action is irreversible.
                      </p>
                    </div>
                    <button
                      onClick={handleDeletePropertyClick}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg flex items-center gap-2 shrink-0 transition-colors shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Property
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* 7. ACTIVITY TAB */}
            {activeTab === 'activity' && (
              <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
                <div className="flex items-center gap-2 border-b border-[var(--border-default)] pb-4 mb-4">
                  <Activity className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
                  <h3 className="font-bold text-[var(--text-primary)]">Property Workspace Logs</h3>
                </div>

                <div className="max-h-[500px] overflow-y-auto space-y-4 pr-1">
                  {propertyEvents.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[var(--text-secondary)]">
                      No activity logs recorded for this property workspace.
                    </div>
                  ) : (
                    propertyEvents.map((evt) => (
                      <div key={evt.id} className="flex gap-3 text-xs items-start">
                        <div className="mt-0.5 p-1 rounded bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center gap-2">
                            <span className="font-bold text-[var(--text-primary)] break-all">
                              {evt.event_type.replace(/_/g, ' ').toUpperCase()}
                            </span>
                            <span className="text-[9px] text-[var(--text-tertiary)] shrink-0">
                              {new Date(evt.created_at).toLocaleString()}
                            </span>
                          </div>
                          
                          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                            {evt.event_type === 'property_created' && 'Registered property workspace target.'}
                            {evt.event_type === 'property_updated' && 'Modified standard properties configuration.'}
                            {evt.event_type === 'settings_updated' && 'Updated extensible properties settings schema.'}
                            {evt.event_type === 'banner_changed' && 'Assigned a different Consent Banner overlay to the property.'}
                            {evt.event_type === 'api_key_rotated' && 'Rotated live API access key.'}
                            {evt.event_type === 'api_key_generated' && 'Generated a new API access key pair.'}
                            {evt.event_type === 'api_key_revoked' && 'Revoked active API access key.'}
                            {evt.event_type === 'verification_started' && 'Started manual compliance verification scan.'}
                            {evt.event_type === 'verification_completed' && `Verification completed. Status: ${evt.payload?.all_passed ? 'PASSED' : 'FAILED'}.`}
                            {evt.event_type === 'coverage_scan_started' && 'Initiated crawling page scanning.'}
                            {evt.event_type === 'coverage_scan_completed' && `Domain crawl completed. Scanned ${evt.payload?.total_pages || 0} pages. Coverage: ${Math.round(evt.payload?.coverage_percentage || 0)}%.`}
                            {evt.event_type === 'snippet_copied' && 'Snippet copied to clipboard.'}
                            {evt.event_type === 'developer_email_sent' && `Snippet installation guides emailed to: ${evt.payload?.email || ''}`}
                            
                            {!['property_created', 'property_updated', 'settings_updated', 'banner_changed', 'api_key_rotated', 'api_key_generated', 'api_key_revoked', 'verification_started', 'verification_completed', 'coverage_scan_started', 'coverage_scan_completed', 'snippet_copied', 'developer_email_sent'].includes(evt.event_type) && (
                              <span className="font-mono text-[9px] block max-w-full overflow-x-auto">
                                {JSON.stringify(evt.payload)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* --- POPUP MODALS --- */}

      {/* 1. Change Banner Modal */}
      {showBannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base">Select Consent Banner</h3>
                <p className="text-xs text-[var(--text-secondary)]">Assign a live banner to render on {property.domain}.</p>
              </div>
              <button
                onClick={() => {
                  setShowBannerModal(false);
                  setBannerSearchQuery('');
                }}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="p-4 border-b border-[var(--border-default)] bg-[var(--surface-base)]">
              <input
                type="text"
                placeholder="Search banners by name..."
                value={bannerSearchQuery}
                onChange={(e) => setBannerSearchQuery(e.target.value)}
                className="w-full bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {banners
                .filter(b => b.name.toLowerCase().includes(bannerSearchQuery.toLowerCase()))
                .map((b) => (
                  <div
                    key={b.id}
                    className={cn(
                      "p-3 rounded-lg border flex items-center justify-between transition-all hover:bg-black/5 dark:hover:bg-white/5",
                      property.active_banner?.banner_id === b.id
                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                        : "border-[var(--border-default)] bg-[var(--surface-card)]"
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{b.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          v{b.version}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] mt-1.5 block">
                        Last saved: {new Date(b.updated_at).toLocaleDateString()}
                      </span>
                    </div>

                    {property.active_banner?.banner_id === b.id ? (
                      <span className="text-xs font-bold text-[var(--brand-primary)] flex items-center gap-1">
                        <Check className="w-4 h-4" /> Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAssignBanner(b.id)}
                        className="px-3 py-1 bg-[var(--brand-primary)] text-white text-xs font-semibold rounded hover:opacity-90 transition-all"
                      >
                        Deploy Banner
                      </button>
                    )}
                  </div>
                ))}
              {banners.filter(b => b.name.toLowerCase().includes(bannerSearchQuery.toLowerCase())).length === 0 && (
                <div className="text-center py-6 text-xs text-[var(--text-secondary)]">
                  No match found. Banners must be set to 'Live' status in Banner Builder to display here.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Workspace / Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveSettings} className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-md shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)] shrink-0">
              <h3 className="font-bold text-[var(--text-primary)] text-base">Workspace Settings</h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5">DISPLAY NAME</label>
                <input
                  type="text"
                  required
                  value={editFields.displayName}
                  onChange={(e) => setEditFields({ ...editFields, displayName: e.target.value })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5">PROPERTY TYPE</label>
                <select
                  value={editFields.propertyType}
                  onChange={(e) => setEditFields({ ...editFields, propertyType: e.target.value as any })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] font-bold uppercase"
                >
                  <option value="website">Website</option>
                  <option value="android">Android Mobile App</option>
                  <option value="ios">iOS Mobile App</option>
                  <option value="tag_manager">Tag Manager Container</option>
                  <option value="server">Server Side</option>
                  <option value="api">API Endpoint</option>
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5">DEPLOYMENT ENVIRONMENT</label>
                <select
                  value={editFields.environment}
                  onChange={(e) => setEditFields({ ...editFields, environment: e.target.value as any })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                >
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5">BLOCKER MODE</label>
                <select
                  value={editFields.blockerMode}
                  onChange={(e) => setEditFields({ ...editFields, blockerMode: e.target.value as any })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                >
                  <option value="strict">Strict (Block all trackers until explicit consent)</option>
                  <option value="standard">Standard (Block non-essential trackers)</option>
                  <option value="off">Off (Enforce tag rules only)</option>
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5">DEFAULT COMPLIANCE LANGUAGE</label>
                <input
                  type="text"
                  maxLength={10}
                  required
                  value={editFields.defaultLanguage}
                  onChange={(e) => setEditFields({ ...editFields, defaultLanguage: e.target.value })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  id="auto_lang"
                  checked={editFields.autoLanguage}
                  onChange={(e) => setEditFields({ ...editFields, autoLanguage: e.target.checked })}
                  className="rounded border-[var(--border-default)] text-[var(--brand-primary)]"
                />
                <label htmlFor="auto_lang" className="text-[var(--text-secondary)] font-semibold select-none cursor-pointer">
                  Auto-detect User Browser Language
                </label>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1">ALLOWED DOMAIN ORIGINS</label>
                <span className="text-[10px] text-[var(--text-secondary)] block mb-1">Comma-separated list of allowed origins (e.g. https://domain.com, https://sub.domain.com).</span>
                <input
                  type="text"
                  placeholder="https://example.com, https://sub.example.com"
                  value={editFields.allowedOrigins}
                  onChange={(e) => setEditFields({ ...editFields, allowedOrigins: e.target.value })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] font-mono"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1">ADVANCED METADATA JSON</label>
                <span className="text-[10px] text-[var(--text-secondary)] block mb-1">Extensible configuration block for client SDK parameter overlays.</span>
                <textarea
                  rows={4}
                  value={editFields.advancedMetadata}
                  onChange={(e) => setEditFields({ ...editFields, advancedMetadata: e.target.value })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] font-mono leading-relaxed"
                />
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border-default)] bg-[var(--surface-raised)] flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingSettings}
                className="px-4 py-2 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {isSavingSettings ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Property Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-[var(--text-primary)] text-base">Delete Property</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
              {isLoadingDeleteImpact ? (
                <div className="flex flex-col items-center justify-center py-8 text-[var(--text-secondary)] gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-primary)]" />
                  <span className="font-medium">Calculating deletion impact...</span>
                </div>
              ) : deleteImpact ? (
                <>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    Are you sure you want to delete the property <strong className="text-[var(--text-primary)]">{property.display_name || property.domain}</strong>? This will permanently erase the configuration and all associated data.
                  </p>

                  {deleteImpact.has_relations ? (
                    <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10 space-y-3">
                      <div className="font-bold text-red-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Warning: The following associated resources will be permanently deleted:
                      </div>
                      <ul className="space-y-1.5 text-[var(--text-secondary)] list-disc pl-5">
                        {deleteImpact.active_banners_count > 0 && (
                          <li>Active Live Banner: <strong className="text-red-500">{deleteImpact.active_banners_count} live banner(s)</strong> will be disconnected</li>
                        )}
                        {deleteImpact.containers_count > 0 && (
                          <li>Custom GTM Containers: <strong className="text-red-500">{deleteImpact.containers_count} container(s)</strong></li>
                        )}
                        {deleteImpact.api_keys_count > 0 && (
                          <li>Integration API Keys: <strong className="text-red-500">{deleteImpact.api_keys_count} key(s)</strong></li>
                        )}
                        {deleteImpact.scanned_pages_count > 0 && (
                          <li>Scanned Page Indexes: <strong className="text-red-500">{deleteImpact.scanned_pages_count} page(s)</strong></li>
                        )}
                        {deleteImpact.cookies_scanned_count > 0 && (
                          <li>Scanned Cookies/Trackers: <strong className="text-red-500">{deleteImpact.cookies_scanned_count} tracker(s)</strong></li>
                        )}
                        {deleteImpact.consent_receipts_count > 0 && (
                          <li className="list-none -ml-5 mt-2.5 p-2.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                            <span>Consent Audit Records: <strong className="font-semibold text-emerald-700">{deleteImpact.consent_receipts_count} receipt(s)</strong> are preserved for auditing and compliance logs.</span>
                          </li>
                        )}
                      </ul>

                      <div className="mt-4 pt-4 border-t border-red-500/10">
                        <label className="block font-bold text-[var(--text-primary)] mb-2">
                          To confirm, type <code className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 font-mono">delete this property &quot;{deleteImpact.property_name}&quot;</code> below:
                        </label>
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder={`delete this property "${deleteImpact.property_name}"`}
                          className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-base)] border-red-500/20 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-red-500/30"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[var(--text-secondary)]">
                      This property has no active banners, GTM containers, or scanned resources. It is safe to delete.
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="p-4 border-t border-[var(--border-default)] bg-[var(--surface-raised)] flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isDeletingProperty ||
                  isLoadingDeleteImpact ||
                  (deleteImpact?.has_relations &&
                    deleteConfirmText !== `delete this property "${deleteImpact.property_name}"`)
                }
                onClick={handleDeleteProperty}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                {isDeletingProperty && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. API Key Rotation Modal */}
      {showRotateKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <h3 className="font-bold text-[var(--text-primary)] text-base">Rotate API Access Key</h3>
              <button
                type="button"
                onClick={() => {
                  setShowRotateKeyModal(false);
                  setGeneratedKey(null);
                }}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {!generatedKey ? (
                <>
                  <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="w-4.5 h-4.5 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold">Warning</span>
                      <p className="text-[10px] mt-0.5 opacity-90 leading-normal">
                        Rotating the API key invalidates the current live key. Ensure you replace the old API key in your deployment scripts immediately.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[var(--text-secondary)] font-bold mb-1.5">KEY DESCRIPTION LABEL</label>
                    <input
                      type="text"
                      required
                      value={keyLabel}
                      onChange={(e) => setKeyLabel(e.target.value)}
                      className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                    />
                  </div>

                  <button
                    onClick={handleRotateKey}
                    disabled={isRotating}
                    className="w-full py-2 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
                  >
                    {isRotating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5" />
                    )}
                    Generate New Key Pair
                  </button>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold">New Key Generated Successfully</span>
                      <p className="text-[10px] mt-0.5 opacity-90 leading-normal">
                        Copy this private API key now. It will not be shown to you again in full format.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[var(--text-secondary)] font-bold mb-1">NEW PRIVATE API KEY</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={generatedKey.key}
                        className="flex-1 bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono outline-none select-all"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedKey.key);
                          notify('Full key copied.');
                        }}
                        className="p-2 border border-[var(--border-default)] rounded-lg hover:bg-black/5 text-[var(--text-primary)]"
                        title="Copy Key"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowRotateKeyModal(false);
                      setGeneratedKey(null);
                    }}
                    className="w-full py-2 bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] text-xs font-bold rounded-lg"
                  >
                    Done & Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Add Deployment Modal */}
      {showAddDeploymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base">Add Deployment Target</h3>
                <p className="text-xs text-[var(--text-secondary)]">Register a new app, site, or tag container using this property.</p>
              </div>
              <button
                onClick={() => setShowAddDeploymentModal(false)}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateDeployment} className="p-5 space-y-4">
              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5 uppercase">Deployment Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Web or iOS App"
                  value={newDeploymentData.name}
                  onChange={(e) => setNewDeploymentData({ ...newDeploymentData, name: e.target.value })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5 uppercase">Platform Type</label>
                <select
                  value={newDeploymentData.platform}
                  onChange={(e) => setNewDeploymentData({ ...newDeploymentData, platform: e.target.value })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                >
                  <option value="website">Web / CDN Script</option>
                  <option value="android">Android App SDK</option>
                  <option value="ios">iOS App SDK</option>
                  <option value="tag_manager">Google Tag Manager Container</option>
                  <option value="server">Server-side Integration</option>
                  <option value="api">API Endpoint</option>
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold mb-1.5 uppercase">Target Identifier / Bundle ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. com.acme.app or https://acme.com"
                  value={newDeploymentData.identifier}
                  onChange={(e) => setNewDeploymentData({ ...newDeploymentData, identifier: e.target.value })}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddDeploymentModal(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-black/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingDeployment}
                  className="px-4 py-2 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isCreatingDeployment ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Register Deployment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAgentPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" />
                  Agent Instructions Prompt
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">Copy and paste this prompt into your AI coding agent (e.g. Cursor, Claude Code, Copilot, Antigravity) to automatically configure the consent banner or mobile SDK in your codebase.</p>
              </div>
              <button
                onClick={() => {
                  setShowAgentPromptModal(false);
                  setCopiedPromptText(false);
                }}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="relative rounded-xl overflow-hidden bg-[#0A0A0A] border border-zinc-800">
                <pre className="p-5 font-mono text-[12px] text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[400px]">
                  <code>{getAgentPromptText()}</code>
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border-default)] flex justify-end gap-2 bg-[var(--surface-raised)]">
              <button
                type="button"
                onClick={() => {
                  setShowAgentPromptModal(false);
                  setCopiedPromptText(false);
                }}
                className="px-4 py-2 border rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(getAgentPromptText());
                  setCopiedPromptText(true);
                  setTimeout(() => setCopiedPromptText(false), 2000);
                }}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedPromptText ? 'Copied Prompt!' : 'Copy Prompt'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
