import { X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import type { DataProcessor, DataProcessorCreate, DpaStatus } from '@/types/workspace';

export type ProcessorFormValues = {
  name: string;
  processor_role: string;
  purpose: string;
  dpa_status: DpaStatus;
  dpa_signed_date: string;
  risk_level: string;
  data_categories: string;
  location: string;
  contact_email: string;
};

const EMPTY_FORM: ProcessorFormValues = {
  name: '',
  processor_role: 'Data Processor',
  purpose: '',
  dpa_status: 'none',
  dpa_signed_date: '',
  risk_level: 'Low',
  data_categories: '',
  location: '',
  contact_email: '',
};

function fromProcessor(p: DataProcessor): ProcessorFormValues {
  return {
    name: p.name,
    processor_role: p.processor_role,
    purpose: p.purpose ?? '',
    dpa_status: p.dpa_status,
    dpa_signed_date: p.dpa_signed_date ?? '',
    risk_level: p.risk_level ?? 'Low',
    data_categories: p.data_categories ?? '',
    location: p.location ?? '',
    contact_email: p.contact_email ?? '',
  };
}

export function toProcessorPayload(values: ProcessorFormValues): DataProcessorCreate {
  const trim = (s: string) => s.trim();
  return {
    name: trim(values.name),
    processor_role: trim(values.processor_role) || 'Data Processor',
    purpose: trim(values.purpose) || null,
    dpa_status: values.dpa_status,
    dpa_signed_date: trim(values.dpa_signed_date) || null,
    risk_level: trim(values.risk_level) || null,
    data_categories: trim(values.data_categories) || null,
    location: trim(values.location) || null,
    contact_email: trim(values.contact_email) || null,
  };
}

interface ProcessorFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: DataProcessor | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (body: DataProcessorCreate) => Promise<void>;
}

const inputClass =
  'w-full border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';

export function ProcessorFormModal({
  open,
  mode,
  initial,
  saving = false,
  onClose,
  onSubmit,
}: ProcessorFormModalProps): ReactElement | null {
  const [form, setForm] = useState<ProcessorFormValues>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? fromProcessor(initial) : { ...EMPTY_FORM });
  }, [open, initial]);

  if (!open) return null;

  const set = (key: keyof ProcessorFormValues, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    void onSubmit(toProcessorPayload(form));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface-card)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto text-[var(--text-primary)]">
        <div className="sticky top-0 bg-[var(--surface-card)] border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold">
            {mode === 'create' ? 'Add data processor' : `Edit ${initial?.name ?? 'processor'}`}
          </h2>
          <button type="button" onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputClass}
              placeholder="e.g. Salesforce"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <input
                value={form.processor_role}
                onChange={(e) => set('processor_role', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Risk level</label>
              <select
                value={form.risk_level}
                onChange={(e) => set('risk_level', e.target.value)}
                className={inputClass}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Purpose</label>
            <input
              value={form.purpose}
              onChange={(e) => set('purpose', e.target.value)}
              className={inputClass}
              placeholder="e.g. CRM & Marketing"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">DPA status</label>
              <select
                value={form.dpa_status}
                onChange={(e) => set('dpa_status', e.target.value)}
                className={inputClass}
              >
                <option value="none">No DPA</option>
                <option value="signed">Signed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">DPA date</label>
              <input
                type="date"
                value={form.dpa_signed_date}
                onChange={(e) => set('dpa_signed_date', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Data categories</label>
            <textarea
              value={form.data_categories}
              onChange={(e) => set('data_categories', e.target.value)}
              className={`${inputClass} h-20`}
              placeholder="Types of personal data processed"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                className={inputClass}
                placeholder="e.g. India (Mumbai)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => set('contact_email', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Add processor' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-raised)] text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
