import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { LoginPage } from '@/app/components/auth/LoginPage';
import { SignupPage } from '@/app/components/auth/SignupPage';
import { ChangePasswordPage } from '@/app/components/auth/ChangePasswordPage';
import { PendingApprovalPage } from '@/app/components/auth/PendingApprovalPage';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken } from '@/lib/auth/storage';

function AuthLoadingScreen(): ReactElement {
  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface-base)]">
      <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
    </div>
  );
}

export function LoginRoute(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, mustChangePassword } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  useEffect(() => {
    if (!isLoading && mustChangePassword) {
      navigate('/change-password', { replace: true });
      return;
    }
    if (!isLoading && user) {
      navigate(from, { replace: true });
    }
  }, [user, isLoading, mustChangePassword, from, navigate]);

  if (isLoading) return <AuthLoadingScreen />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user) return <Navigate to={from} replace />;

  return <LoginPage onSwitchToSignup={() => navigate('/signup')} />;
}

export function SignupRoute(): ReactElement {
  const navigate = useNavigate();
  const { user, isLoading, mustChangePassword } = useAuth();

  useEffect(() => {
    if (!isLoading && mustChangePassword) {
      navigate('/change-password', { replace: true });
      return;
    }
    if (!isLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, isLoading, mustChangePassword, navigate]);

  if (isLoading) return <AuthLoadingScreen />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user) return <Navigate to="/dashboard" replace />;

  return <SignupPage onSwitchToLogin={() => navigate('/login')} />;
}

export function ChangePasswordRoute(): ReactElement {
  const { mustChangePassword, isLoading } = useAuth();

  if (isLoading) return <AuthLoadingScreen />;
  if (!mustChangePassword) return <Navigate to="/dashboard" replace />;

  return <ChangePasswordPage />;
}

export function PendingApprovalRoute(): ReactElement {
  const { user, isLoading } = useAuth();

  if (isLoading) return <AuthLoadingScreen />;
  if (user?.status !== 'pending_approval') return <Navigate to="/dashboard" replace />;

  return <PendingApprovalPage />;
}

export function RootRedirect(): ReactElement {
  const token = getAccessToken();
  return <Navigate to={token ? '/dashboard' : '/login'} replace />;
}
