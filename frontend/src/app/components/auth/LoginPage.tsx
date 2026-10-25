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
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[var(--surface-base)] px-4 py-10 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-40 top-[-18%] size-[34rem] rounded-full bg-[#725cf5]/12 blur-[110px] dark:bg-[#725cf5]/10" />
        <div className="absolute -right-40 bottom-[-22%] size-[38rem] rounded-full bg-[#d7a6ff]/15 blur-[120px] dark:bg-[#8b5cf6]/10" />

        <div className="absolute inset-y-0 left-0 hidden w-[38vw] min-w-[410px] lg:block">
          <div className="absolute left-[4%] top-1/2 h-[88vh] max-h-[940px] w-[min(32vw,530px)] -translate-y-1/2 rounded-[3rem] border border-[#6f5ff0]/10 bg-white/10 shadow-[0_40px_120px_rgba(79,70,229,0.12)] dark:border-white/[0.06] dark:bg-white/[0.015]">
            <img
              src="/assets/vajra/s1.png"
              alt=""
              className="vajra-auth-art-left size-full object-contain p-5 opacity-[0.30] mix-blend-multiply contrast-125 xl:opacity-[0.38] dark:invert dark:mix-blend-screen dark:opacity-[0.17]"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[var(--surface-base)]" />
        </div>

        <div className="absolute inset-y-0 right-0 hidden w-[38vw] min-w-[410px] lg:block">
          <div className="absolute right-[2%] top-1/2 h-[86vh] max-h-[920px] w-[min(34vw,560px)] -translate-y-1/2 rounded-[3rem] border border-[#8b5cf6]/10 bg-white/10 shadow-[0_40px_120px_rgba(139,92,246,0.12)] dark:border-white/[0.06] dark:bg-white/[0.015]">
            <img
              src="/assets/vajra/s2.png"
              alt=""
              className="vajra-auth-art-right size-full object-contain p-4 opacity-[0.28] mix-blend-multiply contrast-125 xl:opacity-[0.36] dark:invert dark:mix-blend-screen dark:opacity-[0.16]"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[var(--surface-base)]" />
        </div>

        <div className="absolute left-1/2 top-1/2 h-[72%] w-[min(780px,80vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--surface-base)]/80 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[430px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6f5ff0] to-[#8b5cf6] text-white shadow-[0_14px_38px_rgba(111,95,240,0.35)] ring-1 ring-white/50">
            <Shield className="size-7" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
            Vajra
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Sign in with your organization account
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-[1.35rem] border border-[var(--border-default)] bg-[var(--surface-card)]/95 p-6 shadow-[0_24px_80px_rgba(30,27,75,0.10),0_2px_8px_rgba(30,27,75,0.05)] backdrop-blur-xl sm:p-7 dark:shadow-[0_28px_90px_rgba(0,0,0,0.45)]"
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
                'w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition',
                'bg-[var(--surface-card)] text-[var(--text-primary)]',
                'border border-[var(--border-default)]',
                'focus:border-[#7666ef] focus:ring-4 focus:ring-[#7666ef]/10',
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
                'w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition',
                'bg-[var(--surface-card)] text-[var(--text-primary)]',
                'border border-[var(--border-default)]',
                'focus:border-[#7666ef] focus:ring-4 focus:ring-[#7666ef]/10',
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
              'w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(90,79,230,0.22)] transition',
              'bg-gradient-to-br from-[#6f5ff0] to-[#5a4fe6]',
              'hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-60',
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
