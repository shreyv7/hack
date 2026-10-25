import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  Database,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Shield,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  fetchDataSourceActivity,
  fetchDataSourceUsageSummary,
} from '@/lib/api/dataSources';
import type {
  DataSource,
  DataSourceActivityEntry,
  DataSourceUsageSummary,
} from '@/types/dataSource';
import { connectorMeta, effectiveIntegrationMode, sourceCapabilities } from '@/types/dataSource';

interface SourceDetailDrawerProps {
  source: DataSource;
  orgId?: string;
  onClose: () => void;
  onEdit: () => void;
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

function credentialAgeDays(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function SourceDetailDrawer({
  source,
  orgId,
  onClose,
  onEdit,
}: SourceDetailDrawerProps): ReactElement {
  const [usage, setUsage] = useState<DataSourceUsageSummary | null>(null);
  const [activity, setActivity] = useState<DataSourceActivityEntry[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsage(true);
    void fetchDataSourceUsageSummary(source.id, orgId)
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source.id, orgId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingActivity(true);
    void fetchDataSourceActivity(source.id, orgId)
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingActivity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source.id, orgId]);

  const meta = connectorMeta(source.source_type);
  const caps = sourceCapabilities(source);
  const credDays = credentialAgeDays(source.credential_rotated_at);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl flex flex-col bg-[var(--surface-card)] border-l border-[var(--border-default)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="source-detail-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-[var(--text-tertiary)] mb-1">{meta.label}</p>
              <h2 id="source-detail-title" className="text-xl font-semibold text-[var(--text-primary)]">
                {source.name}
              </h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--surface-raised)] text-[var(--text-secondary)] capitalize">
                  {source.environment}
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs capitalize',
                    source.criticality === 'critical' || source.criticality === 'high'
                      ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                      : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]',
                  )}
                >
                  {source.criticality}
                </span>
                {source.residency_flag === 'outside_approved_residency' && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--status-warning-bg)] text-[var(--status-warning)] inline-flex items-center gap-1">
                    <Globe className="size-3" /> Outside residency
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0 px-6 pt-4">
          <TabsList className="shrink-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="usage">Data usage</TabsTrigger>
            <TabsTrigger value="activity">Activity log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-y-auto pb-6 space-y-4 mt-4">
            <Section title="Accountability">
              <Row label="Owner" value={source.owner_name ?? 'Unassigned'} />
              <Row label="Processor" value={source.data_processor_name ?? 'None linked'} />
              <Row
                label="Integration mode"
                value={
                  effectiveIntegrationMode(source) === 'read_write' ? 'Read-write' : 'Discovery only'
                }
              />
            </Section>

            <Section title="Connection">
              <Row label="Status" value={source.status} />
              <Row label="Region" value={source.region ?? '—'} />
              <Row label="Endpoint" value={
                source.host
                  ? `${source.host}${source.port ? `:${source.port}` : ''}${source.database_name ? `/${source.database_name}` : ''}`
                  : '—'
              } />
              <Row label="Last tested" value={formatWhen(source.last_tested_at)} />
              {source.last_error && (
                <p className="text-xs text-[var(--status-danger)] mt-2">{source.last_error}</p>
              )}
            </Section>

            <Section title="Security safeguards (§8(5))">
              <SafeguardRow label="SSL/TLS" ok={source.ssl_enabled} />
              <SafeguardRow label="Encryption at rest" ok={source.encryption_at_rest} />
              <SafeguardRow
                label="Credential rotation"
                ok={credDays !== null && credDays < 365}
                detail={
                  credDays === null
                    ? 'Never rotated'
                    : credDays < 365
                      ? `Rotated ${credDays}d ago`
                      : `Stale — ${credDays}d since rotation`
                }
              />
            </Section>

            <Section title="Capabilities">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Auto-inventory', on: caps.autoInventory },
                  { label: 'PII scan', on: caps.scan },
                  { label: 'Masking', on: caps.mask },
                  { label: 'Retention', on: caps.retention },
                ].map((chip) => (
                  <span
                    key={chip.label}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium',
                      chip.on
                        ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                        : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]',
                    )}
                  >
                    {chip.on ? '✓' : '✗'} {chip.label}
                  </span>
                ))}
              </div>
            </Section>

            {source.description && (
              <Section title="Description">
                <p className="text-sm text-[var(--text-secondary)]">{source.description}</p>
              </Section>
            )}

            <button
              type="button"
              onClick={onEdit}
              className="w-full px-4 py-2 text-sm rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
            >
              Edit source
            </button>
          </TabsContent>

          <TabsContent value="usage" className="flex-1 overflow-y-auto pb-6 space-y-4 mt-4">
            {loadingUsage ? (
              <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading usage…
              </div>
            ) : usage ? (
              <>
                <UsageBlock
                  title="Data Inventory"
                  icon={Database}
                  link="/data/inventory"
                  empty="No assets linked — run schema scan first."
                >
                  {usage.inventory_assets.length > 0 ? (
                    <>
                      <p className="text-sm text-[var(--text-secondary)] mb-2">
                        {usage.total_fields} fields across {usage.inventory_assets.length} asset(s)
                        {usage.highest_classification
                          ? ` · highest: ${usage.highest_classification}`
                          : ''}
                      </p>
                      <ul className="space-y-1">
                        {usage.inventory_assets.map((a) => (
                          <li key={a.id} className="text-xs text-[var(--text-secondary)]">
                            {a.name} — {a.field_count} fields
                            {a.highest_classification ? ` (${a.highest_classification})` : ''}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </UsageBlock>

                <UsageBlock title="PII Scanner" icon={Shield} link="/scanner/pii" empty="No scans yet.">
                  {usage.pii_scan.job_id ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                      Last scan: {usage.pii_scan.status} · {usage.pii_scan.findings_count} findings ·{' '}
                      {usage.pii_scan.fields_flagged} fields flagged
                    </p>
                  ) : null}
                </UsageBlock>

                <UsageBlock title="Data Masking" icon={Lock} link="/data/masking" empty="No PII fields to cover yet.">
                  {usage.masking.total_pii_fields > 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                      {usage.masking.covered_by_rules}/{usage.masking.total_pii_fields} PII fields covered (
                      {usage.masking.coverage_pct}%)
                    </p>
                  ) : null}
                </UsageBlock>

                <UsageBlock
                  title="Retention Policies"
                  icon={Clock}
                  link="/data/retention"
                  empty="No retention policies attached."
                >
                  {usage.retention_policies.length > 0 ? (
                    <ul className="space-y-1">
                      {usage.retention_policies.map((p) => (
                        <li key={p.id} className="text-xs text-[var(--text-secondary)]">
                          {p.name} — {p.action} ({p.status})
                          {p.last_run_at ? ` · last run ${formatWhen(p.last_run_at)}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </UsageBlock>

                <UsageBlock
                  title="Cross-Border Transfers"
                  icon={Globe}
                  link="/governance/cross-border-transfer"
                  empty="No transfers linked via processor."
                >
                  {usage.cross_border_transfers.length > 0 ? (
                    <ul className="space-y-1">
                      {usage.cross_border_transfers.map((t) => (
                        <li key={t.id} className="text-xs text-[var(--text-secondary)]">
                          {t.name} → {t.destination_country} ({t.status})
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </UsageBlock>

                <UsageBlock
                  title="Consent Purposes"
                  icon={Activity}
                  link="/consent/enforcement"
                  empty="No purpose→field mappings for this source yet."
                >
                  {usage.consent_purposes.length > 0 ? (
                    <ul className="space-y-1">
                      {usage.consent_purposes.map((p) => (
                        <li key={p.purpose_id} className="text-xs text-[var(--text-secondary)]">
                          {p.purpose_name} — {p.mapped_field_count} field(s)
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </UsageBlock>
              </>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Could not load usage summary.</p>
            )}
          </TabsContent>

          <TabsContent value="activity" className="flex-1 overflow-y-auto pb-6 mt-4">
            {loadingActivity ? (
              <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading activity…
              </div>
            ) : activity.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] py-8 text-center">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {activity.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-[var(--border-default)] p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text-primary)] capitalize">
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {formatWhen(entry.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1">by {entry.user_name}</div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="rounded-xl border border-[var(--border-default)] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[var(--text-primary)] text-right break-all">{value}</span>
    </div>
  );
}

function SafeguardRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium',
          ok ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]',
        )}
      >
        {ok ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
        {detail ?? (ok ? 'Yes' : 'No')}
      </span>
    </div>
  );
}

function UsageBlock({
  title,
  icon: Icon,
  link,
  empty,
  children,
}: {
  title: string;
  icon: typeof Database;
  link: string;
  empty: string;
  children?: React.ReactNode;
}): ReactElement {
  const hasContent = Boolean(children);
  return (
    <div className="rounded-xl border border-[var(--border-default)] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-sky-600" />
          <h4 className="text-sm font-medium text-[var(--text-primary)]">{title}</h4>
        </div>
        <Link
          to={link}
          className="text-xs text-sky-600 hover:underline inline-flex items-center gap-1"
        >
          Open <ExternalLink className="size-3" />
        </Link>
      </div>
      {hasContent ? children : <p className="text-xs text-[var(--text-tertiary)]">{empty}</p>}
    </div>
  );
}
