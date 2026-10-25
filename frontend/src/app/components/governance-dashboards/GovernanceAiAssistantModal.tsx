/**
 * Governance AI Assistant Modal
 *
 * On mount, calls POST /governance/dashboards/ai/assist (action=welcome).
 * One AI call (~400 input / ~300 output tokens); falls back gracefully
 * to rule-based summary when Shield AI is unconfigured.
 *
 * "Continue in Shield AI" navigates to /ai/copilot with prefilled query +
 * compact copilot_context so the Copilot doesn't need re-explaining.
 */

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  X,
} from 'lucide-react';
import { fetchGovernanceAiAssist } from '@/lib/api/governanceDashboard';
import type { GovernanceAiAssistResponse } from '@/types/governanceDashboard';

interface GovernanceAiAssistantModalProps {
  dashboardId?: string;
  dashboardName?: string;
  orgId?: string;
  onClose: () => void;
}

const CHIPS = [
  { label: 'Explain this dashboard', query: 'Explain this Governance compliance dashboard and what the key metrics mean.' },
  { label: 'Top compliance gaps', query: 'What are my top compliance gaps and what should I prioritise?' },
  { label: 'Share or schedule', query: 'How do I share or schedule this dashboard for stakeholders?' },
  { label: 'Add widgets', query: 'How do I add or customise widgets on this dashboard?' },
];

function SkeletonLine({ width = 'w-full' }: { width?: string }): ReactElement {
  return <div className={`h-3 rounded-full bg-violet-400/20 animate-pulse ${width}`} />;
}

export function GovernanceAiAssistantModal({
  dashboardId,
  dashboardName,
  orgId,
  onClose,
}: GovernanceAiAssistantModalProps): ReactElement {
  const navigate = useNavigate();
  const [result, setResult] = useState<GovernanceAiAssistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    fetchGovernanceAiAssist('welcome', dashboardId, undefined, orgId)
      .then((res) => {
        if (!cancelled) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dashboardId, orgId]);

  const handleChip = (query: string) => {
    const ctx = result?.copilot_context ?? '';
    navigate('/ai/copilot', {
      state: {
        query,
        context: ctx,
        dashboardName: dashboardName ?? 'Governance Dashboard',
      },
    });
  };

  const handleContinue = () => {
    const ctx = result?.copilot_context ?? '';
    navigate('/ai/copilot', {
      state: {
        query: `Tell me more about my compliance posture on the "${dashboardName ?? 'Governance'}" dashboard.`,
        context: ctx,
        dashboardName: dashboardName ?? 'Governance Dashboard',
      },
    });
  };

  return (
    /* Backdrop */
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {/* Gradient border wrapper */}
      <div className="p-0.5 rounded-xl bg-gradient-to-r from-[var(--status-ai)] to-[var(--brand-primary)] shadow-2xl w-full max-w-lg">
        {/* Inner panel */}
        <div className="rounded-[11px] bg-[var(--surface-card)] overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-violet-500/20 bg-violet-500/5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-[var(--status-ai)] to-[var(--brand-primary)]">
                  <Sparkles className="size-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Governance AI Assistant
                  </h2>
                  {result && (
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {result.configured && !result.used_fallback
                        ? 'AI-assisted governance insights'
                        : result.used_fallback
                        ? 'Rule-based summary · Shield AI unavailable'
                        : 'Loading…'}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mt-0.5 flex-shrink-0"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {loading ? (
              /* Skeleton loader */
              <div className="space-y-3">
                <SkeletonLine />
                <SkeletonLine width="w-5/6" />
                <SkeletonLine width="w-4/6" />
                <div className="pt-2 space-y-2">
                  <SkeletonLine width="w-3/4" />
                  <SkeletonLine width="w-2/3" />
                  <SkeletonLine width="w-4/5" />
                </div>
              </div>
            ) : fetchError ? (
              <div className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle className="size-4 flex-shrink-0" />
                <span>AI analysis unavailable. Please try again later.</span>
              </div>
            ) : result ? (
              <>
                {result.used_fallback && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600">
                    <AlertTriangle className="size-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      Shield AI is not configured. Contact your administrator to enable AI insights.
                    </span>
                  </div>
                )}

                {/* Summary */}
                <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                  {result.summary}
                </p>

                {/* Priority bullets */}
                {result.bullets.length > 0 && (
                  <ul className="space-y-2">
                    {result.bullets.map((bullet, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <CheckCircle2 className="size-3.5 flex-shrink-0 mt-0.5 text-violet-500" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {/* Suggested chips */}
            <div className="pt-1">
              <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Ask Shield AI
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleChip(chip.query)}
                    className="px-2.5 py-1 text-[11px] rounded-full border border-violet-500/30 text-violet-600 bg-violet-500/5 hover:bg-violet-500/15 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-[var(--status-ai)] to-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity"
            >
              Continue in Shield AI
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
