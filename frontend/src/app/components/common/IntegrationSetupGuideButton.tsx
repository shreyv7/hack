import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Clock,
  Code,
  FileText,
  Globe,
  Scale,
  Smartphone,
  Tag,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from './MarkdownMessage';
import { INTEGRATION_GUIDES, type IntegrationGuideId } from '@/content/integrationGuides';

interface IntegrationSetupGuideButtonProps {
  guideId: IntegrationGuideId;
  className?: string;
}

const GUIDE_ICONS: Record<IntegrationGuideId, LucideIcon> = {
  website: Globe,
  mobile_sdk: Smartphone,
  tag_manager: Tag,
  api_webhooks: Webhook,
};

export function IntegrationSetupGuideButton({
  guideId,
  className,
}: IntegrationSetupGuideButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  const guide = INTEGRATION_GUIDES[guideId];
  const HeroIcon = GUIDE_ICONS[guideId];

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeId, setActiveId] = useState<string>(guide.sections[0]?.id ?? '');

  const sectionIds = useMemo(() => guide.sections.map((s) => s.id), [guide.sections]);

  useEffect(() => {
    if (!open) return;
    setActiveId(guide.sections[0]?.id ?? '');
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    sectionIds.forEach((id) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [open, sectionIds, guide.sections]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    const root = scrollRef.current;
    if (el && root) {
      root.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
      setActiveId(id);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
          'border border-[var(--border-default)] text-[var(--text-primary)]',
          'bg-[var(--surface-card)] hover:bg-black/5 dark:hover:bg-white/5',
          'flex items-center gap-2 shadow-sm',
          className,
        )}
      >
        <BookOpen className="w-4 h-4 text-[var(--brand-primary)]" />
        Whitepaper & Setup Guide
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--surface-base)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`guide-title-${guideId}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero */}
            <div className="relative shrink-0 overflow-hidden border-b border-[var(--border-default)]">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)]/15 via-[var(--brand-primary)]/5 to-transparent" />
              <div className="relative px-7 py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--brand-primary)] text-white shadow-lg shrink-0">
                      <HeroIcon className="w-6 h-6" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]">
                          Whitepaper
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--text-tertiary)]">
                          {guide.version}
                        </span>
                      </div>
                      <h2
                        id={`guide-title-${guideId}`}
                        className="text-xl font-bold text-[var(--text-primary)] leading-tight"
                      >
                        {guide.title}
                      </h2>
                      <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                        {guide.subtitle}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
                    aria-label="Close whitepaper"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pl-16">
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <Clock className="w-3.5 h-3.5" /> {guide.readingTime}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <FileText className="w-3.5 h-3.5" /> Updated {guide.updated}
                  </span>
                  <span className="inline-flex items-center gap-1.5 flex-wrap">
                    {guide.audience.map((a) => (
                      <span
                        key={a}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)]"
                      >
                        {a}
                      </span>
                    ))}
                  </span>
                  <span className="inline-flex items-center gap-1.5 flex-wrap">
                    {guide.dpdpaRefs.map((ref) => (
                      <span
                        key={ref}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30"
                      >
                        <Scale className="w-3 h-3" /> {ref}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </div>

            {/* Body: TOC + content */}
            <div className="flex flex-1 min-h-0">
              {/* Table of contents */}
              <nav className="hidden md:block w-64 shrink-0 border-r border-[var(--border-default)] bg-[var(--surface-card)] overflow-y-auto py-4 px-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] px-3 mb-2">
                  Contents
                </p>
                <ul className="space-y-0.5">
                  {guide.sections.map((s, i) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => scrollTo(s.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5',
                          activeId === s.id
                            ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-semibold'
                            : 'text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--text-primary)]',
                        )}
                      >
                        <span
                          className={cn(
                            'text-[10px] font-mono w-5 h-5 rounded flex items-center justify-center shrink-0',
                            activeId === s.id
                              ? 'bg-[var(--brand-primary)] text-white'
                              : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]',
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="truncate">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Content */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-7 py-6 scroll-smooth">
                <div className="max-w-3xl">
                  {guide.sections.map((s, i) => (
                    <section
                      key={s.id}
                      id={s.id}
                      ref={(el) => {
                        sectionRefs.current[s.id] = el;
                      }}
                      className="mb-10 scroll-mt-4"
                    >
                      <div className="flex items-center gap-3 mb-3 pb-2 border-b border-[var(--border-default)]">
                        <span className="text-xs font-mono font-bold w-6 h-6 rounded-md flex items-center justify-center bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] shrink-0">
                          {i + 1}
                        </span>
                        <h3 className="text-base font-bold text-[var(--text-primary)]">{s.title}</h3>
                      </div>
                      <MarkdownMessage>{s.markdown}</MarkdownMessage>
                    </section>
                  ))}

                  <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] pt-4 mt-2 border-t border-[var(--border-default)]">
                    <Code className="w-3.5 h-3.5" />
                    ZeroShield DPDPA Platform · {guide.title} · {guide.version}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
