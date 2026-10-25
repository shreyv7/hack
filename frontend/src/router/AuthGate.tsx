import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';

function AuthLoadingScreen(): ReactElement {
  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface-base)]">
      <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
    </div>
  );
}

/** Redirects for must-change-password and pending-approval states. */
export function AuthGate(): ReactElement {
  const { user, isLoading, mustChangePassword } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (user?.status === 'pending_approval' && location.pathname !== '/pending-approval') {
    return <Navigate to="/pending-approval" replace />;
  }

  return <Outlet />;
}
