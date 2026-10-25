import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  alert?: boolean;
  warning?: boolean;
  danger?: boolean;
  routePath?: string;
}

function subtitleColorClass(alert?: boolean, warning?: boolean, danger?: boolean): string {
  if (alert || danger) return 'text-[var(--status-danger)]';
  if (warning) return 'text-[var(--status-warning)]';
  return 'text-[var(--text-tertiary)]';
}

export function MetricCard({
  title,
  value,
  subtitle,
  alert,
  warning,
  danger,
  routePath,
}: MetricCardProps): ReactElement {
  const navigate = useNavigate();

  const handleClick = (): void => {
    if (routePath) navigate(routePath);
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') handleClick();
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'p-4 rounded-xl cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5',
        'bg-[var(--surface-card)] border border-[var(--border-default)]',
      )}
    >
      <div className="text-[10px] font-medium mb-1 uppercase tracking-wide text-[var(--text-tertiary)]">
        {title}
      </div>
      <div className="text-2xl font-semibold mb-1 text-[var(--text-primary)]">{value}</div>
      {subtitle ? (
        <div className={cn('text-xs font-medium line-clamp-2', subtitleColorClass(alert, warning, danger))}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}
