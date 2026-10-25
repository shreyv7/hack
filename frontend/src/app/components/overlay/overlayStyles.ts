/** Shared styling tokens for the floating assistant overlay. */
export const overlayPanelClass =
  'fixed z-[9990] rounded-2xl overflow-hidden shadow-2xl border border-black/15';

export const overlayPanelStyle = {
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.55) 100%)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
} as const;

export const overlayBtnClass =
  'border border-black/25 bg-white/60 text-gray-900 hover:bg-white/80 transition-colors';

export const overlayBtnActiveClass =
  'border border-black/40 bg-white/90 text-gray-900 shadow-sm';

export const overlayInputClass =
  'rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 bg-white/70 border border-black/25 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/40';

export const overlayCardClass =
  'rounded-xl px-3 py-2 bg-white/65 border border-black/20 backdrop-blur-sm';
