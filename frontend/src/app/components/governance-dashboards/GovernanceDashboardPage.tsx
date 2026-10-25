import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart3, Calendar, Copy, Download, Grid, Plus, Share2, Sparkles, X, FileText, Users, Radio, Building2, Trash2,
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { SectionReference } from '@/app/components/common/SectionReference';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { WidgetRenderer } from '@/app/components/governance-dashboards/WidgetRenderer';
import { GovernanceAiAssistantModal } from '@/app/components/governance-dashboards/GovernanceAiAssistantModal';
import { OrgHierarchyModal } from '@/app/components/ropa/OrgHierarchyModal';
import { useGovernanceDashboard } from '@/hooks/useGovernanceDashboard';
import { fetchBusinessUnits, fetchDepartments, type BusinessUnit, type Department } from '@/lib/api/ropa';
import { fetchPurposes } from '@/lib/api/consent';
import type { Purpose } from '@/types/consent';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchBankingEnabled, fetchBankingConfig } from '@/lib/api/consentBanking';
import type { JourneyConfig } from '@/types/consentBanking';
import type { Property } from '@/types/integrations';
import {
  addDashboardShare,
  deleteDashboardSchedule,
  fetchDashboardSchedules,
  fetchDashboardShares,
  removeDashboardShare,
  revokePublicLink,
} from '@/lib/api/governanceDashboard';
import { listUsers } from '@/lib/api/users';
import type { ShareRecord, ScheduleRecord } from '@/types/governanceDashboard';
import type { User } from '@/types/auth';
import { notify } from '@/app/utils/notify';
import { ApiError } from '@/lib/api/client';
import { useAccessModal } from '@/hooks/useAccessModal';
import { AccessRestrictedModal } from '@/app/components/ui/AccessRestrictedModal';

const TIME_FILTERS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '6 months' },
  { value: '365d', label: '1 year' },
];

function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return 'Not yet refreshed';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function publicLinkUrl(token: string): string {
  return `${window.location.origin}/compliance/dashboards/public/${token}`;
}

function expiryFromPreset(preset: 'never' | '7d' | '30d'): string | null {
  if (preset === 'never') return null;
  const d = new Date();
  d.setDate(d.getDate() + (preset === '7d' ? 7 : 30));
  return d.toISOString();
}

function DraggableWidget(props: Parameters<typeof WidgetRenderer>[0] & { index: number; moveWidget: (from: number, to: number) => void }) {
  const { index, moveWidget, ...rest } = props;
  const [{ isDragging }, drag] = useDrag({ type: 'widget', item: { index }, collect: (m) => ({ isDragging: m.isDragging() }) });
  const [, drop] = useDrop({
    accept: 'widget',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        moveWidget(item.index, index);
        item.index = index;
      }
    },
  });
  return (
    <div ref={(node) => drag(drop(node))} style={{ opacity: isDragging ? 0.5 : 1 }}>
      <WidgetRenderer {...rest} />
    </div>
  );
}

export function GovernanceDashboardPage(): ReactElement {
  const navigate = useNavigate();
  const {
    loading, error, hasOrg, isSuperadmin, organizations, selectedOrgId, setSelectedOrgId,
    dashboards, activeDashboard, templates, widgetCatalog, widgetMetrics, refreshing, editMode,
    filters, saveFilters, selectDashboard, createDashboard, exportDashboard, scheduleReport,
    generatePublicLink, orgIdParam,
  } = useGovernanceDashboard();

  const [showNewModal, setShowNewModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPublicLinkModal, setShowPublicLinkModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newTemplateKey, setNewTemplateKey] = useState('');
  const [localWidgets, setLocalWidgets] = useState(activeDashboard?.widgets ?? []);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [bankingEnabled, setBankingEnabled] = useState(false);
  const [journeys, setJourneys] = useState<JourneyConfig[]>([]);
  const [showOrgHierarchyModal, setShowOrgHierarchyModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [shareTargetType, setShareTargetType] = useState<'user' | 'role'>('user');
  const [shareUserId, setShareUserId] = useState('');
  const [shareRole, setShareRole] = useState('admin');
  const [sharePermission, setSharePermission] = useState('read');
  const [scheduleName, setScheduleName] = useState('Weekly Board Report');
  const [scheduleFrequency, setScheduleFrequency] = useState('weekly');
  const [scheduleFormat, setScheduleFormat] = useState('pdf');
  const [scheduleRecipients, setScheduleRecipients] = useState('');
  const [publicLinkPassword, setPublicLinkPassword] = useState('');
  const [publicLinkExpiry, setPublicLinkExpiry] = useState<'never' | '7d' | '30d'>('never');
  const [createdPublicUrl, setCreatedPublicUrl] = useState<string | null>(null);
  const [creatingPublicLink, setCreatingPublicLink] = useState(false);

  // Permission modal for inline 403 errors (share / manage operations)
  const { isOpen: accessModalOpen, modalProps: accessModalConfig, open: openAccessModal, close: closeAccessModal } = useAccessModal();

  const reloadHierarchy = async () => {
    const [buData, deptData, propData, purposeData, bankingStatus] = await Promise.all([
      fetchBusinessUnits(orgIdParam ?? undefined),
      fetchDepartments(orgIdParam ?? undefined),
      integrationsApi.listProperties(orgIdParam ?? undefined),
      fetchPurposes(orgIdParam ?? undefined),
      fetchBankingEnabled(orgIdParam ?? undefined).catch(() => ({ enabled: false })),
    ]);
    setBusinessUnits(buData);
    setDepartments(deptData);
    setProperties(propData);
    setPurposes(purposeData);
    setBankingEnabled(bankingStatus.enabled);
    if (bankingStatus.enabled) {
      const cfg = await fetchBankingConfig(orgIdParam ?? undefined);
      setJourneys(cfg.journeys ?? []);
    } else {
      setJourneys([]);
    }
  };

  useEffect(() => {
    if (!hasOrg) {
      setBusinessUnits([]);
      setDepartments([]);
      return;
    }
    void reloadHierarchy().catch(() => {
      setBusinessUnits([]);
      setDepartments([]);
    });
  }, [hasOrg, orgIdParam, selectedOrgId]);

  const reloadShares = async () => {
    if (!activeDashboard) return;
    const [shareResult, userResult] = await Promise.allSettled([
      fetchDashboardShares(activeDashboard.id, orgIdParam ?? undefined),
      listUsers(orgIdParam ?? undefined),
    ]);
    if (shareResult.status === 'fulfilled') {
      setShares(shareResult.value);
    } else {
      setShares([]);
    }
    if (userResult.status === 'fulfilled') {
      setOrgUsers(userResult.value);
    } else {
      setOrgUsers([]);
    }
    if (shareResult.status === 'rejected' && userResult.status === 'rejected') {
      throw shareResult.reason;
    }
  };

  const reloadSchedules = async () => {
    if (!activeDashboard) return;
    const data = await fetchDashboardSchedules(activeDashboard.id, orgIdParam ?? undefined);
    setSchedules(data);
  };

  useEffect(() => {
    if (showShareModal && activeDashboard) {
      void reloadShares().catch(() => notify('Failed to load shares'));
    }
  }, [showShareModal, activeDashboard?.id, orgIdParam]);

  useEffect(() => {
    if (showPublicLinkModal && activeDashboard) {
      setCreatedPublicUrl(null);
      void reloadShares().catch(() => notify('Failed to load public links'));
    }
  }, [showPublicLinkModal, activeDashboard?.id, orgIdParam]);

  useEffect(() => {
    if (showScheduleModal && activeDashboard) {
      void reloadSchedules().catch(() => notify('Failed to load schedules'));
    }
  }, [showScheduleModal, activeDashboard?.id, orgIdParam]);

  const pinned = dashboards.filter((d) => d.is_pinned);
  const displayWidgets = editMode ? localWidgets : (activeDashboard?.widgets ?? []);
  const publicLinks = shares.filter((s) => s.public_token);

  const handleCopyPublicLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied');
    } catch {
      notify('Failed to copy link');
    }
  };

  const handleCreatePublicLink = async () => {
    if (!activeDashboard) {
      notify('Select or create a dashboard first');
      return;
    }
    setCreatingPublicLink(true);
    try {
      const link = await generatePublicLink({
        permission: 'read',
        expires_at: expiryFromPreset(publicLinkExpiry),
        password: publicLinkPassword.trim() || null,
      });
      if (!link) {
        notify('Select or create a dashboard first');
        return;
      }
      setCreatedPublicUrl(link.public_url);
      setPublicLinkPassword('');
      notify('Public link created');
      await reloadShares();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        openAccessModal({
          featureName: 'Dashboard Sharing',
          allowedRoles: ['admin', 'superadmin', 'compliance_officer', 'dpo'],
        });
      } else {
        notify('Failed to create public link');
      }
    } finally {
      setCreatingPublicLink(false);
    }
  };

  const moveWidget = (from: number, to: number) => {
    setLocalWidgets((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createDashboard(newName.trim(), newTemplateKey || undefined);
      notify('Dashboard created');
      setShowNewModal(false);
      setNewName('');
    } catch {
      notify('Failed to create dashboard');
    }
  };

  const handleExport = async (format: 'pdf' | 'json' | 'csv' | 'xlsx' | 'pptx' | 'png') => {
    try {
      await exportDashboard(format);
      notify(`Exported ${format.toUpperCase()}`);
      setShowExportModal(false);
    } catch {
      notify('Export failed');
    }
  };

  const handleAddShare = async () => {
    if (!activeDashboard) return;
    if (shareTargetType === 'user' && !shareUserId) {
      notify('Please select a user');
      return;
    }
    try {
      await addDashboardShare(
        activeDashboard.id,
        shareTargetType === 'user'
          ? { shared_with_user_id: shareUserId, permission: sharePermission }
          : { shared_with_role: shareRole, permission: sharePermission },
        orgIdParam ?? undefined
      );
      notify('Share added');
      await reloadShares();
    } catch (e) {
      notify('Failed to add share');
    }
  };

  const handleRemoveShare = async (shareId: string, isPublic?: boolean) => {
    if (!activeDashboard) return;
    try {
      if (isPublic) {
        await revokePublicLink(activeDashboard.id, shareId, orgIdParam ?? undefined);
      } else {
        await removeDashboardShare(activeDashboard.id, shareId, orgIdParam ?? undefined);
      }
      notify(isPublic ? 'Public link revoked' : 'Share removed');
      if (isPublic && createdPublicUrl) setCreatedPublicUrl(null);
      await reloadShares();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        openAccessModal({
          featureName: 'Dashboard Share Management',
          allowedRoles: ['admin', 'superadmin', 'compliance_officer', 'dpo'],
        });
      } else {
        notify(isPublic ? 'Failed to revoke public link' : 'Failed to remove share');
      }
    }
  };

  const handleCreateSchedule = async () => {
    if (!scheduleRecipients.trim()) {
      notify('Enter at least one email recipient');
      return;
    }
    try {
      await scheduleReport({
        name: scheduleName.trim(),
        frequency: scheduleFrequency,
        export_format: scheduleFormat,
        delivery_config_json: {
          recipients: scheduleRecipients.split(',').map((e) => e.trim()).filter(Boolean),
        },
      });
      notify('Schedule created');
      setShowScheduleModal(false);
      await reloadSchedules();
    } catch {
      notify('Failed to create schedule');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!activeDashboard) return;
    try {
      await deleteDashboardSchedule(activeDashboard.id, scheduleId, orgIdParam ?? undefined);
      notify('Schedule deleted');
      await reloadSchedules();
    } catch {
      notify('Failed to delete schedule');
    }
  };

  return (
    <>
      {accessModalOpen && (
        <AccessRestrictedModal
          featureName={accessModalConfig.featureName}
          allowedRoles={accessModalConfig.allowedRoles}
          onDismiss={closeAccessModal}
        />
      )}
      <ConsentManagementGate
      title="Compliance Dashboards"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <DndProvider backend={HTML5Backend}>
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div>
                <h1>Custom Compliance Dashboards</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Governance module — build, customize, and share compliance dashboards
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigate('/compliance/reports')} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2">
                  <FileText className="size-4" /> Regulatory Reports
                </button>
                <button type="button" onClick={() => setShowShareModal(true)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2">
                  <Share2 className="size-4" /> Share
                </button>
                <button type="button" onClick={() => setShowScheduleModal(true)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2">
                  <Calendar className="size-4" /> Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiModal(true)}
                  className="px-4 py-2 text-sm rounded-md bg-gradient-to-r from-[var(--status-ai)] to-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 transition-opacity font-medium"
                >
                  <Sparkles className="size-4" /> AI Assistant
                </button>
                <button type="button" onClick={() => setShowNewModal(true)} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2">
                  <Plus className="size-4" /> New Dashboard
                </button>
              </div>
            </div>
            <SectionReference section="DPDPA — Compliance Reporting & Dashboard Customization" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]">
            <select
              value={filters.time_range}
              onChange={(e) => void saveFilters({ ...filters, time_range: e.target.value })}
              className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
            >
              {TIME_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <div className="flex items-center gap-1.5">
              <select
                value={filters.business_unit_id ?? ''}
                onChange={(e) => void saveFilters({
                  ...filters,
                  business_unit_id: e.target.value || null,
                })}
                className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
              >
                <option value="">All units</option>
                {businessUnits.map((bu) => (
                  <option key={bu.id} value={bu.id}>{bu.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowOrgHierarchyModal(true)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--brand-primary)] flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded border border-transparent hover:border-[var(--border-default)]"
                title="Add or manage business units and departments"
              >
                <Building2 className="size-3" />
                Manage
              </button>
            </div>
            <select
              value={filters.property_id ?? ''}
              onChange={(e) => void saveFilters({ ...filters, property_id: e.target.value || null })}
              className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name || p.domain}</option>
              ))}
            </select>
            <select
              value={filters.purpose_id ?? ''}
              onChange={(e) => void saveFilters({ ...filters, purpose_id: e.target.value || null })}
              className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
            >
              <option value="">All purposes</option>
              {purposes.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {bankingEnabled && (
              <>
                <select
                  value={filters.channel ?? ''}
                  onChange={(e) => void saveFilters({ ...filters, channel: e.target.value || null })}
                  className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
                >
                  <option value="">All channels</option>
                  {journeys.map((j) => (
                    <option key={j.channel} value={j.channel}>{j.label || j.channel}</option>
                  ))}
                </select>
                <select
                  value={filters.journey_key ?? ''}
                  onChange={(e) => void saveFilters({ ...filters, journey_key: e.target.value || null })}
                  className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
                >
                  <option value="">All journeys</option>
                  {journeys.map((j) => (
                    <option key={j.key} value={j.key}>{j.label || j.key}</option>
                  ))}
                </select>
              </>
            )}
            <select
              value={filters.auto_refresh_seconds ?? ''}
              onChange={(e) => void saveFilters({ ...filters, auto_refresh_seconds: e.target.value ? Number(e.target.value) : null })}
              className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
            >
              <option value="">Auto-refresh off</option>
              <option value="30">Refresh every 30s</option>
              <option value="60">Refresh every 1m</option>
              <option value="300">Refresh every 5m</option>
            </select>
            {refreshing && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--status-success)] ml-auto">
                <Radio className="size-3 animate-pulse" /> Live
              </span>
            )}
          </div>

          {/* Pinned tabs */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Pinned Dashboards</h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {(pinned.length ? pinned : dashboards).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectDashboard(d.id)}
                  className={`px-4 py-2 rounded-lg border-2 whitespace-nowrap text-sm font-medium transition-all ${
                    activeDashboard?.id === d.id
                      ? 'border-[var(--brand-primary)] bg-[var(--status-info-bg)] text-[var(--status-info)]'
                      : 'border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)]'
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas */}
          {activeDashboard && (
            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4 md:p-6 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{activeDashboard.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
                      v{activeDashboard.version}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Owner: {activeDashboard.owner_name ?? '—'} · Last updated: {formatUpdated(activeDashboard.last_refreshed_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleExport('pdf')} className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] flex items-center gap-2">
                    <Download className="size-4" /> Export
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                {displayWidgets.map((widget, index) =>
                  editMode ? (
                    <DraggableWidget
                      key={widget.id}
                      widget={widget}
                      metrics={widgetMetrics[widget.id]}
                      editMode={editMode}
                      index={index}
                      moveWidget={moveWidget}
                      onRefresh={() => activeDashboard && selectDashboard(activeDashboard.id)}
                    />
                  ) : (
                    <WidgetRenderer
                      key={widget.id}
                      widget={widget}
                      metrics={widgetMetrics[widget.id]}
                      onRefresh={() => activeDashboard && selectDashboard(activeDashboard.id)}
                      onExport={() => handleExport('json')}
                    />
                  )
                )}
              </div>
            </div>
          )}

          {/* Bottom panels */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4">
              <h3 className="font-medium mb-3">Widget Library</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {['Charts', 'Metrics & KPIs', 'Tables & Lists', 'Compliance-specific'].map((cat) => {
                  const count = widgetCatalog.filter((w) => w.category === cat).length;
                  const Icon = cat.includes('Chart') ? BarChart3 : cat.includes('Table') ? FileText : cat.includes('Compliance') ? Users : Grid;
                  return (
                    <div key={cat} className="flex items-center justify-between p-2 rounded border border-[var(--border-default)] text-sm">
                      <div className="flex items-center gap-2"><Icon className="size-4 text-[var(--text-secondary)]" />{cat}</div>
                      <span className="text-xs text-[var(--text-tertiary)]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="lg:col-span-3 bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4">
              <h3 className="font-medium mb-3">Sharing & Export Options</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { title: 'Public Link', desc: 'Anyone with link can view', action: () => setShowPublicLinkModal(true), requiresDashboard: true },
                  { title: 'Specific Users/Roles', desc: 'Invite team members', action: () => setShowShareModal(true) },
                  { title: 'Auto-export Schedule', desc: 'Weekly PDF / Monthly PPT', action: () => setShowScheduleModal(true) },
                  { title: 'Export Formats', desc: 'PDF, Excel, CSV, JSON', action: () => setShowExportModal(true) },
                ].map((item) => (
                  <div key={item.title} className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/30">
                    <div className="text-sm font-medium mb-1">{item.title}</div>
                    <div className="text-xs text-[var(--text-secondary)] mb-2">{item.desc}</div>
                    <button
                      type="button"
                      onClick={() => item.action()}
                      disabled={'requiresDashboard' in item && item.requiresDashboard && !activeDashboard}
                      title={'requiresDashboard' in item && item.requiresDashboard && !activeDashboard ? 'Select or create a dashboard first' : undefined}
                      className="text-sm text-[var(--brand-primary)] font-medium cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      Configure →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Templates */}
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6">
            <h3 className="font-medium mb-4">Dashboard Templates</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {templates.map((t) => (
                <div key={t.key} onClick={() => setSelectedTemplate(t.key)} className="p-4 rounded-lg border border-[var(--border-default)] hover:border-[var(--brand-primary)] cursor-pointer transition-colors">
                  <div className="text-sm font-medium mb-1">{t.name}</div>
                  <div className="text-xs text-[var(--text-tertiary)] mb-2">{t.widget_count} widgets</div>
                  <button type="button" className="text-sm text-[var(--brand-primary)] font-medium">Use template →</button>
                </div>
              ))}
            </div>
          </div>

          {/* Modals */}
          {showNewModal && (
            <Modal title="Create New Dashboard" onClose={() => setShowNewModal(false)}>
              <label className="block text-sm font-medium mb-2">Dashboard Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 border rounded-md mb-4 bg-[var(--surface-raised)]" placeholder="e.g., Q2 2026 Board Report" />
              <label className="block text-sm font-medium mb-2">Start from Template</label>
              <select value={newTemplateKey} onChange={(e) => setNewTemplateKey(e.target.value)} className="w-full px-3 py-2 border rounded-md mb-4 bg-[var(--surface-raised)]">
                <option value="">Blank Dashboard</option>
                {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => void handleCreate()} className="w-full py-2 bg-[var(--brand-primary)] text-white rounded-md font-medium">Create Dashboard</button>
            </Modal>
          )}

          {showPublicLinkModal && (
            <Modal title="Public Link" onClose={() => setShowPublicLinkModal(false)}>
              {!activeDashboard ? (
                <p className="text-sm text-[var(--text-secondary)]">Select or create a dashboard first.</p>
              ) : (
                <>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    Anyone with this link can view the dashboard without logging in.
                  </p>

                  {createdPublicUrl && (
                    <div className="mb-4 p-3 rounded-lg border border-[var(--brand-primary)]/30 bg-[var(--status-info-bg)]">
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">New link created</div>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={createdPublicUrl}
                          className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)] font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => void handleCopyPublicLink(createdPublicUrl)}
                          className="p-2 rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
                          title="Copy link"
                        >
                          <Copy className="size-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Optional password</label>
                      <input
                        type="password"
                        value={publicLinkPassword}
                        onChange={(e) => setPublicLinkPassword(e.target.value)}
                        placeholder="Leave blank for no password"
                        className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Link expiry</label>
                      <select
                        value={publicLinkExpiry}
                        onChange={(e) => setPublicLinkExpiry(e.target.value as 'never' | '7d' | '30d')}
                        className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm"
                      >
                        <option value="never">Never expires</option>
                        <option value="7d">7 days</option>
                        <option value="30d">30 days</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCreatePublicLink()}
                      disabled={creatingPublicLink}
                      className="w-full py-2 bg-[var(--brand-primary)] text-white rounded-md text-sm font-medium disabled:opacity-50"
                    >
                      {creatingPublicLink ? 'Generating…' : 'Generate link'}
                    </button>
                  </div>

                  <div className="border-t border-[var(--border-default)] pt-3 max-h-48 overflow-y-auto space-y-2">
                    <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Active public links</div>
                    {publicLinks.length === 0 && (
                      <p className="text-xs text-[var(--text-secondary)]">No public links yet.</p>
                    )}
                    {publicLinks.map((s) => {
                      const url = publicLinkUrl(s.public_token!);
                      return (
                        <div key={s.id} className="flex items-center justify-between text-sm gap-2 p-2 rounded border border-[var(--border-default)]">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate font-mono text-xs">{url}</div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              Created {formatUpdated(s.created_at)}
                              {s.expires_at ? ` · Expires ${formatUpdated(s.expires_at)}` : ' · No expiry'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleCopyPublicLink(url)}
                              className="p-1 hover:bg-[var(--surface-raised)] rounded"
                              title="Copy link"
                            >
                              <Copy className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveShare(s.id, true)}
                              className="p-1 text-[var(--status-danger)] hover:bg-[var(--surface-raised)] rounded"
                              title="Revoke link"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Modal>
          )}

          {showShareModal && (
            <Modal title="Share Dashboard" onClose={() => setShowShareModal(false)}>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Invite team members by user or role. Public links appear in the list below.
              </p>
              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShareTargetType('user')} className={`flex-1 py-1.5 text-xs rounded border ${shareTargetType === 'user' ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-[var(--border-default)]'}`}>User</button>
                  <button type="button" onClick={() => setShareTargetType('role')} className={`flex-1 py-1.5 text-xs rounded border ${shareTargetType === 'role' ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-[var(--border-default)]'}`}>Role</button>
                </div>
                {shareTargetType === 'user' ? (
                  <select value={shareUserId} onChange={(e) => setShareUserId(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm">
                    <option value="">Select user…</option>
                    {orgUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                ) : (
                  <select value={shareRole} onChange={(e) => setShareRole(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm">
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </select>
                )}
                <select value={sharePermission} onChange={(e) => setSharePermission(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm">
                  <option value="read">Read</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
                <button type="button" onClick={() => void handleAddShare()} className="w-full py-2 bg-[var(--brand-primary)] text-white rounded-md text-sm font-medium">Add Share</button>
              </div>
              <div className="border-t border-[var(--border-default)] pt-3 max-h-48 overflow-y-auto space-y-2">
                {shares.length === 0 && <p className="text-xs text-[var(--text-secondary)]">No shares yet.</p>}
                {shares.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm gap-2 p-2 rounded border border-[var(--border-default)]">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {s.public_token ? 'Public link' : s.shared_with_user_name ?? s.shared_with_role ?? 'Share'}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">{s.permission}</div>
                    </div>
                    <button type="button" onClick={() => void handleRemoveShare(s.id, Boolean(s.public_token))} className="p-1 text-[var(--status-danger)] hover:bg-[var(--surface-raised)] rounded">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Modal>
          )}

          {showScheduleModal && (
            <Modal title="Schedule Report" onClose={() => setShowScheduleModal(false)}>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Email recurring PDF or PowerPoint exports to stakeholders.
              </p>
              <div className="space-y-3 mb-4">
                <input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="Schedule name" className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm" />
                <select value={scheduleFrequency} onChange={(e) => setScheduleFrequency(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
                <select value={scheduleFormat} onChange={(e) => setScheduleFormat(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm">
                  <option value="pdf">PDF</option>
                  <option value="pptx">PowerPoint</option>
                  <option value="xlsx">Excel</option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <input value={scheduleRecipients} onChange={(e) => setScheduleRecipients(e.target.value)} placeholder="Recipients (comma-separated emails)" className="w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)] text-sm" />
                <button type="button" onClick={() => void handleCreateSchedule()} className="w-full py-2 bg-[var(--brand-primary)] text-white rounded-md text-sm font-medium">Create Schedule</button>
              </div>
              <div className="border-t border-[var(--border-default)] pt-3 max-h-40 overflow-y-auto space-y-2">
                {schedules.length === 0 && <p className="text-xs text-[var(--text-secondary)]">No schedules yet.</p>}
                {schedules.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm gap-2 p-2 rounded border border-[var(--border-default)]">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{s.frequency} · {s.export_format.toUpperCase()}</div>
                    </div>
                    <button type="button" onClick={() => void handleDeleteSchedule(s.id)} className="p-1 text-[var(--status-danger)] hover:bg-[var(--surface-raised)] rounded">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Modal>
          )}

          {showExportModal && (
            <Modal title="Export Dashboard" onClose={() => setShowExportModal(false)}>
              <p className="text-sm text-[var(--text-secondary)] mb-4">Choose a format to download the current dashboard with live widget metrics.</p>
              <div className="grid grid-cols-2 gap-2">
                {(['pdf', 'xlsx', 'csv', 'json', 'pptx'] as const).map((fmt) => (
                  <button key={fmt} type="button" onClick={() => void handleExport(fmt)} className="py-2 px-3 text-sm rounded-md border border-[var(--border-default)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] font-medium uppercase">
                    {fmt}
                  </button>
                ))}
              </div>
            </Modal>
          )}

          {selectedTemplate && (
            <Modal title={templates.find((t) => t.key === selectedTemplate)?.name ?? 'Template'} onClose={() => setSelectedTemplate(null)}>
              <p className="text-sm text-[var(--text-secondary)] mb-4">Pre-configured widgets tailored for this audience.</p>
              <button type="button" onClick={() => { void createDashboard(templates.find((t) => t.key === selectedTemplate)?.name ?? 'New Dashboard', selectedTemplate); setSelectedTemplate(null); notify('Dashboard created from template'); }} className="w-full py-2 bg-[var(--brand-primary)] text-white rounded-md">Use This Template</button>
            </Modal>
          )}

          {showAiModal && (
            <GovernanceAiAssistantModal
              dashboardId={activeDashboard?.id}
              dashboardName={activeDashboard?.name}
              orgId={orgIdParam ?? undefined}
              onClose={() => setShowAiModal(false)}
            />
          )}
        </div>
      </DndProvider>

      <OrgHierarchyModal
        open={showOrgHierarchyModal}
        onClose={() => setShowOrgHierarchyModal(false)}
        orgId={orgIdParam ?? undefined}
        businessUnits={businessUnits}
        departments={departments}
        onUpdated={reloadHierarchy}
        initialBusinessUnitId={filters.business_unit_id ?? undefined}
      />
    </ConsentManagementGate>
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): ReactElement {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg shadow-xl max-w-lg w-full">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
