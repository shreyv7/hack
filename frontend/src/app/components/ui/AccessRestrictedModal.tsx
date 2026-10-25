/**
 * AccessRestrictedModal
 *
 * Premium, context-aware permission gate modal.
 * Shows the user their current role, which feature they tried to access,
 * and exactly which roles are allowed — so they know who to contact.
 *
 * Style: blurred backdrop over the current page (Option A), centred card with
 * gradient lock icon, role chips, and a "Go to Dashboard" CTA.
 */
import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ShieldOff, Lock, ArrowLeft, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabel } from '@/lib/auth/display';
import type { UserRole } from '@/types/auth';

/** Colour bucket for each role — keeps the chips visually distinct */
const ROLE_CHIP_COLOUR: Record<UserRole, string> = {
  superadmin: 'from-violet-600 to-purple-700',
  admin:      'from-blue-600 to-blue-700',
  user:       'from-sky-500 to-sky-600',
  ciso:       'from-rose-600 to-red-700',
  legal_head: 'from-amber-500 to-orange-600',
  legal_counsel: 'from-yellow-500 to-amber-600',
  compliance_officer: 'from-teal-500 to-emerald-600',
  grievance_officer:  'from-indigo-500 to-indigo-700',
  security_analyst:   'from-red-500 to-rose-600',
  data_steward:       'from-green-500 to-emerald-600',
  auditor:            'from-gray-500 to-slate-600',
  dpo:                'from-cyan-500 to-teal-600',
  it_admin:           'from-orange-500 to-amber-600',
  branch_operator:    'from-blue-500 to-cyan-600',
};

export interface AccessRestrictedModalProps {
  /** Human-readable feature name shown in the modal heading */
  featureName: string;
  /** Which roles are allowed to access this feature */
  allowedRoles: UserRole[];
  /** Called when the user clicks "Go to Dashboard" */
  onDismiss: () => void;
}

export function AccessRestrictedModal({
  featureName,
  allowedRoles,
  onDismiss,
}: AccessRestrictedModalProps): ReactElement {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Lock scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleDashboard = () => {
    onDismiss();
    void navigate('/dashboard', { replace: true });
  };

  const adminEmail = 'admin@zeroshield.in'; // fallback; ideally from org settings

  return (
    /* Backdrop: blurs the page behind the modal */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        backdropFilter: 'blur(12px) saturate(0.6)',
        backgroundColor: 'rgba(0,0,0,0.55)',
        animation: 'arm-fade-in 0.22s ease',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="arm-title"
    >
      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          animation: 'arm-slide-up 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Gradient header banner */}
        <div
          className="flex flex-col items-center gap-3 px-8 pt-8 pb-6"
          style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#1e3a5f 100%)' }}
        >
          {/* Icon ring */}
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)' }}
          >
            <Lock className="w-8 h-8 text-white" aria-hidden="true" />
          </div>

          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300 mb-1">
              Access Restricted
            </p>
            <h2
              id="arm-title"
              className="text-xl font-bold text-white leading-snug"
            >
              {featureName}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6 flex flex-col gap-5">
          {/* Current role badge */}
          {user && (
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: 'var(--surface-hover)' }}
            >
              <ShieldOff className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Your role{' '}
                <span
                  className="font-semibold rounded-md px-2 py-0.5 text-xs"
                  style={{ background: 'var(--brand-primary)', color: '#fff' }}
                >
                  {roleLabel(user.role)}
                </span>{' '}
                does not have permission to access this feature.
              </p>
            </div>
          )}

          {/* Who can access */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Roles with access
            </p>
            <div className="flex flex-wrap gap-2">
              {allowedRoles.map((role) => (
                <span
                  key={role}
                  className={`
                    inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold
                    text-white bg-gradient-to-r ${ROLE_CHIP_COLOUR[role] ?? 'from-gray-500 to-slate-600'}
                    shadow-sm
                  `}
                >
                  {roleLabel(role)}
                </span>
              ))}
            </div>
          </div>

          {/* Divider */}
          <hr style={{ borderColor: 'var(--border-default)' }} />

          {/* CTA buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDashboard}
              className="
                w-full flex items-center justify-center gap-2
                py-2.5 rounded-xl text-sm font-semibold text-white
                transition-all duration-150 hover:brightness-110 active:scale-[0.98]
              "
              style={{
                background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary, var(--brand-primary)))',
                boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Go to Dashboard
            </button>

            <a
              href={`mailto:${adminEmail}?subject=Access request: ${encodeURIComponent(featureName)}`}
              className="
                w-full flex items-center justify-center gap-2
                py-2.5 rounded-xl text-sm font-semibold
                transition-all duration-150 hover:brightness-95 active:scale-[0.98]
              "
              style={{
                background: 'var(--surface-hover)',
                color: 'var(--text-secondary)',
              }}
            >
              <Mail className="w-4 h-4" />
              Request Access
            </a>
          </div>
        </div>
      </div>

      {/* Keyframe animations injected inline */}
      <style>{`
        @keyframes arm-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes arm-slide-up { from { opacity: 0; transform: translateY(24px) scale(0.96) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}
