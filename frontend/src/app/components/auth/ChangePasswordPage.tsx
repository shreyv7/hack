import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { getPendingEmail } from '@/lib/auth/storage';
import { cn } from '@/lib/utils';

export function ChangePasswordPage(): ReactElement {
  const { changePassword, user } = useAuth();
  const pendingEmail = getPendingEmail();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ old_password: oldPassword, new_password: newPassword });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not update password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface-base)] px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] text-[#6f5ff0] mb-4">
            <LockKeyhole className="size-7" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Change password</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {user?.email ?? pendingEmail
              ? `You must set a new password before continuing (${user?.email ?? pendingEmail}).`
              : 'You must set a new password before continuing.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="old-password" className="text-sm font-medium text-[var(--text-primary)]">
              Current password
            </label>
            <input
              id="old-password"
              type="password"
              autoComplete="current-password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border-default)] bg-[var(--surface-card)]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm font-medium text-[var(--text-primary)]">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border-default)] bg-[var(--surface-card)]"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirm-password"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border-default)] bg-[var(--surface-card)]"
            />
          </div>

          {error ? (
            <p className="text-sm text-[var(--status-danger)]" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white',
              'bg-gradient-to-br from-[#6f5ff0] to-[#5a4fe6]',
              'hover:opacity-95 disabled:opacity-60',
            )}
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
