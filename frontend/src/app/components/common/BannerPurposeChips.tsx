import type { ReactElement } from 'react';
import { Tag } from 'lucide-react';
import { getBannerPurposeLabels } from '@/lib/consent/bannerPurposeTypes';

interface BannerPurposeChipsProps {
  purposeTypes?: string[] | null;
  customText?: string | null;
  /** Compact chips for card headers; default shows a short summary line. */
  variant?: 'chips' | 'summary';
  className?: string;
}

export function BannerPurposeChips({
  purposeTypes,
  customText,
  variant = 'chips',
  className = '',
}: BannerPurposeChipsProps): ReactElement | null {
  const labels = getBannerPurposeLabels(purposeTypes, customText);
  if (labels.length === 0) return null;

  if (variant === 'summary') {
    return (
      <span className={`text-xs text-[var(--text-secondary)] ${className}`}>
        {labels.join(', ')}
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <Tag className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" aria-hidden />
      {labels.map((label) => (
        <span
          key={label}
          className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--brand-primary)]/5 text-[var(--brand-primary)] border border-[var(--brand-primary)]/15"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
