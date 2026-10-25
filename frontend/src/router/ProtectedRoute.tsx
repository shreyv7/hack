import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { getAccessToken } from '@/lib/auth/storage';

export function ProtectedRoute(): ReactElement {
  const location = useLocation();
  const token = getAccessToken();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
