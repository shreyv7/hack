import type { ReactElement } from 'react';
import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';

const FLOW_NODES = [
  { id: 'banner-builder', label: 'Banner Builder', description: 'Design & configure' },
  { id: 'publish', label: 'Banner published with ID', description: 'BANNER-2026-A8B3' },
  { id: 'tech-integration', label: 'Technical Integration auto-deploys', description: 'Web/Mobile/GTM' },
  { id: 'users', label: 'Users see banner on web/mobile/GTM', description: 'End user experience' },
  {
    id: 'proof-vault',
    label: 'Consent events flow back to Proof Vault + Audit Log',
    description: 'Compliance records',
  },
] as const;

/**
 * Expandable diagram showing consent banner publish and integration data flow.
 */
export function MappingDiagram(): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border bg-[var(--surface-card)] border-[var(--border-default)]">
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsExpanded((prev) => !prev);
            e.preventDefault();
          }
        }}
        role="button"
        tabIndex={0}
        className="w-full p-4 flex items-center justify-between hover:bg-black/5 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="size-4 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronRight className="size-4 text-[var(--text-tertiary)]" />
          )}
          <span className="text-sm font-semibold text-[var(--text-primary)]">Mapping Diagram</span>
          <DPDPAChip
            sections={[
              {
                chapter: 2,
                section: 6,
                name: 'Consent',
                url: '/dpdpa2023/chapter-2/section6.html',
              },
              {
                chapter: 2,
                section: 8,
                subsection: 4,
                name: 'Accuracy & verifiability',
                url: '/dpdpa2023/chapter-2/section8.html',
              },
            ]}
            size="compact"
          />
        </div>
        <span className="text-xs text-[var(--text-tertiary)]">
          {isExpanded ? 'Collapse' : 'Expand to see data flow'}
        </span>
      </div>

      {isExpanded ? (
        <div className="p-6 border-t border-[var(--border-default)]">
          <div className="flex items-start gap-3 overflow-x-auto pb-2">
            {FLOW_NODES.map((node, index) => (
              <div key={node.id} className="flex items-center gap-3 shrink-0">
                <div
                  className={cn(
                    'p-4 rounded-lg border-2 min-w-40',
                    'bg-[var(--surface-card)] border-[var(--border-default)]',
                  )}
                >
                  <div className="text-sm font-semibold mb-1 text-left text-[var(--text-primary)]">{node.label}</div>
                  <div className="text-xs text-left text-[var(--text-secondary)]">{node.description}</div>
                </div>
                {index < FLOW_NODES.length - 1 ? (
                  <ArrowRight className="size-5 shrink-0 text-[var(--brand-primary)]" />
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg text-xs bg-[var(--surface-raised)] text-[var(--text-secondary)]">
            Click any node to navigate to that part of the journey. Changes propagate automatically within 30
            seconds.
          </div>
        </div>
      ) : null}
    </div>
  );
}
