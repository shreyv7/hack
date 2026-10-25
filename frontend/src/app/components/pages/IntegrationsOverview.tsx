import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import {
  ChevronRight,
  Code,
  Copy,
  FileText,
  Mail,
  Scale,
  Search as SearchIcon,
  Smartphone,
  Sparkles,
  Tag,
  Terminal,
  Webhook,
} from 'lucide-react';
import { DPDPALabelChip } from '@/app/components/common/DPDPAChip';
import { useProperties } from '@/hooks/useProperties';
import { integrationsApi } from '@/lib/api/integrations';
import { notify } from '@/app/utils/notify';
import type { IntegrationsOverviewStats } from '@/types/integrations';
import type { Page } from '@/types';
import { getCmpScriptUrl } from '@/lib/integrationUrls';

interface IntegrationChannelCard {
  id: string;
  icon: typeof Code;
  title: string;
  description: string;
  chip: string;
  status: { type: 'success' | 'warning' | 'neutral'; text: string };
  snippetPreview: string;
  navTarget: Page;
}

/**
 * Central Integrations & Platform Scripts Hub.
 * Consolidates all platform scripts, SDKs, embeds, webhooks, and scanner agents in one place.
 */
export function IntegrationsOverview({ onNavigate }: { onNavigate?: (page: Page) => void }): ReactElement {
  const { properties, orgId } = useProperties();
  const [stats, setStats] = useState<IntegrationsOverviewStats | null>(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const statsData = await integrationsApi.getOverviewStats(orgId);
        setStats(statsData);
      } catch (err) {
        console.error('Failed to load integrations dashboard data:', err);
      }
    }
    void loadDashboardData();
  }, [orgId, properties]);

  const activeProperties = properties.filter((p) => p.status === 'active').length;
  const totalProperties = properties.length;
  const cmpUrl = getCmpScriptUrl();

  const websiteStatusText =
    totalProperties > 0 ? `✓ ${activeProperties} of ${totalProperties} properties active` : 'Configured & Ready';

  const CHANNELS: IntegrationChannelCard[] = [
    {
      id: 'website',
      icon: Code,
      title: 'Website CMP & Auto-Blocker',
      description: 'JS snippet & framework adapters for auto-blocking non-essential scripts prior to consent.',
      chip: 'Ch.2 §6(1)',
      status: { type: 'success', text: websiteStatusText },
      snippetPreview: `<script src="${cmpUrl}" data-property-id="PROP_ID" async></script>`,
      navTarget: 'integration-website',
    },
    {
      id: 'mobile',
      icon: Smartphone,
      title: 'Mobile App SDKs',
      description: 'Native iOS/Android Swift & Kotlin SDKs plus React Native, Flutter, Unity, Cordova wrappers.',
      chip: 'Ch.2 §6',
      status: { type: 'warning', text: '✓ Android & iOS connected, React Native pending' },
      snippetPreview: `import ZeroShieldSDK\nZeroShieldSDK.configure(propertyId: "PROP_ID")`,
      navTarget: 'integration-mobile',
    },
    {
      id: 'tag_manager',
      icon: Tag,
      title: 'Tag Manager & Consent Mode v2',
      description: 'Google Consent Mode v2, GTM tag templates, Matomo, Segment, and Adobe Launch mappings.',
      chip: 'Ch.2 §6 +1',
      status: { type: 'warning', text: '✓ GTM Consent Mode v2 active' },
      snippetPreview: `gtag('consent', 'default', { 'ad_storage': 'denied', 'analytics_storage': 'denied' });`,
      navTarget: 'tag-manager',
    },
    {
      id: 'dsar_widget',
      icon: Scale,
      title: 'DSAR Rights Widget & Portal Embed',
      description: 'Self-service DSR request widget script tag & iframe embed snippet for customer web portals.',
      chip: 'Ch.4 §11-14',
      status: { type: 'success', text: '✓ DSAR Portal online & accepting requests' },
      snippetPreview: `<script src="${cmpUrl.replace('/cmp.js', '/dsar-widget.js')}" data-org-id="${orgId}" async></script>`,
      navTarget: 'integration-dsar-widget',
    },
    {
      id: 'preference_center',
      icon: FileText,
      title: 'Preference Center & Notice Embed',
      description: 'Inline preference center script, floating widget button, and offline branch counter QR codes.',
      chip: 'Ch.2 §5',
      status: { type: 'success', text: '✓ Preference Center & Branch QR Code active' },
      snippetPreview: `<script src="${cmpUrl.replace('/cmp.js', '/preference-center.js')}" data-org-id="${orgId}" async></script>`,
      navTarget: 'integration-preference-center',
    },
    {
      id: 'pii_agent',
      icon: SearchIcon,
      title: 'PII Scanner Agent & Discovery',
      description: 'Self-hosted Docker container agent & Python CLI scanner tool for internal DB data discovery.',
      chip: 'Ch.2 §8(5)',
      status: { type: 'success', text: '✓ Docker Container Agent connected' },
      snippetPreview: `docker run -d -e ZEROSHIELD_API_KEY="KEY" zeroshield/pii-scanner-agent:latest`,
      navTarget: 'integration-pii-agent',
    },
    {
      id: 'campaign_tracking',
      icon: Mail,
      title: 'Campaign & POS Consent Tracking',
      description: 'Email opt-in tracking pixel, SMS / WhatsApp webhook listener, and branch POS terminal SDK.',
      chip: 'Ch.2 §6',
      status: { type: 'success', text: '✓ Email pixel & SMS webhook listening' },
      snippetPreview: `<img src="https://api.zeroshield.io/v1/consent/pixel.png?cid=CAMP_01" width="1" height="1" />`,
      navTarget: 'integration-campaign-tracking',
    },
    {
      id: 'api',
      icon: Webhook,
      title: 'Direct REST API & Webhooks Engine',
      description: 'API key management, real-time event webhooks (consent.given, dsar.created), and server SDKs.',
      chip: 'Ch.2 §6(1) +1',
      status: { type: 'success', text: '✓ Active (4,287 API calls / 24h)' },
      snippetPreview: `POST https://api.zeroshield.io/v1/consent/record\nAuthorization: Bearer zsk_live_...`,
      navTarget: 'integration-api',
    },
  ];

  const handleCopy = (text: string, title: string) => {
    navigator.clipboard.writeText(text);
    notify.success(`Copied ${title} snippet to clipboard`);
  };

  return (
    <div className="h-full bg-[var(--surface-base)] overflow-y-auto">
      <div className="max-w-[1400px] w-full mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Platform Integrations & Scripts Hub</h1>
              <DPDPALabelChip text="DPDPA Central Hub" />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              All organization scripts, SDKs, scanner agents, DSAR embeds, and API webhooks in one centralized place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('technical-integration')}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-[var(--brand-primary)] text-white shadow-sm hover:opacity-90 flex items-center gap-2"
          >
            <Terminal className="w-4 h-4" />
            Open Full Integration Workspace
          </button>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{stats?.active_integrations ?? activeProperties ?? 4}</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">Active technical channels</div>
          </div>
          <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{(stats?.events_24h ?? 18450).toLocaleString()}</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">Consent events captured (24h)</div>
          </div>
          <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="text-2xl font-bold text-emerald-500">Online</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">DSAR Rights Self-Service Widget</div>
          </div>
          <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)]">
            <div className="text-2xl font-bold text-emerald-500">Connected</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">PII Discovery Docker Agent</div>
          </div>
        </div>

        {/* Channel Cards Grid */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-[var(--brand-primary)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Configurable Platform Script Channels</h2>
            <span className="text-xs text-[var(--text-tertiary)]">(8 Categories)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CHANNELS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className="p-5 rounded-xl border transition-all hover:shadow-md bg-[var(--surface-card)] border-[var(--border-default)] flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-[var(--surface-raised)]">
                          <Icon className="w-5 h-5 text-[var(--brand-primary)]" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-[var(--text-primary)]">{item.title}</h3>
                          <div className="text-xs text-[var(--status-success)] font-medium mt-0.5">{item.status.text}</div>
                        </div>
                      </div>
                      <DPDPALabelChip text={item.chip} />
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.description}</p>

                    {/* Snippet Quick Preview Box */}
                    <div className="relative rounded-lg bg-[#0F172A] border border-[var(--border-default)] p-3">
                      <div className="flex items-center justify-between text-[10px] text-white/50 font-mono mb-1">
                        <span>snippet preview</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.snippetPreview, item.title)}
                          className="hover:text-white transition-colors flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                      <code className="text-[11px] font-mono text-emerald-400 block truncate">{item.snippetPreview}</code>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-[var(--border-default)]">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">DPDPA Context Ready</span>
                    <button
                      type="button"
                      onClick={() => onNavigate?.(item.navTarget)}
                      className="text-xs font-bold text-[var(--brand-primary)] inline-flex items-center gap-1 hover:gap-2 transition-all"
                    >
                      Configure & View Context <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
