import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { GaugeDiameter } from '@/types';

interface ComplianceGaugeProps {
  /** SVG diameter in pixels. */
  size: GaugeDiameter;
  /** Compliance score from 0–100. */
  score: number;
}

const VALUE_TEXT_CLASS: Record<GaugeDiameter, string> = {
  80: 'text-xl',
  120: 'text-[28px]',
  200: 'text-5xl',
};

const LABEL_TEXT_CLASS: Record<GaugeDiameter, string> = {
  80: 'text-[9px]',
  120: 'text-[11px]',
  200: 'text-sm',
};

const STROKE_WIDTH: Record<GaugeDiameter, number> = {
  80: 6,
  120: 8,
  200: 12,
};

/** Maps a score to its themed stroke/text color class. */
function scoreColorClass(score: number): string {
  if (score >= 90) return 'text-[var(--status-success)]';
  if (score >= 70) return 'text-[var(--status-warning)]';
  return 'text-[var(--status-danger)]';
}

/**
 * Circular SVG gauge that displays a compliance percentage with a
 * color-coded progress arc and centred score label.
 */
export function ComplianceGauge({ size, score }: ComplianceGaugeProps): ReactElement {
  const strokeWidth = STROKE_WIDTH[size];
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const colorClass = scoreColorClass(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-[var(--surface-raised)]"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={colorClass}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cn('font-semibold text-[var(--text-primary)]', VALUE_TEXT_CLASS[size])}>
          {score}%
        </div>
        <div className={cn('text-[var(--text-tertiary)]', LABEL_TEXT_CLASS[size])}>Score</div>
      </div>
    </div>
  );
}
