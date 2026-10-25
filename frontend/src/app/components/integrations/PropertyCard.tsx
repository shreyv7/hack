import type { ReactElement } from 'react';
import { CheckCircle, Clock, Globe, LayoutTemplate, Link, XCircle } from 'lucide-react';
import type { Property } from '@/types/integrations';
import { cn } from '@/lib/utils';

interface PropertyCardProps {
  property: Property;
  onClick: () => void;
}

export function PropertyCard({ property, onClick }: PropertyCardProps): ReactElement {
  const getEnvironmentBadge = () => {
    switch (property.environment) {
      case 'production':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 shrink-0">PROD</span>;
      case 'staging':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 shrink-0">STG</span>;
      case 'development':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 shrink-0">DEV</span>;
    }
  };

  const getStatusIcon = () => {
    switch (property.status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'pending_setup':
        return <Clock className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'paused':
      case 'archived':
        return <XCircle className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "p-5 rounded-xl border transition-all cursor-pointer group bg-[var(--surface-card)] hover:shadow-md hover:-translate-y-0.5",
        property.status === 'archived' ? "opacity-60 border-dashed" : "border-[var(--border-default)]"
      )}
    >
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--surface-raised)] shrink-0">
            <Globe className="w-5 h-5 text-[var(--brand-primary)]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)] transition-colors truncate">
              {property.display_name || property.domain}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 min-w-0">
              <span className="text-sm text-[var(--text-secondary)] truncate">{property.domain}</span>
              {getEnvironmentBadge()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-base)] shrink-0 whitespace-nowrap">
          {getStatusIcon()}
          <span className="text-xs font-medium capitalize text-[var(--text-secondary)]">
            {property.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-[var(--border-default)]">
        <div>
          <div className="text-xs mb-1 text-[var(--text-tertiary)] flex items-center gap-1.5">
            <LayoutTemplate className="w-3.5 h-3.5" />
            Active Banner
          </div>
          {property.active_banner_name ? (
            <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {property.active_banner_name}
            </div>
          ) : (
            <div className="text-sm font-medium text-[var(--text-tertiary)]">No banner attached</div>
          )}
        </div>
        <div>
          <div className="text-xs mb-1 text-[var(--text-tertiary)] flex items-center gap-1.5">
            <Link className="w-3.5 h-3.5" />
            Blocker Mode
          </div>
          <div className="text-sm font-medium text-[var(--text-primary)] capitalize">
            {property.blocker_mode}
          </div>
        </div>
      </div>
    </div>
  );
}
