import type { ReactElement } from 'react';
import { ArrowRight, Webhook, Code, Shield, Globe, Database, Zap } from 'lucide-react';

const FLOW_NODES = [
  {
    id: 'configure',
    label: 'Banner Builder',
    description: 'Content, categories, webhook URL, dev mode',
    icon: Shield,
  },
  {
    id: 'publish',
    label: 'Publish to property',
    description: 'Active banner linked to domain',
    icon: Globe,
  },
  {
    id: 'cmp',
    label: 'cmp.js on your site',
    description: 'Loads config + window.ZeroShield API',
    icon: Code,
  },
  {
    id: 'consent',
    label: 'User grants consent',
    description: 'Accept / Reject / Customize',
    icon: Zap,
  },
  {
    id: 'vault',
    label: 'Proof Vault receipt',
    description: 'Signed, tamper-evident audit record',
    icon: Database,
  },
  {
    id: 'webhook',
    label: 'Webhook to your API',
    description: 'Real-time consent.granted event POST',
    icon: Webhook,
  },
] as const;

/**
 * End-to-end integration mapping for banner install, developer mode, and webhooks.
 */
export function BannerIntegrationMappingDiagram(): ReactElement {
  return (
    <div
      className="rounded-xl border p-5 space-y-4"
      style={{
        backgroundColor: 'var(--surface-primary)',
        borderColor: 'var(--border-default)',
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Integration mapping</h3>
        <p className="text-xs mt-1 text-[var(--text-secondary)]">
          How your banner, CMP script, Proof Vault, and outbound webhooks connect end to end.
        </p>
      </div>

      <div className="flex items-start gap-2 overflow-x-auto pb-1">
        {FLOW_NODES.map((node, index) => {
          const Icon = node.icon;
          return (
            <div key={node.id} className="flex items-center gap-2 shrink-0">
              <div
                className="p-3 rounded-lg border min-w-[148px]"
                style={{
                  backgroundColor: 'var(--surface-card)',
                  borderColor: node.id === 'webhook' ? 'var(--brand-primary)' : 'var(--border-default)',
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4 h-4 text-[var(--brand-primary)]" strokeWidth={1.5} />
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{node.label}</div>
                </div>
                <div className="text-[11px] leading-snug text-[var(--text-secondary)]">{node.description}</div>
              </div>
              {index < FLOW_NODES.length - 1 ? (
                <ArrowRight className="w-4 h-4 shrink-0 text-[var(--brand-primary)]" strokeWidth={1.5} />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
        <div className="p-3 rounded-lg bg-[var(--surface-raised)] text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Developer Mode path: </span>
          When enabled, step 3 (cmp.js) does not auto-show the banner. Your app calls{' '}
          <code className="font-mono text-[10px]">window.ZeroShield.showBanner()</code> when ready.
        </div>
        <div className="p-3 rounded-lg bg-[var(--surface-raised)] text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Webhook path: </span>
          After consent (step 4), ZeroShield POSTs a JSON event to your webhook URL (step 6) in
          addition to sealing the Proof Vault receipt.
        </div>
      </div>
    </div>
  );
}
