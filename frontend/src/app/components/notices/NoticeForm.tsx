import type { ReactElement } from 'react';
import { useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOTICE_LANGUAGES, NOTICE_LANGUAGE_LABELS } from '@/lib/consent/noticeLanguages';
import type { NoticeFormData } from '@/types';
import { notify } from '@/app/utils/notify';
import { buildPublicPortalUrl } from '@/lib/dsar/portalSlug';

interface NoticeFormProps {
  /** Current controlled form values. */
  formData: NoticeFormData;
  /** Updates the full form state object. */
  setFormData: (data: NoticeFormData) => void;
  /** Opens Multi-Language Editor for additional translations. */
  onAddLanguage?: () => void;
  /** Active organization slug. */
  orgSlug?: string;
}

const FIELD_CLASS = cn(
  'w-full px-3 py-2 rounded-lg text-sm',
  'bg-[var(--surface-card)] border border-[var(--border-default)] text-[var(--text-primary)]',
);



/**
 * Multi-section form for creating or editing a consent notice.
 */
export function NoticeForm({ formData, setFormData, onAddLanguage, orgSlug }: NoticeFormProps): ReactElement {
  const [charCount, setCharCount] = useState(formData.openingStatement.length);

  const handleChange = (field: keyof NoticeFormData, value: string): void => {
    setFormData({ ...formData, [field]: value });
    if (field === 'openingStatement') {
      setCharCount(value.length);
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Notice Identity</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
              Notice Title (internal name) *
            </label>
            <input
              type="text"
              value={formData.noticeTitle}
              onChange={(event) => handleChange('noticeTitle', event.target.value)}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
              Display Name (shown to users) *
            </label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(event) => handleChange('displayName', event.target.value)}
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="notice-language" className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                Language
              </label>
              <select
                id="notice-language"
                value={formData.language}
                onChange={(event) => handleChange('language', event.target.value)}
                className={cn(FIELD_CLASS, 'cursor-pointer')}
              >
                {!NOTICE_LANGUAGES.includes(formData.language as (typeof NOTICE_LANGUAGES)[number]) && (
                  <option value={formData.language}>{formData.language}</option>
                )}
                {NOTICE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {NOTICE_LANGUAGE_LABELS[lang]}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1 text-[var(--text-tertiary)]">
                Primary notice language per DPDPA Section 6(3) — English or an Eighth Schedule language.
              </p>
            </div>
            {onAddLanguage && (
              <button
                type="button"
                onClick={onAddLanguage}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--brand-primary)] shrink-0"
                title="Translate this notice into more languages"
              >
                <Plus className="size-4" />
                Add language
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Opening Statement</h2>
        </div>
        <textarea
          value={formData.openingStatement}
          onChange={(event) => handleChange('openingStatement', event.target.value)}
          placeholder="We collect and use your personal data to provide our services. This notice explains what data we collect, why, and how you can control it."
          rows={5}
          className={cn(FIELD_CLASS, 'resize-none')}
        />
        <div className="text-xs mt-1 text-[var(--text-tertiary)]">{charCount}/1000</div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Categories of Personal Data</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Specify which classes/types of personal data are collected (e.g. contact details, transaction history, medical records).</p>
        </div>
        <textarea
          value={formData.dataCategories || ''}
          onChange={(event) => handleChange('dataCategories', event.target.value)}
          placeholder="e.g. Name, Phone number, Email address, Payment details, Medical prescriptions"
          rows={3}
          className={cn(FIELD_CLASS, 'resize-none')}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Contact Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">Contact Email *</label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(event) => handleChange('contactEmail', event.target.value)}
              placeholder="privacy@company.in"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
              Contact Website (optional)
            </label>
            <input
              type="url"
              value={formData.contactWebsite}
              onChange={(event) => handleChange('contactWebsite', event.target.value)}
              className={FIELD_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">DPO Name</label>
              <input
                type="text"
                value={formData.dpoName}
                onChange={(event) => handleChange('dpoName', event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">DPO Email</label>
              <input
                type="email"
                value={formData.dpoEmail}
                onChange={(event) => handleChange('dpoEmail', event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
              Grievance Officer Name (if different from DPO)
            </label>
            <input
              type="text"
              value={formData.grievanceOfficerName || ''}
              onChange={(event) => handleChange('grievanceOfficerName', event.target.value)}
              className={FIELD_CLASS}
              placeholder="e.g. Same as DPO"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">User Rights</h2>
        <div className="space-y-4">
          <div>
            <div className="mb-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">
                How can users exercise their rights?
              </label>
            </div>
            <p className="text-xs mb-2 text-[var(--text-tertiary)]">Tip: include a clear method and timeframe</p>
            <textarea
              value={formData.rightsExercise}
              onChange={(event) => handleChange('rightsExercise', event.target.value)}
              rows={3}
              className={cn(FIELD_CLASS, 'resize-none')}
            />
          </div>

          <div>
            <div className="mb-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">
                How can users complain to the Data Protection Board?
              </label>
            </div>
            <textarea
              value={formData.complaintProcess}
              onChange={(event) => handleChange('complaintProcess', event.target.value)}
              rows={3}
              className={cn(FIELD_CLASS, 'resize-none')}
            />
          </div>

          <div>
            <div className="mb-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">
                Statutory Escalation Notice to DPBI
              </label>
            </div>
            <p className="text-xs mb-2 text-[var(--text-tertiary)]">Stipulates their right to escalate grievances to the Data Protection Board of India.</p>
            <textarea
              value={formData.dpbiEscalationText || ''}
              onChange={(event) => handleChange('dpbiEscalationText', event.target.value)}
              rows={3}
              className={cn(FIELD_CLASS, 'resize-none')}
            />
          </div>

          <div>
            <div className="mb-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">Data retention policy summary</label>
            </div>
            <textarea
              value={formData.retentionPolicy}
              onChange={(event) => handleChange('retentionPolicy', event.target.value)}
              rows={3}
              className={cn(FIELD_CLASS, 'resize-none')}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Consent Withdrawal Method</h2>
        <div className="mb-2">
          <label className="text-sm font-medium text-[var(--text-primary)]">
            How should users withdraw consent? (Optional)
          </label>
        </div>
        <textarea
          value={formData.consentWithdrawalMethod || ''}
          onChange={(event) => handleChange('consentWithdrawalMethod', event.target.value)}
          placeholder="e.g. Users may withdraw their consent at any time via the Rights Portal toggle below, or by contacting the DPO directly."
          rows={2}
          className={cn(FIELD_CLASS, 'resize-none')}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Consent Withdrawal URL</h2>
        <div className="flex items-center gap-2 mb-3">
          <div
            className={cn(
              'flex-1 px-3 py-2 rounded-lg text-sm font-mono',
              'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)]',
            )}
          >
            {orgSlug ? `${buildPublicPortalUrl(orgSlug)}?right=withdraw` : 'https://consent.company.in/withdraw/[SDK_KEY]'}
          </div>
          <button
            type="button"
            onClick={() => {
              const url = orgSlug ? `${buildPublicPortalUrl(orgSlug)}?right=withdraw` : 'https://consent.company.in/withdraw/[SDK_KEY]';
              void navigator.clipboard.writeText(url);
              notify('Consent withdrawal URL copied to clipboard');
            }}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors border border-[var(--border-default)] cursor-pointer"
            aria-label="Copy withdrawal URL"
          >
            <Copy className="size-4 text-[var(--text-secondary)]" />
          </button>
        </div>
        <div className="p-3 rounded-lg text-xs bg-[var(--status-info-bg)] text-[var(--text-secondary)]">
          Your SDK key will be embedded automatically when you save. This URL appears in the consent widget as
          &apos;Withdraw consent&apos; per DPDPA Rule 3(c).
        </div>
      </section>
    </div>
  );
}
