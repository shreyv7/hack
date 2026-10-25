// Connector slug stored as `source_type`. Free-form string (the backend
// validates against its catalog) — see SOURCE_CATALOG below for the known set.
export type DataSourceType = string;

export type DataSourceCategory = 'database' | 'cloud' | 'files' | 'api' | 'logs' | 'upload';

export type DataSourceStatus = 'pending' | 'connected' | 'error';

/** Discovery = read-only (scan/inventory); read_write = masking, anonymization, deletion (Req 6). */
export type IntegrationMode = 'discovery' | 'read_write';

export type SourceEnvironment = 'production' | 'staging' | 'development' | 'test';

export type SourceCriticality = 'low' | 'medium' | 'high' | 'critical';

export type ResidencyFlag = 'approved' | 'outside_approved_residency' | 'unknown';

/** Concrete DB engines a cloud/other source can resolve to (extra_config.engine). */
export const ENGINE_OPTIONS: { value: string; label: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'sqlserver', label: 'Microsoft SQL Server' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'mongodb', label: 'MongoDB' },
];

// --- Connector catalog ------------------------------------------------------
// Keep in sync with backend app/models/data_source.py CONNECTOR_CATEGORY.

export interface ConnectorMeta {
  /** Stored as source_type. */
  value: DataSourceType;
  label: string;
  emoji: string;
  /** Show a "Database engine" dropdown (stored in extra_config.engine). */
  engineSelect?: boolean;
  /** Dedicated credential form (e.g. Google Drive's Client ID/Secret/Refresh Token). */
  customForm?: 'gdrive';
  /** Short guidance shown under the form for this connector. */
  hint?: string;
}

/** Which connection fields make sense for a category. */
export type ConnFieldKind = 'host' | 'port' | 'database' | 'username' | 'password' | 'region' | 'ssl';

export interface CategoryMeta {
  value: DataSourceCategory;
  label: string;
  emoji: string;
  description: string;
  connectors: ConnectorMeta[];
  /** Connection fields shown in the form (empty for upload). */
  fields: ConnFieldKind[];
  /** Per-field label/placeholder overrides for this category. */
  labels?: Partial<Record<ConnFieldKind, { label: string; placeholder?: string }>>;
}

export const SOURCE_CATALOG: CategoryMeta[] = [
  {
    value: 'database',
    label: 'Database',
    emoji: '🗄️',
    description: 'Self-managed relational & document databases',
    fields: ['host', 'port', 'database', 'username', 'password', 'ssl'],
    connectors: [
      { value: 'postgresql', label: 'PostgreSQL', emoji: '🐘' },
      { value: 'mysql', label: 'MySQL', emoji: '🐬' },
      { value: 'mariadb', label: 'MariaDB', emoji: '🦭' },
      { value: 'mongodb', label: 'MongoDB', emoji: '🍃' },
      { value: 'oracle', label: 'Oracle Database', emoji: '🔴', hint: 'Database name = Oracle service name.' },
      { value: 'sqlserver', label: 'Microsoft SQL Server', emoji: '🟦' },
      {
        value: 'sqlite',
        label: 'SQLite',
        emoji: '📦',
        hint: 'Enter the database file path in the “Database name” field.',
      },
      {
        value: 'other_db',
        label: 'Other Database',
        emoji: '🗄️',
        engineSelect: true,
        hint: 'Pick the underlying engine, then fill standard connection details.',
      },
    ],
  },
  {
    value: 'cloud',
    label: 'Cloud',
    emoji: '☁️',
    description: 'Managed / hosted database services',
    fields: ['host', 'port', 'database', 'username', 'password', 'region', 'ssl'],
    labels: { host: { label: 'Endpoint / Host', placeholder: 'mydb.abc123.ap-south-1.rds.amazonaws.com' } },
    connectors: [
      { value: 'aws_rds', label: 'AWS RDS', emoji: '🟧', engineSelect: true, hint: 'Use the RDS endpoint as host and pick the DB engine.' },
      { value: 'azure_sql', label: 'Azure SQL Database', emoji: '🟦', hint: 'Host = server.database.windows.net (SQL Server engine).' },
      { value: 'gcp_sql', label: 'Google Cloud SQL', emoji: '🟥', engineSelect: true, hint: 'Use the public IP / host and pick the DB engine.' },
      { value: 'mongodb_atlas', label: 'MongoDB Atlas', emoji: '🍃', hint: 'Host = cluster host (xxxx.mongodb.net); connects via SRV.' },
      { value: 'self_hosted', label: 'Self-Hosted (On-Premises)', emoji: '🏢', engineSelect: true },
      { value: 'other_cloud', label: 'Other', emoji: '☁️', engineSelect: true },
    ],
  },
  {
    value: 'files',
    label: 'Files',
    emoji: '📁',
    description: 'Object storage & file transfer',
    fields: ['host', 'region', 'username', 'password'],
    labels: {
      host: { label: 'Bucket / Container / Path', placeholder: 'my-bucket/prefix' },
      username: { label: 'Access Key / Account', placeholder: 'AKIA…' },
      password: { label: 'Secret Key', placeholder: '••••••••' },
    },
    connectors: [
      { value: 's3', label: 'AWS S3', emoji: '🟧', hint: 'Bucket in field above; region required. Optional Advanced: endpoint_url (MinIO), session_token.' },
      { value: 'azure_blob', label: 'Azure Blob Storage', emoji: '🟦', hint: 'Account name = username, account key = password. Or set connection_string in Advanced.' },
      { value: 'gcs', label: 'Google Cloud Storage', emoji: '🟥', hint: 'Bucket in field above; paste service-account JSON in Advanced (key: service_account_json).' },
      {
        value: 'gdrive',
        label: 'Google Drive',
        emoji: '📂',
        customForm: 'gdrive',
        hint: 'In Google Cloud Console: create a project, enable the Google Drive API, create OAuth 2.0 credentials, and obtain a refresh token (e.g. via the OAuth Playground). Then enter the Client ID, Client Secret and Refresh Token below.',
      },
      { value: 'sftp', label: 'SFTP / FTP', emoji: '🔁', hint: 'Optional Advanced: path (remote dir), private_key (PEM).' },
    ],
  },
  {
    value: 'api',
    label: 'API',
    emoji: '🔌',
    description: 'Web service endpoints',
    fields: ['host', 'username', 'password'],
    labels: {
      host: { label: 'Base URL / Endpoint', placeholder: 'https://api.example.com/v1' },
      username: { label: 'Auth Header / Key Name', placeholder: 'Authorization' },
      password: { label: 'Token / Secret', placeholder: '••••••••' },
    },
    connectors: [
      { value: 'rest', label: 'REST', emoji: '🔌', hint: 'Token sent as Bearer by default. For PII scanning, set Advanced: scan_paths (e.g. ["/users","/orders"]) to the JSON endpoints to read. Optional: health_path, verify_ssl.' },
      { value: 'graphql', label: 'GraphQL', emoji: '◼️', hint: 'We probe with a {__typename} query.' },
      { value: 'soap', label: 'SOAP', emoji: '🧼', hint: 'We fetch the endpoint’s WSDL.' },
      { value: 'other_api', label: 'Other', emoji: '🔌' },
    ],
  },
  {
    value: 'logs',
    label: 'Logs',
    emoji: '📊',
    description: 'Log & observability platforms',
    fields: ['host', 'region', 'username', 'password'],
    labels: {
      host: { label: 'Log Group / Index / Endpoint', placeholder: '/aws/lambda/my-fn' },
      username: { label: 'Access Key / Token Name', placeholder: 'AKIA…' },
      password: { label: 'Secret / Token', placeholder: '••••••••' },
    },
    connectors: [
      { value: 'cloudwatch', label: 'AWS CloudWatch', emoji: '🟧', hint: 'Access key = username, secret = password, region required.' },
      { value: 'azure_monitor', label: 'Azure Monitor', emoji: '🟦', hint: 'Advanced: tenant_id, client_id, workspace_id. Client secret = password.' },
      { value: 'gcp_logging', label: 'Google Cloud Logging', emoji: '🟥', hint: 'Advanced: service_account_json (and optional project).' },
      { value: 'splunk', label: 'Splunk', emoji: '🟩', hint: 'Host = https://host:8089. Token = password, or set username for basic auth.' },
      { value: 'other_logs', label: 'Other', emoji: '📊' },
    ],
  },
  {
    value: 'upload',
    label: 'File Upload',
    emoji: '📤',
    description: 'Upload a file directly (max 50 MB)',
    fields: [],
    connectors: [{ value: 'file_upload', label: 'File Upload', emoji: '📤' }],
  },
];

/** Max upload size enforced client-side; mirrors backend MAX_UPLOAD_BYTES. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const CONNECTOR_INDEX: Record<string, { connector: ConnectorMeta; category: CategoryMeta }> = {};
for (const category of SOURCE_CATALOG) {
  for (const connector of category.connectors) {
    CONNECTOR_INDEX[connector.value] = { connector, category };
  }
}

export function connectorMeta(type: DataSourceType): ConnectorMeta {
  return CONNECTOR_INDEX[type]?.connector ?? { value: type, label: type, emoji: '🗄️' };
}

// DB-family connectors (database + cloud categories) can be schema-/PII-scanned
// and have retention run on them once a reachable engine is configured.
const DB_FAMILY_TYPES = new Set<string>(
  SOURCE_CATALOG.filter((c) => c.value === 'database' || c.value === 'cloud').flatMap((c) =>
    c.connectors.map((conn) => conn.value),
  ),
);

/** Legacy export kept for callers that reference the original three. */
export const SCANNABLE_SOURCE_TYPES: DataSourceType[] = ['postgresql', 'mysql', 'mongodb'];

export function isScannableSource(type: DataSourceType): boolean {
  return DB_FAMILY_TYPES.has(type);
}

/** File extensions the uploaded-file PII scanner can parse (mirrors backend). */
export const SCANNABLE_UPLOAD_EXTENSIONS = [
  '.csv', '.tsv', '.xlsx', '.json', '.txt', '.log', '.pdf', '.docx',
];

/**
 * Whether a source can be PII-scanned: DB-family connectors, or an uploaded file
 * of a supported type. Use this (not isScannableSource) for the scanner picker.
 */
export function isPiiScannableSource(source: {
  source_type: DataSourceType;
  category: DataSourceCategory | null;
  extra_config?: Record<string, unknown>;
}): boolean {
  if (source.category === 'upload') {
    const name = String(source.extra_config?.original_filename ?? '').toLowerCase();
    return SCANNABLE_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext));
  }
  // Cloud file stores (S3 / GCS / Azure Blob / Google Drive / SFTP) — their files
  // are listed, downloaded and parsed at scan time. Log sources (CloudWatch /
  // Azure Monitor / GCP Logging / Splunk) have recent events fetched and scanned.
  if (source.category === 'files') return true;
  if (source.category === 'logs' && source.source_type !== 'other_logs') return true;
  // REST APIs: GET the base URL + configured paths and scan the responses.
  if (source.category === 'api' && (source.source_type === 'rest' || source.source_type === 'other_api'))
    return true;
  return DB_FAMILY_TYPES.has(source.source_type);
}

export function categoryForConnector(type: DataSourceType): CategoryMeta | undefined {
  return CONNECTOR_INDEX[type]?.category;
}

/**
 * What each module can do with a given source — the single source of truth for
 * capability badges and disabled-with-reason UI. Mirrors the backend gates:
 *  - autoInventory: DB live-schema, or file headers parsed (upload/files).
 *  - scan: isPiiScannableSource (DB-family + files + uploads + logs + REST).
 *  - mask / retention: in-place SQL/Mongo only (supports_introspection).
 */
export interface SourceCapabilities {
  autoInventory: boolean;
  scan: boolean;
  mask: boolean;
  retention: boolean;
  /** True when destructive retention/masking actions are permitted on this source. */
  writeActions: boolean;
}

export function defaultIntegrationMode(sourceType: DataSourceType): IntegrationMode {
  const cat = categoryForConnector(sourceType);
  if (cat?.value === 'database' || cat?.value === 'cloud') return 'read_write';
  return 'discovery';
}

export function effectiveIntegrationMode(source: {
  source_type: DataSourceType;
  integration_mode?: IntegrationMode | null;
}): IntegrationMode {
  return source.integration_mode ?? defaultIntegrationMode(source.source_type);
}

/** Engines the backend can resolve for DB-family sources (mirrors db_connector.ALL_ENGINES). */
const ALL_ENGINES = new Set([
  'postgresql', 'mysql', 'mariadb', 'oracle', 'sqlserver', 'sqlite', 'mongodb',
]);

/** Map cloud region or ISO code to a 3-letter country code (mirrors backend data_source_governance). */
const REGION_COUNTRY_HINTS: Record<string, string> = {
  'ap-south-1': 'IND',
  'ap-south-2': 'IND',
  'ap-southeast-1': 'SGP',
  'ap-southeast-2': 'AUS',
  'eu-west-1': 'IRL',
  'eu-central-1': 'DEU',
  'us-east-1': 'USA',
  'us-west-2': 'USA',
};

export function regionToCountryCode(region: string | null | undefined): string | null {
  if (!region) return null;
  const normalized = region.trim().toLowerCase();
  if (normalized in REGION_COUNTRY_HINTS) return REGION_COUNTRY_HINTS[normalized];
  const upper = region.trim().toUpperCase();
  if (upper.length === 3 && /^[A-Z]+$/.test(upper)) return upper;
  return null;
}

/** Engines schema import actually supports today (mirrors db_connector.SCHEMA_IMPORT_ENGINES). */
const SCHEMA_IMPORT_ENGINES = new Set(['postgresql', 'mysql', 'mariadb', 'mongodb']);

/** Cloud/other slugs that require extra_config.engine before a DB engine is known. */
const ENGINE_SELECT_TYPES = new Set([
  'aws_rds', 'gcp_sql', 'self_hosted', 'other_cloud', 'other_db',
]);

/**
 * Mirror backend db_connector.resolve_engine — maps connector slug + extra_config.engine
 * to a concrete database engine, or null when not configured.
 */
export function resolveEngine(source: {
  source_type: DataSourceType;
  extra_config?: Record<string, unknown>;
}): string | null {
  const st = source.source_type;
  if (ALL_ENGINES.has(st)) return st;
  const fixed: Record<string, string | null> = {
    azure_sql: 'sqlserver',
    mongodb_atlas: 'mongodb',
  };
  if (st in fixed) return fixed[st];
  if (ENGINE_SELECT_TYPES.has(st)) {
    const engine = source.extra_config?.engine;
    return typeof engine === 'string' && ALL_ENGINES.has(engine) ? engine : null;
  }
  return null;
}

/** True when backend can introspect schema for inventory import (DB + file sources). */
export function supportsSchemaImport(source: {
  source_type: DataSourceType;
  category: DataSourceCategory | null;
  extra_config?: Record<string, unknown>;
}): boolean {
  if (source.category === 'upload' || source.category === 'files') return true;
  const eng = resolveEngine(source);
  return eng !== null && SCHEMA_IMPORT_ENGINES.has(eng);
}

/** True when backend resolves a DB engine (masking/retention gate — broader than import). */
export function supportsDbIntrospection(source: {
  source_type: DataSourceType;
  extra_config?: Record<string, unknown>;
}): boolean {
  const eng = resolveEngine(source);
  return eng !== null && ALL_ENGINES.has(eng);
}

export function sourceLabel(source: DataSource): string {
  const parts = [source.name];
  if (source.environment && source.environment !== 'production') {
    parts.push(ENV_LABELS[source.environment] ?? source.environment);
  }
  if (source.owner_name) parts.push(source.owner_name);
  return parts.join(' · ');
}

const ENV_LABELS: Record<SourceEnvironment, string> = {
  production: 'Prod',
  staging: 'Staging',
  development: 'Dev',
  test: 'Test',
};

export function sourceCapabilities(source: {
  source_type: DataSourceType;
  category: DataSourceCategory | null;
  integration_mode?: IntegrationMode | null;
  extra_config?: Record<string, unknown>;
}): SourceCapabilities {
  const writeActions = effectiveIntegrationMode(source) === 'read_write';
  const dbIntrospect = supportsDbIntrospection(source);
  return {
    autoInventory: supportsSchemaImport(source),
    scan: isPiiScannableSource(source),
    mask: dbIntrospect && writeActions,
    retention: dbIntrospect && writeActions,
    writeActions,
  };
}

export function categoryMeta(category: DataSourceCategory): CategoryMeta | undefined {
  return SOURCE_CATALOG.find((c) => c.value === category);
}

export interface DataSource {
  id: string;
  organization_id: string;
  name: string;
  source_type: DataSourceType;
  category: DataSourceCategory | null;
  region: string | null;
  description: string | null;
  host: string | null;
  port: number | null;
  database_name: string | null;
  username: string | null;
  ssl_enabled: boolean;
  extra_config: Record<string, unknown>;
  integration_mode: IntegrationMode;
  owner_user_id: string | null;
  owner_name: string | null;
  environment: SourceEnvironment;
  criticality: SourceCriticality;
  data_processor_id: string | null;
  data_processor_name: string | null;
  encryption_at_rest: boolean;
  credential_rotated_at: string | null;
  tags: string[];
  residency_flag: ResidencyFlag;
  needs_retest: boolean;
  status: DataSourceStatus;
  has_password: boolean;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataSourceCreate {
  name: string;
  source_type: DataSourceType;
  category?: DataSourceCategory | null;
  region?: string | null;
  description?: string | null;
  host?: string | null;
  port?: number | null;
  database_name?: string | null;
  username?: string | null;
  password?: string | null;
  ssl_enabled?: boolean;
  extra_config?: Record<string, unknown>;
  integration_mode?: IntegrationMode | null;
  owner_user_id?: string | null;
  owner_name?: string | null;
  environment?: SourceEnvironment;
  criticality?: SourceCriticality;
  data_processor_id?: string | null;
  encryption_at_rest?: boolean;
  tags?: string[];
}

export type DataSourceUpdate = Partial<DataSourceCreate>;

export interface ConnectionTestResult {
  success: boolean;
  status: DataSourceStatus;
  message: string;
  tested_at: string;
}

export interface DataSourceActivityEntry {
  id: string;
  data_source_id: string | null;
  action: string;
  source_name: string;
  user_name: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface InventoryAssetSummary {
  id: string;
  name: string;
  field_count: number;
  highest_classification: string | null;
}

export interface PiiScanSummary {
  job_id: string | null;
  status: string | null;
  finished_at: string | null;
  fields_flagged: number;
  findings_count: number;
}

export interface MaskingCoverageSummary {
  total_pii_fields: number;
  covered_by_rules: number;
  coverage_pct: number;
}

export interface RetentionPolicySummary {
  id: string;
  name: string;
  status: string;
  action: string;
  last_run_at: string | null;
}

export interface CrossBorderTransferSummary {
  id: string;
  name: string;
  destination_country: string;
  status: string;
}

export interface ConsentPurposeSummary {
  purpose_id: string;
  purpose_name: string;
  mapped_field_count: number;
}

export interface DataSourceUsageSummary {
  source_id: string;
  inventory_assets: InventoryAssetSummary[];
  total_fields: number;
  highest_classification: string | null;
  pii_scan: PiiScanSummary;
  masking: MaskingCoverageSummary;
  retention_policies: RetentionPolicySummary[];
  cross_border_transfers: CrossBorderTransferSummary[];
  consent_purposes: ConsentPurposeSummary[];
}

/** Lucide icon name per category for enterprise UI (replaces emoji in cards). */
export const CATEGORY_ICONS: Record<DataSourceCategory, string> = {
  database: 'Database',
  cloud: 'Cloud',
  files: 'FolderOpen',
  api: 'Plug',
  logs: 'BarChart3',
  upload: 'Upload',
};
