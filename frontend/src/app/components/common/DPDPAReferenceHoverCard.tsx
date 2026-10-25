import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import type { DPDPASection } from '@/lib/dpdpaSectionCatalog';
import { openDPDPADocument } from '@/lib/dpdpaReferences';
import { cn } from '@/lib/utils';

const CARD_WIDTH = 320;
const VIEWPORT_PADDING = 12;
const GAP_BELOW_TRIGGER = 8;
const HOVER_CLOSE_DELAY_MS = 120;

interface DPDPAReferenceHoverCardProps {
  sections: readonly DPDPASection[];
  className?: string;
  style?: CSSProperties;
}

/**
 * Hover popup listing linked statute sections with clickable “View full text” actions.
 */
export function DPDPAReferenceHoverCard({
  sections,
  className,
  style,
}: DPDPAReferenceHoverCardProps): ReactElement | null {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div
      role="tooltip"
      style={style}
      className={cn(
        'rounded-xl shadow-2xl p-4 bg-white border border-gray-200 w-80 pointer-events-auto',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {sections.map((section, index) => (
        <div
          key={`${section.chapter}-${section.section}-${section.subsection ?? ''}-${index}`}
          className={index > 0 ? 'mt-3 pt-3 border-t border-gray-200' : ''}
        >
          <div className="font-bold text-sm mb-1 text-gray-800">
            {section.name ?? `Chapter ${section.chapter}, Section ${section.section}`}
          </div>
          {section.excerpt ? (
            <div className="text-xs mb-2 italic text-gray-500">&ldquo;{section.excerpt}&rdquo;</div>
          ) : null}
          <button
            type="button"
            onClick={() => openDPDPADocument(section.url)}
            className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
          >
            View full text
            <ExternalLink className="size-3" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

function computeFloatingPosition(triggerRect: DOMRect): { top: number; left: number } {
  let left = triggerRect.left + triggerRect.width / 2 - CARD_WIDTH / 2;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - CARD_WIDTH - VIEWPORT_PADDING));

  let top = triggerRect.bottom + GAP_BELOW_TRIGGER;
  const estimatedHeight = 200;
  if (top + estimatedHeight > window.innerHeight - VIEWPORT_PADDING) {
    top = Math.max(VIEWPORT_PADDING, triggerRect.top - estimatedHeight - GAP_BELOW_TRIGGER);
  }

  return { top, left };
}

interface DPDPAReferenceTriggerProps {
  sections: readonly DPDPASection[];
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a reference control and shows {@link DPDPAReferenceHoverCard} on hover/focus (portaled above sidebar).
 */
export function DPDPAReferenceTrigger({ sections, className, children }: DPDPAReferenceTriggerProps): ReactElement {
  const [showCard, setShowCard] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback((): void => {
    if (!triggerRef.current) {
      return;
    }
    setPosition(computeFloatingPosition(triggerRef.current.getBoundingClientRect()));
  }, []);

  const cancelClose = useCallback((): void => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback((): void => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setShowCard(false), HOVER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  const openCard = useCallback((): void => {
    cancelClose();
    setShowCard(true);
  }, [cancelClose]);

  useLayoutEffect(() => {
    if (!showCard) {
      return;
    }

    updatePosition();

    const handleReposition = (): void => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [showCard, updatePosition]);

  const floatingCard =
    showCard && sections.length > 0
      ? createPortal(
          <div
            className="fixed z-[9999]"
            style={{ top: position.top, left: position.left, width: CARD_WIDTH }}
            onMouseEnter={openCard}
            onMouseLeave={scheduleClose}
          >
            <DPDPAReferenceHoverCard sections={sections} />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={triggerRef}
        className={cn('relative inline-block', className)}
        onMouseEnter={openCard}
        onMouseLeave={scheduleClose}
        onFocus={openCard}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            scheduleClose();
          }
        }}
      >
        {children}
      </div>
      {floatingCard}
    </>
  );
}
