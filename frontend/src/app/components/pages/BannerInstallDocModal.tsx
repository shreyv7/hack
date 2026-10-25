import type { ReactElement } from 'react';
import { useState } from 'react';
import { BookOpen, Copy, X } from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { BannerIntegrationMappingDiagram } from '@/app/components/pages/BannerIntegrationMappingDiagram';

export interface BannerInstallDocProps {
  apiPublicBase: string;
  propertyId: string;
  developerMode: boolean;
  consentWebhookUrl: string;
  installSnippet: string;
  apiSnippet: string;
  onClose: () => void;
}

const SAMPLE_WEBHOOK_PAYLOAD = `{
  "event_id": "evt_a8b3c9d4e7f2",
  "timestamp": "2026-06-30T10:42:18.234Z",
  "event_type": "consent.granted",
  "organization_id": "7b3e21c1-d5ba-409b-9cec-33f7127de03d",
  "property_id": "a1a2a3a4-b5b6-c7c8-d9d0-e1e2e3e4e5e6",
  "banner_id": "BANNER-2026-A8B3",
  "receipt_id": "rcpt_f4e2a1b9c8d7",
  "is_test": false,
  "data": {
    "session_id": "sess_9x8y7z",
    "platform": "website",
    "consented_purposes": {
      "analytics": true,
      "marketing": false,
      "functional": true
    },
    "language": "en"
  }
}`;

function DocSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <div className="text-xs leading-relaxed text-[var(--text-secondary)] space-y-2">{children}</div>
    </section>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }): ReactElement {
  const copy = () => {
    void navigator.clipboard.writeText(code);
    notify(`${label} copied`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 cursor-pointer"
        style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#E2E8F0' }}
      >
        <Copy className="w-3 h-3" />
        Copy
      </button>
      <pre
        className="p-3 pr-16 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre-wrap"
        style={{ backgroundColor: '#1E1B4B', color: '#E2E8F0' }}
      >
        {code}
      </pre>
    </div>
  );
}

/**
 * Full install documentation modal for CMP, Developer Mode, and webhook usage.
 */
export function BannerInstallDocModal({
  apiPublicBase,
  propertyId,
  developerMode,
  consentWebhookUrl,
  installSnippet,
  apiSnippet,
  onClose,
}: BannerInstallDocProps): ReactElement {
  const webhookHandlerExample = `// Express.js example — verify and act on consent events
app.post('/webhooks/consent', express.json(), (req, res) => {
  const { event_type, data, receipt_id } = req.body;

  if (event_type === 'consent.granted') {
  // Enable analytics only if user opted in
    if (data.consented_purposes?.analytics) {
      enableGoogleAnalytics(data.session_id);
    }
  }

  if (event_type === 'consent.denied' || event_type === 'consent.withdrawn') {
    disableMarketingTags(data.session_id);
  }

  // Always respond 2xx so Vajra marks delivery successful
  res.status(200).json({ received: true, receipt_id });
});`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col border"
        style={{
          backgroundColor: 'var(--surface-card)',
          borderColor: 'var(--border-default)',
        }}
      >
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--brand-primary)]" strokeWidth={1.5} />
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Vajra CMP — Install &amp; Integration Guide
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                cmp.js setup, Developer Mode, and consent webhooks
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--surface-raised)] cursor-pointer"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <BannerIntegrationMappingDiagram />

          <DocSection title="1. Install the CMP script">
            <p>
              Add this snippet to your site&apos;s <code className="font-mono text-[11px]">&lt;head&gt;</code>{' '}
              before any tracking scripts. Replace <code className="font-mono text-[11px]">YOUR_API_KEY</code>{' '}
              with the live key from Property Detail → API Keys.
            </p>
            <CodeBlock code={installSnippet} label="Install snippet" />
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>data-property-id</strong> — {propertyId || 'Select a property in Basic Information'}
              </li>
              <li>
                <strong>data-api-url</strong> — {apiPublicBase}
              </li>
              <li>On load, cmp.js fetches banner config and exposes <code className="font-mono">window.Vajra</code></li>
            </ul>
          </DocSection>

          <DocSection title="2. Developer Mode — programmatic banner control">
            {developerMode ? (
              <p className="text-[var(--status-success)] font-medium">
                Developer Mode is ON for this banner. The banner will not auto-appear on first visit.
              </p>
            ) : (
              <p>
                Developer Mode is OFF — the banner auto-shows for new visitors. Enable it in Advanced
                settings if you need manual control.
              </p>
            )}
            <p>When Developer Mode is enabled:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>cmp.js loads config but does <strong>not</strong> render the banner automatically</li>
              <li>Your application decides when to show consent (after login, on checkout, etc.)</li>
              <li>Returning users with saved consent in localStorage are not prompted again</li>
            </ul>
            <CodeBlock code={apiSnippet} label="Developer Mode API" />
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border border-[var(--border-default)] rounded-lg overflow-hidden">
                <thead className="bg-[var(--surface-raised)]">
                  <tr>
                    <th className="text-left p-2 font-semibold">Method</th>
                    <th className="text-left p-2 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['isReady()', 'Returns true after config is loaded'],
                    ['showBanner()', 'Render the consent banner'],
                    ['hideBanner()', 'Remove banner from DOM'],
                    ['getConsent()', 'Current purpose-level consent object'],
                    ['onConsentChange(cb)', 'Subscribe to consent updates'],
                    ['acceptAll() / rejectAll()', 'Programmatic consent actions'],
                    ['openPreferences()', 'Open customize panel'],
                  ].map(([method, desc]) => (
                    <tr key={method} className="border-t border-[var(--border-default)]">
                      <td className="p-2 font-mono text-[var(--brand-primary)]">{method}</td>
                      <td className="p-2">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DocSection>

          <DocSection title="3. Webhook integration — real-time consent events">
            {consentWebhookUrl ? (
              <p>
                Configured endpoint:{' '}
                <code className="font-mono text-[11px] break-all">{consentWebhookUrl}</code>
              </p>
            ) : (
              <p>
                No webhook URL configured yet. Add one in Advanced → Webhook Integration. When set,
                Vajra POSTs to your server on every live consent action.
              </p>
            )}
            <p><strong>Event types delivered:</strong></p>
            <ul className="list-disc pl-4 space-y-1">
              <li><code className="font-mono">consent.granted</code> — user accepted all optional purposes</li>
              <li><code className="font-mono">consent.denied</code> — user rejected all optional purposes</li>
              <li><code className="font-mono">consent.partial</code> — mixed choices in customize panel</li>
              <li><code className="font-mono">consent.withdrawn</code> — consent cleared / withdrawn</li>
              <li><code className="font-mono">consent.test</code> — sent when you click Test in the wizard</li>
            </ul>
            <p><strong>Sample live payload:</strong></p>
            <CodeBlock code={SAMPLE_WEBHOOK_PAYLOAD} label="Webhook payload" />
            <p><strong>Your server should:</strong></p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Accept <code className="font-mono">POST</code> with <code className="font-mono">Content-Type: application/json</code></li>
              <li>Respond with HTTP 2xx within 10 seconds</li>
              <li>Use <code className="font-mono">data.consented_purposes</code> to gate trackers, ads, and personalization</li>
              <li>Store <code className="font-mono">receipt_id</code> for audit correlation with Proof Vault</li>
            </ul>
            <CodeBlock code={webhookHandlerExample} label="Webhook handler example" />
          </DocSection>

          <DocSection title="4. End-to-end checklist">
            <ol className="list-decimal pl-4 space-y-1">
              <li>Create banner and configure content, categories, and languages</li>
              <li>Set webhook URL (optional) and enable Developer Mode if needed</li>
              <li>Publish banner and link it to your property</li>
              <li>Paste install snippet on your site; add Developer Mode code if enabled</li>
              <li>Click Test on the webhook field to verify your endpoint</li>
              <li>Accept consent on a test page — confirm Proof Vault receipt and webhook delivery</li>
            </ol>
          </DocSection>
        </div>
      </div>
    </div>
  );
}

interface BannerInstallDocTriggerProps {
  apiPublicBase: string;
  propertyId: string;
  developerMode: boolean;
  consentWebhookUrl: string;
  installSnippet: string;
  apiSnippet: string;
}

/**
 * Mapping diagram + button that opens the full install documentation modal.
 */
export function BannerInstallDocSection({
  apiPublicBase,
  propertyId,
  developerMode,
  consentWebhookUrl,
  installSnippet,
  apiSnippet,
}: BannerInstallDocTriggerProps): ReactElement {
  const [showDoc, setShowDoc] = useState(false);

  return (
    <div className="space-y-4">
      <BannerIntegrationMappingDiagram />

      <button
        type="button"
        onClick={() => setShowDoc(true)}
        className="w-full px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border cursor-pointer hover:opacity-90"
        style={{
          backgroundColor: 'var(--brand-primary)',
          color: 'white',
          borderColor: 'var(--brand-primary)',
        }}
      >
        <BookOpen className="w-4 h-4" strokeWidth={1.5} />
        View Install Documentation
      </button>

      {showDoc ? (
        <BannerInstallDocModal
          apiPublicBase={apiPublicBase}
          propertyId={propertyId}
          developerMode={developerMode}
          consentWebhookUrl={consentWebhookUrl}
          installSnippet={installSnippet}
          apiSnippet={apiSnippet}
          onClose={() => setShowDoc(false)}
        />
      ) : null}
    </div>
  );
}