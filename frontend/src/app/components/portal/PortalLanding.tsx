import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  Edit3,
  FileText,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortalLandingProps {
  /** Called with the selected data-right type id when a card is clicked. */
  onRightSelection: (rightType: string) => void;
  onStatusCheck?: () => void;
}

interface DataRightOption {
  id: string;
  title: string;
  icon: LucideIcon;
  iconClass: string;
  iconBgClass: string;
  description: string;
}

const DATA_RIGHTS: DataRightOption[] = [
  {
    id: 'access',
    title: 'Access Your Data',
    icon: FileText,
    iconClass: 'text-[var(--status-info)]',
    iconBgClass: 'bg-[var(--status-info-bg)]',
    description: 'Request a copy of the personal data we hold about you.',
  },
  {
    id: 'correct',
    title: 'Correct Your Data',
    icon: Edit3,
    iconClass: 'text-[var(--status-warning)]',
    iconBgClass: 'bg-[var(--status-warning-bg)]',
    description: 'Request correction of inaccurate or incomplete personal data.',
  },
  {
    id: 'erase',
    title: 'Erase Your Data',
    icon: Trash2,
    iconClass: 'text-[var(--status-danger)]',
    iconBgClass: 'bg-[var(--status-danger-bg)]',
    description: 'Request deletion of your personal data (Right to be Forgotten).',
  },
  {
    id: 'nominate',
    title: 'Nominate a Person',
    icon: UserPlus,
    iconClass: 'text-[var(--status-success)]',
    iconBgClass: 'bg-[var(--status-success-bg)]',
    description: 'Nominate someone to exercise your rights on your behalf.',
  },
  {
    id: 'grievance',
    title: 'File a Grievance',
    icon: AlertTriangle,
    iconClass: 'text-orange-500',
    iconBgClass: 'bg-orange-50',
    description: 'Raise a complaint if your previous request was ignored or handled incorrectly.',
  },
  {
    id: 'withdraw',
    title: 'Withdraw Consent',
    icon: XCircle,
    iconClass: 'text-[var(--status-warning)]',
    iconBgClass: 'bg-[var(--status-warning-bg)]',
    description: 'Withdraw your previously given consent to process your personal data.',
  },
];

/**
 * Public data-rights portal landing page with selectable request types.
 */
export function PortalLanding({ onRightSelection, onStatusCheck }: PortalLandingProps): ReactElement {
  return (
    <div className="max-w-4xl mx-auto px-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-semibold mb-4 text-[var(--text-primary)]">Exercise Your Data Rights</h1>
        <p className="text-lg max-w-2xl mx-auto text-[var(--text-secondary)]">
          Under India&apos;s DPDPA 2023, you have rights over your personal data. Select the type of request below.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {DATA_RIGHTS.map((right) => {
          const Icon = right.icon;
          return (
            <button
              key={right.id}
              type="button"
              onClick={() => onRightSelection(right.id)}
              className={cn(
                'group p-6 rounded-xl text-left transition-all hover:-translate-y-1 hover:shadow-lg',
                'bg-[var(--surface-card)] border border-[var(--border-default)]',
              )}
            >
              <div className={cn('size-12 rounded-lg flex items-center justify-center mb-4', right.iconBgClass)}>
                <Icon className={cn('size-6', right.iconClass)} />
              </div>
              <h3 className="text-lg font-semibold mb-2 flex items-center justify-between text-[var(--text-primary)]">
                {right.title}
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1 text-[var(--text-tertiary)]" />
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">{right.description}</p>
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={onStatusCheck}
          className="text-sm font-medium hover:underline text-[var(--brand-primary)]"
        >
          Already submitted a request? Check status →
        </button>
      </div>
    </div>
  );
}
