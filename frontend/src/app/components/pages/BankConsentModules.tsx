import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { Link, useLocation } from 'react-router';
import { Building2, GitBranch, Users } from 'lucide-react';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import {
  fetchBankingConfig,
  fetchConsentPrincipal,
  fetchConsentPrincipals,
  updateBankingConfig,
} from '@/lib/api/consentBanking';
import { integrationsApi } from '@/lib/api/integrations';
import type { Property } from '@/types/integrations';
import type {
  AttributeLevel,
  ConsentIndustryConfig,
  ConsentPrincipalDetail,
  ConsentPrincipalSummary,
  IdentifierTypeConfig,
  JourneyConfig,
} from '@/types/consentBanking';
import { notify } from '@/app/utils/notify';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Bank Identifier Settings', path: '/consent/banking/identifiers', icon: Building2 },
  { label: 'Journey & Channel Mapping', path: '/consent/banking/journeys', icon: GitBranch },
  { label: 'Customer Consent Registry', path: '/consent/banking/registry', icon: Users },
] as const;

const LEVELS: AttributeLevel[] = ['required', 'optional', 'disabled'];

/** Digital self-serve journeys — offline capture / staff metadata do not apply. */
const ONLINE_JOURNEY_KEYS = new Set(['mobile_banking', 'internet_banking', 'web_portal']);

function isOnlineJourney(journey: JourneyConfig): boolean {
  if (ONLINE_JOURNEY_KEYS.has(journey.key)) return true;
  return journey.allow_offline_capture === false;
}

function BankingTabs(): ReactElement {
  const location = useLocation();
  return (
    <div className="flex flex-wrap gap-2 mb-6 border-b border-[var(--border-default)] pb-3">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--brand-primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]',
            )}
          >
            <Icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function IdentifierSettingsPanel({
  config,
  onSave,
  saving,
}: {
  config: ConsentIndustryConfig;
  onSave: (types: IdentifierTypeConfig[]) => void;
  saving: boolean;
}): ReactElement {
  const [types, setTypes] = useState(config.identifier_types);

  useEffect(() => {
    setTypes(config.identifier_types);
  }, [config.identifier_types]);

  const addType = () => {
    setTypes((prev) => [
      ...prev,
      {
        key: `custom_${prev.length + 1}`,
        label: 'Custom Identifier',
        storage: 'token',
        enabled: true,
        sensitive: false,
        allow_offline_capture: true,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Configure which customer attributes your bank collects. Only enabled types can be used on journeys
        (DPDPA data minimization). Email and phone can be required, optional, or disabled per journey.
      </p>
      {types.map((t, idx) => (
        <div
          key={`${t.key}-${idx}`}
          className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4 border border-[var(--border-default)] rounded-lg bg-[var(--surface-card)]"
        >
          <input
            className="px-2 py-1 border rounded text-sm bg-[var(--surface-raised)]"
            value={t.key}
            onChange={(e) => {
              const next = [...types];
              next[idx] = { ...t, key: e.target.value };
              setTypes(next);
            }}
            placeholder="key"
          />
          <input
            className="px-2 py-1 border rounded text-sm bg-[var(--surface-raised)] md:col-span-2"
            value={t.label}
            onChange={(e) => {
              const next = [...types];
              next[idx] = { ...t, label: e.target.value };
              setTypes(next);
            }}
            placeholder="Label"
          />
          <select
            className="px-2 py-1 border rounded text-sm bg-[var(--surface-raised)]"
            value={t.storage}
            onChange={(e) => {
              const next = [...types];
              next[idx] = { ...t, storage: e.target.value as IdentifierTypeConfig['storage'] };
              setTypes(next);
            }}
          >
            <option value="token">Token</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.enabled}
              onChange={(e) => {
                const next = [...types];
                next[idx] = { ...t, enabled: e.target.checked };
                setTypes(next);
              }}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.sensitive}
              onChange={(e) => {
                const next = [...types];
                next[idx] = { ...t, sensitive: e.target.checked };
                setTypes(next);
              }}
            />
            Sensitive token
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.allow_offline_capture}
              onChange={(e) => {
                const next = [...types];
                next[idx] = { ...t, allow_offline_capture: e.target.checked };
                setTypes(next);
              }}
            />
            Offline capture
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={addType} className="px-3 py-2 text-sm border rounded-md">
          + Add identifier type
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(types)}
          className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-50"
        >
          Save identifier catalog
        </button>
      </div>
    </div>
  );
}

function JourneyMappingPanel({
  config,
  orgId,
  onSave,
  saving,
}: {
  config: ConsentIndustryConfig;
  orgId?: string;
  onSave: (journeys: JourneyConfig[], propertyJourneyMap: Record<string, string>) => void;
  saving: boolean;
}): ReactElement {
  const [journeys, setJourneys] = useState(config.journeys);
  const [propertyMap, setPropertyMap] = useState(config.property_journey_map);
  const [properties, setProperties] = useState<Property[]>([]);
  const enabledTypes = config.identifier_types.filter((t) => t.enabled);

  useEffect(() => {
    setJourneys(config.journeys);
    setPropertyMap(config.property_journey_map);
  }, [config.journeys, config.property_journey_map]);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    void integrationsApi.listProperties(orgId).then((props) => {
      if (active) setProperties(props);
    });
    return () => {
      active = false;
    };
  }, [orgId]);

  const setLevel = (jIdx: number, typeKey: string, level: AttributeLevel) => {
    setJourneys((prev) => {
      const next = [...prev];
      next[jIdx] = {
        ...next[jIdx],
        attributes: { ...next[jIdx].attributes, [typeKey]: level },
      };
      return next;
    });
  };

  const setJourneyFlag = (
    jIdx: number,
    field: 'otp_required' | 'allow_offline_capture' | 'staff_metadata_required',
    value: boolean,
  ) => {
    setJourneys((prev) => {
      const next = [...prev];
      next[jIdx] = { ...next[jIdx], [field]: value };
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)]">
        Set required, optional, or disabled attributes per channel journey. Banks can require email on
        internet banking and only mobile on branch-assisted flows.
      </p>
      {journeys.map((journey, jIdx) => {
        const online = isOnlineJourney(journey);
        return (
        <div key={journey.key} className="border border-[var(--border-default)] rounded-lg p-4 bg-[var(--surface-card)]">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <strong>{journey.label}</strong>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded font-medium capitalize',
                online
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200',
              )}
            >
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 mb-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={journey.otp_required ?? false}
                onChange={(e) => setJourneyFlag(jIdx, 'otp_required', e.target.checked)}
              />
              OTP required
            </label>
            {!ONLINE_JOURNEY_KEYS.has(journey.key) && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={journey.allow_offline_capture ?? true}
                    onChange={(e) => setJourneyFlag(jIdx, 'allow_offline_capture', e.target.checked)}
                  />
                  Allow offline capture
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={journey.staff_metadata_required ?? false}
                    onChange={(e) => setJourneyFlag(jIdx, 'staff_metadata_required', e.target.checked)}
                  />
                  Staff metadata required
                </label>
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)]">
                  <th className="py-2 pr-4">Attribute</th>
                  <th className="py-2">Level</th>
                </tr>
              </thead>
              <tbody>
                {enabledTypes.map((t) => (
                  <tr key={t.key} className="border-t border-[var(--border-default)]">
                    <td className="py-2 pr-4">{t.label}</td>
                    <td className="py-2">
                      <select
                        className="px-2 py-1 border rounded bg-[var(--surface-raised)]"
                        value={journey.attributes[t.key] ?? 'disabled'}
                        onChange={(e) => setLevel(jIdx, t.key, e.target.value as AttributeLevel)}
                      >
                        {LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        );
      })}
      <div className="border border-[var(--border-default)] rounded-lg p-4 bg-[var(--surface-card)]">
        <h3 className="font-medium mb-2">Property → default journey</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Map each website or app property to a default journey when clients do not send an explicit journey key.
        </p>
        {properties.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No integration properties found for this organization.</p>
        ) : (
          <div className="space-y-3">
            {properties.map((property) => (
              <div key={property.id} className="flex flex-wrap items-center gap-3">
                <span className="text-sm min-w-[200px]">
                  {property.display_name || property.domain}
                  <span className="block text-xs text-[var(--text-tertiary)]">{property.domain}</span>
                </span>
                <select
                  className="px-2 py-1 border rounded bg-[var(--surface-raised)] text-sm"
                  value={propertyMap[property.id] ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPropertyMap((prev) => {
                      const next = { ...prev };
                      if (value) next[property.id] = value;
                      else delete next[property.id];
                      return next;
                    });
                  }}
                >
                  <option value="">— No default —</option>
                  {journeys.map((journey) => (
                    <option key={journey.key} value={journey.key}>
                      {journey.label}
                    </option>
                  ))}
                </select>
                <a
                  href="/consent/banner"
                  className="text-xs text-[var(--brand-primary)] underline whitespace-nowrap"
                >
                  Configure banner →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(journeys, propertyMap)}
        className="px-4 py-2 text-sm rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-50"
      >
        Save journey mapping
      </button>
    </div>
  );
}

function RegistryPanel({ orgId }: { orgId?: string }): ReactElement {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ConsentPrincipalSummary[]>([]);
  const [selected, setSelected] = useState<ConsentPrincipalDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConsentPrincipals(orgId, search || undefined);
      setRows(data);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to load registry');
    } finally {
      setLoading(false);
    }
  }, [orgId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      setSelected(await fetchConsentPrincipal(id, orgId));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to load customer');
    }
  };

  const registryPager = useClientPagination(rows);

  useEffect(() => {
    registryPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, rows.length]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 border rounded-md bg-[var(--surface-card)]"
          placeholder="Search by bank customer ref token..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={() => void load()} className="px-3 py-2 border rounded-md text-sm">
          Search
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
      ) : (
        <div className="border border-[var(--border-default)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-raised)]">
              <tr>
                <th className="text-left p-3">Customer ref</th>
                <th className="text-left p-3">Linkage</th>
                <th className="text-left p-3">Identifiers</th>
                <th className="text-left p-3">Consents</th>
                <th className="text-left p-3" />
              </tr>
            </thead>
            <tbody>
              {registryPager.slice.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border-default)]">
                  <td className="p-3 font-mono text-xs">{row.canonical_ref}</td>
                  <td className="p-3">{row.linkage_source}</td>
                  <td className="p-3">{row.identifier_types.join(', ') || '—'}</td>
                  <td className="p-3">{row.receipt_count}</td>
                  <td className="p-3">
                    <button type="button" className="text-[var(--brand-primary)] text-sm" onClick={() => void openDetail(row.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[var(--text-secondary)]">
                    No linked customers yet. Consents captured with bank identifiers will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <TablePager
            page={registryPager.page}
            pageCount={registryPager.pageCount}
            total={registryPager.total}
            pageSize={registryPager.pageSize}
            onPage={registryPager.setPage}
          />
        </div>
      )}
      {selected && (
        <div className="border border-[var(--border-default)] rounded-lg p-4 bg-[var(--surface-card)]">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-medium">Customer consent profile</h3>
              <p className="text-xs font-mono text-[var(--text-secondary)]">{selected.canonical_ref}</p>
            </div>
            <button type="button" className="text-sm" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {selected.receipts.map((r) => (
              <div key={r.id} className="text-sm p-2 rounded bg-[var(--surface-raised)]">
                <div className="flex justify-between gap-2">
                  <span>{r.capture_channel ?? '—'} / {r.journey_key ?? '—'}</span>
                  <span className="text-[var(--text-tertiary)]">{r.created_at}</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">lang: {r.language}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BankingConsentPage({ mode }: { mode: 'identifiers' | 'journeys' | 'registry' }): ReactElement {
  const org = useComplianceOrg();
  const [config, setConfig] = useState<ConsentIndustryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org.hasOrg) return;
    let active = true;
    setLoading(true);
    void fetchBankingConfig(org.orgIdParam)
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : 'Failed to load banking config');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org.orgIdParam, org.hasOrg]);

  const saveIdentifiers = async (identifier_types: IdentifierTypeConfig[]) => {
    setSaving(true);
    try {
      const updated = await updateBankingConfig({ identifier_types }, org.orgIdParam);
      setConfig(updated);
      notify('Identifier catalog saved.');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveJourneys = async (journeys: JourneyConfig[], property_journey_map: Record<string, string>) => {
    setSaving(true);
    try {
      const updated = await updateBankingConfig({ journeys, property_journey_map }, org.orgIdParam);
      setConfig(updated);
      notify('Journey mapping saved.');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConsentManagementGate
      loading={loading}
      error={error}
      hasOrg={org.hasOrg}
      isSuperadmin={org.isSuperadmin}
      organizations={org.organizations}
      selectedOrgId={org.selectedOrgId}
      onSelectOrg={org.setSelectedOrgId}
      title="Advanced Consent Management"
    >
      <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
        <h1 className="mb-2">Banking Consent Management</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Multi-identifier consent mapping for banks — configurable per journey, DPDPA-compliant proof linkage.
        </p>
        <BankingTabs />
        {config && mode === 'identifiers' && (
          <IdentifierSettingsPanel config={config} onSave={(t) => void saveIdentifiers(t)} saving={saving} />
        )}
        {config && mode === 'journeys' && (
          <JourneyMappingPanel
            config={config}
            orgId={org.orgIdParam}
            onSave={(j, map) => void saveJourneys(j, map)}
            saving={saving}
          />
        )}
        {mode === 'registry' && <RegistryPanel orgId={org.orgIdParam} />}
      </div>
    </ConsentManagementGate>
  );
}

export function BankIdentifierSettings(): ReactElement {
  return <BankingConsentPage mode="identifiers" />;
}

export function BankJourneyMapping(): ReactElement {
  return <BankingConsentPage mode="journeys" />;
}

export function BankCustomerConsentRegistry(): ReactElement {
  return <BankingConsentPage mode="registry" />;
}
