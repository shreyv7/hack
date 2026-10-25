import type { ReactElement } from 'react';
import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function PendingApprovalPage(): ReactElement {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleRefresh = async (): Promise<void> => {
    setChecking(true);
    try {
      await refreshUser();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface-base)] px-4 py-12">
      <div className="w-full max-w-[460px] text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f0a84e] to-[#f0853e] text-white shadow-lg mb-5">
          <Clock className="size-7" strokeWidth={2} />
        </div>

        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Account awaiting approval
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Thanks for signing up{user?.full_name ? `, ${user.full_name}` : ''}. Your workspace has
          been created and is pending review by a Vajra administrator. You&apos;ll be able to
          explore the platform as soon as it&apos;s approved.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={checking}
            className={cn(
              'w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white',
              'bg-gradient-to-br from-[#6f5ff0] to-[#5a4fe6]',
              'hover:opacity-95 disabled:opacity-60',
            )}
          >
            {checking ? 'Checking…' : 'Check approval status'}
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            className={cn(
              'w-full rounded-lg px-4 py-2.5 text-sm font-medium',
              'border border-[var(--border-default)] text-[var(--text-primary)]',
              'hover:bg-[var(--surface-raised)]',
            )}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
