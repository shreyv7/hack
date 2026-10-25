import type { ReactElement } from 'react';
import { Link } from 'react-router';

export function ResetPasswordPage(): ReactElement {
  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface-base)] px-4 py-12">
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Reset password</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Password reset via email link is not yet available. Use your temporary password from the
          invite email, then set a new password after signing in.
        </p>
        <Link
          to="/login"
          className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
