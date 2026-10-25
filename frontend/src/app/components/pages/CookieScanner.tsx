import type { ReactElement } from 'react';
import { useState } from 'react';
import { Search, Check, AlertTriangle, X, Copy, ExternalLink, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';

type ScannerTab = 'sdk-verification' | 'public-scanner';
type PropertyStatus = 'operational' | 'issues';
type CheckStatus = 'pass' | 'fail';
type CookieCategory = 'Essential' | 'Analytics' | 'Advertising';

interface ScannerProperty {
  id: string;
  name: string;
  status: PropertyStatus;
  pagesScanned: number;
  pagesWithSDK: number;
  issuesCount: number;
}

interface SdkCheck {
  id: number;
  name: string;
  status: CheckStatus;
  detail: string;
}

interface PageCoverage {
  url: string;
  sdkDetected: boolean;
  bannerShown: boolean;
  blockedCount: number;
}

interface ScannedCookie {
  name: string;
  category: CookieCategory;
  purpose: string;
  expires: string;
  preConsent: boolean;
}

const PROPERTIES: ScannerProperty[] = [
  { id: 'acmeretail.in', name: 'acmeretail.in', status: 'operational', pagesScanned: 52, pagesWithSDK: 52, issuesCount: 0 },
  { id: 'shop.acmeretail.in', name: 'shop.acmeretail.in', status: 'issues', pagesScanned: 52, pagesWithSDK: 47, issuesCount: 5 },
  { id: 'mobile-app', name: 'Mobile App (Android)', status: 'operational', pagesScanned: 1, pagesWithSDK: 1, issuesCount: 0 },
  { id: 'ios', name: 'Mobile App (iOS)', status: 'operational', pagesScanned: 1, pagesWithSDK: 1, issuesCount: 0 },
];

const SDK_CHECKS: SdkCheck[] = [
  { id: 1, name: 'SDK script loaded', status: 'pass', detail: 'Vajra SDK v3.2.1 detected' },
  { id: 2, name: 'SDK loaded before tracking scripts', status: 'pass', detail: 'Loads 200ms before analytics' },
  { id: 3, name: 'SDK version current', status: 'pass', detail: 'v3.2.1 (latest)' },
  { id: 4, name: 'Pre-consent blocker active', status: 'pass', detail: 'Blocks 12 tracker categories' },
  { id: 5, name: 'Consent banner displayed', status: 'pass', detail: 'Shown to new users' },
  { id: 6, name: 'Consent events flowing to backend', status: 'pass', detail: 'Last event 12 seconds ago' },
  { id: 7, name: 'Withdrawal URL responding', status: 'pass', detail: 'HTTP 200 OK' },
  { id: 8, name: 'Cookie Policy link valid', status: 'pass', detail: 'Points to /cookie-policy' },
];

const PAGES_COVERAGE: PageCoverage[] = [
  { url: '/', sdkDetected: true, bannerShown: true, blockedCount: 8 },
  { url: '/products', sdkDetected: true, bannerShown: true, blockedCount: 12 },
  { url: '/checkout', sdkDetected: true, bannerShown: true, blockedCount: 6 },
  { url: '/account', sdkDetected: true, bannerShown: true, blockedCount: 4 },
  { url: '/admin/legacy-page', sdkDetected: false, bannerShown: false, blockedCount: 0 },
];

const COOKIES: ScannedCookie[] = [
  { name: '_ga', category: 'Analytics', purpose: 'Google Analytics tracking', expires: '2 years', preConsent: false },
  { name: '_fbp', category: 'Advertising', purpose: 'Facebook Pixel', expires: '3 months', preConsent: false },
  { name: 'session_id', category: 'Essential', purpose: 'Session management', expires: 'Session', preConsent: true },
  { name: 'consent_preferences', category: 'Essential', purpose: 'Store consent choices', expires: '1 year', preConsent: true },
];

/** Category badge classes for scanned cookies. */
function cookieCategoryClass(category: CookieCategory): string {
  if (category === 'Essential') return 'bg-blue-100 text-blue-700';
  if (category === 'Analytics') return 'bg-purple-100 text-purple-700';
  return 'bg-orange-100 text-orange-700';
}

/**
 * Cookie scanner for SDK integration verification and public website compliance scans.
 */
export function CookieScanner(): ReactElement {
  const [activeTab, setActiveTab] = useState<ScannerTab>('sdk-verification');
  const [selectedProperty, setSelectedProperty] = useState('acmeretail.in');

  const currentProperty = PROPERTIES.find((p) => p.id === selectedProperty);
  const isOperational = currentProperty?.status === 'operational';
  const {
    page: coveragePage,
    setPage: setCoveragePage,
    pageCount: coveragePageCount,
    pageItems: coveragePageItems,
    total: coverageTotal,
    pageSize: coveragePageSize,
  } = useClientPagination(PAGES_COVERAGE, TABLE_PAGE_SIZE, selectedProperty);

  return (
    <div className="min-h-screen p-8 bg-[var(--surface-base)]">
      <div className="max-w-[1280px] mx-auto">
        <div className="mb-6">
          <h1 className="mb-2">Cookie Scanner</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            SDK integration verification and public website scanning
          </p>
        </div>

        <div className="mb-6">
          <div className="flex gap-2 border-b border-[var(--border-default)]">
            {(
              [
                { key: 'sdk-verification' as const, label: 'SDK Integration Verification' },
                { key: 'public-scanner' as const, label: 'Public Scanner' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors border-b-2',
                  activeTab === tab.key
                    ? 'text-[var(--brand-primary)] border-[var(--brand-primary)]'
                    : 'text-[var(--text-secondary)] border-transparent',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'sdk-verification' ? (
          <>
            <div className="mb-6">
              <div className="flex gap-2">
                {PROPERTIES.map((prop) => (
                  <button
                    key={prop.id}
                    type="button"
                    onClick={() => setSelectedProperty(prop.id)}
                    className={cn(
                      'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors',
                      selectedProperty === prop.id ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                      selectedProperty === prop.id
                        ? 'bg-[var(--surface-card)] text-[var(--text-primary)] border-b-2 border-[var(--brand-primary)]'
                        : 'text-[var(--text-secondary)]',
                    )}
                  >
                    {prop.name}
                    {prop.issuesCount > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
                        {prop.issuesCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <div
                className={cn(
                  'p-6 rounded-lg border',
                  isOperational
                    ? 'bg-[var(--status-success-bg)] border-[var(--status-success)]'
                    : 'bg-[var(--status-warning-bg)] border-[var(--status-warning)]',
                )}
              >
                <div className="flex items-center gap-3">
                  {isOperational ? (
                    <Check className="w-8 h-8 text-[var(--status-success)]" strokeWidth={2} />
                  ) : (
                    <AlertTriangle className="w-8 h-8 text-[var(--status-warning)]" strokeWidth={2} />
                  )}
                  <div>
                    <h3
                      className={cn(
                        isOperational ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]',
                      )}
                    >
                      {isOperational
                        ? `${selectedProperty}: SDK detected and operational`
                        : `${selectedProperty}: SDK detected on ${currentProperty?.pagesWithSDK} of ${currentProperty?.pagesScanned} pages — ${currentProperty?.issuesCount} pages missing`}
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="mb-4">SDK Health Checklist</h2>
              <div className="grid grid-cols-2 gap-4">
                {SDK_CHECKS.map((check) => (
                  <div
                    key={check.id}
                    className="p-4 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]"
                  >
                    <div className="flex items-start gap-3">
                      {check.status === 'pass' ? (
                        <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--status-success)]" strokeWidth={2} />
                      ) : (
                        <X className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--status-danger)]" strokeWidth={2} />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium mb-1 text-[var(--text-primary)]">{check.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{check.detail}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h2 className="mb-4">Page-by-Page Coverage</h2>
              <div className="rounded-lg border overflow-hidden bg-[var(--surface-card)] border-[var(--border-default)]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-default)]">
                      {['URL', 'SDK Detected', 'Banner Shown', 'Pre-consent Blocked', 'Last Verified'].map(
                        (header) => (
                          <th
                            key={header}
                            className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]"
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {coveragePageItems.map((page) => (
                      <tr key={page.url} className="border-b border-[var(--border-default)]">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-[var(--text-primary)]">{page.url}</span>
                        </td>
                        <td className="px-4 py-3">
                          {page.sdkDetected ? (
                            <Check className="w-4 h-4 text-[var(--status-success)]" strokeWidth={2} />
                          ) : (
                            <X className="w-4 h-4 text-[var(--status-danger)]" strokeWidth={2} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {page.bannerShown ? (
                            <Check className="w-4 h-4 text-[var(--status-success)]" strokeWidth={2} />
                          ) : (
                            <X className="w-4 h-4 text-[var(--status-danger)]" strokeWidth={2} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-[var(--text-secondary)]">{page.blockedCount} trackers</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-[var(--text-secondary)]">2 min ago</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TablePager
                  page={coveragePage}
                  pageCount={coveragePageCount}
                  total={coverageTotal}
                  pageSize={coveragePageSize}
                  onPage={setCoveragePage}
                />
              </div>
            </div>

            <div className="p-6 rounded-lg border bg-[var(--surface-card)] border-[var(--border-default)]">
              <div className="flex items-center justify-between mb-4">
                <h3>Installation Snippet</h3>
                <div className="flex gap-2">
                  <button type="button" className="px-3 py-1.5 rounded text-sm font-medium border border-[var(--border-default)]">
                    Web
                  </button>
                  <button type="button" className="px-3 py-1.5 rounded text-sm font-medium text-[var(--text-secondary)]">
                    React
                  </button>
                  <button type="button" className="px-3 py-1.5 rounded text-sm font-medium text-[var(--text-secondary)]">
                    iOS
                  </button>
                  <button type="button" className="px-3 py-1.5 rounded text-sm font-medium text-[var(--text-secondary)]">
                    Android
                  </button>
                </div>
              </div>
              <div className="relative">
                <pre className="p-4 rounded font-mono text-sm overflow-x-auto bg-[var(--surface-raised)] text-[var(--text-primary)]">
                  {`<script src="https://cdn.vajra.com/sdk/v3.2.1/vajra.js"></script>
<script>
  Vajra.init({
    apiKey: 'your_api_key_here',
    domain: 'acmeretail.in'
  });
</script>`}
                </pre>
                <button type="button" className="absolute top-4 right-4 p-2 rounded hover:bg-white/10 transition-colors">
                  <Copy className="w-4 h-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-semibold mb-4 text-[var(--text-primary)]">
                How DPDPA-compliant is your website?
              </h1>
              <p className="text-lg mb-8 text-[var(--text-secondary)]">
                Free instant scan reveals every cookie, tracker, and pixel — and tells you exactly what needs consent.
              </p>

              <div className="mb-6">
                <div className="relative max-w-xl mx-auto">
                  <input
                    type="text"
                    placeholder="Enter your website URL"
                    className="w-full px-6 py-4 rounded-lg border text-lg transition-colors focus:outline-none focus:ring-2 border-[var(--border-default)] focus:ring-[var(--brand-primary)]"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 rounded-lg text-white font-medium transition-opacity hover:opacity-90 bg-[var(--brand-primary)]"
                  >
                    Scan now (free)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 text-sm mb-12 text-[var(--text-secondary)]">
                {['No signup needed for first scan', 'Results in 60 seconds', 'Used by 2,400+ Indian businesses'].map(
                  (text) => (
                    <div key={text} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[var(--status-success)]" strokeWidth={2} />
                      {text}
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-12">
              {[
                { icon: FileCode, title: 'What we find', body: 'Cookies, trackers, pixels, fingerprinting, SDKs' },
                { icon: Search, title: 'What you get', body: 'Compliance report, remediation list, DPDPA section mapping' },
                {
                  icon: AlertTriangle,
                  title: 'Why it matters',
                  body: '₹250 Cr penalty exposure under DPDPA',
                  showChip: true,
                },
              ].map((card) => {
                const CardIcon = card.icon;
                return (
                  <div
                    key={card.title}
                    className="p-6 rounded-lg border text-center bg-[var(--surface-card)] border-[var(--border-default)]"
                  >
                    <CardIcon className="w-8 h-8 mx-auto mb-3 text-[var(--brand-primary)]" strokeWidth={1.5} />
                    <h3 className="mb-2">{card.title}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{card.body}</p>
                    {'showChip' in card && card.showChip && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mt-2 bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
                        ₹250 Cr max exposure
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-6 rounded-lg border mb-8 bg-[var(--surface-card)] border-[var(--border-default)]">
              <h2 className="mb-4">Sample Scan Results</h2>
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { value: 'C', label: 'Compliance Grade', className: 'text-[var(--status-warning)]' },
                  { value: '24', label: 'Cookies Found', className: 'text-[var(--text-primary)]' },
                  { value: '8', label: 'Trackers Found', className: 'text-[var(--text-primary)]' },
                  { value: '12', label: 'Pre-consent Violations', className: 'text-[var(--status-danger)]' },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className={cn('text-3xl font-semibold mb-1', stat.className)}>{stat.value}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="mb-6">
                <h3 className="mb-3">Categorized Trackers</h3>
                <div className="space-y-2">
                  {COOKIES.map((cookie) => (
                    <div
                      key={cookie.name}
                      className="flex items-center justify-between p-3 rounded bg-[var(--surface-raised)]"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium mb-1 text-[var(--text-primary)]">{cookie.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{cookie.purpose}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={cn('px-2 py-1 rounded text-xs font-medium', cookieCategoryClass(cookie.category))}>
                          {cookie.category}
                        </span>
                        {cookie.preConsent ? (
                          <AlertTriangle className="w-4 h-4 text-[var(--status-danger)]" strokeWidth={2} />
                        ) : (
                          <Check className="w-4 h-4 text-[var(--status-success)]" strokeWidth={2} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded bg-[var(--status-info-bg)]">
                <h4 className="mb-2 text-[var(--status-info)]">Get the full report + remediation plan</h4>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Your name"
                    className="px-3 py-2 rounded border border-[var(--border-default)]"
                  />
                  <input
                    type="email"
                    placeholder="Email address"
                    className="px-3 py-2 rounded border border-[var(--border-default)]"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Company name"
                  className="w-full px-3 py-2 rounded border border-[var(--border-default)] mb-3"
                />
                <button
                  type="button"
                  className="w-full px-4 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)]"
                >
                  Send me the report
                </button>
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-lg text-lg font-medium text-white transition-opacity hover:opacity-90 bg-[var(--brand-primary)]"
              >
                Fix everything with Vajra — Free 14-day trial
                <ExternalLink className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
