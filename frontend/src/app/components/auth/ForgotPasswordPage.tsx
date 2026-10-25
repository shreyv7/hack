import type { ReactElement } from 'react';
import { Link } from 'react-router';

export function ForgotPasswordPage(): ReactElement {
  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface-base)] px-4 py-12">
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Forgot password</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Password reset is not yet connected to the API. Contact your organization administrator
          or platform support to reset your account.
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
