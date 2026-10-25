import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { ControlSize } from '@/types';

interface ComplianceGaugeProps {
  /** Compliance score from 0–100 rendered inside the gauge. */
  score: number;
  /** Overall diameter preset. Defaults to `'md'`. */
  size?: ControlSize;
  /** Whether to render the qualitative status label below the gauge. Defaults to `true`. */
  showLabel?: boolean;
}

const RADIUS_BY_SIZE: Record<ControlSize, number> = {
  sm: 80,
  md: 120,
  lg: 200,
};

const STROKE_BY_SIZE: Record<ControlSize, number> = {
  sm: 8,
  md: 12,
  lg: 16,
};

const VALUE_TEXT_CLASS: Record<ControlSize, string> = {
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-5xl',
};

/** Maps a score to its themed color utility class. */
function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-[var(--status-success)]';
  if (score >= 60) return 'text-[var(--status-warning)]';
  return 'text-[var(--status-danger)]';
}

/** Maps a score to its qualitative status label. */
function scoreStatus(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Improving';
  return 'Needs Attention';
}

/**
 * Circular SVG gauge that visualises a compliance score (0–100) with a
 * color-coded arc and an optional qualitative status label.
 */
export function ComplianceGauge({
  score,
  size = 'md',
  showLabel = true,
}: ComplianceGaugeProps): ReactElement {
  const radius = RADIUS_BY_SIZE[size];
  const strokeWidth = STROKE_BY_SIZE[size];
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const colorClass = scoreColorClass(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg height={radius * 2} width={radius * 2} className="-rotate-90">
        <circle
          className="text-[var(--border-default)]"
          stroke="currentColor"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          className={cn(
            'transition-[stroke-dashoffset] duration-500 ease-out',
            colorClass,
          )}
          stroke="currentColor"
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy=".3em"
          className={cn('rotate-90 fill-current font-semibold', VALUE_TEXT_CLASS[size], colorClass)}
        >
          {score}
        </text>
      </svg>
      {showLabel && (
        <div className="text-center">
          <div className={cn('text-sm font-medium', colorClass)}>{scoreStatus(score)}</div>
        </div>
      )}
    </div>
  );
}
