import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { ArrowLeft, Settings2 } from 'lucide-react';
import type {
  DataRightType,
  PortalFormField,
  PortalFormSchema,
  VerificationMethod,
} from '@/types/dsar';
import { RIGHT_TYPE_LABELS } from '@/types/dsar';
import { fetchPortalForm } from '@/lib/api/dsar';
import {
  emptyValuesForForm,
  getVerificationOptions,
  isFormValid,
  mapFormValuesToSubmission,
} from '@/lib/dsar/portalFormUtils';
import { notify } from '@/app/utils/notify';
import { Button } from '@/app/components/ui/Button';
import { IndiaPhoneInput } from '@/app/components/ui/IndiaPhoneInput';
import { PortalFormBuilder } from '@/app/components/portal/PortalFormBuilder';

interface RequestFormProps {
  orgSlug: string;
  rightType: DataRightType;
  onBack: () => void;
  onSubmit: (data: {
    requester_name: string;
    requester_email: string;
    requester_phone: string;
    request_details: string;
    extra_data: Record<string, unknown>;
    verification_method: VerificationMethod;
  }) => Promise<void>;
  loading?: boolean;
  canCustomize?: boolean;
  onSaveForm?: (schema: PortalFormSchema) => Promise<void>;
}

function renderFieldInput(
  field: PortalFormField,
  value: string | boolean,
  onChange: (key: string, value: string | boolean) => void
): ReactElement {
  const commonClass = 'w-full px-3 py-2 border border-[var(--border-default)] rounded-md';

  if (field.type === 'textarea') {
    return (
      <textarea
        rows={4}
        value={String(value)}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.key, e.target.value)}
        className={commonClass}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(field.key, e.target.value)}
        className={commonClass}
      >
        <option value="">Select…</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field.key, e.target.checked)}
        />
        {field.placeholder || field.label}
      </label>
    );
  }

  if (field.type === 'tel') {
    return (
      <IndiaPhoneInput
        value={String(value)}
        onChange={(digits) => onChange(field.key, digits)}
        className="w-full"
        inputClassName="flex-1 min-w-0 px-3 py-2 border border-[var(--border-default)] rounded-r-md"
      />
    );
  }

  const inputType =
    field.type === 'email' || field.type === 'number' || field.type === 'date'
      ? field.type
      : 'text';

  return (
    <input
      type={inputType}
      value={String(value)}
      placeholder={field.placeholder}
      onChange={(e) => onChange(field.key, e.target.value)}
      className={commonClass}
    />
  );
}

export function RequestForm({
  orgSlug,
  rightType,
  onBack,
  onSubmit,
  loading = false,
  canCustomize = false,
  onSaveForm,
}: RequestFormProps): ReactElement {
  const [schema, setSchema] = useState<PortalFormSchema | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [formLoading, setFormLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('email');

  useEffect(() => {
    let cancelled = false;
    setFormLoading(true);
    setFormError(null);
    void fetchPortalForm(orgSlug, rightType)
      .then((loaded) => {
        if (cancelled) return;
        setSchema(loaded);
        setValues(emptyValuesForForm(loaded));
        setVerificationMethod(getVerificationOptions(loaded.fields).defaultMethod);
      })
      .catch(() => {
        if (!cancelled) setFormError('Could not load request form');
      })
      .finally(() => {
        if (!cancelled) setFormLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, rightType]);

  const handleChange = (key: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const verificationOptions = schema ? getVerificationOptions(schema.fields) : null;
  const canSubmit = schema
    ? isFormValid(
        schema.fields,
        values,
        verificationOptions?.needsChoice ? verificationMethod : undefined
      )
    : false;

  const handleSaveForm = async (next: PortalFormSchema) => {
    if (!onSaveForm) return;
    setSavingForm(true);
    try {
      await onSaveForm(next);
      setSchema(next);
      setValues(emptyValuesForForm(next));
      setEditing(false);
    } finally {
      setSavingForm(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-8">
      <div className="mb-6 flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 hover:underline text-[var(--brand-primary)]"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-tertiary)]">{RIGHT_TYPE_LABELS[rightType]}</span>
          {canCustomize && onSaveForm && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-[var(--brand-primary)] hover:underline"
            >
              <Settings2 className="size-4" />
              Customize form
            </button>
          )}
        </div>
      </div>

      <div className="p-8 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] space-y-4">
        <h1 className="text-2xl font-semibold">{RIGHT_TYPE_LABELS[rightType]}</h1>

        {formLoading && (
          <p className="text-sm text-[var(--text-secondary)]">Loading form…</p>
        )}

        {formError && (
          <p className="text-sm text-red-600">{formError}</p>
        )}

        {editing && schema && onSaveForm && (
          <PortalFormBuilder
            schema={schema}
            onSave={handleSaveForm}
            onCancel={() => setEditing(false)}
            saving={savingForm}
          />
        )}

        {!editing && schema && !formLoading && (
          <>
            {schema.fields.map((field) => (
              <div key={field.id}>
                {field.type !== 'checkbox' && (
                  <label className="block text-sm font-medium mb-2">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </label>
                )}
                {renderFieldInput(field, values[field.key] ?? '', handleChange)}
              </div>
            ))}
            {verificationOptions?.needsChoice && (
              <div className="rounded-lg border border-[var(--border-default)] p-4 space-y-2">
                <p className="text-sm font-medium">How should we verify your identity?</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="verification-method"
                    checked={verificationMethod === 'email'}
                    onChange={() => setVerificationMethod('email')}
                  />
                  Send verification code to my email
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="verification-method"
                    checked={verificationMethod === 'sms'}
                    onChange={() => setVerificationMethod('sms')}
                  />
                  Send verification code via SMS to my phone
                </label>
              </div>
            )}
            <p className="text-xs text-[var(--text-secondary)]">{schema.help_text}</p>
            <Button
              variant="primary"
              size="lg"
              disabled={!canSubmit || loading}
              onClick={() => {
                if (!schema) return;
                try {
                  const payload = mapFormValuesToSubmission(
                    schema.fields,
                    values,
                    verificationOptions?.needsChoice ? verificationMethod : undefined
                  );
                  void onSubmit(payload);
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Please complete all required fields');
                }
              }}
            >
              {loading ? 'Submitting…' : 'Submit request'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
