import type { ReactElement } from 'react';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Monitor, Smartphone, Tablet, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NoticeFormData } from '@/types';
import type { Purpose } from '@/types/consent';

interface NoticePreviewProps {
  /** Current notice form values used to render the live preview. */
  formData: NoticeFormData;
  /** Linked purposes to show dynamic granular disclosures. */
  selectedPurposes?: Purpose[];
}

type PreviewChannel = 'web' | 'mobile' | 'email';
type DeviceSize = 'desktop' | 'tablet' | 'mobile';

const PREVIEW_TABS: { label: string; id: PreviewChannel }[] = [
  { label: 'Web Widget', id: 'web' },
  { label: 'Mobile App', id: 'mobile' },
  { label: 'Email', id: 'email' },
];

const DEVICE_OPTIONS: { id: DeviceSize; icon: LucideIcon; label: string }[] = [
  { id: 'desktop', icon: Monitor, label: 'Desktop' },
  { id: 'tablet', icon: Tablet, label: 'Tablet' },
  { id: 'mobile', icon: Smartphone, label: 'Mobile' },
];

const DEVICE_FRAME_CLASS: Record<DeviceSize, string> = {
  desktop: 'w-full max-w-none',
  tablet: 'w-full max-w-[480px]',
  mobile: 'w-full max-w-[320px]',
};

const DEVICE_CANVAS_CLASS: Record<DeviceSize, string> = {
  desktop: 'min-h-[400px]',
  tablet: 'min-h-[520px]',
  mobile: 'min-h-[560px]',
};

/**
 * Live preview panel for a consent notice across channels and device sizes.
 */
export function NoticePreview({ formData, selectedPurposes = [] }: NoticePreviewProps): ReactElement {
  const [activeTab, setActiveTab] = useState<PreviewChannel>('web');
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');

  // Fallback mock purposes if none are linked in current view state
  const renderedPurposes = selectedPurposes.length > 0 ? selectedPurposes : [
    {
      id: 'mock-1',
      name: 'Telehealth & Prescription Tracking',
      legal_basis: 'consent' as const,
      data_categories: ['Medical History', 'Active Prescriptions', 'Doctor Notes'],
      retention_period: '7 years',
      description: 'Used for active telehealth consulting, tracking prescriptions, and sharing digital receipts.',
      is_special_category: true,
      version: '1.0',
      last_reviewed_at: null,
      archived_at: null,
      linked_notices_count: 0
    },
    {
      id: 'mock-2',
      name: 'Marketing Analytics & Personalization',
      legal_basis: 'consent' as const,
      data_categories: ['Browsing history', 'Purchase preferences'],
      retention_period: '12 months',
      description: 'To optimize site performance and send personalized medical product recommendations.',
      is_special_category: false,
      version: '1.0',
      last_reviewed_at: null,
      archived_at: null,
      linked_notices_count: 0
    }
  ];

  return (
    <div className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]">
      <div className="flex border-b border-[var(--border-default)]">
        {PREVIEW_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                isActive ? 'border-b-2 border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'text-[var(--text-secondary)]',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-6">
        <div className="mb-4 text-sm font-medium text-[var(--text-primary)]">Live Preview</div>

        <div
          className={cn(
            'rounded-lg p-6 mb-6 bg-[var(--surface-base)] border border-[var(--border-default)] flex justify-center transition-all duration-300',
            DEVICE_CANVAS_CLASS[deviceSize],
          )}
        >
          <div
            className={cn(
              'rounded-lg p-4 shadow-lg mx-auto bg-card border border-[var(--border-default)] transition-all duration-300 bg-[var(--surface-card)]',
              DEVICE_FRAME_CLASS[deviceSize],
            )}
          >
            {activeTab === 'email' ? (
              <>
                <div className="text-xs text-[var(--text-tertiary)] mb-2 border-b border-[var(--border-default)] pb-2">
                  Subject: {formData.displayName || 'Consent Notice'}
                </div>
                <p className="text-sm mb-4 text-[var(--text-secondary)] whitespace-pre-wrap">
                  {formData.openingStatement || 'Your consent notice opening statement will appear here...'}
                </p>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white"
                >
                  Review &amp; consent
                </button>
              </>
            ) : (
              <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1 text-[var(--text-primary)] font-sans leading-relaxed text-xs">
                {/* Header */}
                <div className="border-b border-[var(--border-default)] pb-2">
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-[var(--text-primary)]">
                    <ShieldCheck className="size-4 text-[var(--brand-primary)]" />
                    <span>{formData.displayName || 'Consent Notice'}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono block mt-0.5">
                    Pursuant to DPDPA 2023 Section 6(1)
                  </span>
                </div>

                {/* Opening statement */}
                <p className="text-[var(--text-secondary)]">
                  {formData.openingStatement || 'We collect and process your personal data based on stated purposes. This notice explains what we collect, why, and how you can exercise control.'}
                </p>

                {/* dynamic purposes */}
                <div className="space-y-2 border-t border-[var(--border-default)] pt-3">
                  <div className="font-semibold text-[var(--text-secondary)] mb-1.5" style={{ fontSize: '10px' }}>
                    SPECIFIED PURPOSES & LEGAL BASIS:
                  </div>
                  {renderedPurposes.map((p) => (
                    <div key={p.id} className="p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/40 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">{p.name}</span>
                        <div className="flex gap-1 shrink-0">
                          {p.is_special_category && (
                            <span className="text-[8px] bg-red-950/40 text-red-400 border border-red-900/30 px-1 py-0.5 rounded">Special</span>
                          )}
                          <span className="text-[8px] bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)] px-1 py-0.5 rounded capitalize">
                            {p.legal_basis === 'legitimate_use' ? 'Legitimate Use' : 'Consent'}
                          </span>
                        </div>
                      </div>
                      <p className="text-[var(--text-secondary)] text-[10px] leading-snug">{p.description}</p>
                      <div className="text-[9px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-default)]/20 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 w-full">
                        <div className="flex gap-x-2">
                          <span><strong>Data:</strong> {p.data_categories.join(', ')}</span>
                          <span>·</span>
                          <span><strong>Retention:</strong> {p.retention_period}</span>
                        </div>
                        {p.legal_basis === 'legitimate_use' && (
                          <span className="text-[8px] text-amber-500 hover:underline cursor-pointer shrink-0">Object ↗</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* DPO info */}
                <div className="border-t border-[var(--border-default)] pt-3 space-y-1 text-[10px] text-[var(--text-secondary)]">
                  <div className="font-semibold text-[var(--text-tertiary)] uppercase text-[9px] tracking-wide">Data Fiduciary Contacts:</div>
                  <div>DPO Email: <span className="font-mono text-[var(--brand-primary)] select-all">{formData.dpoEmail || 'dpo@yourcompany.com'}</span></div>
                  <div>Grievance Redressal: <span className="font-mono text-[var(--brand-primary)] select-all">{formData.contactEmail || 'privacy@yourcompany.com'}</span></div>
                </div>

                {/* Rights checklist */}
                <div className="border-t border-[var(--border-default)] pt-3 space-y-1 text-[10px] text-[var(--text-secondary)]">
                  <div className="font-semibold text-[var(--text-tertiary)] uppercase text-[9px] tracking-wide">Your Rights under DPDPA:</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[9px]">
                    <li>Right to access personal data & summary of processing activities (§11)</li>
                    <li>Right to correction, completion, and erasure (§12)</li>
                    <li>Right to grievance redressal regarding actions of data fiduciary (§13)</li>
                    <li>Right to nominate another individual in event of death/incapacity (§14)</li>
                  </ul>
                </div>

                {/* DPBI Escalation notice */}
                <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-900/30 text-amber-300/90 text-[10px] leading-normal">
                  <strong>Statutory Escalation Notice:</strong> If your grievances are not resolved by the Data Fiduciary within 30 days, you have the statutory legal right to lodge a complaint directly with the Data Protection Board of India (DPBI) at https://dpboard.gov.in.
                </div>

                {/* Action buttons */}
                <div className={cn('flex gap-2 pt-2', deviceSize === 'mobile' && 'flex-col')}>
                  <button
                    type="button"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--brand-primary)] text-white hover:opacity-90"
                  >
                    Accept notice
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
                  >
                    Customize choices
                  </button>
                </div>
                <button type="button" className="w-full mt-1.5 text-center hover:underline text-[var(--text-tertiary)] block text-[10px]">
                  Withdraw consent
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium mb-2 text-[var(--text-tertiary)]">Preview different screen sizes</div>
          <div className="flex gap-2">
            {DEVICE_OPTIONS.map(({ id, icon: Icon, label }) => {
              const isSelected = deviceSize === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={`Preview ${label}`}
                  aria-pressed={isSelected}
                  onClick={() => setDeviceSize(id)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    isSelected
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-black/5',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
