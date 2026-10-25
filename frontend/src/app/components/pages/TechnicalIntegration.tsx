import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Code,
  Copy,
  Edit2,
  FileText,
  Mail,
  QrCode,
  RefreshCw,
  Scale,
  Search as SearchIcon,
  Smartphone,
  Tag,
  Terminal,
  Webhook,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DPDPALabelChip } from '@/app/components/common/DPDPAChip';
import { DPDPAReferencePanel } from '@/app/components/common/DPDPAReferencePanel';
import { MappingDiagram } from '@/app/components/common/MappingDiagram';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchBanners } from '@/lib/api/consent';
import { notify } from '@/app/utils/notify';
import type { PropertyDetail } from '@/types/integrations';
import type { ConsentBanner } from '@/types/consent';
import { getCmpScriptUrl, getPublicApiBaseUrl } from '@/lib/integrationUrls';

export type IntegrationTab =
  | 'website'
  | 'mobile'
  | 'tag-manager'
  | 'dsar-widget'
  | 'preference-center'
  | 'pii-agent'
  | 'campaign-tracking'
  | 'api';

type MobilePlatform = 'ios' | 'android' | 'react-native' | 'flutter' | 'unity' | 'cordova';
type WebFramework = 'html' | 'react' | 'nextjs' | 'angular' | 'vue' | 'wordpress' | 'shopify';

interface TechnicalIntegrationProps {
  propertyId: string;
  defaultTab?: IntegrationTab;
  onNavigateToBannerBuilder?: (bannerId: string) => void;
}

const TABS: { id: IntegrationTab; label: string; icon: typeof Code; chip: string }[] = [
  { id: 'website', label: 'Website CMP', icon: Code, chip: 'Ch.2 §6(1)' },
  { id: 'mobile', label: 'Mobile SDK', icon: Smartphone, chip: 'Ch.2 §6' },
  { id: 'tag-manager', label: 'Tag Manager & Consent Mode', icon: Tag, chip: 'Ch.2 §6 +1' },
  { id: 'dsar-widget', label: 'DSAR Widget & Portal', icon: Scale, chip: 'Ch.4 §11-14' },
  { id: 'preference-center', label: 'Preference Center & Notice', icon: FileText, chip: 'Ch.2 §5' },
  { id: 'pii-agent', label: 'PII Scanner Agent', icon: SearchIcon, chip: 'Ch.2 §8(5)' },
  { id: 'campaign-tracking', label: 'Campaign & POS Tracking', icon: Mail, chip: 'Ch.2 §6' },
  { id: 'api', label: 'API & Webhook Subscriptions', icon: Webhook, chip: 'Ch.2 §6(1) +1' },
];

const MOBILE_PLATFORMS = [
  { id: 'ios' as MobilePlatform, label: 'iOS Native Swift', version: 'v4.2.1', status: 'success' },
  { id: 'android' as MobilePlatform, label: 'Android Kotlin', version: 'v4.2.1', status: 'success' },
  { id: 'react-native' as MobilePlatform, label: 'React Native', version: 'v4.2.0', status: 'warning' },
  { id: 'flutter' as MobilePlatform, label: 'Flutter', version: 'v4.1.8', status: 'success' },
  { id: 'unity' as MobilePlatform, label: 'Unity', version: 'v4.1.5', status: 'none' },
  { id: 'cordova' as MobilePlatform, label: 'Cordova / Ionic', version: 'v4.1.2', status: 'none' },
];

const WEB_FRAMEWORKS: { id: WebFramework; label: string }[] = [
  { id: 'html', label: 'HTML / CDN Script' },
  { id: 'react', label: 'React.js' },
  { id: 'nextjs', label: 'Next.js' },
  { id: 'angular', label: 'Angular' },
  { id: 'vue', label: 'Vue.js / Nuxt' },
  { id: 'wordpress', label: 'WordPress' },
  { id: 'shopify', label: 'Shopify' },
];

const CONSENT_MODE_MAPPINGS = [
  { purpose: 'Strictly Necessary', modes: 'security_storage / functionality_storage' },
  { purpose: 'Analytics', modes: 'analytics_storage' },
  { purpose: 'Advertising', modes: 'ad_storage / ad_user_data / ad_personalization' },
  { purpose: 'Functional', modes: 'personalization_storage' },
];

const REST_ENDPOINTS = [
  { method: 'GET' as const, endpoint: '/v1/consent/check', desc: 'Query active consent status for data principal' },
  { method: 'POST' as const, endpoint: '/v1/consent/record', desc: 'Submit explicit consent record with HMAC signature' },
  { method: 'POST' as const, endpoint: '/v1/consent/withdraw', desc: 'Process consent withdrawal signal' },
  { method: 'GET' as const, endpoint: '/v1/dsr/{requestId}', desc: 'Track DSAR fulfillment SLA status' },
  { method: 'POST' as const, endpoint: '/v1/dsr', desc: 'Submit new Data Principal Rights request' },
  { method: 'GET' as const, endpoint: '/v1/tcf-string', desc: 'Retrieve IAB TCF v2.2 encoded string' },
];

const DPDPA_REFERENCES = [
  'Ch.2 §5 Notice requirement prior to consent collection',
  'Ch.2 §6 Free, informed, specific, unconditional, unambiguous consent',
  'Ch.2 §6(1) Consent manager interoperability',
  'Ch.2 §8(4) Accuracy and consistency of personal data',
  'Ch.2 §8(5) Technical & organizational security safeguards',
  'Ch.4 §11-14 Data Principal Rights (Access, Correction, Erasure, Grievance)',
];

function CodeBlock({ code, language = 'html' }: { code: string; language?: string }): ReactElement {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    notify.success('Code snippet copied to clipboard');
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-[var(--border-default)] my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1E1B4B] border-b border-white/10">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-white/60" />
          <span className="text-xs font-medium text-white/60 font-mono">{language}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono text-emerald-400 bg-[#0F172A] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function TechnicalIntegration({
  propertyId,
  defaultTab = 'website',
  onNavigateToBannerBuilder,
}: TechnicalIntegrationProps): ReactElement {
  const [activeTab, setActiveTab] = useState<IntegrationTab>(defaultTab);
  const [selectedPlatform, setSelectedPlatform] = useState<MobilePlatform>('ios');
  const [selectedFramework, setSelectedFramework] = useState<WebFramework>('html');

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [allProperties, setAllProperties] = useState<PropertyDetail[]>([]);
  const [banners, setBanners] = useState<ConsentBanner[]>([]);
  const [activeBanner, setActiveBanner] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        let propData: PropertyDetail | null = null;
        try {
          propData = await integrationsApi.getProperty(propertyId);
        } catch {
          // fallback mock property if not found
          propData = {
            id: propertyId || 'prop-default',
            organization_id: 'org-demo',
            name: 'Primary Enterprise App',
            display_name: 'Primary Enterprise App',
            domain: 'app.example.com',
            property_type: 'website',
            environment: 'production',
            status: 'active',
            blocker_mode: 'standard',
            auto_language: true,
            default_language: 'en',
            consent_notice_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            health_score: 95,
            health_grade: 'A',
            last_updated_time: new Date().toISOString(),
            settings: {
              environment: 'production',
              blocker_mode: 'standard',
              auto_language: true,
              default_language: 'en',
              geo_targeting: {},
              allowed_origins: [],
              advanced_metadata: {},
            },
            api_keys: [],
            api_key_prefix: 'zs_live_9f82a1',
            active_banner: {
              property_id: propertyId || 'prop-default',
              banner_id: 'b-01',
              status: 'active',
              activated_at: new Date().toISOString(),
              banner_name: 'DPDPA Universal Banner v2',
              banner_version: '2.4',
            },
            active_banner_name: 'DPDPA Universal Banner v2',
          };
        }

        const targetOrgId = propData.organization_id;
        const targetPropId = propData.id;

        const [, bannersData, propsList] = await Promise.all([
          integrationsApi.getSnippet(targetPropId).catch(() => ({
            html: `<script src="${getCmpScriptUrl()}" data-property-id="${targetPropId}" data-tenant-id="${targetOrgId}" async></script>`,
            react: `import { VajraProvider } from '@vajra/react';`,
            npm: `npm install @vajra/cmp-sdk`,
          })),
          fetchBanners(targetOrgId).catch(() => []),
          integrationsApi.listProperties(targetOrgId).catch(() => [propData as PropertyDetail]),
        ]);

        setProperty(propData);
        setAllProperties((propsList as PropertyDetail[]).length > 0 ? (propsList as PropertyDetail[]) : [propData]);
        setBanners(bannersData.filter((b: ConsentBanner) => b.status === 'Live'));
        setActiveBanner(propData.active_banner?.banner_id || (bannersData[0]?.id ?? ''));
      } catch (err) {
        console.error('Failed to load integration data', err);
      } finally {
        setIsLoading(false);
      }
    }
    void loadData();
  }, [propertyId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-[var(--surface-base)]">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-primary)]" />
          <span>Loading technical script configurations...</span>
        </div>
      </div>
    );
  }

  const currentProperty = property || {
    id: propertyId || 'prop-default',
    organization_id: 'org-demo',
    name: 'Primary Enterprise App',
    display_name: 'Primary Enterprise App',
    domain: 'app.example.com',
    type: 'website',
    status: 'active',
    environment: 'production',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    api_key_prefix: 'zs_live_9f82a1',
  };

  const cmpUrl = getCmpScriptUrl();
  const apiUrl = getPublicApiBaseUrl();

  // Dynamic code snippets
  const websiteHtmlSnippet = `<script
  src="${cmpUrl}"
  data-property-id="${currentProperty.id}"
  data-api-key="${currentProperty.api_key_prefix || 'zs_live_key'}"
  data-api-url="${apiUrl}"
  data-blocker-mode="auto"
  ${activeBanner ? `data-banner-id="${activeBanner}"` : ''}
  async
></script>`;

  const websiteReactSnippet = `// 1. Install NPM package
npm install @vajra/react-cmp

// 2. Wrap main application root component:
import React from 'react';
import { VajraProvider } from '@vajra/react-cmp';

export default function App() {
  return (
    <VajraProvider
      propertyId="${currentProperty.id}"
      apiKey="${currentProperty.api_key_prefix || 'zs_live_key'}"
      apiUrl="${apiUrl}"
      options={{
        blockerMode: 'auto',
        bannerId: '${activeBanner || 'b-01'}',
      }}
    >
      <YourAppComponents />
    </VajraProvider>
  );
}`;

  const websiteNextSnippet = `// app/layout.tsx or pages/_document.tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="${cmpUrl}"
          strategy="afterInteractive"
          data-property-id="${currentProperty.id}"
          data-api-key="${currentProperty.api_key_prefix || 'zs_live_key'}"
          data-api-url="${apiUrl}"
          data-blocker-mode="auto"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`;

  const swiftInit = `import VajraSDK

func application(_ application: UIApplication,
                didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    VajraSDK.configure(
        propertyId: "${currentProperty.id}",
        apiKey: "${currentProperty.api_key_prefix || 'zs_live_key'}",
        apiUrl: "${apiUrl}"
    )
    return true
}`;

  const kotlinInit = `import com.vajra.android.sdk.Vajra

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Vajra.initialize(
            context = this,
            propertyId = "${currentProperty.id}",
            apiKey = "${currentProperty.api_key_prefix || 'zs_live_key'}"
        )
    }
}`;

  const dsarWidgetScript = `<!-- Vajra DSAR Self-Service Portal Widget -->
<script
  src="${cmpUrl.replace('/cmp.js', '/dsar-widget.js')}"
  data-org-id="${currentProperty.organization_id}"
  data-theme="dark"
  data-position="bottom-right"
  async
></script>`;

  const dsarIframeEmbed = `<!-- DPDPA Rights Portal Iframe Embed (Privacy Policy Page) -->
<iframe
  src="${window.location.origin}/rights/portal?org=${currentProperty.organization_id}"
  width="100%"
  height="680px"
  style="border: 1px solid var(--border-default); border-radius: 12px;"
  title="Data Principal Rights Portal"
></iframe>`;

  const prefCenterEmbed = `<!-- Embedded Preference Center Snippet -->
<div id="vajra-preference-center"></div>
<script
  src="${cmpUrl.replace('/cmp.js', '/preference-center.js')}"
  data-org-id="${currentProperty.organization_id}"
  data-target="#vajra-preference-center"
  async
></script>`;

  const dockerPiiAgent = `# Run Self-Hosted PII Scanner Container Agent
docker run -d \\
  --name vajra-scanner-agent \\
  -e VAJRA_API_KEY="${currentProperty.api_key_prefix || 'zs_live_key'}" \\
  -e VAJRA_ORG_ID="${currentProperty.organization_id}" \\
  -e DB_CONNECTION_STRING="postgresql://db_user:password@internal-db:5432/customer_db" \\
  -p 8088:8088 \\
  vajra/pii-scanner-agent:latest`;

  const pythonPiiCli = `# Install PII Scanner CLI
pip install vajra-scanner

# Run automated scan against local database or server
vajra-scanner scan \\
  --api-key "${currentProperty.api_key_prefix || 'zs_live_key'}" \\
  --host "localhost" \\
  --port 5432 \\
  --db "production_db"`;

  const campaignPixel = `<!-- Consent Email Opt-In Tracking Pixel -->
<img
  src="${apiUrl}/v1/consent/pixel.png?org_id=${currentProperty.organization_id}&cid=EMAIL_CAMPAIGN_01&uid={{user_id}}"
  width="1"
  height="1"
  alt=""
  style="display:none;"
/>`;

  const smsWebhookPayload = `// SMS / WhatsApp Webhook Endpoint: POST ${apiUrl}/v1/consent/webhook/sms
// Headers: X-Vajra-Signature: <HMAC_SHA256>
{
  "phone": "+919876543210",
  "consent_action": "OPT_IN",
  "keyword": "CONSENT",
  "notice_id": "notice_banking_v1",
  "timestamp": "${new Date().toISOString()}"
}`;

  return (
    <div className="h-full flex flex-col bg-[var(--surface-base)] overflow-y-auto">
      <div className="max-w-[1400px] w-full mx-auto p-6 space-y-6">
        {/* Top Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Technical Integration Workspace</h1>
              <DPDPALabelChip text="DPDPA Central Hub" />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Configure and test scripts for website CMP, mobile app SDKs, DSAR widgets, scanner agents, and webhooks.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Target Property:</label>
            <select
              value={currentProperty.id}
              onChange={(e) => {
                const found = allProperties.find((p) => p.id === e.target.value);
                if (found) setProperty(found);
              }}
              className="px-3 py-1.5 rounded-lg border text-sm font-medium bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-primary)]"
            >
              {allProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || p.domain} ({p.domain || p.property_type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* System Mapping Architecture */}
        <MappingDiagram />

        {/* Active Banner Control Bar */}
        <div className="p-4 rounded-xl flex items-center justify-between bg-[var(--surface-card)] border border-[var(--border-default)] shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Active Consent Banner:</span>
            <div className="relative flex-1 max-w-md">
              <select
                value={activeBanner}
                onChange={(e) => setActiveBanner(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border text-sm font-medium appearance-none pr-10 border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
              >
                {banners.map((banner) => (
                  <option key={banner.id} value={banner.id}>
                    {banner.name} ({banner.version})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-tertiary)]" />
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--status-success-bg)] text-[var(--status-success)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live & Publishing
            </span>
          </div>
          {onNavigateToBannerBuilder ? (
            <button
              type="button"
              onClick={() => onNavigateToBannerBuilder(activeBanner)}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
            >
              <Edit2 className="w-4 h-4 text-[var(--brand-primary)]" />
              Edit in Banner Builder
            </button>
          ) : null}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border-default)] pb-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all shrink-0 rounded-t-lg',
                  isActive
                    ? 'text-[var(--brand-primary)] border-[var(--brand-primary)] bg-[var(--surface-card)]'
                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]',
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-tertiary)]')} />
                <span>{tab.label}</span>
                <DPDPALabelChip text={tab.chip} />
              </button>
            );
          })}
        </div>

        {/* TAB 1: WEBSITE CMP */}
        {activeTab === 'website' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <Code className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">Website Consent Banner & Cookie Auto-Blocker</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Auto-blocks non-essential cookies and third-party scripts prior to explicit consent per DPDPA Sec 6(1).
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.2 §6(1)" />
            </div>

            {/* Framework Selector */}
            <div className="flex gap-2 border-b border-[var(--border-default)] pb-2 overflow-x-auto">
              {WEB_FRAMEWORKS.map((fw) => (
                <button
                  key={fw.id}
                  type="button"
                  onClick={() => setSelectedFramework(fw.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    selectedFramework === fw.id
                      ? 'bg-[var(--brand-primary)] text-white shadow-sm'
                      : 'bg-[var(--surface-card)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {fw.label}
                </button>
              ))}
            </div>

            <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)]">
              <h3 className="font-semibold mb-2 text-[var(--text-primary)]">Installation Code Snippet ({selectedFramework.toUpperCase()})</h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Place this snippet in the <code className="text-emerald-500 font-mono">&lt;head&gt;</code> element of your website. It intercepts and controls script loading automatically.
              </p>

              {selectedFramework === 'html' && <CodeBlock code={websiteHtmlSnippet} language="html" />}
              {selectedFramework === 'react' && <CodeBlock code={websiteReactSnippet} language="tsx" />}
              {selectedFramework === 'nextjs' && <CodeBlock code={websiteNextSnippet} language="tsx" />}
              {selectedFramework !== 'html' && selectedFramework !== 'react' && selectedFramework !== 'nextjs' && (
                <CodeBlock code={websiteHtmlSnippet} language="html" />
              )}

              <div className="p-4 rounded-lg bg-[var(--status-warning-bg)] border border-[var(--status-warning)] mt-4">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-[var(--status-warning)] shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                    <strong>Critical Compliance Directive:</strong> Ensure this script tag is loaded <em>before</em> Google Tag Manager, Meta Pixel, or any analytics script. Pre-consent tracking is explicitly prohibited under DPDPA Chapter 2 Section 6.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MOBILE SDK */}
        {activeTab === 'mobile' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <Smartphone className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">Native & Cross-Platform Mobile SDKs</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Native consent modals, preference center synchronization, and event tracking for iOS, Android, React Native, and Flutter.
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.2 §6" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {MOBILE_PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all bg-[var(--surface-card)]',
                    selectedPlatform === platform.id
                      ? 'ring-2 ring-[var(--brand-primary)] border-[var(--brand-primary)]'
                      : 'border-[var(--border-default)] hover:border-gray-400',
                  )}
                >
                  <div className="font-bold text-sm text-[var(--text-primary)]">{platform.label}</div>
                  <div className="text-xs font-mono text-[var(--text-tertiary)] mt-1">{platform.version}</div>
                  <div className="mt-3 flex items-center gap-1.5">
                    {platform.status === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    {platform.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    {platform.status === 'none' && <XCircle className="w-4 h-4 text-gray-400" />}
                    <span className="text-xs font-medium text-[var(--text-secondary)] capitalize">{platform.status}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-4">
              <h3 className="font-semibold text-[var(--text-primary)]">SDK Initialization ({selectedPlatform.toUpperCase()})</h3>
              {selectedPlatform === 'ios' ? (
                <>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">CocoaPods Package</h4>
                    <CodeBlock code={`pod 'VajraSDK', '~> 4.2'`} language="ruby" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Swift AppDelegate Setup</h4>
                    <CodeBlock code={swiftInit} language="swift" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Gradle Dependency</h4>
                    <CodeBlock code={`implementation 'com.vajra.android:sdk:4.2.1'`} language="groovy" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Kotlin Application Setup</h4>
                    <CodeBlock code={kotlinInit} language="kotlin" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TAG MANAGER */}
        {activeTab === 'tag-manager' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <Tag className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">Tag Manager & Google Consent Mode v2</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Synchronize consent states with Google Tag Manager, GA4, Meta Ads, Matomo, and Segment.
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.2 §6 +1" />
            </div>

            <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-4">
              <h3 className="font-semibold text-[var(--text-primary)]">Google Consent Mode v2 Default Setup</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Insert this default consent state snippet prior to firing GTM tags.
              </p>
              <CodeBlock
                code={`<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'security_storage': 'granted',
    'wait_for_update': 500
  });
</script>`}
                language="html"
              />

              <h4 className="font-semibold text-sm text-[var(--text-primary)] mt-6">Consent Mapping Matrix</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CONSENT_MODE_MAPPINGS.map((item) => (
                  <div key={item.purpose} className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)]">
                    <div className="text-xs font-bold text-[var(--brand-primary)] mb-1">{item.purpose}</div>
                    <div className="text-xs font-mono text-[var(--text-secondary)]">{item.modes}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DSAR WIDGET */}
        {activeTab === 'dsar-widget' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <Scale className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">Data Principal Rights (DSAR) Widget & Portal Embed</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Allow data subjects to submit Access, Correction, Erasure, and Grievance Redressal requests directly from your customer portal.
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.4 §11-14" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-3">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">Option A: Floating Rights Portal Widget Tag</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Injects a sleek floating widget on your website footer or user dashboard.
                </p>
                <CodeBlock code={dsarWidgetScript} language="html" />
              </div>

              <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-3">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">Option B: Privacy Policy Iframe Embed</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Embed full DSR request form directly inside your Privacy Policy page.
                </p>
                <CodeBlock code={dsarIframeEmbed} language="html" />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PREFERENCE CENTER */}
        {activeTab === 'preference-center' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <FileText className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">Preference Center & Notice Embed Snippets</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Embed customer preference center and generate offline QR codes for bank branches and retail counters per DPDPA Sec 5.
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.2 §5" />
            </div>

            <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-4">
              <h3 className="font-semibold text-[var(--text-primary)]">Embedded Customer Preference Center</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Render consent notices and preference toggles inline within user account settings.
              </p>
              <CodeBlock code={prefCenterEmbed} language="html" />

              <div className="p-4 rounded-xl border bg-[var(--surface-raised)] border-[var(--border-default)] mt-6 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-[var(--text-primary)]">Offline Branch / Retail Store QR Code Notice</h4>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Printable QR Code for physical branch counters to capture digital consent before service fulfillment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => notify.success('Generating high-resolution QR Code PDF for branch counters...')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--brand-primary)] text-white flex items-center gap-2"
                >
                  <QrCode className="w-4 h-4" />
                  Generate Branch QR Code
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PII SCANNER AGENT */}
        {activeTab === 'pii-agent' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <SearchIcon className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">PII Scanner Agent & Discovery Scripts</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Deploy self-hosted Docker container agents or run Python CLI discovery scripts against internal databases per DPDPA Sec 8(5).
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.2 §8(5)" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-3">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">Option A: Self-Hosted Docker Agent</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Runs inside your VPC/K8s cluster to continuously discover PII fields in PostgreSQL, MySQL, Mongo, or S3.
                </p>
                <CodeBlock code={dockerPiiAgent} language="bash" />
              </div>

              <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-3">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">Option B: Python CLI Database Scanner</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Run on-demand security scans across local databases or file shares.
                </p>
                <CodeBlock code={pythonPiiCli} language="bash" />
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: CAMPAIGN & POS TRACKING */}
        {activeTab === 'campaign-tracking' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <Mail className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">Email, SMS & POS Consent Tracking Pixels & Webhooks</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Track email opt-ins, listen for SMS/WhatsApp keyword consents, and integrate branch POS terminals.
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.2 §6" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-3">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">Email Opt-In Tracking Pixel</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Embed in transactional email campaigns to log proof of consent upon opening.
                </p>
                <CodeBlock code={campaignPixel} language="html" />
              </div>

              <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-3">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">SMS / WhatsApp Webhook Payload</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Endpoint for telecom gateways to forward keyword consents (e.g. "START CONSENT").
                </p>
                <CodeBlock code={smsWebhookPayload} language="json" />
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: API & WEBHOOK SUBSCRIPTIONS */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--surface-raised)]">
                  <Webhook className="w-5 h-5 text-[var(--brand-primary)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">Direct REST API & HMAC Webhook Engine</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Server-to-server consent evaluation APIs and real-time webhook subscriptions for compliance events.
                  </p>
                </div>
              </div>
              <DPDPALabelChip text="Ch.2 §6(1) +1" />
            </div>

            <div className="p-6 rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)] space-y-4">
              <h3 className="font-semibold text-[var(--text-primary)]">API Keys & Authentication</h3>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">Secret API Key:</span>
                  <div className="font-mono text-sm font-bold text-[var(--text-primary)] mt-0.5">
                    {currentProperty.api_key_prefix || 'zs_live_9f82a1'}••••••••••••••••
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentProperty.api_key_prefix || 'zs_live_9f82a1');
                    notify.success('API Key prefix copied');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--brand-primary)] text-white"
                >
                  Copy Key Prefix
                </button>
              </div>

              <h4 className="font-semibold text-sm text-[var(--text-primary)] mt-6">REST Endpoints Catalog</h4>
              <div className="space-y-2">
                {REST_ENDPOINTS.map((api) => (
                  <div key={api.endpoint} className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-mono font-bold', api.method === 'GET' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800')}>
                        {api.method}
                      </span>
                      <code className="text-xs font-mono font-bold text-[var(--text-primary)]">{api.endpoint}</code>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">{api.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom DPDPA Compliance Panel */}
        <DPDPAReferencePanel references={DPDPA_REFERENCES} />
      </div>
    </div>
  );
}
