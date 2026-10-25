import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  Tag,
  Plus,
  Trash2,
  Edit,
  Play,
  RefreshCw,
  Sliders,
  BarChart2,
  Settings as SettingsIcon,
  Filter,
} from 'lucide-react';
import { TablePager } from '@/app/components/common/TablePager';
import { DPDPALabelChip } from '@/app/components/common/DPDPAChip';
import { IntegrationSetupGuideButton } from '@/app/components/common/IntegrationSetupGuideButton';
import { DPDPAReferencePanel } from '@/app/components/common/DPDPAReferencePanel';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { tagManagerApi, type TagManagerContainer, type ManagedTag, type TagExecutionRule, type TagViolation, type TagManagerDailyMetric, type TagManagerOverviewStats, type SimulatedTagResult, type TagExecutionLog, type TagManagerSettings } from '@/lib/api/tagManager';
import { ApiError } from '@/lib/api/client';
import { fetchPurposes } from '@/lib/api/consent';
import { useProperties } from '@/hooks/useProperties';
import { notify } from '@/app/utils/notify';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';
import type { Purpose } from '@/types/consent';

type TabId = 'overview' | 'containers' | 'tags' | 'rules' | 'simulator' | 'violations' | 'analytics' | 'settings';

const DPDPA_REFERENCES = [
  'Ch.2 §6 Consent required for processing',
  'Ch.2 §6(1) Explicit and informed consent',
  'Ch.2 §8(5) Technical security safeguards',
];

function notifyApiError(fallback: string, err: unknown): void {
  notify(err instanceof ApiError ? err.message : fallback);
}

export function TagManager(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { properties } = useProperties();
  
  // Data States
  const [containers, setContainers] = useState<TagManagerContainer[]>([]);
  const [tags, setTags] = useState<ManagedTag[]>([]);
  const [rules, setRules] = useState<TagExecutionRule[]>([]);
  const [violations, setViolations] = useState<TagViolation[]>([]);
  const [analytics, setAnalytics] = useState<TagManagerDailyMetric[]>([]);
  const [overviewStats, setOverviewStats] = useState<TagManagerOverviewStats | null>(null);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [providers, setProviders] = useState<string[]>(['Google Tag Manager', 'Adobe Launch', 'Tealium', 'Custom JS Blocker']);
  const [tagAnalytics, setTagAnalytics] = useState<TagExecutionLog[]>([]);
  const [analyticsDays, setAnalyticsDays] = useState(7);
  const [settings, setSettings] = useState<TagManagerSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [syncingContainerId, setSyncingContainerId] = useState<string | null>(null);
  const [violationScanning, setViolationScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');

  // Modals & Forms States
  const [showCreateContainer, setShowCreateContainer] = useState(false);
  const [editingContainer, setEditingContainer] = useState<TagManagerContainer | null>(null);
  const [containerForm, setContainerForm] = useState({
    container_name: '',
    provider: 'Google Tag Manager',
    container_identifier: '',
    property_id: '',
    environment: 'production',
    auto_sync: true,
    consent_mode: true,
  });

  const [showCreateTag, setShowCreateTag] = useState(false);
  const [editingTag, setEditingTag] = useState<ManagedTag | null>(null);
  const [tagForm, setTagForm] = useState({
    container_id: '',
    provider: 'Google Tag Manager',
    purpose_id: '',
    tag_name: '',
    trigger: 'All Pages',
    execution_type: 'External Script',
    script_url: '',
    inline_script: '',
    status: 'active',
    priority: 10,
  });

  const [showCreateRule, setShowCreateRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    property_id: '',
    priority: 10,
    status: 'active',
    purpose_name: 'Analytics',
    consent_value: 'Granted',
    action: 'Execute',
  });

  // Simulator State
  const [simChoices, setSimChoices] = useState<Record<string, boolean>>({
    Necessary: true,
    Analytics: false,
    Marketing: false,
    Functional: false,
  });
  const [simPropertyId, setSimPropertyId] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simResults, setSimResults] = useState<SimulatedTagResult[]>([]);
  const [hasSimulated, setHasSimulated] = useState(false);

  // Initial Load
  useEffect(() => {
    if (user?.role === 'superadmin' && !orgId) return;
    void loadData();
  }, [orgId, user?.role]);

  useEffect(() => {
    if (!loading) {
      void loadScopedMetrics(selectedPropertyId || undefined, analyticsDays);
    }
  }, [selectedPropertyId, loading, analyticsDays]);

  useEffect(() => {
    void tagManagerApi.listProviders().then(setProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab !== 'settings' || !selectedPropertyId) return;
    void tagManagerApi.getSettings(selectedPropertyId, orgId)
      .then(setSettings)
      .catch((err) => notifyApiError('Failed to load settings', err));
  }, [activeTab, selectedPropertyId, orgId]);

  // Update sim choices if purposes load
  useEffect(() => {
    if (purposes.length > 0) {
      const initialChoices: Record<string, boolean> = { Necessary: true };
      purposes.forEach(p => {
        initialChoices[p.name] = false;
      });
      setSimChoices(initialChoices);
    }
  }, [purposes]);

  // Set default properties/containers for forms when properties load
  useEffect(() => {
    if (properties.length === 0) return;

    const validIds = new Set(properties.map((p) => p.id));
    if (!selectedPropertyId || !validIds.has(selectedPropertyId)) {
      setSelectedPropertyId(properties[0].id);
    }

    setContainerForm((prev) => ({
      ...prev,
      property_id: validIds.has(prev.property_id) ? prev.property_id : properties[0].id,
    }));
    setRuleForm((prev) => ({
      ...prev,
      property_id: validIds.has(prev.property_id) ? prev.property_id : properties[0].id,
    }));
    setSimPropertyId((prev) => (validIds.has(prev) ? prev : properties[0].id));
  }, [properties, selectedPropertyId]);

  useEffect(() => {
    if (containers.length > 0) {
      setTagForm(prev => ({ ...prev, container_id: containers[0].id }));
    }
  }, [containers]);

  const loadScopedMetrics = async (propertyId?: string, days = analyticsDays) => {
    try {
      const [analyticsData, overviewData, tagAnalyticsData] = await Promise.all([
        tagManagerApi.getAnalytics(propertyId, orgId, days),
        tagManagerApi.getOverviewStats(propertyId, orgId),
        tagManagerApi.getTagAnalytics(propertyId, orgId, days),
      ]);
      setAnalytics(analyticsData);
      setOverviewStats(overviewData);
      setTagAnalytics(tagAnalyticsData);
    } catch (err) {
      console.error('Failed to load tag manager metrics:', err);
    }
  };

  const loadData = async (propertyId?: string) => {
    setLoading(true);
    const scope = propertyId ?? selectedPropertyId ?? undefined;
    try {
      const [containersData, tagsData, rulesData, violationsData, analyticsData, overviewData, tagAnalyticsData, purposesData] = await Promise.all([
        tagManagerApi.listContainers(orgId),
        tagManagerApi.listTags({ orgId }),
        tagManagerApi.listRules(undefined, orgId),
        tagManagerApi.listViolations(undefined, orgId),
        tagManagerApi.getAnalytics(scope, orgId, analyticsDays),
        tagManagerApi.getOverviewStats(scope, orgId),
        tagManagerApi.getTagAnalytics(scope, orgId, analyticsDays),
        fetchPurposes(orgId),
      ]);
      setContainers(containersData);
      setTags(tagsData);
      setRules(rulesData);
      setViolations(violationsData);
      setAnalytics(analyticsData);
      setOverviewStats(overviewData);
      setTagAnalytics(tagAnalyticsData);
      setPurposes(purposesData);
    } catch (err) {
      console.error('Failed to load Tag Manager data:', err);
      notify('Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  // --- Containers Actions ---
  const handleSaveContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingContainer) {
        await tagManagerApi.updateContainer(editingContainer.id, containerForm, orgId);
        notify('Container updated successfully');
      } else {
        await tagManagerApi.createContainer(containerForm as any, orgId);
        notify('Container created successfully');
      }
      setShowCreateContainer(false);
      setEditingContainer(null);
      void loadData();
    } catch (err) {
      notifyApiError('Failed to save container', err);
    }
  };

  const handleEditContainerClick = (container: TagManagerContainer) => {
    setEditingContainer(container);
    setContainerForm({
      container_name: container.container_name,
      provider: container.provider,
      container_identifier: container.container_identifier,
      property_id: container.property_id,
      environment: container.environment,
      auto_sync: container.auto_sync,
      consent_mode: container.consent_mode,
    });
    setShowCreateContainer(true);
  };

  const handleDeleteContainer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this container? All tags belonging to this container will also be deleted.')) return;
    try {
      await tagManagerApi.deleteContainer(id, orgId);
      notify('Container deleted successfully');
      void loadData();
    } catch (err) {
      notifyApiError('Failed to delete container', err);
    }
  };

  const handleSyncContainer = async (containerId: string, name: string) => {
    setSyncingContainerId(containerId);
    try {
      await tagManagerApi.syncContainer(containerId, orgId);
      notify(`Container "${name}" synced successfully`);
      void loadData();
    } catch (err) {
      notifyApiError('Failed to sync container', err);
    } finally {
      setSyncingContainerId(null);
    }
  };

  const handleDownloadGtmTemplate = async () => {
    try {
      await tagManagerApi.downloadGtmTemplate(selectedPropertyId || undefined, orgId);
      notify('GTM template downloaded');
    } catch (err) {
      notifyApiError('Failed to download GTM template', err);
    }
  };

  const handleRunViolationScan = async () => {
    const propertyId = selectedPropertyId || simPropertyId || properties[0]?.id;
    if (!propertyId) {
      notify('Select a property to run violation scan');
      return;
    }
    setViolationScanning(true);
    try {
      await tagManagerApi.simulate(propertyId, simChoices, orgId);
      notify('Violation scan complete — check Violations tab');
      void loadData();
    } catch (err) {
      notifyApiError('Violation scan failed', err);
    } finally {
      setViolationScanning(false);
    }
  };

  const handleSettingsToggle = async (field: 'consent_mode_v2' | 'auto_blocker_strict', value: boolean) => {
    if (!selectedPropertyId) return;
    setSettingsSaving(true);
    try {
      const updated = await tagManagerApi.updateSettings(selectedPropertyId, { [field]: value }, orgId);
      setSettings(updated);
      notify('Settings saved');
    } catch (err) {
      notifyApiError('Failed to save settings', err);
    } finally {
      setSettingsSaving(false);
    }
  };

  // --- Tags Actions ---
  const handleSaveTag = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        container_id: tagForm.container_id,
        provider: tagForm.provider,
        purpose_id: tagForm.purpose_id || null,
        tag_name: tagForm.tag_name,
        trigger: tagForm.trigger,
        execution_type: tagForm.execution_type,
        script_url: tagForm.script_url || null,
        inline_script: tagForm.inline_script || null,
        status: tagForm.status,
        priority: Number(tagForm.priority),
      };
      if (editingTag) {
        await tagManagerApi.updateTag(editingTag.id, data, orgId);
        notify('Tag updated successfully');
      } else {
        await tagManagerApi.createTag(data, orgId);
        notify('Tag created successfully');
      }
      setShowCreateTag(false);
      setEditingTag(null);
      void loadData();
    } catch (err) {
      notifyApiError('Failed to save tag', err);
    }
  };

  const handleEditTagClick = (tag: ManagedTag) => {
    setEditingTag(tag);
    setTagForm({
      container_id: tag.container_id,
      provider: tag.provider,
      purpose_id: tag.purpose_id || '',
      tag_name: tag.tag_name,
      trigger: tag.trigger,
      execution_type: tag.execution_type,
      script_url: tag.script_url || '',
      inline_script: tag.inline_script || '',
      status: tag.status,
      priority: tag.priority,
    });
    setShowCreateTag(true);
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tag?')) return;
    try {
      await tagManagerApi.deleteTag(id, orgId);
      notify('Tag deleted successfully');
      void loadData();
    } catch (err) {
      notifyApiError('Failed to delete tag', err);
    }
  };

  // --- Rules Actions ---
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const ruleJson = {
        conditions: [
          { field: 'purpose', operator: '==', value: ruleForm.purpose_name },
          { field: 'consent', operator: '==', value: ruleForm.consent_value },
        ],
        action: ruleForm.action.toLowerCase(),
      };
      await tagManagerApi.createRule({
        property_id: ruleForm.property_id,
        priority: Number(ruleForm.priority),
        rule_json: ruleJson,
        status: ruleForm.status,
      }, orgId);
      notify('Execution rule added successfully');
      setShowCreateRule(false);
      void loadData();
    } catch (err) {
      notifyApiError('Failed to save execution rule', err);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await tagManagerApi.deleteRule(id, orgId);
      notify('Rule deleted successfully');
      void loadData();
    } catch (err) {
      notifyApiError('Failed to delete rule', err);
    }
  };

  // --- Simulator Actions ---
  const handleSimulate = async () => {
    if (!simPropertyId) {
      notify('Please select a property for simulation');
      return;
    }
    setSimulating(true);
    setHasSimulated(true);
    try {
      const resp = await tagManagerApi.simulate(simPropertyId, simChoices, orgId);
      setSimResults(resp.results);
      notify('Simulation complete — metrics and violations recorded');
      void loadData();
    } catch (err) {
      notifyApiError('Simulation failed', err);
    } finally {
      setSimulating(false);
    }
  };

  // --- Violations Actions ---
  const handleResolveViolation = async (id: string) => {
    try {
      await tagManagerApi.resolveViolation(id, orgId);
      notify('Violation resolved successfully');
      void loadData();
    } catch (err) {
      notifyApiError('Failed to resolve violation', err);
    }
  };

  // Filter container list
  const filteredContainers = containers.filter(c => !selectedPropertyId || c.property_id === selectedPropertyId);
  const filteredTags = tags.filter(t => !selectedPropertyId || t.property_id === selectedPropertyId);
  const filteredRules = rules.filter(r => !selectedPropertyId || r.property_id === selectedPropertyId);
  const filteredViolations = violations.filter(v => !selectedPropertyId || v.property_id === selectedPropertyId);

  const containersPager = useClientPagination(filteredContainers);
  const tagsPager = useClientPagination(filteredTags);
  const violationsPager = useClientPagination(filteredViolations);

  useEffect(() => {
    containersPager.resetPage();
    tagsPager.resetPage();
    violationsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  const stats = overviewStats ?? {
    connected_properties: selectedPropertyId ? 1 : properties.length,
    connected_containers: filteredContainers.length,
    managed_tags: filteredTags.length,
    blocked_today: 0,
    consent_success_rate: 0,
    misconfigured_tags: filteredTags.filter(t => !t.purpose_id).length,
    health_score: 0,
    tag_mappings_score: 0,
    execution_rules_score: 0,
    blocked_violations_score: 0,
    stale_containers_score: 0,
    purpose_totals: {},
  };

  const healthScore = stats.health_score;
  const healthMessage =
    healthScore >= 95
      ? 'Your consent framework compliance score is excellent. Correct any misconfigured tags to reach 100%.'
      : healthScore >= 80
        ? 'Good standing. Resolve open violations and map all tags to purposes to improve your score.'
        : healthScore >= 60
          ? 'Needs attention. Review misconfigured tags, execution rules, and unresolved violations.'
          : 'Critical gaps detected. Configure containers, map tag purposes, and resolve violations.';

  const topBlockedTags = (() => {
    const byTag = new Map<string, { tag_name: string; blocked: number }>();
    for (const log of tagAnalytics) {
      const name = log.tag_name || 'Unknown Tag';
      const key = log.tag_id || name;
      const existing = byTag.get(key) || { tag_name: name, blocked: 0 };
      existing.blocked += log.blocked;
      byTag.set(key, existing);
    }
    return Array.from(byTag.values())
      .sort((a, b) => b.blocked - a.blocked)
      .slice(0, 5);
  })();

  const purposeDistribution = (() => {
    const totals = stats.purpose_totals ?? {};
    const items = [
      { name: 'Necessary', key: 'necessary', color: '#3B82F6' },
      { name: 'Analytics', key: 'analytics', color: '#10B981' },
      { name: 'Marketing', key: 'marketing', color: '#EF4444' },
      { name: 'Functional', key: 'functional', color: '#F59E0B' },
    ];
    const grandTotal = items.reduce((sum, item) => sum + (totals[item.key] ?? 0), 0);
    return items.map((item) => {
      const count = totals[item.key] ?? 0;
      return {
        ...item,
        count,
        percent: grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0,
      };
    });
  })();

  return (
    <div className="h-full flex flex-col bg-[var(--surface-base)] text-[var(--text-primary)]">
      {/* Header status bar */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-[1400px] mx-auto p-8">
          
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-semibold mb-2">Consent Enforcement Engine (Tag Manager)</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Control whether third-party scripts/tags execute based on user consent in real time.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <IntegrationSetupGuideButton guideId="tag_manager" />
              {/* Property Filter */}
              <div className="flex items-center gap-3 bg-[var(--surface-card)] p-2 rounded-lg border border-[var(--border-default)]">
                <Filter className="w-4 h-4 text-[var(--text-tertiary)]" />
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Scoped Property:</span>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="bg-transparent text-sm font-semibold border-none focus:outline-none text-[var(--text-primary)]"
                >
                  <option value="">All Properties</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.display_name || p.domain} ({p.environment})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <DPDPALabelChip text="Ch.2 §6" />
            <DPDPALabelChip text="Consent Enforcement" />
            <DPDPALabelChip text="Cookie blocking" />
          </div>

          {/* Tabs Navigation */}
          <div className="flex gap-1 mb-6 border-b border-[var(--border-default)]">
            {([
              { id: 'overview', label: 'Overview', icon: Tag },
              { id: 'containers', label: 'Containers', icon: Sliders },
              { id: 'tags', label: 'Tags', icon: Tag },
              { id: 'rules', label: 'Consent Rules', icon: Sliders },
              { id: 'simulator', label: 'Trigger Simulator', icon: Play },
              { id: 'violations', label: 'Violations', icon: AlertTriangle },
              { id: 'analytics', label: 'Analytics', icon: BarChart2 },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'text-[var(--brand-primary)] border-[var(--brand-primary)]'
                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm text-[var(--text-secondary)]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--brand-primary)]" />
              Loading Tag Manager module...
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-6 gap-4">
                    {[
                      { label: 'Connected Properties', value: stats.connected_properties },
                      { label: 'Connected Containers', value: stats.connected_containers },
                      { label: 'Managed Tags', value: stats.managed_tags },
                      { label: 'Blocked Today', value: stats.blocked_today.toLocaleString() },
                      { label: 'Consent Success Rate', value: `${stats.consent_success_rate}%` },
                      { label: 'Misconfigured Tags', value: stats.misconfigured_tags, highlight: stats.misconfigured_tags > 0 },
                    ].map(card => (
                      <div key={card.label} className="p-4 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                        <div className={`text-2xl font-semibold mb-1 ${card.highlight ? 'text-[var(--status-danger)]' : 'text-[var(--text-primary)]'}`}>
                          {card.value}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">{card.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Health Score Panel */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                      <h3 className="font-semibold mb-2">Consent Enforcement Health</h3>
                      <p className="text-xs text-[var(--text-secondary)] mb-6">
                        Calculated based on container syncing, tag configuration, missing purpose mappings, and unresolved violations.
                      </p>

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-[var(--text-secondary)]">Tag Mappings</span>
                            <span className="font-semibold">{stats.tag_mappings_score}/100</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--status-success)]" style={{ width: `${stats.tag_mappings_score}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-[var(--text-secondary)]">Execution Rules</span>
                            <span className="font-semibold">{stats.execution_rules_score}/100</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--status-success)]" style={{ width: `${stats.execution_rules_score}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-[var(--text-secondary)]">Blocked Violations</span>
                            <span className="font-semibold">{stats.blocked_violations_score}/100</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--status-success)]" style={{ width: `${stats.blocked_violations_score}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-[var(--text-secondary)]">Stale Containers</span>
                            <span className="font-semibold">{stats.stale_containers_score}/100</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--status-success)]" style={{ width: `${stats.stale_containers_score}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 rounded-lg border flex flex-col justify-between items-center text-center bg-[var(--surface-card)] border-[var(--border-default)]">
                      <h4 className="font-semibold text-sm text-[var(--text-secondary)]">Overall Health</h4>
                      <div className="my-6 relative flex items-center justify-center">
                        <div className="text-5xl font-bold text-[var(--brand-primary)]">{healthScore}</div>
                        <div className="text-xs text-[var(--text-tertiary)] absolute bottom-[-20px]">out of 100</div>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] px-4">
                        {healthMessage}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CONTAINERS */}
              {activeTab === 'containers' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Containers</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDownloadGtmTemplate()}
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] cursor-pointer"
                      >
                        Download GTM Template
                      </button>
                      <button
                      type="button"
                      onClick={() => {
                        setEditingContainer(null);
                        setContainerForm({
                          container_name: '',
                          provider: 'Google Tag Manager',
                          container_identifier: '',
                          property_id: properties[0]?.id || '',
                          environment: 'production',
                          auto_sync: true,
                          consent_mode: true,
                        });
                        setShowCreateContainer(true);
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90 cursor-pointer flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add Container
                    </button>
                    </div>
                  </div>

                  <div className="border border-[var(--border-default)] rounded-lg overflow-hidden bg-[var(--surface-card)]">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] font-medium">
                          <th className="p-4">Container Name</th>
                          <th className="p-4">Provider</th>
                          <th className="p-4">Container ID</th>
                          <th className="p-4">Property</th>
                          <th className="p-4">Environment</th>
                          <th className="p-4">Status</th>
                          <th className="p-4">Auto Sync</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredContainers.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-[var(--text-tertiary)]">
                              No containers integrated. Click Add Container to get started.
                            </td>
                          </tr>
                        ) : (
                          containersPager.slice.map(container => (
                            <tr key={container.id} className="border-b last:border-b-0 border-[var(--border-default)] hover:bg-white/5">
                              <td className="p-4 font-semibold text-[var(--text-primary)]">{container.container_name}</td>
                              <td className="p-4 text-[var(--text-secondary)]">{container.provider}</td>
                              <td className="p-4 font-mono text-xs text-[var(--text-secondary)]">{container.container_identifier}</td>
                              <td className="p-4 text-[var(--text-secondary)]">{container.property_domain || 'Unknown'}</td>
                              <td className="p-4">
                                <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase bg-[var(--status-info-bg)] text-[var(--status-info)]">
                                  {container.environment}
                                </span>
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  container.status === 'active' ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]'
                                }`}>
                                  {container.status}
                                </span>
                              </td>
                              <td className="p-4 text-[var(--text-secondary)]">{container.auto_sync ? 'Yes' : 'No'}</td>
                              <td className="p-4 text-right">
                                <div className="flex justify-end gap-3 text-xs">
                                  <button
                                    onClick={() => void handleSyncContainer(container.id, container.container_name)}
                                    disabled={syncingContainerId === container.id}
                                    className="p-1 rounded hover:bg-white/10 text-[var(--brand-primary)] cursor-pointer disabled:opacity-50"
                                    title="Sync container"
                                  >
                                    <RefreshCw className={`w-4 h-4 ${syncingContainerId === container.id ? 'animate-spin' : ''}`} />
                                  </button>
                                  <button
                                    onClick={() => handleEditContainerClick(container)}
                                    className="p-1 rounded hover:bg-white/10 text-[var(--text-secondary)] cursor-pointer"
                                    title="Edit container settings"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteContainer(container.id)}
                                    className="p-1 rounded hover:bg-white/10 text-[var(--status-danger)] cursor-pointer"
                                    title="Delete container"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    <TablePager
                      page={containersPager.page}
                      pageCount={containersPager.pageCount}
                      total={containersPager.total}
                      pageSize={containersPager.pageSize}
                      onPage={containersPager.setPage}
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: TAGS */}
              {activeTab === 'tags' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Managed Tags</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (containers.length === 0) {
                            notify('Please create a container first');
                            return;
                          }
                          setEditingTag(null);
                          setTagForm({
                            container_id: containers[0].id,
                            provider: 'Google Tag Manager',
                            purpose_id: purposes[0]?.id || '',
                            tag_name: '',
                            trigger: 'All Pages',
                            execution_type: 'External Script',
                            script_url: '',
                            inline_script: '',
                            status: 'active',
                            priority: 10,
                          });
                          setShowCreateTag(true);
                        }}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90 cursor-pointer flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Add Managed Tag
                      </button>
                    </div>
                  </div>

                  <div className="border border-[var(--border-default)] rounded-lg overflow-hidden bg-[var(--surface-card)]">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] font-medium">
                          <th className="p-4">Tag Name</th>
                          <th className="p-4">Provider</th>
                          <th className="p-4">Execution Type</th>
                          <th className="p-4">Associated Purpose</th>
                          <th className="p-4">Trigger Rule</th>
                          <th className="p-4">Priority</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTags.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-[var(--text-tertiary)]">
                              No tags mapped. Click Add Managed Tag to define consent rules for script loaders.
                            </td>
                          </tr>
                        ) : (
                          tagsPager.slice.map(tag => (
                            <tr key={tag.id} className="border-b last:border-b-0 border-[var(--border-default)] hover:bg-white/5">
                              <td className="p-4 font-semibold text-[var(--text-primary)]">
                                {tag.tag_name}
                              </td>
                              <td className="p-4 text-[var(--text-secondary)]">{tag.provider}</td>
                              <td className="p-4 text-xs font-mono text-[var(--text-secondary)]">{tag.execution_type}</td>
                              <td className="p-4">
                                {tag.purpose_name ? (
                                  <span className="px-2.5 py-1 rounded bg-[var(--surface-raised)] text-xs font-semibold text-[var(--brand-primary)]">
                                    {tag.purpose_name}
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-[var(--status-danger-bg)] text-xs font-semibold text-[var(--status-danger)] flex items-center gap-1 w-max">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Unmapped
                                  </span>
                                )}
                              </td>
                              <td className="p-4 text-[var(--text-secondary)]">{tag.trigger}</td>
                              <td className="p-4 text-[var(--text-secondary)] font-mono">{tag.priority}</td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  tag.status === 'active' ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]'
                                }`}>
                                  {tag.status}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex justify-end gap-3 text-xs">
                                  <button
                                    onClick={() => handleEditTagClick(tag)}
                                    className="p-1 rounded hover:bg-white/10 text-[var(--text-secondary)] cursor-pointer"
                                    title="Edit tag settings"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTag(tag.id)}
                                    className="p-1 rounded hover:bg-white/10 text-[var(--status-danger)] cursor-pointer"
                                    title="Delete tag"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    <TablePager
                      page={tagsPager.page}
                      pageCount={tagsPager.pageCount}
                      total={tagsPager.total}
                      pageSize={tagsPager.pageSize}
                      onPage={tagsPager.setPage}
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: CONSENT RULES */}
              {activeTab === 'rules' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold">Tag Execution Rule Builder</h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Define enterprise execution policies. Tag actions default to Block unless conditions are satisfied.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateRule(true)}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90 cursor-pointer flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add Execution Rule
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {filteredRules.length === 0 ? (
                      <div className="p-12 text-center border rounded-lg border-[var(--border-default)] text-[var(--text-tertiary)] bg-[var(--surface-card)]">
                        No custom execution rules defined. Platform defaults to direct purpose-consent mappings.
                      </div>
                    ) : (
                      filteredRules.map(rule => (
                        <div key={rule.id} className="p-5 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)] flex justify-between items-center">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-0.5 rounded bg-[var(--surface-raised)] text-xs font-mono font-semibold">Priority {rule.priority}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                rule.status === 'active' ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]'
                              }`}>{rule.status}</span>
                            </div>
                            <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                              <span className="text-[var(--text-secondary)]">IF</span>
                              <span className="font-mono bg-[var(--surface-raised)] px-2 py-1 rounded">
                                {rule.rule_json?.conditions?.[0]?.field} {rule.rule_json?.conditions?.[0]?.operator} {rule.rule_json?.conditions?.[0]?.value}
                              </span>
                              <span className="text-[var(--text-secondary)]">AND</span>
                              <span className="font-mono bg-[var(--surface-raised)] px-2 py-1 rounded">
                                {rule.rule_json?.conditions?.[1]?.field} {rule.rule_json?.conditions?.[1]?.operator} {rule.rule_json?.conditions?.[1]?.value}
                              </span>
                              <span className="text-[var(--text-secondary)]">THEN</span>
                              <span className={`font-semibold uppercase ${rule.rule_json?.action === 'execute' ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'}`}>
                                {rule.rule_json?.action}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-2 text-[var(--status-danger)] hover:bg-white/5 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: TRIGGER SIMULATOR */}
              {activeTab === 'simulator' && (
                <div className="space-y-6">
                  <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                    <h3 className="font-semibold mb-4">Consent Trigger Simulation Sandbox</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Select Property</label>
                        <select
                          value={simPropertyId}
                          onChange={(e) => setSimPropertyId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                        >
                          {properties.map(p => (
                            <option key={p.id} value={p.id}>{p.display_name || p.domain}</option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Simulate Visitor Consent Choices</label>
                        <div className="flex flex-wrap gap-4 items-center mt-2">
                          {Object.keys(simChoices).map(choice => (
                            <label key={choice} className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={simChoices[choice]}
                                disabled={choice.toLowerCase() === 'necessary'}
                                onChange={(e) => setSimChoices({ ...simChoices, [choice]: e.target.checked })}
                                className="rounded border-[var(--border-default)] text-[var(--brand-primary)] bg-[var(--surface-base)] size-4 focus:ring-0 outline-none"
                              />
                              <span>{choice}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSimulate}
                      disabled={simulating}
                      className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      {simulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Simulate Consent Enforcement
                    </button>
                  </div>

                  {hasSimulated && (
                    <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                      <h4 className="font-semibold mb-4">Simulated Enforcement Results</h4>
                      <div className="space-y-3">
                        {simResults.length === 0 ? (
                          <p className="text-sm text-[var(--text-tertiary)]">No tags mapped for simulation on this property.</p>
                        ) : (
                          simResults.map(res => (
                            <div key={res.tag_id} className="p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded bg-[var(--surface-base)]">
                                  <Tag className="w-4 h-4 text-[var(--brand-primary)]" />
                                </div>
                                <div>
                                  <div className="font-semibold text-sm">{res.tag_name}</div>
                                  <div className="text-xs text-[var(--text-secondary)]">
                                    Provider: {res.provider} · Category: <span className="font-medium text-[var(--text-primary)]">{res.purpose_name || 'Necessary'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-xs text-[var(--text-secondary)] font-mono text-right">{res.reason}</div>
                                {res.rule_applied && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--status-info-bg)] text-[var(--status-info)]">
                                    Rule Applied
                                  </span>
                                )}
                                <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                  res.status === 'EXECUTED' ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                                }`}>
                                  {res.status}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: VIOLATIONS */}
              {activeTab === 'violations' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Tracked Consent Violations</h3>
                    <button
                      type="button"
                      onClick={() => void handleRunViolationScan()}
                      disabled={violationScanning}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90 disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      {violationScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Run Violation Scan
                    </button>
                  </div>

                  <div className="border border-[var(--border-default)] rounded-lg overflow-hidden bg-[var(--surface-card)]">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] font-medium">
                          <th className="p-4">Property</th>
                          <th className="p-4">Page URI</th>
                          <th className="p-4">Violating Tag</th>
                          <th className="p-4">Severity</th>
                          <th className="p-4">Reason</th>
                          <th className="p-4">Detected</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredViolations.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-[var(--text-tertiary)]">
                              No violations detected. ZeroShield blocker engine active.
                            </td>
                          </tr>
                        ) : (
                          violationsPager.slice.map(violation => (
                            <tr key={violation.id} className="border-b last:border-b-0 border-[var(--border-default)] hover:bg-white/5">
                              <td className="p-4 text-[var(--text-secondary)]">{violation.property_domain || 'Unknown'}</td>
                              <td className="p-4 font-mono text-xs text-[var(--text-secondary)]">{violation.page}</td>
                              <td className="p-4 font-semibold">{violation.tag_name}</td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  violation.severity.toLowerCase() === 'high' ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]' :
                                  violation.severity.toLowerCase() === 'medium' ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]' :
                                  'bg-[var(--status-info-bg)] text-[var(--status-info)]'
                                }`}>
                                  {violation.severity}
                                </span>
                              </td>
                              <td className="p-4 text-[var(--text-secondary)]">{violation.reason}</td>
                              <td className="p-4 text-[var(--text-secondary)]">{new Date(violation.created_at).toLocaleDateString()}</td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  violation.resolved ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                                }`}>
                                  {violation.resolved ? 'Resolved' : 'Active'}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                {!violation.resolved ? (
                                  <button
                                    onClick={() => handleResolveViolation(violation.id)}
                                    className="px-3 py-1 rounded bg-[var(--brand-primary)] text-white text-xs font-semibold hover:bg-[var(--brand-primary)]/90 cursor-pointer"
                                  >
                                    Resolve
                                  </button>
                                ) : (
                                  <span className="text-xs text-[var(--text-tertiary)]">By {violation.resolved_by_name || 'Admin'}</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    <TablePager
                      page={violationsPager.page}
                      pageCount={violationsPager.pageCount}
                      total={violationsPager.total}
                      pageSize={violationsPager.pageSize}
                      onPage={violationsPager.setPage}
                    />
                  </div>
                </div>
              )}

              {/* TAB 7: ANALYTICS */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="flex justify-end gap-2">
                    {[7, 30, 90].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setAnalyticsDays(days)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          analyticsDays === days
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Execution daily stats */}
                    <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                      <h4 className="font-semibold mb-4">Daily Tag Executions vs Blocks</h4>
                      <div className="h-64 flex items-end justify-between gap-4 mt-6">
                        {analytics.length === 0 ? (
                          <div className="w-full text-center text-sm text-[var(--text-tertiary)] self-center">
                            No execution data yet. Metrics appear when users grant or deny consent on your live property.
                          </div>
                        ) : (
                          analytics.map(item => (
                            <div key={item.id} className="flex-1 flex flex-col items-center">
                              <div className="w-full flex flex-col justify-end gap-1 h-44 bg-[var(--surface-raised)] rounded overflow-hidden relative">
                                <div className="bg-[var(--brand-primary)] w-full" style={{ height: `${(item.executed / (item.executed + item.blocked || 1)) * 100}%` }} />
                                <div className="bg-[var(--status-danger)] w-full" style={{ height: `${(item.blocked / (item.executed + item.blocked || 1)) * 100}%` }} />
                              </div>
                              <span className="text-[10px] text-[var(--text-secondary)] mt-2 font-mono">{new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-4 mt-4 text-xs justify-center">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-[var(--brand-primary)] rounded" />
                          <span>Executed Tags</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-[var(--status-danger)] rounded" />
                          <span>Blocked Violations</span>
                        </div>
                      </div>
                    </div>

                    {/* Purpose executions breakdown */}
                    <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                      <h4 className="font-semibold mb-4">Purpose Category Distribution</h4>
                      <div className="space-y-4 mt-6">
                        {purposeDistribution.map(item => (
                          <div key={item.name} className="flex items-center gap-4">
                            <div className="w-20 text-sm font-semibold text-[var(--text-secondary)]">{item.name}</div>
                            <div className="flex-1 h-3 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
                            </div>
                            <div className="w-20 text-sm text-[var(--text-secondary)] text-right font-mono font-bold">
                              {item.count} events
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
                      <h4 className="font-semibold mb-4">Top Blocked Tags</h4>
                      <div className="space-y-3 mt-6">
                        {topBlockedTags.length === 0 ? (
                          <p className="text-sm text-[var(--text-tertiary)]">No per-tag block data yet. Run a simulation or collect live consent events.</p>
                        ) : (
                          topBlockedTags.map((item) => (
                            <div key={item.tag_name} className="flex items-center gap-4">
                              <div className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate">{item.tag_name}</div>
                              <div className="w-32 h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[var(--status-danger)]"
                                  style={{ width: `${Math.min(100, (item.blocked / (topBlockedTags[0]?.blocked || 1)) * 100)}%` }}
                                />
                              </div>
                              <div className="w-12 text-right text-xs font-mono font-bold text-[var(--status-danger)]">{item.blocked}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 8: SETTINGS */}
              {activeTab === 'settings' && (
                <div className="p-6 rounded-lg border space-y-6 bg-[var(--surface-card)] border-[var(--border-default)]">
                  <h3 className="font-semibold">General Tag Manager Settings</h3>
                  {!selectedPropertyId ? (
                    <p className="text-sm text-[var(--text-tertiary)]">Select a property from the filter above to configure settings.</p>
                  ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface-raised)]">
                      <div>
                        <div className="font-semibold text-sm">Google Consent Mode v2 Integration</div>
                        <div className="text-xs text-[var(--text-secondary)]">Automatically map tag consents to standard `ad_storage`, `analytics_storage` parameters.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings?.consent_mode_v2 ?? true}
                          disabled={settingsSaving}
                          onChange={(e) => void handleSettingsToggle('consent_mode_v2', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-primary)]"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface-raised)]">
                      <div>
                        <div className="font-semibold text-sm">Auto Blocker (Strict Mode)</div>
                        <div className="text-xs text-[var(--text-secondary)]">Block any unrecognized/unmapped tracking tags before explicit consent is granted.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings?.auto_blocker_strict ?? true}
                          disabled={settingsSaving}
                          onChange={(e) => void handleSettingsToggle('auto_blocker_strict', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--brand-primary)]"></div>
                      </label>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </>
          )}

          <DPDPAReferencePanel references={DPDPA_REFERENCES} />
        </div>
      </div>

      {/* --- CREATE/EDIT CONTAINER OVERLAY MODAL --- */}
      {showCreateContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl shadow-xl overflow-hidden text-[var(--text-primary)]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-default)]">
              <h3 className="font-semibold text-lg">{editingContainer ? 'Edit Container Settings' : 'Create Tag Container'}</h3>
              <button onClick={() => { setShowCreateContainer(false); setEditingContainer(null); }} className="text-[var(--text-tertiary)] hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveContainer} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Container Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Website Google Tag Manager"
                  value={containerForm.container_name}
                  onChange={(e) => setContainerForm({ ...containerForm, container_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Provider Type</label>
                  <select
                    value={containerForm.provider}
                    onChange={(e) => setContainerForm({ ...containerForm, provider: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    {providers.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Container ID / Key</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GTM-XXXXXX"
                    value={containerForm.container_identifier}
                    onChange={(e) => setContainerForm({ ...containerForm, container_identifier: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Scope to Property</label>
                  <select
                    value={containerForm.property_id}
                    onChange={(e) => setContainerForm({ ...containerForm, property_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.display_name || p.domain}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Environment</label>
                  <select
                    value={containerForm.environment}
                    onChange={(e) => setContainerForm({ ...containerForm, environment: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    <option value="production">production</option>
                    <option value="staging">staging</option>
                    <option value="development">development</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={containerForm.auto_sync}
                    onChange={(e) => setContainerForm({ ...containerForm, auto_sync: e.target.checked })}
                    className="rounded border-[var(--border-default)] text-[var(--brand-primary)] bg-[var(--surface-base)]"
                  />
                  <span>Enable Auto Sync</span>
                </label>

                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={containerForm.consent_mode}
                    onChange={(e) => setContainerForm({ ...containerForm, consent_mode: e.target.checked })}
                    className="rounded border-[var(--border-default)] text-[var(--brand-primary)] bg-[var(--surface-base)]"
                  />
                  <span>Enable Consent Mode</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => { setShowCreateContainer(false); setEditingContainer(null); }}
                  className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-semibold hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-semibold hover:bg-[var(--brand-primary)]/90 cursor-pointer"
                >
                  Save Container
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATE/EDIT TAG OVERLAY MODAL --- */}
      {showCreateTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl shadow-xl overflow-hidden text-[var(--text-primary)]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-default)]">
              <h3 className="font-semibold text-lg">{editingTag ? 'Edit Tag Configuration' : 'Map Third-Party Tag'}</h3>
              <button onClick={() => { setShowCreateTag(false); setEditingTag(null); }} className="text-[var(--text-tertiary)] hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTag} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Target Container</label>
                  <select
                    value={tagForm.container_id}
                    onChange={(e) => setTagForm({ ...tagForm, container_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    {containers.map(c => (
                      <option key={c.id} value={c.id}>{c.container_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Tag/Provider Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Google Analytics v4"
                    value={tagForm.tag_name}
                    onChange={(e) => setTagForm({ ...tagForm, tag_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Provider Type</label>
                  <select
                    value={tagForm.provider}
                    onChange={(e) => setTagForm({ ...tagForm, provider: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    <option value="Google Analytics">Google Analytics</option>
                    <option value="Facebook Pixel">Facebook Pixel</option>
                    <option value="LinkedIn Insight">LinkedIn Insight</option>
                    <option value="Hotjar">Hotjar</option>
                    <option value="Microsoft Clarity">Microsoft Clarity</option>
                    <option value="Custom JS">Custom script</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Associated DPDPA Purpose</label>
                  <select
                    value={tagForm.purpose_id}
                    onChange={(e) => setTagForm({ ...tagForm, purpose_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] font-semibold"
                  >
                    <option value="">-- Unmapped / Choose Purpose --</option>
                    {purposes.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Trigger Event</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. All Pages, PageView, Click"
                    value={tagForm.trigger}
                    onChange={(e) => setTagForm({ ...tagForm, trigger: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Execution Mode</label>
                  <select
                    value={tagForm.execution_type}
                    onChange={(e) => setTagForm({ ...tagForm, execution_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    <option value="External Script">External Script</option>
                    <option value="Inline">Inline</option>
                    <option value="Pixel">Pixel</option>
                    <option value="HTML">HTML</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Script URL (if external)</label>
                  <input
                    type="text"
                    placeholder="https://www.google-analytics.com/analytics.js"
                    value={tagForm.script_url}
                    onChange={(e) => setTagForm({ ...tagForm, script_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Priority Order</label>
                  <input
                    type="number"
                    value={tagForm.priority}
                    onChange={(e) => setTagForm({ ...tagForm, priority: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Inline Script (if applicable)</label>
                <textarea
                  placeholder="console.log('Execute tracker tag content');"
                  rows={3}
                  value={tagForm.inline_script}
                  onChange={(e) => setTagForm({ ...tagForm, inline_script: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => { setShowCreateTag(false); setEditingTag(null); }}
                  className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-semibold hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-semibold hover:bg-[var(--brand-primary)]/90 cursor-pointer"
                >
                  Save Tag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATE RULE OVERLAY MODAL --- */}
      {showCreateRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl shadow-xl overflow-hidden text-[var(--text-primary)]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-default)]">
              <h3 className="font-semibold text-lg">Add Custom Execution Rule</h3>
              <button onClick={() => setShowCreateRule(false)} className="text-[var(--text-tertiary)] hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Scope to Property</label>
                <select
                  value={ruleForm.property_id}
                  onChange={(e) => setRuleForm({ ...ruleForm, property_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.display_name || p.domain}</option>
                  ))}
                </select>
              </div>

              <div className="p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] space-y-3">
                <h4 className="text-xs font-bold uppercase text-[var(--text-secondary)]">Condition Structure</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">IF Purpose Category is</label>
                    <select
                      value={ruleForm.purpose_name}
                      onChange={(e) => setRuleForm({ ...ruleForm, purpose_name: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                    >
                      <option value="Analytics">Analytics</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Functional">Functional</option>
                      {purposes.filter(p => !['analytics', 'marketing', 'functional'].includes(p.name.toLowerCase())).map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">AND Visitor Consent is</label>
                    <select
                      value={ruleForm.consent_value}
                      onChange={(e) => setRuleForm({ ...ruleForm, consent_value: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                    >
                      <option value="Granted">Granted</option>
                      <option value="Denied">Denied</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">THEN Action</label>
                  <select
                    value={ruleForm.action}
                    onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] font-semibold"
                  >
                    <option value="Execute">Execute Tag</option>
                    <option value="Block">Block</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Priority Level</label>
                  <input
                    type="number"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1">Status</label>
                  <select
                    value={ruleForm.status}
                    onChange={(e) => setRuleForm({ ...ruleForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)]"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => setShowCreateRule(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-semibold hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-semibold hover:bg-[var(--brand-primary)]/90 cursor-pointer"
                >
                  Save Execution Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
