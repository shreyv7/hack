import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import { 
  Plus, Download, Sparkles, Table, Grid as GridIcon, Share2, X, Filter, 
  AlertTriangle, Trash2, ArrowRight, History, GitCompare, RotateCcw, HelpCircle, Building2
} from 'lucide-react';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { StatusPill } from '@/app/components/common/StatusPill';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';
import {
  fetchRopaActivities,
  fetchRopaDashboard,
  fetchRopaActivityDetail,
  fetchBusinessUnits,
  fetchDepartments,
  fetchTeams,
  fetchRopaSuggestions,
  acceptRopaSuggestion,
  dismissRopaSuggestion,
  scanRopaSuggestions,
  createRopaActivity,
  updateRopaActivity,
  deleteRopaActivity,
  submitRopaForReview,
  processRopaApprovalDecision,
  publishRopaActivity,
  deprecateRopaActivity,
  archiveRopaActivity,
  restoreRopaActivity,
  checkoutRopaVersion,
  compareRopaVersions,
  rollbackRopaVersion,
  fetchRopaBankingPresets,
  createDpiaFromActivity,
  exportRopaRegister,
  type ProcessingActivity,
  type ProcessingActivityDetail,
  type RopaDashboardKPIs,
  type RopaBankingContext,
  type RopaBankingPresets,
  type BusinessUnit,
  type Department,
  type Team,
  type RopaDiscoverySuggestion,
  type VersionDiff,
} from '@/lib/api/ropa';
import { fetchProcessors } from '@/lib/api/workspace';
import { fetchPurposes } from '@/lib/api/consent';
import { fetchBankingEnabled } from '@/lib/api/consentBanking';
import { fetchDataSources } from '@/lib/api/dataSources';
import { fetchPolicies } from '@/lib/api/retention';
import { integrationsApi } from '@/lib/api/integrations';
import type { Property } from '@/types/integrations';
import type { DataSource } from '@/types/dataSource';
import type { RetentionPolicy } from '@/types/retention';
import { listUsers } from '@/lib/api/users';
import type { DataProcessor } from '@/types/workspace';
import type { Purpose } from '@/types/consent';
import type { User } from '@/types/auth';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { OrgHierarchyModal } from '@/app/components/ropa/OrgHierarchyModal';


type DetailTabId = 'overview' | 'data' | 'lawful' | 'recipients' | 'retention' | 'security' | 'dpia' | 'versions' | 'audit';


export function RoPAModule(): ReactElement {
  const {
    orgIdParam,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    hasOrg,
    loading: orgLoading,
    error: orgError,
    canEdit,
  } = useComplianceOrg();

  // Lists
  const [activities, setActivities] = useState<ProcessingActivity[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [dataProcessors, setDataProcessors] = useState<DataProcessor[]>([]);
  const [suggestions, setSuggestions] = useState<RopaDiscoverySuggestion[]>([]);
  
  // Dashboard & Metrics
  const [dashboard, setDashboard] = useState<RopaDashboardKPIs | null>(null);
  const [showAllKPIs, setShowAllKPIs] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterPurpose, setFilterPurpose] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterLawfulBasis, setFilterLawfulBasis] = useState('');
  const [filterRetention, setFilterRetention] = useState('');
  const [filterSystem, setFilterSystem] = useState('');

  // Modals / Drawer States
  const [showNewActivityModal, setShowNewActivityModal] = useState(false);
  const [showOrgHierarchyModal, setShowOrgHierarchyModal] = useState(false);
  const [hierarchyFocusDept, setHierarchyFocusDept] = useState(false);
  const [newActivityTab, setNewActivityTab] = useState<'general' | 'data' | 'banking' | 'infrastructure' | 'retention'>('general');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ProcessingActivityDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTabId>('overview');
  const [viewMode, setViewMode] = useState<'table' | 'card' | 'diagram'>('table');
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'xlsx' | 'json'>('pdf');
  
  // Version compare states
  const [versionAId, setVersionAId] = useState('');
  const [versionBId, setVersionBId] = useState('');
  const [versionDiff, setVersionDiff] = useState<VersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Approval state
  const [approvalComments, setApprovalComments] = useState('');
  
  // Edit state (if editing an activity)
  const [isEditing, setIsEditing] = useState(false);

  // Checkout version state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutChangelog, setCheckoutChangelog] = useState('');

  const [bankingEnabled, setBankingEnabled] = useState(false);
  const [bankingPresets, setBankingPresets] = useState<RopaBankingPresets | null>(null);
  const [integrationProperties, setIntegrationProperties] = useState<Property[]>([]);
  const [registeredDataSources, setRegisteredDataSources] = useState<DataSource[]>([]);
  const [orgRetentionPolicies, setOrgRetentionPolicies] = useState<RetentionPolicy[]>([]);

  const emptyBankingContext = (): RopaBankingContext => ({
    channels: [],
    identifier_types: [],
    primary_identifier: '',
    secondary_identifiers: [],
    consent_journey_keys: [],
  });

  // Form State for new/edit Activity
  const [activityForm, setActivityForm] = useState({
    title: '',
    description: '',
    business_unit_id: '',
    department_id: '',
    team_id: '',
    purposes: [] as string[],
    owners: [] as { user_id: string; owner_role: string }[],
    data_categories: [] as { category_name: string; is_special: boolean; sensitivity: string }[],
    data_principals: [] as { category_name: string; description: string; includes_children: boolean }[],
    lawful_bases: [] as { basis_type: string; justification: string; dpdpa_section: string }[],
    systems: [] as { system_name: string; system_type: string; location: string; description: string; property_id?: string; channel?: string }[],
    recipients: [] as { recipient_type: string; name: string; data_shared: string; data_processor_id: string }[],
    retention_policies: [] as { retention_period: string; trigger_event: string; legal_basis: string; auto_delete: boolean; retention_policy_id?: string }[],
    security_measures: [] as { measure_type: string; description: string; status: string }[],
    data_sources: [] as { data_source_id: string; role: string; notes: string }[],
    banking_context: emptyBankingContext(),
  });

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const bankingStatus = await fetchBankingEnabled(orgIdParam).catch(() => ({ enabled: false }));
      setBankingEnabled(bankingStatus.enabled);

      const loadTasks: Promise<unknown>[] = [
        fetchBusinessUnits(orgIdParam),
        fetchDepartments(orgIdParam),
        fetchTeams(orgIdParam),
        listUsers(),
        fetchPurposes(orgIdParam),
        fetchProcessors(orgIdParam),
        fetchRopaSuggestions(orgIdParam),
      ];
      if (bankingStatus.enabled) {
        loadTasks.push(
          fetchRopaBankingPresets(orgIdParam),
          integrationsApi.listProperties(orgIdParam),
          fetchDataSources(orgIdParam),
          fetchPolicies(orgIdParam),
        );
      }

      const results = await Promise.all(loadTasks);
      const [buData, deptData, teamData, usersData, purposesData, processorsData, suggestionsData] = results.slice(0, 7) as [
        BusinessUnit[], Department[], Team[], User[], Purpose[], DataProcessor[], RopaDiscoverySuggestion[]
      ];
      setBusinessUnits(buData);
      setDepartments(deptData);
      setTeams(teamData);
      setUsers(usersData);
      setPurposes(purposesData);
      setDataProcessors(processorsData);
      setSuggestions(suggestionsData);

      if (bankingStatus.enabled && results.length > 7) {
        setBankingPresets(results[7] as RopaBankingPresets);
        setIntegrationProperties(results[8] as Property[]);
        setRegisteredDataSources(results[9] as DataSource[]);
        setOrgRetentionPolicies(results[10] as RetentionPolicy[]);
      }
      
      await refreshActivitiesAndDashboard();
    } catch (err) {
      console.error(err);
      notify('Failed to load Registry data.');
    } finally {
      setLoading(false);
    }
  };

  const reloadHierarchy = async () => {
    const [buData, deptData, teamData] = await Promise.all([
      fetchBusinessUnits(orgIdParam),
      fetchDepartments(orgIdParam),
      fetchTeams(orgIdParam),
    ]);
    setBusinessUnits(buData);
    setDepartments(deptData);
    setTeams(teamData);
  };

  const openOrgHierarchy = (focusDepartment = false) => {
    setHierarchyFocusDept(focusDepartment);
    setShowOrgHierarchyModal(true);
  };

  const refreshActivitiesAndDashboard = async () => {
    try {
      const activeFilters = {
        search: filterQuery || undefined,
        department_id: filterDept || undefined,
        owner_id: filterOwner || undefined,
        status: filterStatus || undefined,
        risk_level: filterRisk || undefined,
        destination_country: filterCountry || undefined,
        purpose_id: filterPurpose || undefined,
        vendor_id: filterVendor || undefined,
        lawful_basis: filterLawfulBasis || undefined,
        retention_period: filterRetention || undefined,
        system_name: filterSystem || undefined,
        orgId: orgIdParam,
      };
      const [activitiesData, dashboardData] = await Promise.all([
        fetchRopaActivities(activeFilters),
        fetchRopaDashboard(orgIdParam)
      ]);
      setActivities(activitiesData);
      setDashboard(dashboardData);
    } catch (err) {
      console.error(err);
      notify('Failed to refresh data lists.');
    }
  };

  useEffect(() => {
    if (isSuperadmin && !hasOrg) return;
    void loadInitialData();
  }, [orgIdParam, hasOrg, isSuperadmin]);

  // Refresh list when filters change
  useEffect(() => {
    if (isSuperadmin && !hasOrg) return;
    void refreshActivitiesAndDashboard();
  }, [
    filterQuery,
    filterDept,
    filterOwner,
    filterStatus,
    filterRisk,
    filterCountry,
    filterPurpose,
    filterVendor,
    filterLawfulBasis,
    filterRetention,
    filterSystem,
    orgIdParam,
    hasOrg,
    isSuperadmin,
  ]);

  // Load activity details when ID selected
  useEffect(() => {
    if (selectedActivityId) {
      void loadActivityDetails(selectedActivityId);
    } else {
      setSelectedActivity(null);
    }
  }, [selectedActivityId]);

  const loadActivityDetails = async (id: string) => {
    try {
      const data = await fetchRopaActivityDetail(id, orgIdParam);
      setSelectedActivity(data);
      setVersionAId('');
      setVersionBId('');
      setVersionDiff(null);
    } catch (err) {
      notify('Failed to load activity details.');
    }
  };

  const handleClearFilters = () => {
    setFilterQuery('');
    setFilterDept('');
    setFilterOwner('');
    setFilterStatus('');
    setFilterRisk('');
    setFilterCountry('');
    setFilterPurpose('');
    setFilterVendor('');
    setFilterLawfulBasis('');
    setFilterRetention('');
    setFilterSystem('');
    notify('Filters cleared.');
  };

  // --- Suggestion actions ---
  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await scanRopaSuggestions(orgIdParam);
      setSuggestions(res);
      notify('Vajra AI discovery scanner completed. Found suggestions.');
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Discovery scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const handleExportRegister = async () => {
    setExporting(true);
    try {
      const blob = await exportRopaRegister(exportFormat, orgIdParam ?? undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ropa_register.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`RoPA register exported as ${exportFormat.toUpperCase()}`);
    } catch {
      notify('RoPA export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleAcceptSuggestion = async (id: string) => {
    try {
      const newAct = await acceptRopaSuggestion(id);
      notify(`Suggestion accepted. Draft Activity created: ${newAct.activity_ref}`);
      setSuggestions(prev => prev.filter(s => s.id !== id));
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to accept suggestion.');
    }
  };

  const handleDismissSuggestion = async (id: string) => {
    try {
      await dismissRopaSuggestion(id);
      notify('Suggestion dismissed.');
      setSuggestions(prev => prev.filter(s => s.id !== id));
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to dismiss suggestion.');
    }
  };

  // --- Version comparison ---
  const handleCompareVersions = async () => {
    if (!versionAId || !versionBId) {
      notify('Select both versions to compare.');
      return;
    }
    setDiffLoading(true);
    try {
      const diff = await compareRopaVersions(versionAId, versionBId);
      setVersionDiff(diff);
      notify('Version diff fetched successfully.');
    } catch (err) {
      notify('Failed to compare versions.');
    } finally {
      setDiffLoading(false);
    }
  };

  // --- Rollback version ---
  const handleRollback = async (versionId: string) => {
    if (!selectedActivity) return;
    if (!confirm('Are you sure you want to rollback to this version snapshot? This will checkout a new draft version representing the rolled-back state.')) return;
    try {
      await rollbackRopaVersion(selectedActivity.id, versionId);
      notify('Activity state rolled back. Switched to a new Draft version.');
      await loadActivityDetails(selectedActivity.id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Rollback failed.');
    }
  };

  // --- Workflow transitions ---
  const handleWorkflowSubmit = async (id: string) => {
    try {
      await submitRopaForReview(id);
      notify('Activity submitted to review pipeline.');
      await loadActivityDetails(id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to submit for review.');
    }
  };

  const handleWorkflowDecision = async (approvalId: string, statusDecision: 'approved' | 'rejected') => {
    if (!selectedActivity) return;
    try {
      await processRopaApprovalDecision(approvalId, {
        status: statusDecision,
        comments: approvalComments || undefined
      });
      notify(`Workflow decision: ${statusDecision}`);
      setApprovalComments('');
      await loadActivityDetails(selectedActivity.id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to record workflow decision.');
    }
  };

  const handleWorkflowPublish = async (id: string) => {
    try {
      await publishRopaActivity(id);
      notify('Processing Activity is now PUBLISHED. Compliance engine updated.');
      await loadActivityDetails(id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to publish activity.');
    }
  };

  const handleWorkflowDeprecate = async (id: string) => {
    try {
      await deprecateRopaActivity(id);
      notify('Activity status updated to Deprecated.');
      await loadActivityDetails(id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to deprecate activity.');
    }
  };

  const handleWorkflowArchive = async (id: string) => {
    try {
      await archiveRopaActivity(id);
      notify('Activity status updated to Archived.');
      await loadActivityDetails(id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to archive activity.');
    }
  };

  const handleWorkflowRestore = async (id: string) => {
    try {
      await restoreRopaActivity(id);
      notify('Activity restored to Draft status.');
      await loadActivityDetails(id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to restore activity.');
    }
  };

  const handleCheckoutVersion = async () => {
    if (!selectedActivity || !checkoutChangelog) return;
    try {
      await checkoutRopaVersion(selectedActivity.id, checkoutChangelog);
      notify('New Draft version checked out for modifications.');
      setCheckoutChangelog('');
      setShowCheckoutModal(false);
      await loadActivityDetails(selectedActivity.id);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to checkout version.');
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('Are you sure you want to soft delete this processing activity?')) return;
    try {
      await deleteRopaActivity(id, orgIdParam);
      notify('Processing activity soft deleted.');
      setSelectedActivityId(null);
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Delete failed.');
    }
  };

  // --- CRUD Save (Create & Edit) ---
  const resetForm = () => {
    setActivityForm({
      title: '',
      description: '',
      business_unit_id: businessUnits[0]?.id || '',
      department_id: '',
      team_id: '',
      purposes: [],
      owners: [],
      data_categories: [],
      data_principals: [],
      lawful_bases: [],
      systems: [],
      recipients: [],
      retention_policies: [],
      security_measures: [],
      data_sources: [],
      banking_context: emptyBankingContext(),
    });
    setNewActivityTab('general');
    setIsEditing(false);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setShowNewActivityModal(true);
  };

  const handleOpenEdit = () => {
    if (!selectedActivity) return;
    setActivityForm({
      title: selectedActivity.title,
      description: selectedActivity.description || '',
      business_unit_id: selectedActivity.business_unit_id,
      department_id: selectedActivity.department_id || '',
      team_id: selectedActivity.team_id || '',
      purposes: selectedActivity.purposes.map(p => p.purpose_id),
      owners: selectedActivity.owners.map(o => ({ user_id: o.user_id, owner_role: o.owner_role })),
      data_categories: selectedActivity.data_categories.map(c => ({ category_name: c.category_name, is_special: c.is_special, sensitivity: c.sensitivity })),
      data_principals: selectedActivity.data_principals.map(p => ({ category_name: p.category_name, description: p.description || '', includes_children: p.includes_children })),
      lawful_bases: selectedActivity.lawful_bases.map(l => ({ basis_type: l.basis_type, justification: l.justification || '', dpdpa_section: l.dpdpa_section || '' })),
      systems: selectedActivity.systems.map(s => ({
        system_name: s.system_name,
        system_type: s.system_type,
        location: s.location || '',
        description: s.description || '',
        property_id: s.property_id || '',
        channel: s.channel || '',
      })),
      recipients: selectedActivity.recipients.map(r => ({ recipient_type: r.recipient_type, name: r.name, data_shared: r.data_shared || '', data_processor_id: r.data_processor_id || '' })),
      retention_policies: selectedActivity.retention_policies.map(rp => ({
        retention_period: rp.retention_period,
        trigger_event: rp.trigger_event || '',
        legal_basis: rp.legal_basis || '',
        auto_delete: rp.auto_delete,
        retention_policy_id: rp.retention_policy_id || '',
      })),
      security_measures: selectedActivity.security_measures.map(sm => ({ measure_type: sm.measure_type, description: sm.description || '', status: sm.status })),
      data_sources: (selectedActivity.data_sources || []).map(ds => ({
        data_source_id: ds.data_source_id,
        role: ds.role,
        notes: ds.notes || '',
      })),
      banking_context: selectedActivity.banking_context || emptyBankingContext(),
    });
    setIsEditing(true);
    setShowNewActivityModal(true);
  };

  const handleSaveActivity = async () => {
    if (!activityForm.title || !activityForm.business_unit_id) {
      notify('Title and Business Unit are required fields.');
      return;
    }
    
    // Convert empty strings to null for optional foreign keys
    const payload = {
      ...activityForm,
      department_id: activityForm.department_id || null,
      team_id: activityForm.team_id || null,
      banking_context: bankingEnabled ? {
        ...activityForm.banking_context,
        primary_identifier: activityForm.banking_context.primary_identifier || null,
      } : undefined,
      systems: activityForm.systems.map(s => ({
        ...s,
        property_id: s.property_id || null,
        channel: s.channel || null,
      })),
      retention_policies: activityForm.retention_policies.map(rp => ({
        ...rp,
        retention_policy_id: rp.retention_policy_id || null,
      })),
    };

    try {
      if (isEditing && selectedActivity) {
        await updateRopaActivity(selectedActivity.id, payload, orgIdParam);
        notify('Processing Activity updated successfully.');
        await loadActivityDetails(selectedActivity.id);
      } else {
        const created = await createRopaActivity(payload, orgIdParam);
        notify(`Processing Activity created: ${created.activity_ref}`);
      }
      setShowNewActivityModal(false);
      resetForm();
      void refreshActivitiesAndDashboard();
    } catch (err) {
      notify('Failed to save processing activity.');
    }
  };

  const handleAddCategory = () => {
    setActivityForm(prev => ({
      ...prev,
      data_categories: [...prev.data_categories, { category_name: '', is_special: false, sensitivity: 'standard' }]
    }));
  };

  const handleRemoveCategory = (index: number) => {
    setActivityForm(prev => ({
      ...prev,
      data_categories: prev.data_categories.filter((_, i) => i !== index)
    }));
  };

  const handleAddSystem = () => {
    setActivityForm(prev => ({
      ...prev,
      systems: [...prev.systems, { system_name: '', system_type: 'database', location: '', description: '', property_id: '', channel: '' }]
    }));
  };

  const handleAddDataSource = () => {
    setActivityForm(prev => ({
      ...prev,
      data_sources: [...prev.data_sources, { data_source_id: '', role: 'primary', notes: '' }],
    }));
  };

  const handleRemoveDataSource = (index: number) => {
    setActivityForm(prev => ({
      ...prev,
      data_sources: prev.data_sources.filter((_, i) => i !== index),
    }));
  };

  const applyBankingPreset = (presetKey: string) => {
    const preset = bankingPresets?.presets[presetKey];
    if (!preset) return;
    setActivityForm(prev => ({
      ...prev,
      banking_context: {
        channels: preset.channels || [],
        identifier_types: preset.identifier_types || [],
        primary_identifier: preset.primary_identifier || '',
        secondary_identifiers: preset.secondary_identifiers || [],
        consent_journey_keys: preset.consent_journey_keys || [],
      },
    }));
    notify(`Applied preset: ${preset.label || presetKey}`);
  };

  const toggleBankingList = (field: 'channels' | 'identifier_types' | 'consent_journey_keys' | 'secondary_identifiers', value: string) => {
    setActivityForm(prev => {
      const current = prev.banking_context[field] as string[];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, banking_context: { ...prev.banking_context, [field]: next } };
    });
  };

  const handleCreateDpiaFromActivity = async () => {
    if (!selectedActivity) return;
    try {
      const result = await createDpiaFromActivity(selectedActivity.id, orgIdParam);
      notify(`DPIA ${result.dpia_ref} created and linked.`);
      const detail = await fetchRopaActivityDetail(selectedActivity.id, orgIdParam);
      setSelectedActivity(detail);
    } catch {
      notify('Failed to create DPIA from activity.');
    }
  };

  const handleRemoveSystem = (index: number) => {
    setActivityForm(prev => ({
      ...prev,
      systems: prev.systems.filter((_, i) => i !== index)
    }));
  };

  const handleAddRecipient = () => {
    setActivityForm(prev => ({
      ...prev,
      recipients: [...prev.recipients, { recipient_type: 'vendor', name: '', data_shared: '', data_processor_id: '' }]
    }));
  };

  const handleRemoveRecipient = (index: number) => {
    setActivityForm(prev => ({
      ...prev,
      recipients: prev.recipients.filter((_, i) => i !== index)
    }));
  };

  const handleAddLawfulBasis = () => {
    setActivityForm(prev => ({
      ...prev,
      lawful_bases: [...prev.lawful_bases, { basis_type: 'consent', justification: '', dpdpa_section: 'Section 6' }]
    }));
  };

  const handleRemoveLawfulBasis = (index: number) => {
    setActivityForm(prev => ({
      ...prev,
      lawful_bases: prev.lawful_bases.filter((_, i) => i !== index)
    }));
  };

  const handleAddRetention = () => {
    setActivityForm(prev => ({
      ...prev,
      retention_policies: [...prev.retention_policies, { retention_period: '7 years', trigger_event: 'Account deletion', legal_basis: 'Tax compliance', auto_delete: true, retention_policy_id: '' }]
    }));
  };

  const handleRemoveRetention = (index: number) => {
    setActivityForm(prev => ({
      ...prev,
      retention_policies: prev.retention_policies.filter((_, i) => i !== index)
    }));
  };

  const handleAddOwner = () => {
    setActivityForm(prev => ({
      ...prev,
      owners: [...prev.owners, { user_id: users[0]?.id || '', owner_role: 'business_owner' }]
    }));
  };

  const handleRemoveOwner = (index: number) => {
    setActivityForm(prev => ({
      ...prev,
      owners: prev.owners.filter((_, i) => i !== index)
    }));
  };

  // Helper to format date strings
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const activitiesFilterKey = [
    filterQuery,
    filterDept,
    filterOwner,
    filterStatus,
    filterRisk,
    filterCountry,
    filterPurpose,
    filterVendor,
    filterLawfulBasis,
    filterRetention,
    filterSystem,
  ].join('|');

  const {
    page: activitiesPage,
    setPage: setActivitiesPage,
    pageCount: activitiesPageCount,
    pageItems: activitiesPageItems,
    total: activitiesTotal,
    pageSize: activitiesPageSize,
  } = useClientPagination(activities, TABLE_PAGE_SIZE, activitiesFilterKey);

  return (
    <ConsentManagementGate
      title="Record of Processing Activities"
      loading={loading || orgLoading}
      error={orgError}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
    <div className="p-8 max-w-[1440px] mx-auto min-h-screen bg-[var(--surface-base)] text-[var(--text-primary)]">
      {/* Header Bar */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold mb-2">Record of Processing Activities (RoPA)</h1>
          <div className="flex items-center gap-3">
            <DPDPAChip
              sections={{
                chapter: 2,
                section: 10,
                name: 'Significant Data Fiduciary obligations',
                url: '/dpdpa2023/chapter-2/section10.html',
                excerpt: 'Maintain record of processing activities...',
              }}
              size="detailed"
            />
            <PenaltyChip amount={250} />
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'xlsx' | 'json')}
            className="px-2 py-2 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)]"
          >
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
            <option value="json">JSON</option>
          </select>
          <button
            onClick={() => void handleExportRegister()}
            disabled={exporting}
            className="px-4 py-2 text-sm font-semibold rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <Download className="size-4" />
            {exporting ? 'Exporting…' : 'Export Register'}
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 text-sm font-semibold rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <Sparkles className="size-4 text-purple-500" />
            {scanning ? 'Scanning...' : 'Auto-discover'}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => openOrgHierarchy(false)}
              className="px-4 py-2 text-sm font-semibold rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] flex items-center gap-2 cursor-pointer transition-all"
            >
              <Building2 className="size-4" />
              Org Structure
            </button>
          )}
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer transition-all"
          >
            <Plus className="size-4" />
            New Processing Activity
          </button>
        </div>
      </div>

      <SectionReference section="DPDPA — Required for SDFs, best practice for all Data Fiduciaries" />

      {/* 14 KPIs Dashboard Grid */}
      {dashboard && (
        <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg border border-[var(--border-default)] p-6 mb-6 shadow-sm transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">Registry Compliance & Coverage</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-500 font-mono">Real-time</span>
            </div>
            <button
              onClick={() => setShowAllKPIs(!showAllKPIs)}
              className="text-sm text-[var(--brand-primary)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
            >
              {showAllKPIs ? 'Hide Advanced Metrics ↑' : 'Show All 14 Compliance KPIs ↓'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-6 items-center">
            {/* Compliance Health Score */}
            <div className="col-span-1 border-r border-[var(--border-default)] pr-6 flex flex-col items-center justify-center text-center">
              <span className="text-sm font-semibold text-[var(--text-secondary)] mb-1">Global Compliance</span>
              <div className="text-4xl font-extrabold text-[var(--brand-primary)] font-mono">{dashboard.compliance_percentage}%</div>
              <div className="w-full mt-3 h-2 bg-[var(--surface-raised)] rounded-full overflow-hidden border border-[var(--border-default)]">
                <div 
                  className={`h-full transition-all ${dashboard.compliance_percentage > 80 ? 'bg-green-500' : dashboard.compliance_percentage > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                  style={{ width: `${dashboard.compliance_percentage}%` }}
                />
              </div>
            </div>

            {/* Coverage Bar */}
            <div className="col-span-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Documented Processing Registry</span>
                <span className="text-sm font-bold font-mono">{dashboard.published} of {dashboard.total} Published</span>
              </div>
              <div className="h-4 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full overflow-hidden flex">
                <div 
                  className="bg-green-500 h-full transition-all" 
                  style={{ width: `${dashboard.total > 0 ? (dashboard.published / dashboard.total) * 100 : 0}%` }}
                />
                <div 
                  className="bg-yellow-500 h-full transition-all" 
                  style={{ width: `${dashboard.total > 0 ? (dashboard.pending / dashboard.total) * 100 : 0}%` }}
                />
                <div 
                  className="bg-gray-400 h-full transition-all" 
                  style={{ width: `${dashboard.total > 0 ? (dashboard.draft / dashboard.total) * 100 : 0}%` }}
                />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Published ({dashboard.published})</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Pending Review ({dashboard.pending})</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Draft ({dashboard.draft})</div>
              </div>
            </div>
          </div>

          {/* Expanded 14 KPIs Grid */}
          {showAllKPIs && (
            <div className="grid grid-cols-6 gap-4 mt-6 pt-6 border-t border-[var(--border-default)] animate-fadeIn">
              {[
                { label: 'Total Activities', val: dashboard.total, sub: 'Total registered' },
                { label: 'Published Registry', val: dashboard.published, sub: 'Active & certified' },
                { label: 'Draft Mode', val: dashboard.draft, sub: 'In modification' },
                { label: 'Pending Review', val: dashboard.pending, sub: 'Needs approvals' },
                { label: 'High Risk Activities', val: dashboard.high_risk, sub: 'Risk score 61-80', warning: dashboard.high_risk > 0 },
                { label: 'Critical Risk', val: dashboard.critical, sub: 'Risk score 81-100', critical: dashboard.critical > 0 },
                { label: 'Without Linked DPIA', val: dashboard.without_dpia, sub: 'DPIA audit gap', warning: dashboard.without_dpia > 0 },
                { label: 'Without Owners', val: dashboard.without_owner, sub: 'Governance missing', warning: dashboard.without_owner > 0 },
                { label: 'No Retention Policy', val: dashboard.without_retention, sub: 'DPDPA Section 8(5)', warning: dashboard.without_retention > 0 },
                { label: 'No Lawful Basis', val: dashboard.without_purpose, sub: 'Illegal processing', critical: dashboard.without_purpose > 0 },
                { label: 'Without Vendor Contract', val: dashboard.without_vendor, sub: 'Processor risk', warning: dashboard.without_vendor > 0 },
                { label: 'Cross-border Transfers', val: dashboard.cross_border, sub: 'Adequacy checked' },
                { label: 'AI Discovered Queue', val: dashboard.ai_discovered, sub: 'Auto suggestions', highlight: dashboard.ai_discovered > 0 },
                { label: 'DPDPA Health Score', val: `${dashboard.compliance_percentage}%`, sub: 'Score calculation' },
                ...(dashboard.banking_enabled ? [
                  { label: 'Missing Channel', val: dashboard.without_channel ?? 0, sub: 'Banking context gap', warning: (dashboard.without_channel ?? 0) > 0 },
                  { label: 'Missing Data Source', val: dashboard.without_data_source ?? 0, sub: 'Inventory not linked', warning: (dashboard.without_data_source ?? 0) > 0 },
                  { label: 'Missing Retention FK', val: dashboard.without_retention_link ?? 0, sub: 'Req 6 policy link', warning: (dashboard.without_retention_link ?? 0) > 0 },
                ] : []),
              ].map((kpi, idx) => (
                <div 
                  key={idx} 
                  className={`p-3 rounded-lg border bg-[var(--surface-raised)] border-[var(--border-default)] transition-all hover:scale-105 ${
                    kpi.critical ? 'border-red-500/50 bg-red-500/5' : kpi.warning ? 'border-yellow-500/50 bg-yellow-500/5' : kpi.highlight ? 'border-purple-500/50 bg-purple-500/5' : ''
                  }`}
                >
                  <div className={`text-xl font-bold font-mono ${kpi.critical ? 'text-red-500' : kpi.warning ? 'text-yellow-600' : kpi.highlight ? 'text-purple-600' : 'text-[var(--text-primary)]'}`}>
                    {kpi.val}
                  </div>
                  <div className="text-xs font-semibold text-[var(--text-primary)] mt-1">{kpi.label}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{kpi.sub}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Advanced Filter and Search Bar */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4 mb-6 shadow-sm">
        <div className="flex gap-4 items-center">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search processing activities by title, reference, or description..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full pl-3 pr-10 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-md flex items-center gap-2 text-sm font-semibold cursor-pointer transition-all ${
              showFilters ? 'bg-[var(--surface-raised)] border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-[var(--border-default)] hover:bg-[var(--surface-raised)]'
            }`}
          >
            <Filter className="size-4" />
            Enterprise Filters
          </button>
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            Reset
          </button>
        </div>

        {/* Collapsible Advanced Filters */}
        {showFilters && (
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-[var(--border-default)]">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Org Department</label>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Assigned DPO/Owner</label>
              <select
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md"
              >
                <option value="">All Users</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Workflow Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="published">Published</option>
                <option value="deprecated">Deprecated</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Risk Score Level</label>
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md"
              >
                <option value="">All Levels</option>
                <option value="low">Low (0-30)</option>
                <option value="medium">Medium (31-60)</option>
                <option value="high">High (61-80)</option>
                <option value="critical">Critical (81-100)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Transfer Country</label>
              <input
                type="text"
                placeholder="e.g. Singapore, USA"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Linked Purpose</label>
              <select
                value={filterPurpose}
                onChange={(e) => setFilterPurpose(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md"
              >
                <option value="">All Purposes</option>
                {purposes.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Linked Vendor</label>
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md"
              >
                <option value="">All Vendors</option>
                {dataProcessors.map(dp => (
                  <option key={dp.id} value={dp.id}>{dp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Lawful Basis</label>
              <select
                value={filterLawfulBasis}
                onChange={(e) => setFilterLawfulBasis(e.target.value)}
                className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded-md"
              >
                <option value="">All Bases</option>
                <option value="consent">Consent (Section 6)</option>
                <option value="contract">Contract (Section 6)</option>
                <option value="legal-obligation">Legal Obligation (Section 6)</option>
                <option value="legitimate-interest">Legitimate Interest (Section 6)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* View Mode Toggle */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-2 transition-all ${
              viewMode === 'table' ? 'bg-[var(--brand-primary)] text-white font-semibold' : 'border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer'
            }`}
          >
            <Table className="size-4" />
            Table View
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-2 transition-all ${
              viewMode === 'card' ? 'bg-[var(--brand-primary)] text-white font-semibold' : 'border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer'
            }`}
          >
            <GridIcon className="size-4" />
            Card View
          </button>
          <button
            onClick={() => setViewMode('diagram')}
            className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-2 transition-all ${
              viewMode === 'diagram' ? 'bg-[var(--brand-primary)] text-white font-semibold' : 'border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer'
            }`}
          >
            <Share2 className="size-4" />
            Data Flow Map
          </button>
        </div>
        <div className="text-xs text-[var(--text-secondary)] font-mono font-semibold">
          {activities.length} Records Found
        </div>
      </div>

      {/* Render Main Panel content depending on ViewMode */}
      {loading ? (
        <div className="py-20 text-center text-[var(--text-secondary)] bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] shadow-sm">
          Loading Record of Processing Activities...
        </div>
      ) : activities.length === 0 ? (
        <div className="py-20 text-center text-[var(--text-secondary)] bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] shadow-sm flex flex-col items-center justify-center gap-3">
          <HelpCircle className="size-10 text-[var(--text-tertiary)]" />
          <div>No processing activities found matching the filters.</div>
          <button 
            onClick={handleClearFilters}
            className="px-4 py-2 text-xs border border-[var(--border-default)] rounded hover:bg-[var(--surface-raised)] font-semibold cursor-pointer"
          >
            Clear Search filters
          </button>
        </div>
      ) : (
        <>
          {viewMode === 'table' && (
            <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg border border-[var(--border-default)] mb-6 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)] text-left">
                      <th className="py-3 px-4 text-xs font-bold text-[var(--text-secondary)] uppercase">Ref Code</th>
                      <th className="py-3 px-4 text-xs font-bold text-[var(--text-secondary)] uppercase">Activity Name</th>
                      <th className="py-3 px-4 text-xs font-bold text-[var(--text-secondary)] uppercase">Business Unit / Dept</th>
                      <th className="py-3 px-4 text-xs font-bold text-[var(--text-secondary)] uppercase">Risk Score</th>
                      <th className="py-3 px-4 text-xs font-bold text-[var(--text-secondary)] uppercase">Status</th>
                      <th className="py-3 px-4 text-xs font-bold text-[var(--text-secondary)] uppercase">Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activitiesPageItems.map((activity) => (
                      <tr
                        key={activity.id}
                        onClick={() => setSelectedActivityId(activity.id)}
                        className="border-b border-[var(--border-default)] last:border-0 hover:bg-black/5 cursor-pointer transition-all"
                      >
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-[var(--text-primary)]">
                          {activity.activity_ref}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-sm">{activity.title}</div>
                          {activity.description && (
                            <div className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-0.5">{activity.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                          <div>{activity.business_unit_name || 'Technology'}</div>
                          {activity.department_name && (
                            <div className="text-xs font-semibold">{activity.department_name}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                              activity.risk_level === 'critical' ? 'bg-red-500/20 text-red-600' :
                              activity.risk_level === 'high' ? 'bg-orange-500/20 text-orange-600' :
                              activity.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-600' :
                              'bg-green-500/20 text-green-600'
                            }`}>
                              {activity.risk_level.toUpperCase()}
                            </span>
                            <span className="font-semibold font-mono">({activity.risk_score})</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusPill status={activity.status as any} label={activity.status.replace('_', ' ').toUpperCase()} />
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-secondary)] font-mono">
                          {formatDate(activity.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePager
                page={activitiesPage}
                pageCount={activitiesPageCount}
                total={activitiesTotal}
                pageSize={activitiesPageSize}
                onPage={setActivitiesPage}
              />
            </div>
          )}

          {viewMode === 'card' && (
            <div className="grid grid-cols-3 gap-6 mb-6">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  onClick={() => setSelectedActivityId(activity.id)}
                  className="bg-[var(--surface-card)] border border-[var(--border-default)] hover:border-[var(--brand-primary)] hover:shadow-md cursor-pointer rounded-lg p-5 flex flex-col justify-between transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">
                        {activity.activity_ref}
                      </span>
                      <StatusPill status={activity.status as any} label={activity.status.toUpperCase()} />
                    </div>
                    <h4 className="font-bold text-base mb-2 text-[var(--text-primary)] line-clamp-1">{activity.title}</h4>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 h-8 mb-4">
                      {activity.description || 'No description provided.'}
                    </p>
                  </div>
                  <div className="border-t border-[var(--border-default)] pt-3 flex items-center justify-between">
                    <div className="text-xs text-[var(--text-secondary)]">
                      {activity.business_unit_name || 'Tech'} {activity.department_name ? `→ ${activity.department_name}` : ''}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">Risk:</span>
                      <span className="text-xs font-bold font-mono text-[var(--brand-primary)]">
                        {activity.risk_score}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'diagram' && (
            <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg p-6 mb-6 shadow-sm">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Share2 className="size-5 text-[var(--brand-primary)]" />
                Data Flow Diagram
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-6">
                Dynamic visualization representing the flow of processing activities from Business Units down to systems and recipients.
              </p>
              
              <div className="space-y-6">
                {activities.map(activity => (
                  <div key={activity.id} className="p-4 border border-[var(--border-default)] bg-[var(--surface-raised)] rounded-lg flex items-center gap-4 overflow-x-auto">
                    {/* Level 1: Business Unit */}
                    <div className="bg-[var(--surface-card)] border border-[var(--border-default)] px-3 py-2 rounded text-xs font-bold min-w-[150px] shrink-0 text-center shadow-sm">
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase">Business Unit</div>
                      <div className="truncate mt-0.5">{activity.business_unit_name || 'Technology'}</div>
                    </div>

                    <ArrowRight className="size-4 shrink-0 text-[var(--text-secondary)]" />

                    {/* Level 2: Activity */}
                    <div className="bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/40 px-3 py-2 rounded text-xs font-bold min-w-[200px] shrink-0 shadow-sm">
                      <div className="text-[10px] text-[var(--brand-primary)] uppercase font-mono">{activity.activity_ref}</div>
                      <div className="truncate text-[var(--text-primary)] mt-0.5">{activity.title}</div>
                    </div>

                    <ArrowRight className="size-4 shrink-0 text-[var(--text-secondary)]" />

                    {/* Level 3: Systems & Data sharing destinations */}
                    <div className="flex gap-2 shrink-0">
                      <div className="bg-purple-500/10 border border-purple-500/30 px-3 py-2 rounded text-xs font-semibold min-w-[120px]">
                        <div className="text-[9px] text-purple-600 uppercase font-bold">Storage</div>
                        <div className="truncate mt-0.5">RDS Cloud</div>
                      </div>
                      <div className="bg-orange-500/10 border border-orange-500/30 px-3 py-2 rounded text-xs font-semibold min-w-[120px]">
                        <div className="text-[9px] text-orange-600 uppercase font-bold">Recipient</div>
                        <div className="truncate mt-0.5">Third Party Vendor</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Auto-Discovery Suggestion Queue */}
      {suggestions.length > 0 && (
        <div className="mb-6 p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-purple-600" />
            <h3 className="font-medium text-purple-900 dark:text-purple-200">
              Vajra AI Auto-discovery suggestions ({suggestions.length} pending review)
            </h3>
          </div>
          <div className="space-y-4">
            {suggestions.map((sug: RopaDiscoverySuggestion) => (
              <div key={sug.id} className="flex justify-between items-start gap-4 py-3 border-b border-[var(--border-default)]/30 last:border-none">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-purple-500/20 text-purple-600 font-mono">
                      {sug.source_type}
                    </span>
                    <span className="font-semibold text-sm text-[var(--text-primary)]">
                      {sug.source_name}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {sug.description}
                  </div>
                  <div className="text-xs text-[var(--text-primary)] mt-1.5">
                    <strong>Suggested Draft:</strong> {sug.suggested_title} (processes {sug.suggested_data_categories.join(', ')})
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAcceptSuggestion(sug.id)}
                    className="px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded hover:bg-purple-700 cursor-pointer"
                  >
                    Accept suggestion
                  </button>
                  <button
                    onClick={() => handleDismissSuggestion(sug.id)}
                    className="px-3 py-1.5 text-xs font-semibold border border-purple-300 text-purple-700 hover:bg-purple-100 rounded cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Drawer (Overlay Modal) */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50 animate-fadeIn">
          <div className="bg-[var(--surface-card)] border-l border-[var(--border-default)] text-[var(--text-primary)] w-[650px] h-full flex flex-col shadow-2xl relative animate-slideLeft">
            
            {/* Header */}
            <div className="p-6 border-b border-[var(--border-default)] flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">{selectedActivity.activity_ref}</span>
                  <StatusPill status={selectedActivity.status as any} label={selectedActivity.status.toUpperCase()} />
                </div>
                <h2 className="font-bold text-xl mt-1 text-[var(--text-primary)]">{selectedActivity.title}</h2>
              </div>
              <button
                onClick={() => setSelectedActivityId(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Tab Links */}
            <div className="bg-[var(--surface-raised)] border-b border-[var(--border-default)] px-4 flex gap-1 overflow-x-auto shrink-0 scrollbar-none">
              {([
                { id: 'overview', label: 'Overview' },
                { id: 'data', label: 'Data Categories' },
                { id: 'lawful', label: 'Lawful Basis' },
                { id: 'recipients', label: 'Vendors & Systems' },
                { id: 'retention', label: 'Retention' },
                { id: 'security', label: 'Security' },
                { id: 'dpia', label: 'DPIA Link' },
                { id: 'versions', label: 'Versions & Diff' },
                { id: 'audit', label: 'Events Audit' }
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                    detailTab === tab.id
                      ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Drawer Scroll */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Tab 1: Overview */}
              {detailTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase">Business Unit</span>
                      <span className="text-sm font-bold">{selectedActivity.business_unit_name || 'Technology'}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase">Department</span>
                      <span className="text-sm font-bold">{selectedActivity.department_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase">Team Scope</span>
                      <span className="text-sm font-bold">{selectedActivity.team_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase">Version Code</span>
                      <span className="text-sm font-bold font-mono">v{selectedActivity.versions?.[0]?.version_number || 1}</span>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border-default)] pt-4">
                    <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Risk Score Indicators</span>
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold font-mono text-[var(--brand-primary)]">{selectedActivity.risk_score} / 100</div>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        selectedActivity.risk_level === 'critical' ? 'bg-red-500/20 text-red-600' :
                        selectedActivity.risk_level === 'high' ? 'bg-orange-500/20 text-orange-600' :
                        selectedActivity.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-600' :
                        'bg-green-500/20 text-green-600'
                      }`}>
                        {selectedActivity.risk_level} Risk Level
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border-default)] pt-4">
                    <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Description</span>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {selectedActivity.description || 'No description provided for this processing activity.'}
                    </p>
                  </div>

                  {bankingEnabled && selectedActivity.banking_context && (
                    <div className="border-t border-[var(--border-default)] pt-4">
                      <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Banking Context</span>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[var(--text-tertiary)]">Channels: </span>
                          <span className="font-semibold">{(selectedActivity.banking_context.channels || []).join(', ') || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">Primary ID: </span>
                          <span className="font-semibold">{selectedActivity.banking_context.primary_identifier || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">Identifiers: </span>
                          <span className="font-semibold">{(selectedActivity.banking_context.identifier_types || []).join(', ') || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-tertiary)]">Journeys: </span>
                          <span className="font-semibold">{(selectedActivity.banking_context.consent_journey_keys || []).join(', ') || '—'}</span>
                        </div>
                      </div>
                      {(selectedActivity.linked_consent_notices?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <span className="text-[var(--text-tertiary)] text-xs">Linked consent notices: </span>
                          {selectedActivity.linked_consent_notices?.map(n => (
                            <span key={n.version_id} className="inline-block mr-2 text-xs font-semibold text-[var(--brand-primary)]">
                              {n.notice_name} ({n.version_status})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-[var(--border-default)] pt-4">
                    <span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Assigned Owners</span>
                    {selectedActivity.owners.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic">No assigned owners.</div>
                    ) : (
                      <div className="space-y-2">
                        {selectedActivity.owners.map(o => (
                          <div key={o.id} className="text-sm flex justify-between bg-[var(--surface-raised)] p-2 rounded">
                            <span>{o.user_name || o.user_email || 'System user'}</span>
                            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">{o.owner_role.replace('_', ' ')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Data categories */}
              {detailTab === 'data' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Processed Data Categories</h3>
                    {selectedActivity.data_categories.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic">No categories specified.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedActivity.data_categories.map(c => (
                          <span 
                            key={c.id} 
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${
                              c.is_special ? 'bg-purple-500/10 text-purple-600 border-purple-500/30' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-default)]'
                            }`}
                          >
                            {c.category_name}
                            {c.is_special && <span className="text-[9px] px-1 rounded bg-purple-500 text-white font-mono font-bold">SPECIAL</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--border-default)] pt-4">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Data Principals (Data Subjects)</h3>
                    {selectedActivity.data_principals.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic">No principals mapping configured.</div>
                    ) : (
                      <div className="space-y-2">
                        {selectedActivity.data_principals.map(p => (
                          <div key={p.id} className="p-3 bg-[var(--surface-raised)] rounded border border-[var(--border-default)]">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-sm">{p.category_name}</span>
                              {p.includes_children && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-500">INCLUDES CHILDREN</span>
                              )}
                            </div>
                            {p.description && <p className="text-xs text-[var(--text-secondary)] mt-1">{p.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Lawful basis */}
              {detailTab === 'lawful' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Lawful Bases of Processing</h3>
                  {selectedActivity.lawful_bases.length === 0 ? (
                    <div className="p-4 bg-red-500/10 text-red-500 text-sm rounded border border-red-500/20 font-semibold flex items-center gap-2">
                      <AlertTriangle className="size-4" />
                      Warning: No lawful basis defined for this processing activity.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedActivity.lawful_bases.map(l => (
                        <div key={l.id} className="p-3 bg-[var(--surface-raised)] rounded border border-[var(--border-default)]">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-sm text-[var(--brand-primary)] uppercase">{l.basis_type}</span>
                            <span className="text-xs font-mono font-semibold">{l.dpdpa_section || 'Section 6'}</span>
                          </div>
                          {l.justification && (
                            <div className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                              <strong>Justification:</strong> {l.justification}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Recipients & Systems */}
              {detailTab === 'recipients' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Associated Infrastructure Systems</h3>
                    {selectedActivity.systems.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic">No systems declared.</div>
                    ) : (
                      <div className="space-y-2">
                        {selectedActivity.systems.map(s => (
                          <div key={s.id} className="p-3 bg-[var(--surface-raised)] rounded border border-[var(--border-default)] flex justify-between">
                            <div>
                              <div className="font-semibold text-sm">{s.system_name}</div>
                              {s.location && <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Location: {s.location}</div>}
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-[var(--surface-base)] border border-[var(--border-default)] h-max uppercase font-bold text-[var(--text-secondary)]">{s.system_type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--border-default)] pt-4">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Data Recipients & Processors</h3>
                    {selectedActivity.recipients.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic">No external sharing configured.</div>
                    ) : (
                      <div className="space-y-3">
                        {selectedActivity.recipients.map(r => {
                          const isUnlinked = r.recipient_type === 'vendor' && !r.data_processor_id;
                          return (
                            <div key={r.id} className={`p-3 rounded border ${isUnlinked ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-[var(--border-default)] bg-[var(--surface-raised)]'}`}>
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-semibold text-sm flex items-center gap-1.5">
                                    {r.name}
                                    {isUnlinked && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-yellow-500/20 text-yellow-600 px-1 rounded">
                                        <AlertTriangle className="size-2.5" /> UNLINKED VENDOR
                                      </span>
                                    )}
                                  </div>
                                  {r.data_shared && <div className="text-xs text-[var(--text-secondary)] mt-1">Shared data: {r.data_shared}</div>}
                                </div>
                                <span className="text-[10px] px-2 py-0.5 bg-[var(--surface-base)] border rounded uppercase font-bold text-[var(--text-secondary)]">{r.recipient_type}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 5: Retention */}
              {detailTab === 'retention' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Retention & Disposal Policies</h3>
                  {selectedActivity.retention_policies.length === 0 ? (
                    <div className="text-xs text-[var(--text-tertiary)] italic">No retention policies configured.</div>
                  ) : (
                    <div className="space-y-3">
                      {selectedActivity.retention_policies.map(rp => (
                        <div key={rp.id} className="p-3 bg-[var(--surface-raised)] rounded border border-[var(--border-default)]">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sm text-[var(--brand-primary)]">Retention: {rp.retention_period}</span>
                            {rp.auto_delete && (
                              <span className="text-[10px] bg-green-500/20 text-green-500 font-bold px-2 py-0.5 rounded">AUTO DELETE ENABLED</span>
                            )}
                          </div>
                          {rp.trigger_event && <div className="text-xs text-[var(--text-secondary)] mt-1"><strong>Trigger Event:</strong> {rp.trigger_event}</div>}
                          {rp.legal_basis && <div className="text-xs text-[var(--text-secondary)] mt-0.5"><strong>Justification / Law:</strong> {rp.legal_basis}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 6: Security */}
              {detailTab === 'security' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Technical Security Safeguards</h3>
                  {selectedActivity.security_measures.length === 0 ? (
                    <div className="text-xs text-[var(--text-tertiary)] italic">No safeguards declared.</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedActivity.security_measures.map(sm => (
                        <div key={sm.id} className="p-3 bg-[var(--surface-raised)] rounded border border-[var(--border-default)] flex justify-between items-center">
                          <div>
                            <span className="font-semibold text-sm capitalize">{sm.measure_type.replace('_', ' ')}</span>
                            {sm.description && <p className="text-xs text-[var(--text-secondary)] mt-1">{sm.description}</p>}
                          </div>
                          <span className="text-[10px] font-bold bg-green-500/20 text-green-500 px-2 py-0.5 rounded">{sm.status.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 7: DPIA Link */}
              {detailTab === 'dpia' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Linked Data Protection Impact Assessments (DPIA)</h3>
                    {selectedActivity.dpia_links.length === 0 && (
                      <button
                        type="button"
                        onClick={() => void handleCreateDpiaFromActivity()}
                        className="text-xs px-3 py-1.5 rounded bg-[var(--brand-primary)] text-white font-semibold hover:opacity-90"
                      >
                        Create DPIA from Activity
                      </button>
                    )}
                  </div>
                  {selectedActivity.dpia_links.length === 0 ? (
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-600 text-sm font-semibold space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4" />
                        No DPIA linkage exists for this activity.
                      </div>
                      <p className="text-xs font-normal">
                        Processing sensitive or children categories under DPDPA requires a mandatory DPIA link. Failing to conduct a DPIA lowers compliance health.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedActivity.dpia_links.map(link => (
                        <div key={link.id} className="p-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded flex justify-between items-center shadow-sm">
                          <div>
                            <div className="font-bold text-sm text-[var(--brand-primary)]">{link.dpia_title || 'Linked DPIA Report'}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-0.5">Link Type: <span className="font-semibold">{link.link_type}</span></div>
                          </div>
                          <span className="text-xs bg-blue-500/20 text-blue-500 font-bold px-2.5 py-1 rounded">
                            {link.dpia_status?.toUpperCase() || 'APPROVED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 8: Versions & compare */}
              {detailTab === 'versions' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase mb-2">Activity Registry Versions</h3>
                    <div className="space-y-3">
                      {selectedActivity.versions.map(v => (
                        <div key={v.id} className="p-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded flex items-center justify-between shadow-sm">
                          <div>
                            <div className="font-bold text-sm">Version {v.version_number} <span className="text-xs font-semibold px-2 py-0.5 bg-[var(--surface-base)] border rounded text-[var(--text-secondary)]">{v.status}</span></div>
                            {v.changelog && <div className="text-xs text-[var(--text-secondary)] mt-1">Changelog: {v.changelog}</div>}
                            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Approved: {formatDate(v.approved_at)}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRollback(v.id)}
                              className="p-1 text-[var(--brand-primary)] hover:bg-black/5 rounded cursor-pointer"
                              title="Rollback state to this version snapshot"
                            >
                              <RotateCcw className="size-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[var(--border-default)] pt-4 space-y-4">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase flex items-center gap-1.5">
                      <GitCompare className="size-4" /> Compare Snapshots
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Version A</label>
                        <select
                          value={versionAId}
                          onChange={(e) => setVersionAId(e.target.value)}
                          className="w-full text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] p-1.5 rounded"
                        >
                          <option value="">Select version...</option>
                          {selectedActivity.versions.map(v => (
                            <option key={v.id} value={v.id}>Version {v.version_number} ({v.status})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Version B</label>
                        <select
                          value={versionBId}
                          onChange={(e) => setVersionBId(e.target.value)}
                          className="w-full text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] p-1.5 rounded"
                        >
                          <option value="">Select version...</option>
                          {selectedActivity.versions.map(v => (
                            <option key={v.id} value={v.id}>Version {v.version_number} ({v.status})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleCompareVersions}
                      disabled={diffLoading || !versionAId || !versionBId}
                      className="w-full py-2 bg-[var(--surface-raised)] border border-[var(--border-default)] hover:bg-black/5 rounded font-semibold text-xs cursor-pointer transition-all disabled:opacity-50"
                    >
                      {diffLoading ? 'Loading diff...' : 'Generate Version Comparison'}
                    </button>

                    {versionDiff && (
                      <div className="p-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded text-xs font-mono max-h-60 overflow-y-auto">
                        <div className="font-bold text-[10px] text-[var(--text-secondary)] mb-2 uppercase">Changes Difference Object</div>
                        <pre className="whitespace-pre-wrap">{JSON.stringify(versionDiff.diff_data, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 9: Events Audit */}
              {detailTab === 'audit' && (
                <div className="space-y-4 animate-fadeIn">
                  <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase flex items-center gap-1.5">
                    <History className="size-4" /> Immutable Event Audit Chain
                  </h3>
                  
                  <div className="space-y-3 relative before:absolute before:top-2 before:bottom-2 before:left-[17px] before:w-0.5 before:bg-[var(--border-default)]">
                    {(selectedActivity as any).events?.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic pl-8">No audit events logged.</div>
                    ) : (
                      (selectedActivity as any).events?.map((ev: any) => (
                        <div key={ev.id} className="relative pl-8 pb-3">
                          <div className="absolute left-[10px] top-1.5 size-4 rounded-full bg-[var(--brand-primary)] border-2 border-[var(--surface-card)]" />
                          <div className="p-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded shadow-sm text-xs">
                            <div className="flex justify-between items-center font-bold text-[var(--brand-primary)]">
                              <span>{ev.event_type.replace('_', ' ').toUpperCase()}</span>
                              <span className="font-mono text-[9px] text-[var(--text-tertiary)]">{formatDate(ev.created_at)}</span>
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Actor: <strong>{ev.actor_name || 'System'}</strong></div>
                            {ev.details && (
                              <div className="mt-1 font-mono text-[10px] text-[var(--text-secondary)] max-h-20 overflow-y-auto">
                                Details: {JSON.stringify(ev.details)}
                              </div>
                            )}
                            <div className="text-[9px] text-[var(--text-tertiary)] font-mono truncate mt-2 border-t border-[var(--border-default)] pt-1.5 select-all">
                              Hash Check: {ev.chain_hash}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Workflow Approvals / Lifecycle Actions Panel */}
            <div className="sticky bottom-0 bg-[var(--surface-card)] border-t border-[var(--border-default)] p-4 shrink-0">
              
              {/* Approval chain info */}
              {selectedActivity.status === 'pending_review' && (
                <div className="mb-4 bg-yellow-500/5 border border-yellow-500/20 rounded p-3 text-xs">
                  <div className="font-bold text-yellow-600 uppercase mb-1">Awaiting Review Pipeline Approvals</div>
                  <div className="space-y-1">
                    {selectedActivity.approvals.map(app => (
                      <div key={app.id} className="flex justify-between items-center py-1 border-b last:border-b-0 border-[var(--border-default)]">
                        <span>Role: <strong>{app.role_required.replace('_', ' ').toUpperCase()}</strong></span>
                        <div className="flex gap-2 items-center">
                          <span className={`font-bold uppercase ${app.status === 'approved' ? 'text-green-500' : 'text-yellow-600'}`}>{app.status}</span>
                          {app.status === 'pending' && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleWorkflowDecision(app.id, 'approved')}
                                className="px-2 py-0.5 bg-green-500 text-white rounded text-[10px] cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleWorkflowDecision(app.id, 'rejected')}
                                className="px-2 py-0.5 bg-red-500 text-white rounded text-[10px] cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedActivity.approvals.some(a => a.status === 'pending') && (
                    <div className="mt-3">
                      <input
                        type="text"
                        placeholder="Add review feedback comments here..."
                        value={approvalComments}
                        onChange={(e) => setApprovalComments(e.target.value)}
                        className="w-full text-xs p-1.5 border bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] rounded focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Standard buttons */}
              <div className="flex gap-3">
                {selectedActivity.status === 'draft' && (
                  <>
                    <button
                      onClick={() => handleWorkflowSubmit(selectedActivity.id)}
                      className="flex-1 py-2 bg-[var(--brand-primary)] text-white text-sm font-semibold rounded hover:opacity-95 cursor-pointer"
                    >
                      Submit for Review
                    </button>
                    <button
                      onClick={handleOpenEdit}
                      className="px-4 py-2 border border-[var(--border-default)] hover:bg-black/5 text-sm font-semibold rounded cursor-pointer"
                    >
                      Edit Registry
                    </button>
                    <button
                      onClick={() => handleDeleteActivity(selectedActivity.id)}
                      className="px-3 py-2 border border-red-500/30 text-red-500 hover:bg-red-500/10 rounded cursor-pointer"
                      title="Delete draft activity"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}

                {selectedActivity.status === 'approved' && (
                  <button
                    onClick={() => handleWorkflowPublish(selectedActivity.id)}
                    className="w-full py-2 bg-green-600 text-white text-sm font-semibold rounded hover:opacity-95 cursor-pointer"
                  >
                    Publish to active register
                  </button>
                )}

                {selectedActivity.status === 'published' && (
                  <>
                    <button
                      onClick={() => {
                        setCheckoutChangelog('');
                        setShowCheckoutModal(true);
                      }}
                      className="flex-1 py-2 bg-[var(--brand-primary)] text-white text-sm font-semibold rounded hover:opacity-95 cursor-pointer"
                    >
                      Edit (Checkout New Version)
                    </button>
                    <button
                      onClick={() => handleWorkflowDeprecate(selectedActivity.id)}
                      className="px-3 py-2 border border-[var(--border-default)] hover:bg-black/5 text-xs font-semibold rounded cursor-pointer"
                    >
                      Deprecate
                    </button>
                    <button
                      onClick={() => handleWorkflowArchive(selectedActivity.id)}
                      className="px-3 py-2 border border-[var(--border-default)] hover:bg-black/5 text-xs font-semibold rounded cursor-pointer"
                    >
                      Archive
                    </button>
                  </>
                )}

                {(selectedActivity.status === 'deprecated' || selectedActivity.status === 'archived') && (
                  <button
                    onClick={() => handleWorkflowRestore(selectedActivity.id)}
                    className="w-full py-2 bg-[var(--brand-primary)] text-white text-sm font-semibold rounded hover:opacity-95 cursor-pointer"
                  >
                    Restore to Draft
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Version Snapshot Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] animate-fadeIn">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg p-6 max-w-md w-full shadow-2xl animate-scaleIn text-[var(--text-primary)]">
            <h3 className="font-bold text-lg mb-2">Checkout Modification Version</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Enter a changelog message to explain the revisions that require checking out a new version.
            </p>
            <input
              type="text"
              placeholder="e.g. Updating data categories and linked processors for 2026 audit."
              value={checkoutChangelog}
              onChange={(e) => setCheckoutChangelog(e.target.value)}
              className="w-full p-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none mb-4 text-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={handleCheckoutVersion}
                className="flex-1 py-2 bg-[var(--brand-primary)] text-white font-semibold text-sm rounded hover:opacity-90 cursor-pointer"
              >
                Checkout Version
              </button>
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2 border border-[var(--border-default)] hover:bg-black/5 text-sm rounded font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New / Edit Activity Form Modal */}
      {showNewActivityModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-[var(--surface-card)] border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between z-10 text-[var(--text-primary)]">
              <h2 className="font-bold text-lg">{isEditing ? 'Modify Processing Activity' : 'New Processing Activity'}</h2>
              <button
                onClick={() => setShowNewActivityModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Tabs navigation */}
            <div className="bg-[var(--surface-raised)] border-b border-[var(--border-default)] px-6 flex gap-4">
              {[
                { id: 'general', label: 'General Metadata' },
                { id: 'data', label: 'Data & Lawful Basis' },
                ...(bankingEnabled ? [{ id: 'banking', label: 'Banking Context' }] : []),
                { id: 'infrastructure', label: 'Infrastructure & Recipients' },
                { id: 'retention', label: 'Retention & Security' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setNewActivityTab(tab.id as any)}
                  className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    newActivityTab === tab.id
                      ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6">
              
              {/* Form Tab 1: General */}
              {newActivityTab === 'general' && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Activity Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Employee Payroll Processing"
                      value={activityForm.title}
                      onChange={(e) => setActivityForm(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Description</label>
                    <textarea
                      placeholder="Describe the overall scope, reason, and context of this processing activity..."
                      value={activityForm.description}
                      onChange={(e) => setActivityForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] h-24"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Business Unit *</label>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openOrgHierarchy(false)}
                          className="text-xs text-[var(--brand-primary)] hover:underline font-semibold"
                        >
                          + Add BU
                        </button>
                      )}
                    </div>
                    <select
                      value={activityForm.business_unit_id}
                      onChange={(e) => {
                        const buId = e.target.value;
                        setActivityForm((prev) => ({
                          ...prev,
                          business_unit_id: buId,
                          department_id:
                            prev.department_id &&
                            departments.some((d) => d.id === prev.department_id && d.business_unit_id === buId)
                              ? prev.department_id
                              : '',
                        }));
                      }}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded px-3 py-2 text-sm"
                    >
                      <option value="">Select BU...</option>
                      {businessUnits.map(bu => (
                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                      ))}
                    </select>
                    {businessUnits.length === 0 && canEdit && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        No business units yet.{' '}
                        <button type="button" onClick={() => openOrgHierarchy(false)} className="text-[var(--brand-primary)] hover:underline">
                          Create one
                        </button>
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Department</label>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openOrgHierarchy(true)}
                          className="text-xs text-[var(--brand-primary)] hover:underline font-semibold"
                        >
                          + Add Department
                        </button>
                      )}
                    </div>
                    <select
                      value={activityForm.department_id}
                      onChange={(e) => setActivityForm(prev => ({ ...prev, department_id: e.target.value }))}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded px-3 py-2 text-sm"
                    >
                      <option value="">Select Department...</option>
                      {(activityForm.business_unit_id
                        ? departments.filter((d) => d.business_unit_id === activityForm.business_unit_id)
                        : departments
                      ).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Team Scope</label>
                    <select
                      value={activityForm.team_id}
                      onChange={(e) => setActivityForm(prev => ({ ...prev, team_id: e.target.value }))}
                      className="w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded px-3 py-2 text-sm"
                    >
                      <option value="">Select Team...</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Registry Owners</label>
                      <button 
                        type="button" 
                        onClick={handleAddOwner} 
                        className="text-xs text-[var(--brand-primary)] font-semibold hover:underline"
                      >
                        + Add Owner
                      </button>
                    </div>
                    {activityForm.owners.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic bg-[var(--surface-raised)] p-3 rounded text-center border">
                        No owners assigned. Click Add Owner to configure.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activityForm.owners.map((owner, idx) => (
                          <div key={idx} className="flex gap-4 items-center">
                            <select
                              value={owner.user_id}
                              onChange={(e) => {
                                const newOwners = [...activityForm.owners];
                                newOwners[idx].user_id = e.target.value;
                                setActivityForm(prev => ({ ...prev, owners: newOwners }));
                              }}
                              className="flex-1 text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded"
                            >
                              {users.map(u => (
                                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                              ))}
                            </select>
                            <select
                              value={owner.owner_role}
                              onChange={(e) => {
                                const newOwners = [...activityForm.owners];
                                newOwners[idx].owner_role = e.target.value;
                                setActivityForm(prev => ({ ...prev, owners: newOwners }));
                              }}
                              className="text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] p-1.5 rounded"
                            >
                              <option value="business_owner">Business Owner</option>
                              <option value="technical_owner">Technical Owner</option>
                              <option value="dpo">DPO Officer</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleRemoveOwner(idx)}
                              className="text-red-500 hover:bg-black/5 p-1 rounded"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Form Tab 2: Data & Lawful */}
              {newActivityTab === 'data' && (
                <div className="space-y-6">
                  
                  {/* Data categories */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Data Categories Collected</label>
                      <button 
                        type="button" 
                        onClick={handleAddCategory} 
                        className="text-xs text-[var(--brand-primary)] font-semibold hover:underline"
                      >
                        + Add Category
                      </button>
                    </div>
                    {activityForm.data_categories.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic bg-[var(--surface-raised)] p-3 rounded text-center border">
                        No categories defined. Click Add Category to define.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activityForm.data_categories.map((cat, idx) => (
                          <div key={idx} className="flex gap-4 items-center bg-[var(--surface-raised)] p-3 rounded border">
                            <input
                              type="text"
                              placeholder="e.g. Health status, IP Address, Banking Info"
                              value={cat.category_name}
                              onChange={(e) => {
                                const newCats = [...activityForm.data_categories];
                                newCats[idx].category_name = e.target.value;
                                setActivityForm(prev => ({ ...prev, data_categories: newCats }));
                              }}
                              className="flex-1 text-sm border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                            />
                            <select
                              value={cat.sensitivity}
                              onChange={(e) => {
                                const newCats = [...activityForm.data_categories];
                                newCats[idx].sensitivity = e.target.value;
                                setActivityForm(prev => ({ ...prev, data_categories: newCats }));
                              }}
                              className="text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] p-1.5 rounded"
                            >
                              <option value="standard">Standard</option>
                              <option value="sensitive">Sensitive</option>
                              <option value="highly_sensitive">Highly Sensitive</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={cat.is_special}
                                onChange={(e) => {
                                  const newCats = [...activityForm.data_categories];
                                  newCats[idx].is_special = e.target.checked;
                                  setActivityForm(prev => ({ ...prev, data_categories: newCats }));
                                }}
                                className="rounded"
                              />
                              Special/Sensitive?
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveCategory(idx)}
                              className="text-red-500 hover:bg-black/5 p-1 rounded"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lawful bases */}
                  <div className="border-t border-[var(--border-default)] pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Lawful Basis of processing</label>
                      <button 
                        type="button" 
                        onClick={handleAddLawfulBasis} 
                        className="text-xs text-[var(--brand-primary)] font-semibold hover:underline"
                      >
                        + Add Lawful Basis
                      </button>
                    </div>
                    {activityForm.lawful_bases.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic bg-[var(--surface-raised)] p-3 rounded text-center border">
                        No lawful bases defined.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activityForm.lawful_bases.map((basis, idx) => (
                          <div key={idx} className="bg-[var(--surface-raised)] p-3 rounded border space-y-3">
                            <div className="flex justify-between gap-4 items-center">
                              <select
                                value={basis.basis_type}
                                onChange={(e) => {
                                  const newBases = [...activityForm.lawful_bases];
                                  newBases[idx].basis_type = e.target.value;
                                  setActivityForm(prev => ({ ...prev, lawful_bases: newBases }));
                                }}
                                className="text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] p-1.5 rounded flex-1"
                              >
                                <option value="consent">Consent (Section 6)</option>
                                <option value="contract">Contract Performance (Section 6)</option>
                                <option value="legal-obligation">Legal Obligation (Section 6)</option>
                                <option value="legitimate-interest">Legitimate Interest (Section 6)</option>
                              </select>
                              <input
                                type="text"
                                placeholder="Dpdpa Section/Clause (e.g. Chapter II, Section 6(1))"
                                value={basis.dpdpa_section}
                                onChange={(e) => {
                                  const newBases = [...activityForm.lawful_bases];
                                  newBases[idx].dpdpa_section = e.target.value;
                                  setActivityForm(prev => ({ ...prev, lawful_bases: newBases }));
                                }}
                                className="text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1.5 rounded focus:outline-none flex-1"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveLawfulBasis(idx)}
                                className="text-red-500 hover:bg-black/5 p-1 rounded"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                            <input
                              type="text"
                              placeholder="Justification logic context..."
                              value={basis.justification}
                              onChange={(e) => {
                                const newBases = [...activityForm.lawful_bases];
                                newBases[idx].justification = e.target.value;
                                setActivityForm(prev => ({ ...prev, lawful_bases: newBases }));
                              }}
                              className="w-full text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1.5 rounded focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {bankingEnabled && newActivityTab === 'banking' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Apply Preset</label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(bankingPresets?.presets || {}).map(([key, preset]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyBankingPreset(key)}
                          className="text-xs px-3 py-1.5 rounded border border-[var(--border-default)] hover:border-[var(--brand-primary)]"
                        >
                          {preset.label || key.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Channels</label>
                    <div className="flex flex-wrap gap-2">
                      {(bankingPresets?.journeys || []).map(j => (
                        <label key={j.key} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={activityForm.banking_context.channels.includes(j.channel || j.key)}
                            onChange={() => toggleBankingList('channels', j.channel || j.key)}
                          />
                          {j.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Identifier Types</label>
                    <div className="flex flex-wrap gap-2">
                      {(bankingPresets?.identifier_types || []).filter(i => i.enabled !== false).map(ident => (
                        <label key={ident.key} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={activityForm.banking_context.identifier_types.includes(ident.key)}
                            onChange={() => toggleBankingList('identifier_types', ident.key)}
                          />
                          {ident.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Primary Identifier</label>
                      <select
                        value={activityForm.banking_context.primary_identifier || ''}
                        onChange={(e) => setActivityForm(prev => ({
                          ...prev,
                          banking_context: { ...prev.banking_context, primary_identifier: e.target.value },
                        }))}
                        className="w-full text-sm border border-[var(--border-default)] bg-[var(--surface-raised)] rounded px-2 py-1.5"
                      >
                        <option value="">Select...</option>
                        {activityForm.banking_context.identifier_types.map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Consent Journeys</label>
                      <div className="flex flex-wrap gap-2">
                        {(bankingPresets?.journeys || []).map(j => (
                          <label key={j.key} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={activityForm.banking_context.consent_journey_keys.includes(j.key)}
                              onChange={() => toggleBankingList('consent_journey_keys', j.key)}
                            />
                            {j.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Tab 3: Infrastructure */}
              {newActivityTab === 'infrastructure' && (
                <div className="space-y-6">
                  
                  {/* Systems */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Associated Systems (Databases/SaaS)</label>
                      <button 
                        type="button" 
                        onClick={handleAddSystem} 
                        className="text-xs text-[var(--brand-primary)] font-semibold hover:underline"
                      >
                        + Add System
                      </button>
                    </div>
                    {activityForm.systems.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic bg-[var(--surface-raised)] p-3 rounded text-center border">
                        No storage databases or SaaS systems configured.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activityForm.systems.map((sys, idx) => (
                          <div key={idx} className="bg-[var(--surface-raised)] p-3 rounded border space-y-2">
                            <div className="flex justify-between gap-4 items-center">
                              <input
                                type="text"
                                placeholder="System Name (e.g. AWS Postgres instance)"
                                value={sys.system_name}
                                onChange={(e) => {
                                  const newSys = [...activityForm.systems];
                                  newSys[idx].system_name = e.target.value;
                                  setActivityForm(prev => ({ ...prev, systems: newSys }));
                                }}
                                className="flex-1 text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                              <select
                                value={sys.system_type}
                                onChange={(e) => {
                                  const newSys = [...activityForm.systems];
                                  newSys[idx].system_type = e.target.value;
                                  setActivityForm(prev => ({ ...prev, systems: newSys }));
                                }}
                                className="text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] p-1 rounded"
                              >
                                <option value="database">Database</option>
                                <option value="saas">SaaS Integration</option>
                                <option value="on_premise">On Premise Server</option>
                                <option value="cloud_storage">Cloud Bucket</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveSystem(idx)}
                                className="text-red-500 hover:bg-black/5 p-1 rounded"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                            <div className="flex gap-4">
                              <input
                                type="text"
                                placeholder="Physical Location (e.g. India Region, US-East)"
                                value={sys.location}
                                onChange={(e) => {
                                  const newSys = [...activityForm.systems];
                                  newSys[idx].location = e.target.value;
                                  setActivityForm(prev => ({ ...prev, systems: newSys }));
                                }}
                                className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                              <input
                                type="text"
                                placeholder="Brief infrastructure details..."
                                value={sys.description}
                                onChange={(e) => {
                                  const newSys = [...activityForm.systems];
                                  newSys[idx].description = e.target.value;
                                  setActivityForm(prev => ({ ...prev, systems: newSys }));
                                }}
                                className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                            </div>
                            {bankingEnabled && (
                              <div className="flex gap-4">
                                <select
                                  value={sys.property_id || ''}
                                  onChange={(e) => {
                                    const newSys = [...activityForm.systems];
                                    const prop = integrationProperties.find(p => p.id === e.target.value);
                                    newSys[idx].property_id = e.target.value;
                                    if (prop) {
                                      newSys[idx].system_name = prop.display_name || prop.domain;
                                      newSys[idx].system_type = 'saas';
                                    }
                                    setActivityForm(prev => ({ ...prev, systems: newSys }));
                                  }}
                                  className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded"
                                >
                                  <option value="">Link integration property (optional)</option>
                                  {integrationProperties.map(p => (
                                    <option key={p.id} value={p.id}>{p.display_name || p.domain}</option>
                                  ))}
                                </select>
                                <select
                                  value={sys.channel || ''}
                                  onChange={(e) => {
                                    const newSys = [...activityForm.systems];
                                    newSys[idx].channel = e.target.value;
                                    setActivityForm(prev => ({ ...prev, systems: newSys }));
                                  }}
                                  className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded"
                                >
                                  <option value="">Channel (optional)</option>
                                  {(bankingPresets?.journeys || []).map(j => (
                                    <option key={j.key} value={j.channel || j.key}>{j.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {bankingEnabled && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Linked Data Sources</label>
                        <button type="button" onClick={handleAddDataSource} className="text-xs text-[var(--brand-primary)] font-semibold hover:underline">
                          + Add Data Source
                        </button>
                      </div>
                      {activityForm.data_sources.length === 0 ? (
                        <div className="text-xs text-[var(--text-tertiary)] italic bg-[var(--surface-raised)] p-3 rounded text-center border">
                          No data sources linked from inventory.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activityForm.data_sources.map((ds, idx) => (
                            <div key={idx} className="flex gap-2 items-center bg-[var(--surface-raised)] p-2 rounded border">
                              <select
                                value={ds.data_source_id}
                                onChange={(e) => {
                                  const next = [...activityForm.data_sources];
                                  next[idx].data_source_id = e.target.value;
                                  setActivityForm(prev => ({ ...prev, data_sources: next }));
                                }}
                                className="flex-1 text-xs border border-[var(--border-default)] bg-[var(--surface-base)] rounded px-2 py-1"
                              >
                                <option value="">Select data source...</option>
                                {registeredDataSources.map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                              <select
                                value={ds.role}
                                onChange={(e) => {
                                  const next = [...activityForm.data_sources];
                                  next[idx].role = e.target.value;
                                  setActivityForm(prev => ({ ...prev, data_sources: next }));
                                }}
                                className="text-xs border border-[var(--border-default)] bg-[var(--surface-base)] rounded px-2 py-1"
                              >
                                <option value="primary">Primary</option>
                                <option value="replica">Replica</option>
                                <option value="archive">Archive</option>
                              </select>
                              <button type="button" onClick={() => handleRemoveDataSource(idx)} className="text-red-500 p-1">
                                <X className="size-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recipients / Vendors */}
                  <div className="border-t border-[var(--border-default)] pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Data Recipients / Shared Vendors</label>
                      <button 
                        type="button" 
                        onClick={handleAddRecipient} 
                        className="text-xs text-[var(--brand-primary)] font-semibold hover:underline"
                      >
                        + Add Recipient
                      </button>
                    </div>
                    {activityForm.recipients.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic bg-[var(--surface-raised)] p-3 rounded text-center border">
                        No sharing configured.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activityForm.recipients.map((rec, idx) => (
                          <div key={idx} className="bg-[var(--surface-raised)] p-3 rounded border space-y-2">
                            <div className="flex justify-between gap-4 items-center">
                              <input
                                type="text"
                                placeholder="Recipient/Vendor Name (e.g. Stripe)"
                                value={rec.name}
                                onChange={(e) => {
                                  const newRecs = [...activityForm.recipients];
                                  newRecs[idx].name = e.target.value;
                                  setActivityForm(prev => ({ ...prev, recipients: newRecs }));
                                }}
                                className="flex-1 text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                              <select
                                value={rec.recipient_type}
                                onChange={(e) => {
                                  const newRecs = [...activityForm.recipients];
                                  newRecs[idx].recipient_type = e.target.value;
                                  setActivityForm(prev => ({ ...prev, recipients: newRecs }));
                                }}
                                className="text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] p-1 rounded"
                              >
                                <option value="vendor">External Vendor</option>
                                <option value="public_authority">Public Authority</option>
                                <option value="subsidiary">Subsidiary Group</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipient(idx)}
                                className="text-red-500 hover:bg-black/5 p-1 rounded"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                            <div className="flex gap-4 items-center">
                              <input
                                type="text"
                                placeholder="Categories of data shared..."
                                value={rec.data_shared}
                                onChange={(e) => {
                                  const newRecs = [...activityForm.recipients];
                                  newRecs[idx].data_shared = e.target.value;
                                  setActivityForm(prev => ({ ...prev, recipients: newRecs }));
                                }}
                                className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                              <select
                                value={rec.data_processor_id}
                                onChange={(e) => {
                                  const newRecs = [...activityForm.recipients];
                                  newRecs[idx].data_processor_id = e.target.value;
                                  setActivityForm(prev => ({ ...prev, recipients: newRecs }));
                                }}
                                className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] p-1 rounded"
                              >
                                <option value="">Link Workspace Vendor...</option>
                                {dataProcessors.map(dp => (
                                  <option key={dp.id} value={dp.id}>{dp.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Form Tab 4: Retention */}
              {newActivityTab === 'retention' && (
                <div className="space-y-6">
                  
                  {/* Retention */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase">Retention Policies (DPDPA Section 8(5))</label>
                      <button 
                        type="button" 
                        onClick={handleAddRetention} 
                        className="text-xs text-[var(--brand-primary)] font-semibold hover:underline"
                      >
                        + Add Policy
                      </button>
                    </div>
                    {activityForm.retention_policies.length === 0 ? (
                      <div className="text-xs text-[var(--text-tertiary)] italic bg-[var(--surface-raised)] p-3 rounded text-center border">
                        No policies configured. Failing to specify retention is a critical compliance gap.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activityForm.retention_policies.map((policy, idx) => (
                          <div key={idx} className="bg-[var(--surface-raised)] p-3 rounded border space-y-2">
                            <div className="flex gap-4">
                              {bankingEnabled && orgRetentionPolicies.length > 0 && (
                                <select
                                  value={policy.retention_policy_id || ''}
                                  onChange={(e) => {
                                    const newReps = [...activityForm.retention_policies];
                                    const linked = orgRetentionPolicies.find(p => p.id === e.target.value);
                                    newReps[idx].retention_policy_id = e.target.value;
                                    if (linked) {
                                      newReps[idx].retention_period = `${linked.period_value} ${linked.period_unit}`;
                                      newReps[idx].trigger_event = linked.trigger_event;
                                      newReps[idx].legal_basis = linked.legal_basis || '';
                                    }
                                    setActivityForm(prev => ({ ...prev, retention_policies: newReps }));
                                  }}
                                  className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded"
                                >
                                  <option value="">Link org retention policy (Req 6)...</option>
                                  {orgRetentionPolicies.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              )}
                              <input
                                type="text"
                                placeholder="Retention Period (e.g. 7 years)"
                                value={policy.retention_period}
                                onChange={(e) => {
                                  const newReps = [...activityForm.retention_policies];
                                  newReps[idx].retention_period = e.target.value;
                                  setActivityForm(prev => ({ ...prev, retention_policies: newReps }));
                                }}
                                className="flex-1 text-xs border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={policy.auto_delete}
                                  onChange={(e) => {
                                    const newReps = [...activityForm.retention_policies];
                                    newReps[idx].auto_delete = e.target.checked;
                                    setActivityForm(prev => ({ ...prev, retention_policies: newReps }));
                                  }}
                                  className="rounded"
                                />
                                Auto Disposal?
                              </label>
                              <button
                                type="button"
                                onClick={() => handleRemoveRetention(idx)}
                                className="text-red-500 hover:bg-black/5 p-1 rounded"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                            <div className="flex gap-4">
                              <input
                                type="text"
                                placeholder="Disposal Trigger Event (e.g. account cancellation)"
                                value={policy.trigger_event}
                                onChange={(e) => {
                                  const newReps = [...activityForm.retention_policies];
                                  newReps[idx].trigger_event = e.target.value;
                                  setActivityForm(prev => ({ ...prev, retention_policies: newReps }));
                                }}
                                className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                              <input
                                type="text"
                                placeholder="Statute / Legal basis of retention..."
                                value={policy.legal_basis}
                                onChange={(e) => {
                                  const newReps = [...activityForm.retention_policies];
                                  newReps[idx].legal_basis = e.target.value;
                                  setActivityForm(prev => ({ ...prev, retention_policies: newReps }));
                                }}
                                className="flex-1 text-[11px] border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1 rounded focus:outline-none"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>

            {/* Form Actions Footer */}
            <div className="sticky bottom-0 bg-[var(--surface-card)] border-t border-[var(--border-default)] p-6 flex justify-end gap-3 z-10">
              <button
                type="button"
                onClick={handleSaveActivity}
                className="px-6 py-2 bg-[var(--brand-primary)] text-white text-sm font-semibold rounded-md hover:opacity-90 cursor-pointer"
              >
                {isEditing ? 'Save Changes' : 'Create Activity Draft'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewActivityModal(false)}
                className="px-6 py-2 border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm font-semibold rounded-md cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <OrgHierarchyModal
        open={showOrgHierarchyModal}
        onClose={() => setShowOrgHierarchyModal(false)}
        orgId={orgIdParam}
        businessUnits={businessUnits}
        departments={departments}
        onUpdated={reloadHierarchy}
        initialBusinessUnitId={activityForm.business_unit_id || undefined}
        focusDepartment={hierarchyFocusDept}
      />

    </div>
    </ConsentManagementGate>
  );
}
