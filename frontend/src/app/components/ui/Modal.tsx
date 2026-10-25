import type { ReactElement, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ControlSize } from '@/types';

interface ModalProps {
  /** Maximum width preset. */
  size: ControlSize;
  /** Dialog title shown in the header bar. */
  title: string;
  /** Modal body content. */
  children: ReactNode;
  /** Invoked when the user dismisses the modal. */
  onClose: () => void;
}

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/**
 * Centred overlay dialog with a titled header and dismiss button.
 */
export function Modal({ size, title, children, onClose }: ModalProps): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={cn(
          'w-full rounded-xl overflow-hidden bg-[var(--surface-card)] shadow-xl',
          SIZE_CLASSES[size],
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-black/5 transition-colors"
            aria-label="Close dialog"
          >
            <X className="size-5 text-[var(--text-tertiary)]" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
