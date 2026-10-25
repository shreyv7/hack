import type { ReactElement, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Check,
  Clock,
  Cloud,
  Database,
  FileUp,
  FolderOpen,
  Globe,
  Loader2,
  Plug,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DataSourcesPlaybook } from '@/app/components/data-sources/DataSourcesPlaybook';
import { SourceDetailDrawer } from '@/app/components/data-sources/SourceDetailDrawer';
import { notify } from '@/app/utils/notify';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination, TABLE_PAGE_SIZE } from '@/app/hooks/useClientPagination';
import { Button } from '@/app/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  createDataSource,
  deleteDataSource,
  fetchDataSources,
  testDataSourceConnection,
  updateDataSource,
  uploadDataSourceFile,
} from '@/lib/api/dataSources';
import { importSchemaFromSource } from '@/lib/api/dataInventory';
import { fetchProcessors } from '@/lib/api/workspace';
import type { DataProcessor } from '@/types/workspace';
import {
  categoryMeta,
  connectorMeta,
  ENGINE_OPTIONS,
  isScannableSource,
  MAX_UPLOAD_BYTES,
  SOURCE_CATALOG,
  sourceCapabilities,
  defaultIntegrationMode,
  effectiveIntegrationMode,
} from '@/types/dataSource';
import type {
  CategoryMeta,
  ConnectorMeta,
  ConnFieldKind,
  DataSource,
  DataSourceCreate,
  DataSourceStatus,
  DataSourceUpdate,
  IntegrationMode,
  SourceCriticality,
  SourceEnvironment,
} from '@/types/dataSource';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

const FILTERS = ['All', 'Connected', 'Errors', 'Pending', 'Needs review'] as const;
type SourceFilter = (typeof FILTERS)[number];
type SortOption = 'name' | 'status' | 'last_tested';

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  database: Database,
  cloud: Cloud,
  files: FolderOpen,
  api: Plug,
  logs: BarChart3,
  upload: Upload,
};

const ENV_LABELS: Record<SourceEnvironment, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  test: 'Test',
};

interface StatusDisplay {
  text: string;
  colorClass: string;
  bgClass: string;
  icon: LucideIcon | null;
}

function getStatusDisplay(status: DataSourceStatus): StatusDisplay {
  if (status === 'connected') {
    return {
      text: 'Connected',
      colorClass: 'text-[var(--status-success)]',
      bgClass: 'bg-[var(--status-success-bg)]',
      icon: Check,
    };
  }
  if (status === 'error') {
    return {
      text: 'Error',
      colorClass: 'text-[var(--status-danger)]',
      bgClass: 'bg-[var(--status-danger-bg)]',
      icon: AlertCircle,
    };
  }
  return {
    text: 'Pending',
    colorClass: 'text-[var(--status-warning)]',
    bgClass: 'bg-[var(--status-warning-bg)]',
    icon: Clock,
  };
}

function formatTested(iso: string | null): string {
  if (!iso) return 'Never tested';
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'Tested just now';
  if (mins < 60) return `Tested ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Tested ${hours}h ago`;
  return `Tested ${Math.round(hours / 24)}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Default labels/placeholders for each connection field; categories may override.
const FIELD_DEFAULTS: Record<ConnFieldKind, { label: string; placeholder?: string }> = {
  host: { label: 'Host', placeholder: 'db.example.com' },
  port: { label: 'Port', placeholder: '5432' },
  database: { label: 'Database name', placeholder: 'appdb' },
  username: { label: 'Username', placeholder: 'readonly_user' },
  password: { label: 'Password', placeholder: '••••••••' },
  region: { label: 'Region', placeholder: 'ap-south-1' },
  ssl: { label: 'SSL' },
};

const EMPTY_FORM: DataSourceCreate = {
  name: '',
  source_type: '',
  category: null,
  region: '',
  host: '',
  port: undefined,
  database_name: '',
  username: '',
  password: '',
  ssl_enabled: false,
  description: '',
  integration_mode: undefined,
  environment: 'production',
  criticality: 'medium',
  encryption_at_rest: false,
  tags: [],
};

type Step = 'category' | 'configure';

/**
 * Data Sources — the registry of where an organization's personal data lives.
 * Backed by the /data-sources API; supports create (typed connectors + file
 * upload), test-connection, schema scan, and delete.
 */
export function DataSources(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [processors, setProcessors] = useState<DataProcessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<SourceFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [detailSource, setDetailSource] = useState<DataSource | null>(null);
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<CategoryMeta | null>(null);
  const [form, setForm] = useState<DataSourceCreate>(EMPTY_FORM);
  const [advancedJson, setAdvancedJson] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sourceRows, processorRows] = await Promise.all([
        fetchDataSources(orgId),
        fetchProcessors(orgId).catch(() => [] as DataProcessor[]),
      ]);
      setSources(sourceRows);
      setProcessors(processorRows);
    } catch (error) {
      notify(`Failed to load data sources: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => ({
    total: sources.length,
    connected: sources.filter((s) => s.status === 'connected').length,
    errors: sources.filter((s) => s.status === 'error').length,
    outsideResidency: sources.filter((s) => s.residency_flag === 'outside_approved_residency').length,
    needsRetest: sources.filter((s) => s.needs_retest).length,
    unowned: sources.filter((s) => !s.owner_name && s.environment === 'production').length,
  }), [sources]);

  const filtered = useMemo(() => {
    let rows = sources;
    if (selectedFilter === 'Connected') rows = rows.filter((s) => s.status === 'connected');
    else if (selectedFilter === 'Errors') rows = rows.filter((s) => s.status === 'error');
    else if (selectedFilter === 'Pending') rows = rows.filter((s) => s.status === 'pending');
    else if (selectedFilter === 'Needs review') {
      rows = rows.filter(
        (s) =>
          s.needs_retest ||
          s.residency_flag === 'outside_approved_residency' ||
          (!s.owner_name && s.environment === 'production'),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.source_type.toLowerCase().includes(q) ||
          (s.region?.toLowerCase().includes(q) ?? false) ||
          (s.owner_name?.toLowerCase().includes(q) ?? false),
      );
    }
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'last_tested') {
        const at = a.last_tested_at ? new Date(a.last_tested_at).getTime() : 0;
        const bt = b.last_tested_at ? new Date(b.last_tested_at).getTime() : 0;
        return bt - at;
      }
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [sources, selectedFilter, searchQuery, sortBy]);

  const sourcesPager = useClientPagination(
    filtered,
    TABLE_PAGE_SIZE,
    `${selectedFilter}|${searchQuery}|${sortBy}`,
  );

  const openModal = () => {
    setEditingSource(null);
    setForm(EMPTY_FORM);
    setAdvancedJson('');
    setUploadFile(null);
    setCategory(null);
    setStep('category');
    setShowAddModal(true);
  };

  const openEditModal = (source: DataSource) => {
    setEditingSource(source);
    setDetailSource(null);
    const cat = source.category ? categoryMeta(source.category) : undefined;
    setCategory(cat ?? null);
    setForm({
      name: source.name,
      source_type: source.source_type,
      category: source.category,
      region: source.region,
      description: source.description,
      host: source.host,
      port: source.port ?? undefined,
      database_name: source.database_name,
      username: source.username,
      ssl_enabled: source.ssl_enabled,
      extra_config: source.extra_config,
      integration_mode: source.integration_mode,
      owner_name: source.owner_name,
      environment: source.environment,
      criticality: source.criticality,
      data_processor_id: source.data_processor_id,
      encryption_at_rest: source.encryption_at_rest,
      tags: source.tags ?? [],
    });
    setAdvancedJson('');
    setStep('configure');
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingSource(null);
  };

  const pickCategory = (cat: CategoryMeta) => {
    setCategory(cat);
    setAdvancedJson('');
    // Pre-select the first connector in the category (single one for upload).
    const first = cat.connectors[0];
    setForm((f) => ({ ...f, source_type: first.value, category: cat.value, extra_config: {} }));
    setStep('configure');
  };


  const handleCreate = async () => {
    if (!category) return;

    // --- File upload flow ---
    if (category.value === 'upload') {
      if (editingSource) {
        if (!form.name.trim()) {
          notify('Please enter a name for the data source.');
          return;
        }
        setSaving(true);
        try {
          await updateDataSource(
            editingSource.id,
            {
              name: form.name.trim(),
              description: form.description || null,
              owner_name: form.owner_name || null,
              environment: form.environment,
              criticality: form.criticality,
              data_processor_id: form.data_processor_id || null,
            },
            orgId,
          );
          notify(`Updated "${form.name.trim()}".`);
          closeModal();
          await load();
        } catch (error) {
          notify(`Update failed: ${(error as Error).message}`);
        } finally {
          setSaving(false);
        }
        return;
      }
      if (!uploadFile) {
        notify('Please choose a file to upload.');
        return;
      }
      setSaving(true);
      try {
        await uploadDataSourceFile(
          uploadFile,
          { name: form.name.trim() || undefined, description: form.description || undefined },
          orgId,
        );
        notify(`Uploaded "${form.name.trim() || uploadFile.name}".`);
        closeModal();
        await load();
      } catch (error) {
        notify(`Upload failed: ${(error as Error).message}`);
      } finally {
        setSaving(false);
      }
      return;
    }

    // --- Connection flow ---
    if (!form.name.trim()) {
      notify('Please enter a name for the data source.');
      return;
    }
    if (!form.source_type) {
      notify('Please choose a source type.');
      return;
    }

    // Merge advanced JSON config with any engine chosen in the dropdown.
    let extra: Record<string, unknown> = {};
    if (advancedJson.trim()) {
      try {
        const parsed = JSON.parse(advancedJson);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        extra = parsed as Record<string, unknown>;
      } catch {
        notify('Advanced configuration must be a valid JSON object.');
        return;
      }
    }
    extra = { ...extra, ...(form.extra_config ?? {}) };

    const conn = connectorMeta(form.source_type);
    if (conn.engineSelect && !extra.engine) {
      notify('Please select a database engine.');
      return;
    }

    setSaving(true);
    try {
      const payload: DataSourceCreate = {
        ...form,
        category: category.value,
        region: form.region || null,
        host: form.host || null,
        database_name: form.database_name || null,
        username: form.username || null,
        password: form.password || null,
        description: form.description || null,
        port: form.port ? Number(form.port) : null,
        extra_config: extra,
      };
      if (editingSource) {
        const updatePayload: DataSourceUpdate = { ...payload };
        if (!updatePayload.password) delete updatePayload.password;
        await updateDataSource(editingSource.id, updatePayload, orgId);
        notify(`Data source "${form.name}" updated.`);
      } else {
        await createDataSource(payload, orgId);
        notify(`Data source "${form.name}" added.`);
      }
      closeModal();
      await load();
    } catch (error) {
      notify(`Failed to save source: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (source: DataSource) => {
    setTestingId(source.id);
    try {
      const result = await testDataSourceConnection(source.id, orgId);
      notify(result.message);
      await load();
    } catch (error) {
      notify(`Test failed: ${(error as Error).message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleScanSchema = async (source: DataSource) => {
    setScanningId(source.id);
    try {
      const result = await importSchemaFromSource(source.id, orgId);
      notify(result.message);
    } catch (error) {
      notify(`Schema scan failed: ${(error as Error).message}`);
    } finally {
      setScanningId(null);
    }
  };

  const handleDelete = async (source: DataSource) => {
    if (!window.confirm(`Delete data source "${source.name}"? This cannot be undone.`)) return;
    try {
      await deleteDataSource(source.id, orgId);
      notify(`Deleted "${source.name}".`);
      await load();
    } catch (error) {
      notify(`Failed to delete: ${(error as Error).message}`);
    }
  };

  return (
    <div className="min-h-full">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold mb-2 text-[var(--text-primary)]">Data Sources</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Register databases, cloud stores, files, APIs and logs so they can be inventoried,
              scanned, and governed
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="md" onClick={() => setShowPlaybook(true)}>
              <BookOpen className="w-4 h-4 mr-1.5" />
              Playbook
            </Button>
            <Button variant="primary" size="md" onClick={openModal}>
              + Add Source
            </Button>
          </div>
        </div>

        {!loading && sources.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Connected', value: stats.connected, accent: 'success' },
              { label: 'Errors', value: stats.errors, accent: stats.errors ? 'danger' : undefined },
              { label: 'Outside residency', value: stats.outsideResidency, accent: stats.outsideResidency ? 'warning' : undefined },
              { label: 'Needs re-test', value: stats.needsRetest, accent: stats.needsRetest ? 'warning' : undefined },
              { label: 'Unowned (prod)', value: stats.unowned, accent: stats.unowned ? 'warning' : undefined },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3"
              >
                <div className="text-xs text-[var(--text-tertiary)]">{card.label}</div>
                <div
                  className={cn(
                    'text-2xl font-semibold mt-1',
                    card.accent === 'success' && 'text-[var(--status-success)]',
                    card.accent === 'danger' && 'text-[var(--status-danger)]',
                    card.accent === 'warning' && 'text-[var(--status-warning)]',
                    !card.accent && 'text-[var(--text-primary)]',
                  )}
                >
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="search"
              placeholder="Search sources…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(inputCls, 'pl-9')}
            />
          </div>
          <select
            className={cn(inputCls, 'w-auto')}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="name">Sort: Name</option>
            <option value="status">Sort: Status</option>
            <option value="last_tested">Sort: Last tested</option>
          </select>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setSelectedFilter(filter)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  filter === selectedFilter
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]',
                )}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[var(--text-secondary)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading data sources…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-[var(--surface-raised)] mb-4">
              <Plug className="w-6 h-6 text-[var(--text-tertiary)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
              {sources.length === 0 ? 'No data sources yet' : 'None match this filter'}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md">
              {sources.length === 0
                ? 'Add your first source to start cataloguing where personal data lives.'
                : 'Try a different filter to see your other sources.'}
            </p>
            {sources.length === 0 && (
              <Button variant="primary" size="md" onClick={openModal}>
                + Add Source
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {sourcesPager.slice.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  testing={testingId === source.id}
                  scanning={scanningId === source.id}
                  onTest={() => handleTest(source)}
                  onScan={() => handleScanSchema(source)}
                  onDelete={() => handleDelete(source)}
                  onViewDetails={() => setDetailSource(source)}
                  onEdit={() => openEditModal(source)}
                />
              ))}
            </div>
            <TablePager
              page={sourcesPager.page}
              pageCount={sourcesPager.pageCount}
              total={sourcesPager.total}
              pageSize={sourcesPager.pageSize}
              onPage={sourcesPager.setPage}
            />
          </>
        )}
      </div>

      {showPlaybook && (
        <DataSourcesPlaybook onClose={() => setShowPlaybook(false)} onAddSource={openModal} />
      )}

      {detailSource && (
        <SourceDetailDrawer
          source={detailSource}
          orgId={orgId}
          onClose={() => setDetailSource(null)}
          onEdit={() => openEditModal(detailSource)}
        />
      )}

      {showAddModal && (
        <AddSourceModal
          step={step}
          category={category}
          form={form}
          setForm={setForm}
          advancedJson={advancedJson}
          setAdvancedJson={setAdvancedJson}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          saving={saving}
          editing={Boolean(editingSource)}
          processors={processors}
          onPickCategory={pickCategory}
          onBack={() => setStep('category')}
          onClose={closeModal}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

// --- Source card ------------------------------------------------------------

function SourceCard({
  source,
  testing,
  scanning,
  onTest,
  onScan,
  onDelete,
  onViewDetails,
  onEdit,
}: {
  source: DataSource;
  testing: boolean;
  scanning: boolean;
  onTest: () => void;
  onScan: () => void;
  onDelete: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
}): ReactElement {
  const status = getStatusDisplay(source.status);
  const StatusIcon = status.icon;
  const meta = connectorMeta(source.source_type);
  const cat = source.category ? categoryMeta(source.category) : undefined;
  const isUpload = source.category === 'upload';
  const canImport = sourceCapabilities(source).autoInventory;
  const sizeBytes = Number(source.extra_config?.size_bytes ?? 0);
  const fileName = source.extra_config?.original_filename as string | undefined;
  const CategoryIcon = source.category ? CATEGORY_ICON_MAP[source.category] ?? Database : Database;

  return (
    <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] hover:border-[var(--brand-primary)]/30 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[var(--surface-raised)] shrink-0">
            <CategoryIcon className="w-6 h-6 text-[var(--brand-primary)]" />
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={onViewDetails}
              className="text-base font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)] text-left truncate block w-full"
            >
              {source.name}
            </button>
            <p className="text-xs text-[var(--text-tertiary)] truncate">
              {meta.label}
              {source.region ? ` · ${source.region}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            title="Edit source"
            className="p-1 rounded hover:bg-black/5 transition-colors text-xs text-[var(--text-tertiary)]"
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            title="Delete source"
            className="p-1 rounded hover:bg-black/5 transition-colors"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
            status.bgClass,
            status.colorClass,
          )}
        >
          {StatusIcon && <StatusIcon className="w-3 h-3" />}
          {status.text}
        </div>
        {cat && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)]">
            {cat.label}
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)]">
          {ENV_LABELS[source.environment]}
        </span>
        {(source.criticality === 'high' || source.criticality === 'critical') && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--status-danger-bg)] text-[var(--status-danger)] capitalize">
            {source.criticality}
          </span>
        )}
        {source.residency_flag === 'outside_approved_residency' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
            <Globe className="w-3 h-3" /> Residency
          </span>
        )}
        {source.needs_retest && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
            <Clock className="w-3 h-3" /> Re-test
          </span>
        )}
        <span
          title={
            effectiveIntegrationMode(source) === 'read_write'
              ? 'Masking, anonymization, and deletion actions are permitted (DPO-approved)'
              : 'Discovery only — scan and inventory; no destructive write actions'
          }
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
            effectiveIntegrationMode(source) === 'read_write'
              ? 'bg-[var(--status-info-bg)] text-[var(--status-info)]'
              : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]',
          )}
        >
          {effectiveIntegrationMode(source) === 'read_write' ? 'Read-write' : 'Discovery only'}
        </span>
      </div>

      {source.owner_name ? (
        <p className="text-xs text-[var(--text-secondary)] mb-3">Owner: {source.owner_name}</p>
      ) : source.environment === 'production' ? (
        <p className="text-xs text-[var(--status-warning)] mb-3">No owner assigned</p>
      ) : null}

      {/* What this source supports across the platform. */}
      <div className="mb-4 flex items-center gap-1.5 flex-wrap">
        {(() => {
          const caps = sourceCapabilities(source);
          const chips: { label: string; on: boolean; title: string }[] = [
            { label: 'Auto-inventory', on: caps.autoInventory, title: 'Import table/column structure into Data Inventory' },
            { label: 'PII scan', on: caps.scan, title: 'Scan actual values to detect and classify PII' },
            { label: 'Masking', on: caps.mask, title: caps.writeActions ? 'Rewrite PII values in place (SQL/MongoDB only)' : 'Requires read-write integration mode' },
            { label: 'Retention', on: caps.retention, title: caps.writeActions ? 'Delete/mask/anonymise expired rows (SQL/MongoDB only)' : 'Requires read-write integration mode' },
          ];
          return chips.map((chip) => (
            <span
              key={chip.label}
              title={chip.title}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium',
                chip.on
                  ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                  : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)] line-through',
              )}
            >
              {chip.on ? '✓' : '✗'} {chip.label}
            </span>
          ));
        })()}
      </div>

      <div className="mb-4 text-sm text-[var(--text-secondary)] min-h-[20px]">
        {isUpload ? (
          <span className="font-mono text-xs break-all">
            {fileName ?? 'Uploaded file'}
            {sizeBytes ? ` · ${formatBytes(sizeBytes)}` : ''}
          </span>
        ) : source.host ? (
          <span className="font-mono text-xs break-all">
            {source.host}
            {source.port ? `:${source.port}` : ''}
            {source.database_name ? `/${source.database_name}` : ''}
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)]">No connection details</span>
        )}
        <div className="text-xs text-[var(--text-tertiary)] mt-1">
          {formatTested(source.last_tested_at)}
        </div>
        {source.status === 'error' && source.last_error && (
          <div className="text-xs text-[var(--status-danger)] mt-1 line-clamp-2">
            {source.last_error}
          </div>
        )}
      </div>

      {!isUpload && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onViewDetails}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 bg-[var(--surface-raised)] text-[var(--text-primary)]"
          >
            Details
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 bg-[var(--brand-primary)] text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Test
          </button>
          {canImport && (
            <button
              type="button"
              onClick={onScan}
              disabled={scanning}
              title="Read this source's tables & columns into Data Inventory"
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {scanning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Scan
            </button>
          )}
        </div>
      )}
      {isUpload && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onViewDetails}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 bg-[var(--surface-raised)] text-[var(--text-primary)]"
          >
            View details
          </button>
          {canImport && (
            <button
              type="button"
              onClick={onScan}
              disabled={scanning}
              title="Import column headers from this file into Data Inventory"
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {scanning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Scan
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Add-source modal -------------------------------------------------------

function AddSourceModal({
  step,
  category,
  form,
  setForm,
  advancedJson,
  setAdvancedJson,
  uploadFile,
  setUploadFile,
  saving,
  editing,
  processors,
  onPickCategory,
  onBack,
  onClose,
  onSubmit,
}: {
  step: Step;
  category: CategoryMeta | null;
  form: DataSourceCreate;
  setForm: React.Dispatch<React.SetStateAction<DataSourceCreate>>;
  advancedJson: string;
  setAdvancedJson: (v: string) => void;
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  saving: boolean;
  editing: boolean;
  processors: DataProcessor[];
  onPickCategory: (cat: CategoryMeta) => void;
  onBack: () => void;
  onClose: () => void;
  onSubmit: () => void;
}): ReactElement {
  const isUpload = category?.value === 'upload';
  const selectedConn = connectorMeta(form.source_type);
  const isGdrive = selectedConn.customForm === 'gdrive';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-[var(--surface-card)] border border-[var(--border-default)]">
        <div className="p-6 border-b flex items-center justify-between border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            {step === 'configure' && (
              <button
                type="button"
                onClick={onBack}
                className="p-1 rounded hover:bg-black/5 text-[var(--text-tertiary)]"
                title="Back to categories"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {step === 'category'
                ? editing
                  ? 'Edit Data Source'
                  : 'Add New Data Source'
                : `${category?.label}${editing ? ' — Edit' : ''}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            <X className="size-5" />
          </button>
        </div>

        {step === 'category' ? (
          <div className="p-6">
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              What kind of source do you want to connect?
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SOURCE_CATALOG.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => onPickCategory(cat)}
                  className="p-4 border-2 rounded-lg text-left transition-all border-[var(--border-default)] hover:border-[var(--brand-primary)] hover:bg-[var(--status-info-bg)]"
                >
                  <div className="text-2xl mb-2">{cat.emoji}</div>
                  <div className="font-medium text-sm text-[var(--text-primary)]">{cat.label}</div>
                  <div className="text-xs text-[var(--text-tertiary)] mt-1">{cat.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {!isUpload && category && (
              <div>
                <label className="block text-sm font-medium mb-3 text-[var(--text-primary)]">
                  Connector
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {category.connectors.map((conn) => (
                    <button
                      key={conn.value}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          source_type: conn.value,
                          category: category.value,
                          integration_mode:
                            f.integration_mode ?? defaultIntegrationMode(conn.value),
                        }))
                      }
                      className={cn(
                        'p-3 border-2 rounded-lg transition-all text-left',
                        form.source_type === conn.value
                          ? 'border-[var(--brand-primary)] bg-[var(--status-info-bg)]'
                          : 'border-[var(--border-default)] hover:border-[var(--brand-primary)]',
                      )}
                    >
                      <div className="text-xl mb-1">{conn.emoji}</div>
                      <div className="font-medium text-sm text-[var(--text-primary)]">
                        {conn.label}
                      </div>
                      {isScannableSource(conn.value) && (
                        <div className="text-[10px] text-[var(--status-success)] mt-0.5">
                          Schema scan
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isUpload ? (
              editing ? (
                <UploadEditPanel form={form} setForm={setForm} processors={processors} />
              ) : (
                <UploadPanel
                  form={form}
                  setForm={setForm}
                  uploadFile={uploadFile}
                  setUploadFile={setUploadFile}
                />
              )
            ) : isGdrive ? (
              <GoogleDrivePanel
                connector={selectedConn}
                form={form}
                setForm={setForm}
              />
            ) : (
              <ConnectionFields
                category={category}
                connector={selectedConn}
                form={form}
                setForm={setForm}
                advancedJson={advancedJson}
                setAdvancedJson={setAdvancedJson}
                processors={processors}
                editing={editing}
              />
            )}
          </div>
        )}

        {step === 'configure' && (
          <div className="p-6 border-t flex gap-2 justify-end border-[var(--border-default)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border transition-colors hover:bg-black/5 border-[var(--border-default)] text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <Button variant="primary" size="md" onClick={onSubmit} disabled={saving}>
              {saving
                ? editing
                  ? 'Saving…'
                  : isUpload
                    ? 'Uploading…'
                    : 'Saving…'
                : editing
                  ? 'Save changes'
                  : isUpload
                    ? 'Upload'
                    : 'Add Source'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Connection fields ------------------------------------------------------

function ConnectionFields({
  category,
  connector,
  form,
  setForm,
  advancedJson,
  setAdvancedJson,
  processors,
  editing,
}: {
  category: CategoryMeta | null;
  connector: ConnectorMeta;
  form: DataSourceCreate;
  setForm: React.Dispatch<React.SetStateAction<DataSourceCreate>>;
  advancedJson: string;
  setAdvancedJson: (v: string) => void;
  processors: DataProcessor[];
  editing: boolean;
}): ReactElement {
  if (!category) return <></>;
  const fields = category.fields;
  const labelFor = (kind: ConnFieldKind) => category.labels?.[kind] ?? FIELD_DEFAULTS[kind];

  const scannable = isScannableSource(form.source_type);
  const engine = (form.extra_config?.engine as string | undefined) ?? '';
  const setEngine = (value: string) =>
    setForm((f) => ({ ...f, extra_config: { ...(f.extra_config ?? {}), engine: value } }));

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name *">
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Production Postgres"
          />
        </Field>

        {connector.engineSelect && (
          <Field label="Database engine *">
            <select className={inputCls} value={engine} onChange={(e) => setEngine(e.target.value)}>
              <option value="">Select engine…</option>
              {ENGINE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {fields.includes('host') && (
          <Field label={labelFor('host').label}>
            <input
              className={inputCls}
              value={form.host ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              placeholder={labelFor('host').placeholder}
            />
          </Field>
        )}
        {fields.includes('port') && (
          <Field label={labelFor('port').label}>
            <input
              type="number"
              className={inputCls}
              value={form.port ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, port: e.target.value ? Number(e.target.value) : undefined }))
              }
              placeholder={labelFor('port').placeholder}
            />
          </Field>
        )}
        {fields.includes('database') && (
          <Field label={labelFor('database').label}>
            <input
              className={inputCls}
              value={form.database_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, database_name: e.target.value }))}
              placeholder={labelFor('database').placeholder}
            />
          </Field>
        )}
        {fields.includes('region') && (
          <Field label={labelFor('region').label}>
            <input
              className={inputCls}
              value={form.region ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder={labelFor('region').placeholder}
            />
          </Field>
        )}
        {fields.includes('username') && (
          <Field label={labelFor('username').label}>
            <input
              className={inputCls}
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder={labelFor('username').placeholder}
            />
          </Field>
        )}
        {fields.includes('password') && (
          <Field label={editing ? `${labelFor('password').label} (leave blank to keep)` : labelFor('password').label}>
            <input
              type="password"
              className={inputCls}
              value={form.password ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={editing ? 'Unchanged if empty' : labelFor('password').placeholder}
            />
          </Field>
        )}
        {fields.includes('ssl') && (
          <Field label={labelFor('ssl').label}>
            <label className="flex items-center gap-2 h-[38px] text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.ssl_enabled ?? false}
                onChange={(e) => setForm((f) => ({ ...f, ssl_enabled: e.target.checked }))}
              />
              Require SSL
            </label>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Data owner">
          <input
            className={inputCls}
            value={form.owner_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value || null }))}
            placeholder="e.g. Platform team / Jane Doe"
          />
        </Field>
        <Field label="Environment">
          <select
            className={inputCls}
            value={form.environment ?? 'production'}
            onChange={(e) =>
              setForm((f) => ({ ...f, environment: e.target.value as SourceEnvironment }))
            }
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
            <option value="test">Test</option>
          </select>
        </Field>
        <Field label="Criticality">
          <select
            className={inputCls}
            value={form.criticality ?? 'medium'}
            onChange={(e) =>
              setForm((f) => ({ ...f, criticality: e.target.value as SourceCriticality }))
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
        <Field label="Data processor (vendor)">
          <select
            className={inputCls}
            value={form.data_processor_id ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                data_processor_id: e.target.value || null,
              }))
            }
          >
            <option value="">None — operated in-house</option>
            {processors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Encryption at rest">
          <label className="flex items-center gap-2 h-[38px] text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={form.encryption_at_rest ?? false}
              onChange={(e) => setForm((f) => ({ ...f, encryption_at_rest: e.target.checked }))}
            />
            Storage is encrypted at rest (§8(5))
          </label>
        </Field>
      </div>

      {scannable && (
        <Field label="Integration mode (Req 6)">
          <select
            className={inputCls}
            value={form.integration_mode ?? defaultIntegrationMode(form.source_type)}
            onChange={(e) =>
              setForm((f) => ({ ...f, integration_mode: e.target.value as IntegrationMode }))
            }
          >
            <option value="discovery">Discovery only — scan &amp; inventory (read-only)</option>
            <option value="read_write">Read-write — masking, anonymization, deletion</option>
          </select>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            DPDPA: separate discovery integrations from destructive retention actions. Use read-write
            only after DPO approval.
          </p>
        </Field>
      )}

      {connector.hint && (
        <div className="text-xs rounded-md px-3 py-2 bg-[var(--status-info-bg)] text-[var(--text-secondary)]">
          💡 {connector.hint}
        </div>
      )}

      <Field label="Description">
        <textarea
          className={cn(inputCls, 'h-20 resize-none')}
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="What does this source hold?"
        />
      </Field>

      <details className="group">
        <summary className="text-xs font-medium cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Advanced configuration (JSON)
        </summary>
        <textarea
          className={cn(inputCls, 'h-24 resize-none font-mono mt-2')}
          value={advancedJson}
          onChange={(e) => setAdvancedJson(e.target.value)}
          placeholder={'{\n  "service_account_json": "…",\n  "endpoint_url": "…"\n}'}
        />
        <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
          Optional connector-specific settings, merged into the source configuration.
        </p>
      </details>

      <div className="pt-2 text-sm text-[var(--text-secondary)]">
        {scannable ? (
          <span>
            <strong className="text-[var(--text-primary)]">Connection test &amp; schema scan</strong>{' '}
            are supported for this connector. Use “Test connection” after saving.
          </span>
        ) : (
          <span>
            <strong className="text-[var(--text-primary)]">Connection test</strong> runs a real check
            against the credentials you enter.
          </span>
        )}
      </div>
    </>
  );
}

// --- Upload edit panel (governance fields only) -----------------------------

function UploadEditPanel({
  form,
  setForm,
  processors,
}: {
  form: DataSourceCreate;
  setForm: React.Dispatch<React.SetStateAction<DataSourceCreate>>;
  processors: DataProcessor[];
}): ReactElement {
  return (
    <>
      <Field label="Name *">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={cn(inputCls, 'h-20 resize-none')}
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Data owner">
          <input
            className={inputCls}
            value={form.owner_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value || null }))}
          />
        </Field>
        <Field label="Environment">
          <select
            className={inputCls}
            value={form.environment ?? 'production'}
            onChange={(e) =>
              setForm((f) => ({ ...f, environment: e.target.value as SourceEnvironment }))
            }
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
            <option value="test">Test</option>
          </select>
        </Field>
        <Field label="Criticality">
          <select
            className={inputCls}
            value={form.criticality ?? 'medium'}
            onChange={(e) =>
              setForm((f) => ({ ...f, criticality: e.target.value as SourceCriticality }))
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
        <Field label="Data processor">
          <select
            className={inputCls}
            value={form.data_processor_id ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, data_processor_id: e.target.value || null }))
            }
          >
            <option value="">None</option>
            {processors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

// --- Upload panel -----------------------------------------------------------

function UploadPanel({
  form,
  setForm,
  uploadFile,
  setUploadFile,
}: {
  form: DataSourceCreate;
  setForm: React.Dispatch<React.SetStateAction<DataSourceCreate>>;
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      notify(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB — exceeds the 50 MB limit.`);
      return;
    }
    setUploadFile(file);
    if (!form.name.trim()) setForm((f) => ({ ...f, name: file.name }));
  };

  return (
    <>
      <Field label="Name">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Defaults to the file name"
        />
      </Field>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex flex-col items-center justify-center text-center px-6 py-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
          dragOver
            ? 'border-[var(--brand-primary)] bg-[var(--status-info-bg)]'
            : 'border-[var(--border-default)] hover:border-[var(--brand-primary)]',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0] ?? undefined)}
        />
        {uploadFile ? (
          <>
            <FileUp className="w-8 h-8 text-[var(--brand-primary)] mb-2" />
            <div className="text-sm font-medium text-[var(--text-primary)] break-all">
              {uploadFile.name}
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">
              {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB · click to replace
            </div>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-[var(--text-tertiary)] mb-2" />
            <div className="text-sm font-medium text-[var(--text-primary)]">
              Drag &amp; drop a file, or click to browse
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Maximum size 50 MB</div>
          </>
        )}
      </div>

      <Field label="Description">
        <textarea
          className={cn(inputCls, 'h-20 resize-none')}
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="What does this file contain?"
        />
      </Field>
    </>
  );
}

// --- Google Drive credentials panel ----------------------------------------

function GoogleDrivePanel({
  connector,
  form,
  setForm,
}: {
  connector: ConnectorMeta;
  form: DataSourceCreate;
  setForm: React.Dispatch<React.SetStateAction<DataSourceCreate>>;
}): ReactElement {
  const cfg = (form.extra_config ?? {}) as Record<string, unknown>;
  const setCfg = (key: string, value: string) =>
    setForm((f) => ({ ...f, extra_config: { ...(f.extra_config ?? {}), [key]: value } }));

  return (
    <>
      <Field label="Name *">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Marketing Google Drive"
        />
      </Field>

      <Field label="OAuth Client ID *">
        <input
          className={inputCls}
          value={(cfg.client_id as string) ?? ''}
          onChange={(e) => setCfg('client_id', e.target.value)}
          placeholder="xxxxx.apps.googleusercontent.com"
        />
      </Field>
      <Field label="OAuth Client Secret *">
        <input
          type="password"
          className={inputCls}
          value={(cfg.client_secret as string) ?? ''}
          onChange={(e) => setCfg('client_secret', e.target.value)}
          placeholder="GOCSPX-…"
        />
      </Field>
      <Field label="Refresh Token *">
        <input
          type="password"
          className={inputCls}
          value={form.password ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder="1//0g… (stored encrypted)"
        />
      </Field>
      <Field label="Folder ID (optional)">
        <input
          className={inputCls}
          value={(cfg.folder_id as string) ?? ''}
          onChange={(e) => setCfg('folder_id', e.target.value)}
          placeholder="Restrict to a specific Drive folder"
        />
      </Field>

      {connector.hint && (
        <div className="text-xs rounded-md px-3 py-2 bg-[var(--status-info-bg)] text-[var(--text-secondary)]">
          💡 {connector.hint}
        </div>
      )}

      <Field label="Description">
        <textarea
          className={cn(inputCls, 'h-20 resize-none')}
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="What does this Drive hold?"
        />
      </Field>

      <div className="pt-1 text-sm text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">Connection test</strong> exchanges your
        refresh token for an access token and calls the Drive API. The refresh token is encrypted
        and never returned.
      </div>
    </>
  );
}

// --- shared bits ------------------------------------------------------------

const inputCls =
  'w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]';

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">{label}</label>
      {children}
    </div>
  );
}
