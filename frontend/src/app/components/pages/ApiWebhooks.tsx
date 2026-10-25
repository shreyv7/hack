import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Webhook,
  Key,
  Code,
  Copy,
  Activity,
  Send,
  Plus,
  Trash2,
  HelpCircle,
  Database,
  Loader2,
} from 'lucide-react';
import { integrationsApi } from '@/lib/api/integrations';
import { testConsentWebhook } from '@/lib/api/consent';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';
import { cn } from '@/lib/utils';
import type { Property, PropertyDetail, WebhookDeliveryLog } from '@/types/integrations';
import { IntegrationSetupGuideButton } from '@/app/components/common/IntegrationSetupGuideButton';
import { readStoredOrgId } from '@/lib/compliance/orgContext';

const WEBHOOK_EVENT_OPTIONS = [
  'consent.granted',
  'consent.denied',
  'consent.partial',
  'consent.modified',
  'consent.withdrawn',
  'consent.expired',
  'dpo.complaint_filed',
] as const;

const DATA_RIGHTS_EVENT_OPTIONS = [
  'data-rights.request_created',
  'data-rights.request_received',
  'data-rights.status_changed',
  'data-rights.consent_withdrawn',
  'data-rights.erasure_completed',
  'data-rights.masking_completed',
  'data-rights.anonymization_completed',
  'data-rights.completed',
] as const;

export function ApiWebhooks(): ReactElement {
  const orgId = readStoredOrgId() || undefined;
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoadingProps, setIsLoadingProps] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');

  const [webhookUrl, setWebhookUrl] = useState('');
  const [savedWebhookUrl, setSavedWebhookUrl] = useState<string | null>(null);
  const [bannerId, setBannerId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'consent.granted',
    'consent.withdrawn',
    'consent.modified',
  ]);
  const [signingSecret, setSigningSecret] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [drWebhookUrl, setDrWebhookUrl] = useState('');
  const [drSigningSecret, setDrSigningSecret] = useState('');
  const [drBearerToken, setDrBearerToken] = useState('');
  const [drSelectedEvents, setDrSelectedEvents] = useState<string[]>([
    'data-rights.request_received',
    'data-rights.consent_withdrawn',
  ]);
  const [isSavingDrWebhook, setIsSavingDrWebhook] = useState(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);

  const [logs, setLogs] = useState<WebhookDeliveryLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [activeTab, setActiveTab] = useState<'config' | 'consent' | 'heartbeat'>('config');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [inspectLogPayload, setInspectLogPayload] = useState<WebhookDeliveryLog | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyDetail | null>(null);

  const loadWebhookData = useCallback(async (propertyId: string) => {
    setIsLoadingLogs(true);
    try {
      const [config, deliveries] = await Promise.all([
        integrationsApi.getWebhookConfig(propertyId, orgId),
        integrationsApi.listWebhookDeliveries(propertyId, 50, orgId),
      ]);
      setBannerId(config.banner_id);
      setSavedWebhookUrl(config.url);
      setWebhookUrl(config.url || '');
      if (config.subscribed_events?.length) {
        setSelectedEvents(config.subscribed_events);
      }
      setSigningSecret('');
      setBearerToken('');
      setLogs(deliveries);
      const drConfig = await integrationsApi.getDataRightsWebhookConfig(orgId);
      setDrWebhookUrl(drConfig.url || '');
      if (drConfig.subscribed_events?.length) {
        setDrSelectedEvents(drConfig.subscribed_events);
      }
    } catch (err) {
      console.error(err);
      setBannerId(null);
      setSavedWebhookUrl(null);
      setLogs([]);
      notify('Failed to load webhook configuration.');
    } finally {
      setIsLoadingLogs(false);
    }
  }, [orgId]);

  useEffect(() => {
    async function loadProperties() {
      try {
        const data = await integrationsApi.listProperties(orgId);
        setProperties(data);
        if (data.length > 0) {
          setSelectedPropertyId(data[0].id);
        }
      } catch (err) {
        console.error(err);
        notify('Failed to load properties list.');
      } finally {
        setIsLoadingProps(false);
      }
    }
    void loadProperties();
  }, [orgId]);

  useEffect(() => {
    if (!selectedPropertyId) return;
    async function loadSelectedProp() {
      try {
        const propDetail = await integrationsApi.getProperty(selectedPropertyId, orgId);
        setSelectedProperty(propDetail);
      } catch (err) {
        console.error(err);
      }
    }
    void loadSelectedProp();
    void loadWebhookData(selectedPropertyId);
  }, [selectedPropertyId, orgId, loadWebhookData]);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    if (index === 0) {
      notify('Key prefix copied. Full secret key is hidden for security.');
    } else {
      notify('Copied to clipboard.');
    }
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleToggleEvent = (event: string) => {
    if (selectedEvents.includes(event)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== event));
    } else {
      setSelectedEvents([...selectedEvents, event]);
    }
  };

  const handleToggleDrEvent = (event: string) => {
    if (drSelectedEvents.includes(event)) {
      setDrSelectedEvents(drSelectedEvents.filter((e) => e !== event));
    } else {
      setDrSelectedEvents([...drSelectedEvents, event]);
    }
  };

  const handleSaveDataRightsWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drWebhookUrl.trim().startsWith('http')) {
      notify('Enter a valid data-rights webhook URL.');
      return;
    }
    try {
      setIsSavingDrWebhook(true);
      await integrationsApi.updateDataRightsWebhookConfig(
        {
          url: drWebhookUrl.trim(),
          subscribed_events: drSelectedEvents,
          signing_secret: drSigningSecret.trim() || undefined,
          bearer_token: drBearerToken.trim() || undefined,
        },
        orgId,
      );
      notify('Data-rights webhook saved.');
    } catch (err) {
      console.error(err);
      notify('Failed to save data-rights webhook.');
    } finally {
      setIsSavingDrWebhook(false);
    }
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) {
      notify('Select a property first.');
      return;
    }
    if (!bannerId) {
      notify('Link an active consent banner to this property before saving a webhook URL.');
      return;
    }
    if (!webhookUrl.trim() || !webhookUrl.startsWith('http')) {
      notify('Please enter a valid HTTP/HTTPS endpoint URL.');
      return;
    }
    if (selectedEvents.length === 0) {
      notify('Please select at least one event subscription.');
      return;
    }

    try {
      setIsSavingWebhook(true);
      const config = await integrationsApi.updateWebhookConfig(
        selectedPropertyId,
        {
          url: webhookUrl.trim(),
          subscribed_events: selectedEvents,
          signing_secret: signingSecret.trim() || undefined,
          bearer_token: bearerToken.trim() || undefined,
        },
        orgId,
      );
      setSavedWebhookUrl(config.url);
      notify('Webhook subscription saved.');
    } catch (err) {
      console.error(err);
      notify('Failed to save webhook URL.');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!selectedPropertyId || !savedWebhookUrl) return;
    try {
      await integrationsApi.updateWebhookConfig(selectedPropertyId, { url: null }, orgId);
      setSavedWebhookUrl(null);
      setWebhookUrl('');
      notify('Webhook subscription removed.');
    } catch (err) {
      console.error(err);
      notify('Failed to remove webhook URL.');
    }
  };

  const handleSendTestWebhook = async () => {
    const targetUrl = savedWebhookUrl || webhookUrl.trim();
    if (!targetUrl) {
      notify('Save a webhook subscription endpoint before sending a test event.');
      return;
    }
    if (!selectedPropertyId) {
      notify('Select a property first.');
      return;
    }

    const eventType = selectedEvents[0] || 'consent.test';

    try {
      setIsTesting(true);
      const result = await testConsentWebhook(targetUrl, orgId, {
        propertyId: selectedPropertyId,
        bannerId: bannerId ?? undefined,
        eventType,
      });

      await loadWebhookData(selectedPropertyId);

      if (result.success) {
        notify(`Test event delivered (${result.status_code}, ${result.latency_ms}ms).`);
      } else {
        notify(`Webhook endpoint error: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      notify('Failed to send test webhook.');
    } finally {
      setIsTesting(false);
    }
  };

  const activeKeyPrefix = selectedProperty?.api_keys?.find((k) => k.status === 'active')?.key_prefix || 'zsk_live_pending';
  const activeKey = activeKeyPrefix === 'zsk_live_pending'
    ? 'zsk_live_pending'
    : `${activeKeyPrefix}-YOUR_API_KEY_SECRET`;

  const curlConfig = `curl -X GET "https://api.zeroshield.in/public/v1/integrations/sdk/config/${selectedPropertyId || 'PROPERTY_ID'}" \\
  -H "X-API-KEY: ${activeKey}"`;

  const curlConsent = `curl -X POST "https://api.zeroshield.in/public/v1/integrations/sdk/consent" \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: ${activeKey}" \\
  -d '{
    "property_id": "${selectedPropertyId || 'PROPERTY_ID'}",
    "deployment_id": "YOUR_DEPLOYMENT_ID",
    "session_id": "user_session_45",
    "consented_purposes": ["essential", "analytics"],
    "language": "hi",
    "device_info": "iOS Application (Swift)"
  }'`;

  const logsPager = useClientPagination(logs);

  useEffect(() => {
    logsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  const curlHeartbeat = `curl -X POST "https://api.zeroshield.in/public/v1/integrations/sdk/heartbeat/YOUR_DEPLOYMENT_ID" \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: ${activeKey}" \\
  -d '{
    "sdk_version": "4.2.1",
    "os_version": "iOS 17.4",
    "device_model": "iPhone 15 Pro"
  }'`;

  return (
    <div className="h-full overflow-auto bg-[var(--surface-base)] font-sans">
      <div className="max-w-[1200px] mx-auto p-8 space-y-6">

        {/* Page Header */}
        <div className="flex items-start justify-between border-b border-[var(--border-default)] pb-6">
          <div>
            <h1 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">Developer Console</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Manage API keys, generate code snippets, configure webhooks, and view system event deliveries.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <IntegrationSetupGuideButton guideId="api_webhooks" />
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-[var(--status-info-bg)] text-[var(--status-info)]">
              DPDPA Ch.2 §5 Notice & §6 Consent Compliance
            </span>
          </div>
        </div>

        {/* Top: Credentials Selector */}
        <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
          <div className="flex items-center gap-2 border-b border-[var(--border-default)] pb-4 mb-4">
            <Key className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
            <h3 className="font-bold text-[var(--text-primary)] text-sm">Property Access Credentials</h3>
          </div>

          {isLoadingProps ? (
            <div className="h-10 bg-[var(--surface-raised)] rounded-lg animate-pulse" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-1">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mb-1.5">Select Workspace Property</label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name || p.domain} ({p.environment})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mb-1.5">Active API Access Prefix</label>
                <div className="flex items-center gap-3 p-2 border border-[var(--border-default)] rounded-lg bg-[var(--surface-base)]">
                  <Database className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                  <span className="font-mono text-xs text-[var(--text-secondary)] truncate flex-1">{activeKeyPrefix}********************</span>
                  <button
                    onClick={() => handleCopy(activeKeyPrefix, 0)}
                    className="p-1 border border-[var(--border-default)] rounded hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-primary)]"
                    title="Copy Key Prefix"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Middle: API Explorer and Webhooks (Split Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left: Code snippet API Explorer (3/5 columns) */}
          <div className="lg:col-span-3 p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm flex flex-col min-h-[480px]">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Code className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Interactive API Sandbox</h3>
              </div>
              <div className="flex gap-1.5 border border-[var(--border-default)] rounded-lg p-0.5 bg-[var(--surface-base)]">
                {(['config', 'consent', 'heartbeat'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'px-2.5 py-1 text-[10px] font-bold rounded uppercase tracking-wider transition-all',
                      activeTab === tab
                        ? 'bg-[var(--brand-primary)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-between space-y-4">
              <div className="text-xs text-[var(--text-secondary)]">
                {activeTab === 'config' && 'Retrieve the compiled property consent notice settings, translator configurations, styles, and blocking rules.'}
                {activeTab === 'consent' && "Synchronize a principal's cookie and platform consent choices to build Audit Trails."}
                {activeTab === 'heartbeat' && 'Ping health status indicators from client applications to verify background compliance enforcement.'}
              </div>

              <div className="relative rounded-xl overflow-hidden bg-[#0A0A0A] border border-zinc-800 flex-1 flex flex-col justify-between mt-2 max-h-[350px]">
                <pre className="p-4 font-mono text-[11px] text-zinc-300 overflow-x-auto leading-relaxed overflow-y-auto">
                  <code>
                    {activeTab === 'config' && curlConfig}
                    {activeTab === 'consent' && curlConsent}
                    {activeTab === 'heartbeat' && curlHeartbeat}
                  </code>
                </pre>
                <div className="p-2.5 bg-zinc-900/40 border-t border-zinc-800 flex justify-end">
                  <button
                    onClick={() => {
                      const code = activeTab === 'config' ? curlConfig : activeTab === 'consent' ? curlConsent : curlHeartbeat;
                      handleCopy(code, 1);
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-[var(--brand-primary)] text-white rounded hover:opacity-90 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedIndex === 1 ? 'Copied' : 'Copy Curl'}
                  </button>
                </div>
              </div>

              <div className="p-3.5 border border-[var(--border-default)] rounded-xl bg-[var(--surface-base)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
                <HelpCircle className="w-4.5 h-4.5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                <span>
                  Endpoints are public API gateways. Ensure headers contain a valid active <code>X-API-KEY</code> credential matched to this Property ID.
                </span>
              </div>
            </div>
          </div>

          {/* Right: Webhooks configuration (2/5 columns) */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm flex flex-col justify-between min-h-[480px]">
            <div>
              <div className="flex items-center gap-2 border-b border-[var(--border-default)] pb-4 mb-4">
                <Webhook className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Webhook Subscriptions</h3>
              </div>

              {!bannerId && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3">
                  Link an active consent banner to this property to enable webhook delivery.
                </p>
              )}

              <form onSubmit={handleAddWebhook} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mb-1">Payload URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.yourdomain.com/webhooks"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mb-1.5">Event Subscriptions</label>
                  <div className="space-y-2 text-xs border border-[var(--border-default)] rounded-lg p-3 bg-[var(--surface-base)]">
                    {WEBHOOK_EVENT_OPTIONS.map((event) => (
                      <label key={event} className="flex items-center gap-2 font-medium cursor-pointer text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(event)}
                          onChange={() => handleToggleEvent(event)}
                          className="rounded accent-[var(--brand-primary)]"
                        />
                        <span>{event}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">
                    Live consent events fire automatically. Test events use the first selected type above.
                    HMAC signing uses <code>X-ZeroShield-Signature</code> + <code>X-ZeroShield-Timestamp</code>.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mb-1">
                    Signing secret (optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep existing"
                    value={signingSecret}
                    onChange={(e) => setSigningSecret(e.target.value)}
                    className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mb-1">
                    Bearer token (optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Authorization: Bearer …"
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingWebhook || !bannerId}
                  className="w-full py-2 bg-[var(--brand-primary)] text-white font-bold rounded-lg text-xs hover:opacity-90 flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {isSavingWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {isSavingWebhook ? 'Saving...' : 'Save Webhook Receiver'}
                </button>
              </form>

              <form onSubmit={handleSaveDataRightsWebhook} className="space-y-3 mt-6 pt-4 border-t border-[var(--border-default)]">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">Data-rights webhook (org-wide)</h4>
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  CBS/CRM endpoint for DSAR portal events — separate from per-property consent webhooks.
                </p>
                <input
                  type="url"
                  placeholder="https://cbs.example.com/hooks/data-rights"
                  value={drWebhookUrl}
                  onChange={(e) => setDrWebhookUrl(e.target.value)}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs font-mono"
                />
                <div className="space-y-1.5 text-xs border border-[var(--border-default)] rounded-lg p-2 bg-[var(--surface-base)] max-h-32 overflow-y-auto">
                  {DATA_RIGHTS_EVENT_OPTIONS.map((event) => (
                    <label key={event} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={drSelectedEvents.includes(event)}
                        onChange={() => handleToggleDrEvent(event)}
                        className="rounded accent-[var(--brand-primary)]"
                      />
                      <span className="font-mono text-[10px]">{event}</span>
                    </label>
                  ))}
                </div>
                <input
                  type="password"
                  placeholder="Signing secret (optional)"
                  value={drSigningSecret}
                  onChange={(e) => setDrSigningSecret(e.target.value)}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs font-mono"
                />
                <input
                  type="password"
                  placeholder="Bearer token (optional)"
                  value={drBearerToken}
                  onChange={(e) => setDrBearerToken(e.target.value)}
                  className="w-full bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={isSavingDrWebhook}
                  className="w-full py-2 border border-[var(--border-default)] rounded-lg text-xs font-bold hover:bg-[var(--surface-raised)] disabled:opacity-50"
                >
                  {isSavingDrWebhook ? 'Saving…' : 'Save data-rights webhook'}
                </button>
              </form>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border-default)] space-y-2">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] mb-1">Active Listeners</span>
              {!savedWebhookUrl ? (
                <span className="text-[11px] text-[var(--text-tertiary)] italic">No webhook endpoints configured.</span>
              ) : (
                <div className="p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-semibold text-[var(--text-primary)] truncate block" title={savedWebhookUrl}>{savedWebhookUrl}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedEvents.map((ev) => (
                        <span key={ev} className="px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/5 text-[9px] font-mono text-[var(--text-secondary)]">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleDeleteWebhook()}
                    className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Bottom: Webhook events log history */}
        <div className="p-6 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-[var(--text-secondary)]" />
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Event Stream logs</h3>
                <p className="text-[11px] text-[var(--text-secondary)]">Monitors the outbound POST delivery transactions sent to your target endpoints.</p>
              </div>
            </div>
            <button
              onClick={() => void handleSendTestWebhook()}
              disabled={isTesting || !savedWebhookUrl}
              className="px-3 py-1.5 text-xs font-bold border border-[var(--border-default)] rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1.5 text-[var(--text-primary)] disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {isTesting ? 'Sending test...' : 'Send Test Event'}
            </button>
          </div>

          <div className="border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--surface-base)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-default)] text-[10px] uppercase font-bold text-[var(--text-secondary)]">
                  <th className="p-3">Event Type</th>
                  <th className="p-3">Payload URL</th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Latency</th>
                  <th className="p-3 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {isLoadingLogs ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[var(--text-secondary)]">
                      <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                      Loading delivery logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-[var(--text-secondary)] italic">
                      No webhook deliveries logged yet. Save a webhook URL and click &quot;Send Test Event&quot; to validate your endpoint.
                    </td>
                  </tr>
                ) : (
                  logsPager.slice.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--surface-raised)]/50">
                      <td className="p-3 font-mono font-bold text-[var(--text-primary)]">
                        {log.event}
                        {log.is_test && (
                          <span className="ml-1.5 text-[9px] font-normal uppercase text-[var(--text-tertiary)]">test</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[var(--text-secondary)] max-w-[200px] truncate" title={log.url}>
                        {log.url}
                      </td>
                      <td className="p-3 text-[10px] text-[var(--text-secondary)]">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider',
                          log.success ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500',
                        )}>
                          {log.status_code ?? '—'} {log.status_text}
                        </span>
                      </td>
                      <td className="p-3 text-[10px] text-[var(--text-secondary)]">
                        {log.latency_ms}ms
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setInspectLogPayload(log)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold border border-[var(--border-default)] hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-primary)]"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <TablePager
              page={logsPager.page}
              pageCount={logsPager.pageCount}
              total={logsPager.total}
              pageSize={logsPager.pageSize}
              onPage={logsPager.setPage}
            />
          </div>
        </div>

      </div>

      {/* Log Inspector Modal */}
      {inspectLogPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl w-full max-w-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Webhook Transaction Payload</h3>
                <span className="font-mono text-[10px] text-[var(--text-secondary)] mt-0.5 block">
                  {inspectLogPayload.event} &rarr; {inspectLogPayload.url}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectLogPayload(null)}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              {inspectLogPayload.error && (
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-500">
                  Delivery error: {inspectLogPayload.error}
                </div>
              )}

              <div className="relative rounded-xl overflow-hidden bg-[#0A0A0A] border border-zinc-800">
                <pre className="p-4 font-mono text-[11px] text-zinc-300 overflow-x-auto leading-relaxed max-h-[350px]">
                  <code>{JSON.stringify(inspectLogPayload.payload, null, 2)}</code>
                </pre>
              </div>

              <div className="flex justify-end gap-2 text-xs">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(inspectLogPayload.payload, null, 2));
                    notify('Payload JSON copied.');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy JSON
                </button>
                <button
                  onClick={() => setInspectLogPayload(null)}
                  className="px-4 py-1.5 bg-[var(--brand-primary)] text-white font-bold rounded-lg"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
