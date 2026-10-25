import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shieldAiRecommendations } from '@/lib/api/shieldAi';
import { ApiError } from '@/lib/api/client';

interface ShieldAICardProps {
  /** Card heading. Defaults to "Shield AI Recommendations". */
  title?: string;
  /** Static suggestions. Shown as-is when `topic` is omitted, or as a fallback
   *  if a live recommendation fetch fails. */
  suggestions?: string[];
  /** When provided, the card fetches live recommendations from Shield AI for this
   *  topic (e.g. "privacy risks and mitigations"). Enables loading + regenerate. */
  topic?: string;
  /** Free-text scenario passed to the model to ground the recommendations. */
  context?: string;
  /** How many suggestions to request. Defaults to the number of static
   *  suggestions, or 4. */
  count?: number;
  /** Invoked when the user accepts the suggestions. Hidden when omitted. */
  onApply?: (suggestions: string[]) => void;
  /** Invoked when the user wants to customize the suggestions. Hidden when omitted. */
  onCustomize?: () => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Highlighted callout that surfaces AI-generated compliance recommendations
 * with optional "Apply" and "Customize" actions. When `topic` is supplied the
 * suggestions are generated live by Shield AI; otherwise the
 * static `suggestions` prop is rendered.
 */
export function ShieldAICard({
  title = 'Shield AI Recommendations',
  suggestions = [],
  topic,
  context,
  count,
  onApply,
  onCustomize,
  className,
}: ShieldAICardProps): ReactElement {
  const isLive = Boolean(topic);
  const [items, setItems] = useState<string[]>(suggestions);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!topic) return;
    setIsLoading(true);
    setError(null);
    try {
      const { suggestions: result } = await shieldAiRecommendations({
        topic,
        context,
        count: count ?? (suggestions.length || 4),
      });
      if (result.length > 0) setItems(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach Shield AI. Showing default suggestions.',
      );
      // Keep whatever we have (initial static suggestions) as a fallback.
    } finally {
      setIsLoading(false);
    }
    // suggestions intentionally omitted: only the topic/context/count drive a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, context, count]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={cn('p-4 rounded-lg bg-purple-50 border border-purple-200', className)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-purple-600" />
          <h3 className="font-medium text-purple-900">{title}</h3>
        </div>
        {isLive && (
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            title="Regenerate with Shield AI"
            className="p-1 rounded-md text-purple-600 hover:bg-purple-100 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
          </button>
        )}
      </div>

      {isLoading && items.length === 0 ? (
        <div className="space-y-2 mb-3">
          {Array.from({ length: count ?? 3 }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-purple-200/60 animate-pulse" />
          ))}
        </div>
      ) : (
        items.length > 0 && (
          <ul className="space-y-2 mb-3">
            {items.map((suggestion, index) => (
              <li
                key={`${index}-${suggestion}`}
                className="text-sm text-purple-800 flex items-start gap-2"
              >
                <span className="text-purple-400 mt-0.5">•</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {error && (
        <div className="flex items-start gap-1.5 mb-3 text-xs text-amber-700">
          <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(onApply || onCustomize) && (
        <div className="flex gap-2 mt-3">
          {onApply && (
            <button
              type="button"
              onClick={() => onApply(items)}
              className="px-3 py-1.5 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700"
            >
              Apply
            </button>
          )}
          {onCustomize && (
            <button
              type="button"
              onClick={onCustomize}
              className="px-3 py-1.5 text-sm rounded-md border border-purple-300 text-purple-700 hover:bg-purple-100"
            >
              Customize
            </button>
          )}
        </div>
      )}
    </div>
  );
}
