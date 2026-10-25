import type { ReactElement } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  /** Step sequence number displayed in the circle. */
  number: number;
  /** Human-readable step label. */
  label: string;
  /** Highlights this step as the current step. */
  active: boolean;
}

interface StepperProps {
  /** Ordered list of wizard steps. */
  steps: Step[];
}

/**
 * Horizontal wizard stepper with numbered circles and arrow separators.
 */
export function Stepper({ steps }: StepperProps): ReactElement {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center gap-2">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'size-8 rounded-full flex items-center justify-center font-semibold text-sm',
                step.active
                  ? 'text-white bg-[var(--brand-primary)]'
                  : 'text-white/60 bg-[var(--text-tertiary)]',
              )}
            >
              {step.number}
            </div>
            <span
              className={cn(
                'text-sm font-medium text-[var(--text-primary)]',
                !step.active && 'opacity-60',
              )}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 ? (
            <ArrowRight className="size-4 mx-2 text-[var(--text-tertiary)]" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
