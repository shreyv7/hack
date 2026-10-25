import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Shield } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface SignupPageProps {
  onSwitchToLogin: () => void;
}

const inputClass = cn(
  'w-full px-3 py-2 rounded-lg text-sm',
  'bg-[var(--surface-card)] text-[var(--text-primary)]',
  'border border-[var(--border-default)]',
);

export function SignupPage({ onSwitchToLogin }: SignupPageProps): ReactElement {
  const { signup } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      // On success the user is auto-signed-in and lands on the
      // "awaiting approval" screen (handled by the app shell).
      await signup({
        company_name: companyName.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        password,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to create account. Check that the API is running.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface-base)] px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6f5ff0] to-[#8b5cf6] text-white shadow-lg mb-4">
            <Shield className="size-7" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Create your workspace</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Register your organization on DPDPA Shield
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="signup-company" className="text-sm font-medium text-[var(--text-primary)]">
              Company name
            </label>
            <input
              id="signup-company"
              type="text"
              autoComplete="organization"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={inputClass}
              placeholder="Acme Corp"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-name" className="text-sm font-medium text-[var(--text-primary)]">
              Your full name
            </label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Asha Rao"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-email" className="text-sm font-medium text-[var(--text-primary)]">
              Work email
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-password" className="text-sm font-medium text-[var(--text-primary)]">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="At least 8 characters"
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
            {submitting ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-xs text-center text-[var(--text-secondary)]">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-semibold text-[#6f5ff0] hover:underline"
            >
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
