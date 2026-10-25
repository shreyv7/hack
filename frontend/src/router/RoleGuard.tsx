/**
 * RoleGuard
 *
 * Wraps a route and, when the authenticated user's role is not in
 * `allowedRoles`, renders the page content **behind a blurred overlay** and
 * shows the premium AccessRestrictedModal — so the user can see what's there
 * and understand what they're missing without being silently bounced away.
 *
 * They leave only by clicking "Go to Dashboard" inside the modal.
 */
import type { ReactElement, ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken } from '@/lib/auth/storage';
import { getRoleFromToken } from '@/lib/auth/jwt';
import { AccessRestrictedModal } from '@/app/components/ui/AccessRestrictedModal';
import type { UserRole } from '@/types/auth';

interface RoleGuardProps {
  /** Roles that are permitted to fully interact with this route */
  allowedRoles: UserRole[];
  /**
   * Human-readable name of the feature shown inside the modal.
   * Defaults to the current document title if omitted.
   */
  featureName?: string;
  children?: ReactNode;
}

export function RoleGuard({ allowedRoles, featureName, children }: RoleGuardProps): ReactElement {
  const { user } = useAuth();

  const role = (user?.role ?? getRoleFromToken(getAccessToken())) as UserRole | null;
  const allowed = role !== null && allowedRoles.includes(role);

  const content = children ? <>{children}</> : <Outlet />;

  if (allowed) {
    return content;
  }

  // Restricted: render page content behind blur so the user can see what
  // they are missing, then overlay the modal.
  const displayName = featureName ?? document.title ?? 'This Feature';

  return (
    <div className="relative">
      {/* Blurred page content — pointer-events disabled so nothing is clickable */}
      <div
        aria-hidden="true"
        style={{
          filter: 'blur(6px) saturate(0.4)',
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.7,
        }}
      >
        {content}
      </div>

      {/* Modal overlay — sits above the blurred content */}
      <AccessRestrictedModal
        featureName={displayName}
        allowedRoles={allowedRoles}
        onDismiss={() => {
          // onDismiss triggers navigation inside the modal; nothing extra needed here
        }}
      />
    </div>
  );
}

