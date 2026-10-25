import { notify } from '@/app/utils/notify';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination, TABLE_PAGE_SIZE } from '@/app/hooks/useClientPagination';
import {
  AlertCircle,
  BookOpen,
  Building,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Download,
  DownloadCloud,
  FileText,
  Globe,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  addField,
  bulkUpdateAssetStatus,
  createAsset,
  deleteAsset,
  deleteField,
  exportInventoryCsv,
  fetchAsset,
  fetchAssetActivities,
  fetchAssetAuditLog,
  fetchAssetProcessors,
  fetchAssetUsage,
  fetchAssets,
  fetchInventorySummary,
  importSchemaFromSource,
  linkAssetActivity,
  linkAssetProcessor,
  unlinkAssetActivity,
  unlinkAssetProcessor,
  updateAsset,
} from '@/lib/api/dataInventory';
import {
  fetchRopaActivities,
  createRopaActivity,
  fetchBusinessUnits,
  fetchDepartments,
  fetchTeams,
} from '@/lib/api/ropa';
import type { ProcessingActivity, BusinessUnit, Department, Team } from '@/lib/api/ropa';
import { fetchProcessors, createProcessor } from '@/lib/api/workspace';
import type { DataProcessor, DpaStatus } from '@/types/workspace';
import { fetchDataSources } from '@/lib/api/dataSources';
import type {
  ActivityLink,
  AssetStatus,
  AssetType,
  AssetUsageMap,
  AuditLogEntry,
  ClassificationSource,
  FieldClassification,
  InventoryAsset,
  InventoryAssetDetail,
  InventorySummary,
  ProcessorLink,
  SecuritySafeguard,
} from '@/types/dataInventory';
import { DataInventoryPlaybook } from '@/app/components/inventory/DataInventoryPlaybook';
import type { DataSource } from '@/types/dataSource';
import { sourceLabel, regionToCountryCode, supportsSchemaImport } from '@/types/dataSource';
import { hasRole } from '@/lib/auth/permissions';
import { StatusPill } from '@/app/components/common/StatusPill';
import { fetchPurposeDataMappings } from '@/lib/api/enforcement';
import { fetchPurposes } from '@/lib/api/consent';
import type { Purpose } from '@/types/consent';
import type { LegalBasis } from '@/types/consent';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'database', label: 'Database' },
  { value: 'application', label: 'Application' },
  { value: 'file_system', label: 'File System' },
  { value: 'api', label: 'API' },
  { value: 'table', label: 'Table' },
  { value: 'collection', label: 'Collection' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'other', label: 'Other' },
];

const CLASSIFICATIONS: { value: FieldClassification; label: string }[] = [
  { value: 'unclassified', label: 'Unclassified' },
  { value: 'non_personal', label: 'Non-personal' },
  { value: 'personal', label: 'Personal' },
  { value: 'sensitive', label: 'Sensitive' },
];

const SECURITY_SAFEGUARDS: { value: SecuritySafeguard; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'encryption', label: 'Encryption' },
  { value: 'masking', label: 'Masking' },
  { value: 'obfuscation', label: 'Obfuscation' },
  { value: 'tokenization', label: 'Tokenization' },
];

const CLASSIFICATION_SOURCE_LABELS: Record<ClassificationSource, string> = {
  manual: 'Manual',
  heuristic: 'Heuristic',
  pii_scanner: 'PII Scanner',
};

type SortColumn = 'name' | 'type' | 'status' | 'fields' | 'owner';

function assetTypeLabel(type: AssetType): string {
  return ASSET_TYPES.find((t) => t.value === type)?.label ?? type;
}


function classificationBadge(c: FieldClassification): string {
  if (c === 'sensitive') return 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]';
  if (c === 'personal') return 'bg-[var(--status-info-bg)] text-[var(--status-info)]';
  if (c === 'non_personal') return 'bg-[var(--surface-raised)] text-[var(--text-secondary)]';
  return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
}

interface AssetForm {
  name: string;
  asset_type: AssetType;
  location: string;
  owner: string;
  record_count: string;
  data_categories: string;
  status: AssetStatus;
  data_source_id: string;
  description: string;
  country: string;
  cross_border_transfer: boolean;
  transfer_mechanism: string;
  dpia_required: boolean;
  contains_child_data: boolean;
}

const EMPTY_ASSET_FORM: AssetForm = {
  name: '',
  asset_type: 'database',
  location: '',
  owner: '',
  record_count: '',
  data_categories: '',
  status: 'active',
  data_source_id: '',
  description: '',
  country: '',
  cross_border_transfer: false,
  transfer_mechanism: '',
  dpia_required: false,
  contains_child_data: false,
};

interface FieldForm {
  name: string;
  data_type: string;
  classification: FieldClassification;
  pii_category: string;
  security_safeguard: SecuritySafeguard;
  is_child_data: boolean;
  mandatory_retention: boolean;
  mandatory_retention_days: string;
}

const EMPTY_FIELD_FORM: FieldForm = {
  name: '',
  data_type: '',
  classification: 'personal',
  pii_category: '',
  security_safeguard: 'none',
  is_child_data: false,
  mandatory_retention: false,
  mandatory_retention_days: '365',
};

/**
 * Data Inventory — the Asset Register tab is wired to the /data-inventory API
 * (assets + classified fields). Processing Activities (RoPA) and Processor DPA
 * Tracking (Vendor Risk) remain mock views owned by their own future modules.
 */
export function DataInventory(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const canManageInventory = hasRole(user, 'admin', 'superadmin');
  const [activeTab, setActiveTab] = useState<'assets' | 'activities' | 'dpa'>('assets');
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // --- Asset Register (real) ---
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AssetType>('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState<AssetForm>(EMPTY_ASSET_FORM);
  const [savingAsset, setSavingAsset] = useState(false);

  const [detail, setDetail] = useState<InventoryAssetDetail | null>(null);
  const [fieldPurposeMap, setFieldPurposeMap] = useState<
    Map<string, { name: string; legal_basis: LegalBasis }[]>
  >(new Map());
  const [usageMap, setUsageMap] = useState<AssetUsageMap | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [processorLinks, setProcessorLinks] = useState<ProcessorLink[]>([]);
  const [activityLinks, setActivityLinks] = useState<ActivityLink[]>([]);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [linkProcessorId, setLinkProcessorId] = useState('');
  const [linkActivityId, setLinkActivityId] = useState('');
  const [linkingProcessor, setLinkingProcessor] = useState(false);
  const [linkingActivity, setLinkingActivity] = useState(false);
  const [allProcessors, setAllProcessors] = useState<DataProcessor[]>([]);
  const [allActivities, setAllActivities] = useState<ProcessingActivity[]>([]);
  const [fieldForm, setFieldForm] = useState<FieldForm>(EMPTY_FIELD_FORM);
  const [savingField, setSavingField] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importingSourceId, setImportingSourceId] = useState<string | null>(null);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const sourceId = sourceFilter !== 'all' ? sourceFilter : undefined;
      const [a, s] = await Promise.all([
        fetchAssets(orgId, sourceId),
        fetchInventorySummary(orgId),
      ]);
      setAssets(a);
      setSummary(s);
    } catch (error) {
      notify(`Failed to load inventory: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssets();
    fetchDataSources(orgId)
      .then(setSources)
      .catch(() => setSources([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter]);

  const filteredAssets = useMemo(() => {
    const filtered = assets.filter((a) => {
      if (typeFilter !== 'all' && a.asset_type !== typeFilter) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'type':
          cmp = a.asset_type.localeCompare(b.asset_type);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'fields':
          cmp = a.field_count - b.field_count;
          break;
        case 'owner':
          cmp = (a.owner ?? '').localeCompare(b.owner ?? '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [assets, search, typeFilter, sortColumn, sortDir]);

  const applySourceDefaults = (sourceId: string) => {
    const src = sources.find((s) => s.id === sourceId);
    if (!src) return;
    const countryFromRegion = regionToCountryCode(src.region);
    setAssetForm((f) => ({
      ...f,
      data_source_id: sourceId,
      owner: f.owner || src.owner_name || '',
      location: f.location || src.region || src.host || '',
      country: f.country || countryFromRegion || '',
      cross_border_transfer:
        f.cross_border_transfer || src.residency_flag === 'outside_approved_residency',
    }));
  };

  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }): ReactElement | null => {
    if (sortColumn !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="size-3 inline" /> : <ChevronDown className="size-3 inline" />;
  };

  const toggleSelectAsset = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkStatus = async (status: AssetStatus) => {
    if (selectedAssetIds.size === 0) return;
    setBulkUpdating(true);
    try {
      const result = await bulkUpdateAssetStatus(
        { asset_ids: Array.from(selectedAssetIds), status },
        orgId,
      );
      notify(`Updated ${result.updated} asset(s).`);
      setSelectedAssetIds(new Set());
      await loadAssets();
    } catch (error) {
      notify(`Bulk update failed: ${(error as Error).message}`);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportInventoryCsv(orgId);
      notify('Inventory exported.');
    } catch (error) {
      notify(`Export failed: ${(error as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const ASSETS_PAGE_SIZE = 10;
  const [assetsPage, setAssetsPage] = useState(0);
  useEffect(() => {
    setAssetsPage(0);
  }, [search, typeFilter, sourceFilter]);
  const assetsPageCount = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PAGE_SIZE));
  const assetsSafePage = Math.min(assetsPage, assetsPageCount - 1);
  const pagedAssets = filteredAssets.slice(
    assetsSafePage * ASSETS_PAGE_SIZE,
    (assetsSafePage + 1) * ASSETS_PAGE_SIZE,
  );

  const fieldsPager = useClientPagination(detail?.fields ?? [], TABLE_PAGE_SIZE, detail?.id);
  const auditPager = useClientPagination(auditLog);

  const toggleSelectAll = () => {
    if (selectedAssetIds.size === pagedAssets.length && pagedAssets.length > 0) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(pagedAssets.map((a) => a.id)));
    }
  };

  const openCreate = () => {
    setEditingAssetId(null);
    setAssetForm(EMPTY_ASSET_FORM);
    setShowAssetModal(true);
  };

  const openEdit = (a: InventoryAsset) => {
    setEditingAssetId(a.id);
    setAssetForm({
      name: a.name,
      asset_type: a.asset_type,
      location: a.location ?? '',
      owner: a.owner ?? '',
      record_count: a.record_count ?? '',
      data_categories: a.data_categories.join(', '),
      status: a.status,
      data_source_id: a.data_source_id ?? '',
      description: a.description ?? '',
      country: a.country ?? '',
      cross_border_transfer: a.cross_border_transfer,
      transfer_mechanism: a.transfer_mechanism ?? '',
      dpia_required: a.dpia_required,
      contains_child_data: a.contains_child_data,
    });
    setDetail(null);
    setShowAssetModal(true);
  };

  const saveAsset = async () => {
    if (!assetForm.name.trim()) {
      notify('Please enter an asset name.');
      return;
    }
    setSavingAsset(true);
    try {
      const payload = {
        name: assetForm.name,
        asset_type: assetForm.asset_type,
        location: assetForm.location || null,
        owner: assetForm.owner || null,
        record_count: assetForm.record_count || null,
        description: assetForm.description || null,
        status: assetForm.status,
        data_source_id: assetForm.data_source_id || null,
        data_categories: assetForm.data_categories
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        country: assetForm.country || null,
        cross_border_transfer: assetForm.cross_border_transfer,
        transfer_mechanism: assetForm.transfer_mechanism || null,
        dpia_required: assetForm.dpia_required,
        contains_child_data: assetForm.contains_child_data,
      };
      if (editingAssetId) {
        await updateAsset(editingAssetId, payload, orgId);
        notify('Asset updated.');
      } else {
        await createAsset(payload, orgId);
        notify('Asset added to inventory.');
      }
      setShowAssetModal(false);
      await loadAssets();
    } catch (error) {
      notify(`Failed to save asset: ${(error as Error).message}`);
    } finally {
      setSavingAsset(false);
    }
  };

  const openDetail = async (assetId: string) => {
    try {
      const [assetDetail, mappings, purposes, usage, audit, procs, acts, processors, activities] =
        await Promise.all([
          fetchAsset(assetId, orgId),
          fetchPurposeDataMappings(orgId),
          fetchPurposes(orgId),
          fetchAssetUsage(assetId, orgId),
          fetchAssetAuditLog(assetId, orgId),
          fetchAssetProcessors(assetId, orgId),
          fetchAssetActivities(assetId, orgId),
          fetchProcessors(orgId),
          fetchRopaActivities({ orgId }),
        ]);
      setDetail(assetDetail);
      setUsageMap(usage);
      setAuditLog(audit);
      setProcessorLinks(procs);
      setActivityLinks(acts);
      setAllProcessors(processors);
      setAllActivities(activities);
      setFieldForm(EMPTY_FIELD_FORM);
      setLinkProcessorId('');
      setLinkActivityId('');
      const purposeById = new Map(purposes.map((p: Purpose) => [p.id, p]));
      const byField = new Map<string, { name: string; legal_basis: LegalBasis }[]>();
      for (const m of mappings) {
        const p = purposeById.get(m.purpose_id);
        if (!p) continue;
        const list = byField.get(m.inventory_field_id) ?? [];
        list.push({ name: p.name, legal_basis: p.legal_basis });
        byField.set(m.inventory_field_id, list);
      }
      setFieldPurposeMap(byField);
    } catch (error) {
      notify(`Failed to load asset: ${(error as Error).message}`);
    }
  };

  const handleDeleteAsset = async (a: InventoryAsset | InventoryAssetDetail) => {
    if (
      !window.confirm(
        `Remove "${a.name}" and its fields from the inventory?\n\n` +
          'This only deletes the catalog entry here — the actual table/data in the ' +
          'connected data source is NOT touched.',
      )
    )
      return;
    try {
      await deleteAsset(a.id, orgId);
      notify(`Deleted "${a.name}".`);
      setDetail(null);
      await loadAssets();
    } catch (error) {
      notify(`Failed to delete: ${(error as Error).message}`);
    }
  };

  const handleAddField = async () => {
    if (!detail) return;
    if (!fieldForm.name.trim()) {
      notify('Enter a column/field name.');
      return;
    }
    setSavingField(true);
    try {
      await addField(
        detail.id,
        {
          name: fieldForm.name,
          data_type: fieldForm.data_type || null,
          classification: fieldForm.classification,
          pii_category: fieldForm.pii_category || null,
          security_safeguard: fieldForm.security_safeguard,
          is_encrypted: fieldForm.security_safeguard === 'encryption',
          is_child_data: fieldForm.is_child_data,
          mandatory_retention: fieldForm.mandatory_retention,
          mandatory_retention_days: fieldForm.mandatory_retention
            ? Number(fieldForm.mandatory_retention_days) || 365
            : null,
        },
        orgId,
      );
      setFieldForm(EMPTY_FIELD_FORM);
      await openDetail(detail.id);
      await loadAssets();
    } catch (error) {
      notify(`Failed to add field: ${(error as Error).message}`);
    } finally {
      setSavingField(false);
    }
  };

  const handleImport = async (sourceId: string) => {
    setImportingSourceId(sourceId);
    try {
      const result = await importSchemaFromSource(sourceId, orgId);
      notify(result.message);
      setShowImportModal(false);
      await loadAssets();
    } catch (error) {
      notify(`Schema scan failed: ${(error as Error).message}`);
    } finally {
      setImportingSourceId(null);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!detail) return;
    try {
      await deleteField(fieldId, orgId);
      await openDetail(detail.id);
      await loadAssets();
    } catch (error) {
      notify(`Failed to delete field: ${(error as Error).message}`);
    }
  };

  const handleLinkProcessor = async () => {
    if (!detail || !linkProcessorId) return;
    setLinkingProcessor(true);
    try {
      await linkAssetProcessor(detail.id, { processor_id: linkProcessorId }, orgId);
      notify('Processor linked.');
      setLinkProcessorId('');
      await openDetail(detail.id);
    } catch (error) {
      notify(`Failed to link processor: ${(error as Error).message}`);
    } finally {
      setLinkingProcessor(false);
    }
  };

  const handleUnlinkProcessor = async (linkId: string) => {
    if (!detail) return;
    try {
      await unlinkAssetProcessor(detail.id, linkId, orgId);
      await openDetail(detail.id);
    } catch (error) {
      notify(`Failed to unlink processor: ${(error as Error).message}`);
    }
  };

  const handleLinkActivity = async () => {
    if (!detail || !linkActivityId) return;
    setLinkingActivity(true);
    try {
      await linkAssetActivity(detail.id, { activity_id: linkActivityId }, orgId);
      notify('Processing activity linked.');
      setLinkActivityId('');
      await openDetail(detail.id);
    } catch (error) {
      notify(`Failed to link activity: ${(error as Error).message}`);
    } finally {
      setLinkingActivity(false);
    }
  };

  const handleUnlinkActivity = async (linkId: string) => {
    if (!detail) return;
    try {
      await unlinkAssetActivity(detail.id, linkId, orgId);
      await openDetail(detail.id);
    } catch (error) {
      notify(`Failed to unlink activity: ${(error as Error).message}`);
    }
  };

  // --- Wired data for the other two tabs ---
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [showAddDPAModal, setShowAddDPAModal] = useState(false);
  const [activities, setActivities] = useState<ProcessingActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [dpas, setDpas] = useState<DataProcessor[]>([]);
  const [dpasLoading, setDpasLoading] = useState(false);

  // Hierarchy Data for Activity Form
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);

  // Forms
  interface ActivityFormState {
    title: string;
    description: string;
    business_unit_id: string;
    department_id: string;
    team_id: string;
  }

  const EMPTY_ACTIVITY_FORM: ActivityFormState = {
    title: '',
    description: '',
    business_unit_id: '',
    department_id: '',
    team_id: '',
  };

  const [activityForm, setActivityForm] = useState<ActivityFormState>(EMPTY_ACTIVITY_FORM);
  const [savingActivity, setSavingActivity] = useState(false);

  interface DpaFormState {
    name: string;
    category: string;
    processor_role: string;
    purpose: string;
    data_categories: string;
    location: string;
    contact_email: string;
    dpa_status: DpaStatus;
    dpa_signed_date: string;
    risk_level: string;
  }

  const EMPTY_DPA_FORM: DpaFormState = {
    name: '',
    category: 'Other',
    processor_role: 'Data Processor',
    purpose: '',
    data_categories: '',
    location: '',
    contact_email: '',
    dpa_status: 'none',
    dpa_signed_date: '',
    risk_level: 'medium',
  };

  const [dpaForm, setDpaForm] = useState<DpaFormState>(EMPTY_DPA_FORM);
  const [savingDpa, setSavingDpa] = useState(false);

  const loadHierarchy = async () => {
    setLoadingHierarchy(true);
    try {
      const [bu, dept, t] = await Promise.all([
        fetchBusinessUnits(orgId),
        fetchDepartments(orgId),
        fetchTeams(orgId),
      ]);
      setBusinessUnits(bu);
      setDepartments(dept);
      setTeams(t);
    } catch (err) {
      notify(`Failed to load org hierarchy: ${(err as Error).message}`);
    } finally {
      setLoadingHierarchy(false);
    }
  };

  useEffect(() => {
    if (showAddActivityModal && businessUnits.length === 0) {
      void loadHierarchy();
    }
  }, [showAddActivityModal, businessUnits.length]);

  const loadActivities = async () => {
    setActivitiesLoading(true);
    try {
      const data = await fetchRopaActivities({ orgId });
      setActivities(data);
    } catch (err) {
      notify(`Failed to load activities: ${(err as Error).message}`);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadDpas = async () => {
    setDpasLoading(true);
    try {
      const data = await fetchProcessors(orgId);
      setDpas(data);
    } catch (err) {
      notify(`Failed to load DPAs: ${(err as Error).message}`);
    } finally {
      setDpasLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'activities' && activities.length === 0) {
      void loadActivities();
    } else if (activeTab === 'dpa' && dpas.length === 0) {
      void loadDpas();
    }
  }, [activeTab, orgId]);

  const handleSaveActivity = async () => {
    if (!activityForm.title.trim()) {
      notify('Please enter an activity title.');
      return;
    }
    if (!activityForm.business_unit_id) {
      notify('Please select a business unit.');
      return;
    }
    setSavingActivity(true);
    try {
      const payload = {
        title: activityForm.title,
        description: activityForm.description || null,
        business_unit_id: activityForm.business_unit_id,
        department_id: activityForm.department_id || null,
        team_id: activityForm.team_id || null,
      };
      await createRopaActivity(payload, orgId);
      notify('Processing activity created successfully.');
      setShowAddActivityModal(false);
      setActivityForm(EMPTY_ACTIVITY_FORM);
      await loadActivities();
    } catch (error) {
      notify(`Failed to save activity: ${(error as Error).message}`);
    } finally {
      setSavingActivity(false);
    }
  };

  const handleSaveDpa = async () => {
    if (!dpaForm.name.trim()) {
      notify('Please enter a processor name.');
      return;
    }
    setSavingDpa(true);
    try {
      const payload = {
        name: dpaForm.name,
        category: dpaForm.category,
        processor_role: dpaForm.processor_role,
        purpose: dpaForm.purpose || null,
        data_categories: dpaForm.data_categories || null,
        location: dpaForm.location || null,
        contact_email: dpaForm.contact_email || null,
        dpa_status: dpaForm.dpa_status,
        dpa_signed_date: dpaForm.dpa_status === 'signed' && dpaForm.dpa_signed_date ? dpaForm.dpa_signed_date : null,
        risk_level: dpaForm.risk_level || null,
      };
      await createProcessor(payload, orgId);
      notify('Data processor created successfully.');
      setShowAddDPAModal(false);
      setDpaForm(EMPTY_DPA_FORM);
      await loadDpas();
    } catch (error) {
      notify(`Failed to save processor: ${(error as Error).message}`);
    } finally {
      setSavingDpa(false);
    }
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto text-[var(--text-primary)]">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-semibold">Data Inventory</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlaybook(true)}
              className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] flex items-center gap-2 cursor-pointer"
            >
              <BookOpen className="size-4" />
              Playbook
            </button>
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export CSV
            </button>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Catalogue data assets and classify the personal data each one holds
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border-default)] mb-6">
        {([
          { key: 'assets', label: 'Asset Register', icon: Database },
          { key: 'activities', label: 'Processing Activities', icon: FileText },
          { key: 'dpa', label: 'Processor DPA Tracking', icon: Building },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <tab.icon className="size-4" />
              {tab.label}
            </div>
          </button>
        ))}
      </div>

      {/* Asset Register Tab (wired) */}
      {activeTab === 'assets' && (
        <div>
          {summary && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <SummaryCard label="Data Assets" value={summary.total_assets} />
              <SummaryCard label="Personal Fields" value={summary.personal_fields} tone="info" />
              <SummaryCard label="Sensitive Fields" value={summary.sensitive_fields} tone="danger" />
              <SummaryCard label="Needs Review" value={summary.assets_needing_review} tone="warning" />
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assets..."
                  className="pl-10 pr-4 py-2 border border-[var(--border-default)] rounded-md text-sm bg-[var(--surface-card)] text-[var(--text-primary)]"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | AssetType)}
                className="px-3 py-2 border border-[var(--border-default)] rounded-md text-sm bg-[var(--surface-card)] text-[var(--text-primary)]"
              >
                <option value="all">All Types</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-2 border border-[var(--border-default)] rounded-md text-sm bg-[var(--surface-card)] text-[var(--text-primary)]"
              >
                <option value="all">All Sources</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sourceLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {canManageInventory && selectedAssetIds.size > 0 && (
                <div className="flex items-center gap-2 mr-2">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {selectedAssetIds.size} selected
                  </span>
                  <button
                    onClick={() => void handleBulkStatus('active')}
                    disabled={bulkUpdating}
                    className="px-2 py-1 text-xs rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer disabled:opacity-50"
                  >
                    Mark Active
                  </button>
                  <button
                    onClick={() => void handleBulkStatus('review_needed')}
                    disabled={bulkUpdating}
                    className="px-2 py-1 text-xs rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer disabled:opacity-50"
                  >
                    Mark Review
                  </button>
                  <button
                    onClick={() => void handleBulkStatus('archived')}
                    disabled={bulkUpdating}
                    className="px-2 py-1 text-xs rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              )}
              {canManageInventory && (
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] flex items-center gap-2 cursor-pointer"
                >
                  <DownloadCloud className="size-4" />
                  Import from source
                </button>
              )}
              {canManageInventory && (
                <button
                  onClick={openCreate}
                  className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="size-4" />
                  Add Asset
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-[var(--text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inventory…
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-[var(--surface-raised)] mb-4">
                <Database className="w-6 h-6 text-[var(--text-tertiary)]" />
              </div>
              <h3 className="text-base font-semibold mb-1">
                {assets.length === 0 ? 'No assets catalogued yet' : 'None match your filters'}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md">
                {assets.length === 0
                  ? 'Add a data asset, then classify its fields as personal or sensitive.'
                  : 'Try a different search or type filter.'}
              </p>
              {assets.length === 0 && canManageInventory && (
                <button
                  onClick={openCreate}
                  className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="size-4" />
                  Add Asset
                </button>
              )}
            </div>
          ) : (
            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                    {canManageInventory && (
                      <th className="py-3 px-3 w-10">
                        <input
                          type="checkbox"
                          checked={pagedAssets.length > 0 && selectedAssetIds.size === pagedAssets.length}
                          onChange={toggleSelectAll}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </th>
                    )}
                    <th
                      className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none"
                      onClick={() => toggleSort('name')}
                    >
                      Name <SortIcon col="name" />
                    </th>
                    <th
                      className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none"
                      onClick={() => toggleSort('type')}
                    >
                      Type <SortIcon col="type" />
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Source</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Location</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Compliance</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Data Categories</th>
                    <th
                      className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none"
                      onClick={() => toggleSort('fields')}
                    >
                      Fields <SortIcon col="fields" />
                    </th>
                    <th
                      className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none"
                      onClick={() => toggleSort('owner')}
                    >
                      Owner <SortIcon col="owner" />
                    </th>
                    <th
                      className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none"
                      onClick={() => toggleSort('status')}
                    >
                      Status <SortIcon col="status" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      onClick={() => openDetail(asset.id)}
                      className="border-b border-[var(--border-default)]/40 hover:bg-[var(--surface-raised)] cursor-pointer"
                    >
                      {canManageInventory && (
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedAssetIds.has(asset.id)}
                            onChange={() => toggleSelectAsset(asset.id)}
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-primary)]">{asset.name}</div>
                        {asset.record_count && (
                          <div className="text-xs text-[var(--text-tertiary)]">{asset.record_count} records</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{assetTypeLabel(asset.asset_type)}</td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{asset.data_source_name ?? '—'}</td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{asset.location ?? '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {asset.cross_border_transfer && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[10px]" title="Cross-border transfer">
                              <Globe className="size-3" /> CB
                            </span>
                          )}
                          {asset.dpia_required && (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[10px]" title="DPIA required">
                              DPIA
                            </span>
                          )}
                          {asset.contains_child_data && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[10px]" title="Children's data">
                              Child
                            </span>
                          )}
                          {!asset.cross_border_transfer && !asset.dpia_required && !asset.contains_child_data && (
                            <span className="text-xs text-[var(--text-tertiary)]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {asset.data_categories.slice(0, 2).map((cat) => (
                            <span key={cat} className="px-2 py-0.5 rounded bg-[var(--status-info-bg)] text-[var(--status-info)] text-xs">
                              {cat}
                            </span>
                          ))}
                          {asset.data_categories.length > 2 && (
                            <span className="px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs">
                              +{asset.data_categories.length - 2}
                            </span>
                          )}
                          {asset.data_categories.length === 0 && (
                            <span className="text-xs text-[var(--text-tertiary)]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                        {asset.field_count}
                        {asset.sensitive_field_count > 0 && (
                          <span className="ml-1 text-[var(--status-danger)]">
                            ({asset.sensitive_field_count} sensitive)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{asset.owner ?? '—'}</td>
                      <td className="py-3 px-4">
                        {asset.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">
                            <CheckCircle className="size-3" />
                            Active
                          </span>
                        ) : asset.status === 'review_needed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs">
                            <AlertCircle className="size-3" />
                            Review Needed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs">
                            Archived
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePager
                page={assetsSafePage}
                pageCount={assetsPageCount}
                total={filteredAssets.length}
                pageSize={ASSETS_PAGE_SIZE}
                onPage={setAssetsPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Processing Activities Tab */}
      {activeTab === 'activities' && (
        <div>
          <div className="mb-3 text-xs text-[var(--text-tertiary)]">
            These records are synced from the RoPA Module.
          </div>
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setShowAddActivityModal(true)}
              className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              Add Processing Activity
            </button>
          </div>
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Activity Ref</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Title</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Risk Level</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Business Unit</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {activitiesLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading activities...
                    </td>
                  </tr>
                ) : activities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
                      No processing activities found.
                    </td>
                  </tr>
                ) : (
                  activities.map((activity) => (
                    <tr key={activity.id} className="border-b border-[var(--border-default)]/40">
                      <td className="py-3 px-4 text-sm font-mono text-[var(--text-secondary)]">{activity.activity_ref || activity.id.substring(0, 8)}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-primary)]">{activity.title}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{activity.description || 'No description'}</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{activity.risk_level || '—'}</td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{activity.business_unit_name || '—'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-[var(--status-info-bg)] text-[var(--status-info)] text-xs">{activity.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Processor DPA Tracking Tab */}
      {activeTab === 'dpa' && (
        <div>
          <div className="mb-3 text-xs text-[var(--text-tertiary)]">
            These records are synced from the Workspace Processors data.
          </div>
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setShowAddDPAModal(true)}
              className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              Add DPA
            </button>
          </div>
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Processor Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Role</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">DPA Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-secondary)]">Signed Date</th>
                </tr>
              </thead>
              <tbody>
                {dpasLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading DPAs...
                    </td>
                  </tr>
                ) : dpas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
                      No Processor DPAs found.
                    </td>
                  </tr>
                ) : (
                  dpas.map((dpa) => (
                    <tr key={dpa.id} className="border-b border-[var(--border-default)]/40">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-primary)]">{dpa.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{dpa.location ? `Location: ${dpa.location}` : 'No location specified'}</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{dpa.category || '—'}</td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{dpa.processor_role || '—'}</td>
                      <td className="py-3 px-4">
                        {dpa.dpa_status === 'signed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">
                            <CheckCircle className="size-3" /> Signed
                          </span>
                        ) : dpa.dpa_status === 'expired' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs">
                            <AlertCircle className="size-3" /> Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs">
                            <Clock className="size-3" /> {dpa.dpa_status || 'None'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{dpa.dpa_signed_date || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {showAddDPAModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[var(--border-default)]">
                <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Add Data Processor / DPA</h2>
                  <button
                    onClick={() => {
                      setShowAddDPAModal(false);
                      setDpaForm(EMPTY_DPA_FORM);
                    }}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <Labeled label="Processor Name *">
                    <input
                      className={inputCls}
                      value={dpaForm.name}
                      onChange={(e) => setDpaForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Amazon Web Services, Inc."
                    />
                  </Labeled>

                  <div className="grid grid-cols-2 gap-4">
                    <Labeled label="Processor Role">
                      <input
                        className={inputCls}
                        value={dpaForm.processor_role}
                        onChange={(e) => setDpaForm((f) => ({ ...f, processor_role: e.target.value }))}
                        placeholder="e.g. Data Processor"
                      />
                    </Labeled>
                    <Labeled label="Category">
                      <select
                        className={inputCls}
                        value={dpaForm.category}
                        onChange={(e) => setDpaForm((f) => ({ ...f, category: e.target.value }))}
                      >
                        <option value="Cloud Provider">Cloud Provider</option>
                        <option value="SaaS">SaaS</option>
                        <option value="Analytics">Analytics</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Logistics">Logistics</option>
                        <option value="Other">Other</option>
                      </select>
                    </Labeled>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Labeled label="Risk Level">
                      <select
                        className={inputCls}
                        value={dpaForm.risk_level}
                        onChange={(e) => setDpaForm((f) => ({ ...f, risk_level: e.target.value }))}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </Labeled>
                    <Labeled label="DPA Status">
                      <select
                        className={inputCls}
                        value={dpaForm.dpa_status}
                        onChange={(e) => setDpaForm((f) => ({ ...f, dpa_status: e.target.value as DpaStatus }))}
                      >
                        <option value="none">None</option>
                        <option value="signed">Signed</option>
                        <option value="expired">Expired</option>
                        <option value="under_review">Under Review</option>
                      </select>
                    </Labeled>
                  </div>

                  {dpaForm.dpa_status === 'signed' && (
                    <Labeled label="DPA Signed Date">
                      <input
                        type="date"
                        className={inputCls}
                        value={dpaForm.dpa_signed_date}
                        onChange={(e) => setDpaForm((f) => ({ ...f, dpa_signed_date: e.target.value }))}
                      />
                    </Labeled>
                  )}

                  <Labeled label="Purpose of Processing">
                    <input
                      className={inputCls}
                      value={dpaForm.purpose}
                      onChange={(e) => setDpaForm((f) => ({ ...f, purpose: e.target.value }))}
                      placeholder="e.g. Cloud hosting infrastructure, email notifications"
                    />
                  </Labeled>

                  <Labeled label="Data Categories Shared">
                    <input
                      className={inputCls}
                      value={dpaForm.data_categories}
                      onChange={(e) => setDpaForm((f) => ({ ...f, data_categories: e.target.value }))}
                      placeholder="e.g. User emails, IP addresses, names"
                    />
                  </Labeled>

                  <div className="grid grid-cols-2 gap-4">
                    <Labeled label="Location / Data Residency">
                      <input
                        className={inputCls}
                        value={dpaForm.location}
                        onChange={(e) => setDpaForm((f) => ({ ...f, location: e.target.value }))}
                        placeholder="e.g. EU (Ireland), US East"
                      />
                    </Labeled>
                    <Labeled label="Contact Email">
                      <input
                        type="email"
                        className={inputCls}
                        value={dpaForm.contact_email}
                        onChange={(e) => setDpaForm((f) => ({ ...f, contact_email: e.target.value }))}
                        placeholder="e.g. privacy@processor.com"
                      />
                    </Labeled>
                  </div>
                </div>
                <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowAddDPAModal(false);
                      setDpaForm(EMPTY_DPA_FORM);
                    }}
                    className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDpa}
                    disabled={savingDpa}
                    className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {savingDpa ? 'Saving…' : 'Add DPA'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showAddActivityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Processing Activity</h2>
              <button
                onClick={() => {
                  setShowAddActivityModal(false);
                  setActivityForm(EMPTY_ACTIVITY_FORM);
                }}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {loadingHierarchy ? (
                <div className="flex items-center justify-center py-8 text-[var(--text-secondary)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading organizational hierarchy…
                </div>
              ) : (
                <>
                  <Labeled label="Activity Title *">
                    <input
                      className={inputCls}
                      value={activityForm.title}
                      onChange={(e) => setActivityForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. User Authentication & Profile Management"
                    />
                  </Labeled>
                  
                  <Labeled label="Business Unit *">
                    <select
                      className={inputCls}
                      value={activityForm.business_unit_id}
                      onChange={(e) => {
                        const buId = e.target.value;
                        setActivityForm((f) => ({
                          ...f,
                          business_unit_id: buId,
                          department_id: '',
                          team_id: '',
                        }));
                      }}
                    >
                      <option value="">— Select Business Unit —</option>
                      {businessUnits.map((bu) => (
                        <option key={bu.id} value={bu.id}>
                          {bu.name} ({bu.code || 'N/A'})
                        </option>
                      ))}
                    </select>
                  </Labeled>

                  <div className="grid grid-cols-2 gap-4">
                    <Labeled label="Department (optional)">
                      <select
                        className={inputCls}
                        disabled={!activityForm.business_unit_id}
                        value={activityForm.department_id}
                        onChange={(e) => {
                          const deptId = e.target.value;
                          setActivityForm((f) => ({
                            ...f,
                            department_id: deptId,
                            team_id: '',
                          }));
                        }}
                      >
                        <option value="">— Select Department —</option>
                        {departments
                          .filter((d) => d.business_unit_id === activityForm.business_unit_id)
                          .map((dept) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name}
                            </option>
                          ))}
                      </select>
                    </Labeled>

                    <Labeled label="Team (optional)">
                      <select
                        className={inputCls}
                        disabled={!activityForm.department_id}
                        value={activityForm.team_id}
                        onChange={(e) => setActivityForm((f) => ({ ...f, team_id: e.target.value }))}
                      >
                        <option value="">— Select Team —</option>
                        {teams
                          .filter((t) => t.department_id === activityForm.department_id)
                          .map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                      </select>
                    </Labeled>
                  </div>

                  <Labeled label="Description">
                    <textarea
                      className={`${inputCls} h-24 resize-none`}
                      value={activityForm.description}
                      onChange={(e) => setActivityForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Describe the purpose and data flow of this activity..."
                    />
                  </Labeled>
                </>
              )}
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddActivityModal(false);
                  setActivityForm(EMPTY_ACTIVITY_FORM);
                }}
                className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveActivity}
                disabled={savingActivity || loadingHierarchy}
                className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {savingActivity ? 'Saving…' : 'Add Activity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import schema from a data source */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-lg w-full border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Import Schema from Data Source</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Reads a database&apos;s tables &amp; columns — or an uploaded / cloud file&apos;s
                  headers — and auto-classifies likely PII. API &amp; log sources have no fixed
                  columns; scan them or add assets manually.
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-2 max-h-[50vh] overflow-y-auto">
              {sources.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  No data sources yet. Register a database, cloud store, or file source on the Data Sources page first.
                </p>
              ) : (
                sources.map((s) => {
                  const supported = supportsSchemaImport(s);
                  const needsEngine =
                    !supported &&
                    (s.category === 'database' || s.category === 'cloud') &&
                    !s.extra_config?.engine;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded border border-[var(--border-default)]"
                    >
                      <div>
                        <div className="text-sm font-medium">{s.name}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">
                          {sourceLabel(s)}
                          {s.host ? ` · ${s.host}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => handleImport(s.id)}
                        disabled={!supported || importingSourceId === s.id}
                        title={
                          supported
                            ? 'Import structure from this source'
                            : needsEngine
                              ? 'Configure the database engine on this source before importing'
                              : 'Auto-import supports PostgreSQL/MySQL/MongoDB and file sources. Run a PII scan or add assets manually.'
                        }
                        className="px-3 py-1.5 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
                      >
                        {importingSourceId === s.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {supported ? 'Import' : 'Unsupported'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex justify-end">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingAssetId ? 'Edit Asset' : 'Add New Asset'}</h2>
              <button onClick={() => setShowAssetModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Labeled label="Asset Name *">
                <input
                  className={inputCls}
                  value={assetForm.name}
                  onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Customer Database"
                />
              </Labeled>
              <div className="grid grid-cols-2 gap-4">
                <Labeled label="Asset Type">
                  <select
                    className={inputCls}
                    value={assetForm.asset_type}
                    onChange={(e) => setAssetForm((f) => ({ ...f, asset_type: e.target.value as AssetType }))}
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Location">
                  <input
                    className={inputCls}
                    value={assetForm.location}
                    onChange={(e) => setAssetForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. AWS RDS Mumbai"
                  />
                </Labeled>
              </div>
              <Labeled label="Linked Data Source (optional)">
                <select
                  className={inputCls}
                  value={assetForm.data_source_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    setAssetForm((f) => ({ ...f, data_source_id: id }));
                    if (id) applySourceDefaults(id);
                  }}
                >
                  <option value="">— None —</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Data Categories (comma-separated)">
                <input
                  className={inputCls}
                  value={assetForm.data_categories}
                  onChange={(e) => setAssetForm((f) => ({ ...f, data_categories: e.target.value }))}
                  placeholder="Names, Emails, Phone Numbers"
                />
              </Labeled>
              <div className="grid grid-cols-3 gap-4">
                <Labeled label="Owner">
                  <input
                    className={inputCls}
                    value={assetForm.owner}
                    onChange={(e) => setAssetForm((f) => ({ ...f, owner: e.target.value }))}
                    placeholder="Owner name"
                  />
                </Labeled>
                <Labeled label="Records">
                  <input
                    className={inputCls}
                    value={assetForm.record_count}
                    onChange={(e) => setAssetForm((f) => ({ ...f, record_count: e.target.value }))}
                    placeholder="e.g. 1.2M"
                  />
                </Labeled>
                <Labeled label="Status">
                  <select
                    className={inputCls}
                    value={assetForm.status}
                    onChange={(e) => setAssetForm((f) => ({ ...f, status: e.target.value as AssetStatus }))}
                  >
                    <option value="active">Active</option>
                    <option value="review_needed">Review Needed</option>
                    <option value="archived">Archived</option>
                  </select>
                </Labeled>
              </div>
              <Labeled label="Description">
                <textarea
                  className={`${inputCls} h-20 resize-none`}
                  value={assetForm.description}
                  onChange={(e) => setAssetForm((f) => ({ ...f, description: e.target.value }))}
                />
              </Labeled>
              <div className="border-t border-[var(--border-default)] pt-4 mt-2">
                <div className="text-sm font-medium mb-3">DPDPA Compliance Metadata</div>
                <div className="grid grid-cols-2 gap-4">
                  <Labeled label="Country (ISO 3166-1 alpha-3)">
                    <input
                      className={inputCls}
                      value={assetForm.country}
                      onChange={(e) => setAssetForm((f) => ({ ...f, country: e.target.value }))}
                      placeholder="e.g. IND, USA"
                      maxLength={3}
                    />
                  </Labeled>
                  <Labeled label="Transfer Mechanism">
                    <input
                      className={inputCls}
                      value={assetForm.transfer_mechanism}
                      onChange={(e) => setAssetForm((f) => ({ ...f, transfer_mechanism: e.target.value }))}
                      placeholder="e.g. Standard contractual clauses"
                      disabled={!assetForm.cross_border_transfer}
                    />
                  </Labeled>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={assetForm.cross_border_transfer}
                      onChange={(e) =>
                        setAssetForm((f) => ({ ...f, cross_border_transfer: e.target.checked }))
                      }
                    />
                    Cross-border transfer (Sec 16)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={assetForm.dpia_required}
                      onChange={(e) => setAssetForm((f) => ({ ...f, dpia_required: e.target.checked }))}
                    />
                    DPIA required (Sec 10)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={assetForm.contains_child_data}
                      onChange={(e) =>
                        setAssetForm((f) => ({ ...f, contains_child_data: e.target.checked }))
                      }
                    />
                    Contains children&apos;s data (Sec 9)
                  </label>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-end">
              <button onClick={() => setShowAssetModal(false)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer">
                Cancel
              </button>
              <button
                onClick={saveAsset}
                disabled={savingAsset}
                className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {savingAsset ? 'Saving…' : editingAssetId ? 'Save Changes' : 'Add Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Detail + Field Classification Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-[var(--border-default)]">
            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{detail.name}</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {assetTypeLabel(detail.asset_type)}
                  {detail.data_source_name ? ` · Source: ${detail.data_source_name}` : ''}
                  {detail.location ? ` · ${detail.location}` : ''}
                  {detail.record_count ? ` · ${detail.record_count} records` : ''}
                  {detail.last_imported_at
                    ? ` · Imported ${new Date(detail.last_imported_at).toLocaleDateString()}`
                    : ''}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {detail.data_categories.length > 0 && (
                <div>
                  <div className="text-sm text-[var(--text-secondary)] mb-2">Data Categories</div>
                  <div className="flex flex-wrap gap-2">
                    {detail.data_categories.map((cat) => (
                      <span key={cat} className="px-2 py-1 rounded bg-[var(--status-info-bg)] text-[var(--status-info)] text-sm">{cat}</span>
                    ))}
                  </div>
                </div>
              )}

              {(detail.cross_border_transfer || detail.dpia_required || detail.contains_child_data) && (
                <div className="flex flex-wrap gap-2">
                  {detail.cross_border_transfer && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs">
                      <Globe className="size-3" /> Cross-border {detail.country ? `· ${detail.country}` : ''}
                      {detail.transfer_mechanism ? ` · ${detail.transfer_mechanism}` : ''}
                    </span>
                  )}
                  {detail.dpia_required && (
                    <span className="px-2 py-1 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs">DPIA Required</span>
                  )}
                  {detail.contains_child_data && (
                    <span className="px-2 py-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-xs">Children&apos;s Data</span>
                  )}
                </div>
              )}

              {/* Used In panel */}
              <div className="rounded-lg border border-[var(--border-default)] p-4 space-y-4">
                <div className="text-sm font-medium">Used In</div>
                {usageMap && (
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded bg-[var(--surface-raised)] p-2">
                      <div className="font-semibold text-[var(--text-primary)]">{usageMap.purpose_count}</div>
                      <div className="text-[var(--text-tertiary)]">Purposes</div>
                    </div>
                    <div className="rounded bg-[var(--surface-raised)] p-2">
                      <div className="font-semibold text-[var(--text-primary)]">{usageMap.processor_count}</div>
                      <div className="text-[var(--text-tertiary)]">Processors</div>
                    </div>
                    <div className="rounded bg-[var(--surface-raised)] p-2">
                      <div className="font-semibold text-[var(--text-primary)]">{usageMap.activity_count}</div>
                      <div className="text-[var(--text-tertiary)]">Activities</div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-2">Linked Processors</div>
                  {processorLinks.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">No processors linked.</p>
                  ) : (
                    <ul className="space-y-1 mb-2">
                      {processorLinks.map((p) => (
                        <li key={p.id} className="flex items-center justify-between text-xs rounded border border-[var(--border-default)] px-2 py-1.5">
                          <span>{p.processor_name} <span className="text-[var(--text-tertiary)]">· DPA {p.processor_dpa_status ?? 'none'}</span></span>
                          <button onClick={() => void handleUnlinkProcessor(p.id)} className="text-[var(--status-danger)] hover:underline">Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <select
                      className={`${inputCls} flex-1 text-xs`}
                      value={linkProcessorId}
                      onChange={(e) => setLinkProcessorId(e.target.value)}
                    >
                      <option value="">— Add processor —</option>
                      {allProcessors
                        .filter((p) => !processorLinks.some((l) => l.processor_id === p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <button
                      onClick={() => void handleLinkProcessor()}
                      disabled={!linkProcessorId || linkingProcessor}
                      className="px-3 py-1.5 text-xs rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-50"
                    >
                      Link
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[var(--text-secondary)] mb-2">Linked Processing Activities</div>
                  {activityLinks.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)] mb-2">No activities linked.</p>
                  ) : (
                    <ul className="space-y-1 mb-2">
                      {activityLinks.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-xs rounded border border-[var(--border-default)] px-2 py-1.5">
                          <span>{a.activity_title} {a.activity_ref ? <span className="text-[var(--text-tertiary)]">· {a.activity_ref}</span> : null}</span>
                          <button onClick={() => void handleUnlinkActivity(a.id)} className="text-[var(--status-danger)] hover:underline">Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <select
                      className={`${inputCls} flex-1 text-xs`}
                      value={linkActivityId}
                      onChange={(e) => setLinkActivityId(e.target.value)}
                    >
                      <option value="">— Add activity —</option>
                      {allActivities
                        .filter((a) => !activityLinks.some((l) => l.activity_id === a.id))
                        .map((a) => (
                          <option key={a.id} value={a.id}>{a.title}</option>
                        ))}
                    </select>
                    <button
                      onClick={() => void handleLinkActivity()}
                      disabled={!linkActivityId || linkingActivity}
                      className="px-3 py-1.5 text-xs rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-50"
                    >
                      Link
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Fields / Columns ({detail.fields.length})</div>
                </div>
                {detail.fields.length === 0 ? (
                  <div className="text-sm text-[var(--text-tertiary)] py-3">
                    No fields classified yet. Add columns below and tag each as personal or sensitive.
                  </div>
                ) : (
                  <div className="border border-[var(--border-default)] rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface-raised)]">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Field</th>
                          <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Type</th>
                          <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Classification</th>
                          <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Source</th>
                          <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Safeguard</th>
                          <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Purposes</th>
                          <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">PII Category</th>
                          <th className="py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fieldsPager.slice.map((field) => (
                          <tr key={field.id} className="border-t border-[var(--border-default)]/40">
                            <td className="py-2 px-3 font-mono text-xs">
                              {field.name}
                              {field.is_child_data && (
                                <span className="ml-2 inline-flex px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[10px]">
                                  child
                                </span>
                              )}
                              {field.mandatory_retention && (
                                <span
                                  title={`Legal retention hold — kept ≥ ${field.mandatory_retention_days ?? 365} days`}
                                  className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[10px] font-medium"
                                >
                                  hold {field.mandatory_retention_days ?? 365}d
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[var(--text-secondary)]">{field.data_type ?? '—'}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${classificationBadge(field.classification)}`}>
                                {CLASSIFICATIONS.find((c) => c.value === field.classification)?.label}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[10px] text-[var(--text-secondary)]">
                                {CLASSIFICATION_SOURCE_LABELS[field.classification_source] ?? field.classification_source}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-xs text-[var(--text-secondary)]">
                              {SECURITY_SAFEGUARDS.find((s) => s.value === field.security_safeguard)?.label ?? '—'}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {(fieldPurposeMap.get(field.id) ?? []).length === 0 ? (
                                  <span className="text-[var(--text-tertiary)]">—</span>
                                ) : (
                                  (fieldPurposeMap.get(field.id) ?? []).map((p) => (
                                    <StatusPill
                                      key={`${field.id}-${p.name}`}
                                      status={
                                        p.legal_basis === 'legitimate_use' ? 'legit-use' : 'consent'
                                      }
                                      label={p.name}
                                      className="text-[10px] max-w-[120px] truncate"
                                    />
                                  ))
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-[var(--text-secondary)]">{field.pii_category ?? '—'}</td>
                            <td className="py-2 px-3 text-right">
                              <button onClick={() => handleDeleteField(field.id)} className="text-[var(--text-tertiary)] hover:text-[var(--status-danger)]" title="Remove field">
                                <Trash2 className="size-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePager
                      page={fieldsPager.page}
                      pageCount={fieldsPager.pageCount}
                      total={fieldsPager.total}
                      pageSize={fieldsPager.pageSize}
                      onPage={fieldsPager.setPage}
                    />
                  </div>
                )}

                {/* Add field row */}
                <div className="mt-3 grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Field name</label>
                    <input className={inputCls} value={fieldForm.name} onChange={(e) => setFieldForm((f) => ({ ...f, name: e.target.value }))} placeholder="email" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Type</label>
                    <input className={inputCls} value={fieldForm.data_type} onChange={(e) => setFieldForm((f) => ({ ...f, data_type: e.target.value }))} placeholder="varchar" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Classification</label>
                    <select className={inputCls} value={fieldForm.classification} onChange={(e) => setFieldForm((f) => ({ ...f, classification: e.target.value as FieldClassification }))}>
                      {CLASSIFICATIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Safeguard</label>
                    <select className={inputCls} value={fieldForm.security_safeguard} onChange={(e) => setFieldForm((f) => ({ ...f, security_safeguard: e.target.value as SecuritySafeguard }))}>
                      {SECURITY_SAFEGUARDS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">PII category</label>
                    <input className={inputCls} value={fieldForm.pii_category} onChange={(e) => setFieldForm((f) => ({ ...f, pii_category: e.target.value }))} placeholder="email" />
                  </div>
                  <div className="col-span-2">
                    <button
                      onClick={handleAddField}
                      disabled={savingField}
                      className="w-full px-3 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      Add field
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fieldForm.is_child_data}
                      onChange={(e) => setFieldForm((f) => ({ ...f, is_child_data: e.target.checked }))}
                    />
                    Children&apos;s data field (Sec 9)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fieldForm.mandatory_retention}
                      onChange={(e) => setFieldForm((f) => ({ ...f, mandatory_retention: e.target.checked }))}
                    />
                    Legal retention hold (logs ≥ 1 year)
                  </label>
                  {fieldForm.mandatory_retention && (
                    <span className="flex items-center gap-1">
                      min
                      <input
                        type="number"
                        className="w-20 px-2 py-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)]"
                        value={fieldForm.mandatory_retention_days}
                        onChange={(e) => setFieldForm((f) => ({ ...f, mandatory_retention_days: e.target.value }))}
                      />
                      days
                    </span>
                  )}
                </div>
              </div>

              {/* Audit log */}
              <div className="rounded-lg border border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => setShowAuditLog((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                >
                  Audit Log ({auditLog.length})
                  {showAuditLog ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
                {showAuditLog && (
                  <div className="border-t border-[var(--border-default)]">
                    {auditLog.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-[var(--text-tertiary)]">No audit entries yet.</p>
                    ) : (
                      <>
                        <table className="w-full text-xs">
                          <thead className="bg-[var(--surface-raised)] sticky top-0">
                            <tr>
                              <th className="text-left py-2 px-3 font-medium">When</th>
                              <th className="text-left py-2 px-3 font-medium">Action</th>
                              <th className="text-left py-2 px-3 font-medium">Field</th>
                              <th className="text-left py-2 px-3 font-medium">Change</th>
                              <th className="text-left py-2 px-3 font-medium">Actor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditPager.slice.map((entry) => (
                              <tr key={entry.id} className="border-t border-[var(--border-default)]/40">
                                <td className="py-2 px-3 text-[var(--text-tertiary)]">
                                  {new Date(entry.created_at).toLocaleString()}
                                </td>
                                <td className="py-2 px-3">{entry.action}</td>
                                <td className="py-2 px-3">{entry.field_name ?? '—'}</td>
                                <td className="py-2 px-3 text-[var(--text-secondary)]">
                                  {entry.old_value && entry.new_value
                                    ? `${entry.old_value} → ${entry.new_value}`
                                    : entry.new_value ?? entry.old_value ?? '—'}
                                </td>
                                <td className="py-2 px-3">{entry.actor_email ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <TablePager
                          page={auditPager.page}
                          pageCount={auditPager.pageCount}
                          total={auditPager.total}
                          pageSize={auditPager.pageSize}
                          onPage={auditPager.setPage}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-[var(--border-default)] flex gap-2 justify-between">
              <button onClick={() => handleDeleteAsset(detail)} className="px-4 py-2 text-sm rounded-md border border-[var(--status-danger)] text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] cursor-pointer">
                Delete Asset
              </button>
              <div className="flex gap-2">
                <button onClick={() => openEdit(detail)} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer">
                  Edit Asset
                </button>
                <button onClick={() => setDetail(null)} className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 cursor-pointer">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPlaybook && (
        <DataInventoryPlaybook onClose={() => setShowPlaybook(false)} orgId={orgId} />
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]';

function Labeled({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'info' | 'danger' | 'warning';
}): ReactElement {
  const toneClass =
    tone === 'danger'
      ? 'text-[var(--status-danger)]'
      : tone === 'warning'
        ? 'text-[var(--status-warning)]'
        : tone === 'info'
          ? 'text-[var(--status-info)]'
          : 'text-[var(--text-primary)]';
  return (
    <div className="p-4 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-[var(--text-secondary)] mt-1">{label}</div>
    </div>
  );
}

