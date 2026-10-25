import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Shield } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface LoginPageProps {
  onSwitchToSignup: () => void;
}

export function LoginPage({ onSwitchToSignup }: LoginPageProps): ReactElement {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error && err.message) {
        setError(
          `Cannot reach the API (${import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8002/api'}). Start the backend: uvicorn app.main:app --reload --port 8002`,
        );
      } else {
        setError('Unable to sign in. Check that the API is running on port 8002.');
      }
    } finally {
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
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">DPDPA Shield</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Sign in with your organization account
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium text-[var(--text-primary)]">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[var(--surface-card)] text-[var(--text-primary)]',
                'border border-[var(--border-default)]',
              )}
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="login-password"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[var(--surface-card)] text-[var(--text-primary)]',
                'border border-[var(--border-default)]',
              )}
            />
          </div>

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-[#6f5ff0] hover:underline"
            >
              Forgot password?
            </Link>
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
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-xs text-center text-[var(--text-secondary)]">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="font-semibold text-[#6f5ff0] hover:underline"
            >
              Create one
            </button>
          </p>
          <p className="text-xs text-center text-[var(--text-secondary)]">
            Invited by your administrator? Use the credentials from your invite email.
          </p>
        </form>
      </div>
    </div>
  );
}
