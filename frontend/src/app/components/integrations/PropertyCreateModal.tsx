import type { ReactElement } from 'react';
import { useState } from 'react';
import { X } from 'lucide-react';
import type { PropertyCreate } from '@/types/integrations';

interface PropertyCreateModalProps {
  onClose: () => void;
  onSubmit: (data: PropertyCreate) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  propertyTypeFilter?: 'website' | 'mobile';
}

export function PropertyCreateModal({ 
  onClose, 
  onSubmit, 
  isLoading, 
  error,
  propertyTypeFilter = 'website'
}: PropertyCreateModalProps): ReactElement {
  const [formData, setFormData] = useState<PropertyCreate>({
    domain: '',
    display_name: '',
    property_type: propertyTypeFilter === 'mobile' ? 'android' : 'website',
    environment: 'production',
    blocker_mode: 'strict',
    default_language: 'en',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.domain) return;
    await onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl shadow-xl bg-[var(--surface-base)] border border-[var(--border-default)]">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-default)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {propertyTypeFilter === 'mobile' ? 'Add Mobile App Target' : 'Add New Property'}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {propertyTypeFilter === 'mobile' ? 'Register an iOS or Android app environment.' : 'Register a website domain for integration.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                borderColor: 'var(--status-danger)',
                backgroundColor: 'color-mix(in srgb, var(--status-danger) 8%, white)',
                color: 'var(--text-primary)',
              }}
            >
              {error}
            </div>
          )}

          {propertyTypeFilter === 'mobile' && (
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--text-primary)]">
                App Platform Target <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.property_type}
                onChange={(e) => setFormData({ ...formData, property_type: e.target.value as any })}
                className="w-full px-4 py-2.5 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]"
              >
                <option value="android">Android Native (Kotlin)</option>
                <option value="ios">iOS Native (Swift)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-primary)]">
              {propertyTypeFilter === 'mobile' ? 'App Identifier / Bundle ID' : 'Domain'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={propertyTypeFilter === 'mobile' ? 'e.g. com.acme.app' : 'e.g. acme.com or shop.acme.com'}
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value.toLowerCase().trim() })}
              className="w-full px-4 py-2.5 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-primary)]">
              Display Name <span className="text-[var(--text-tertiary)] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Acme Retail Main Site"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--text-primary)]">Environment</label>
              <select
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value as any })}
                className="w-full px-4 py-2.5 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--text-primary)]">Blocker Mode</label>
              <select
                value={formData.blocker_mode}
                onChange={(e) => setFormData({ ...formData, blocker_mode: e.target.value as any })}
                className="w-full px-4 py-2.5 rounded-lg border text-sm bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]"
              >
                <option value="strict">Strict (Auto-block)</option>
                <option value="standard">Standard</option>
                <option value="off">Off (Manual blocking)</option>
              </select>
            </div>
          </div>
          
          <div className="pt-2">
             <div className="p-3 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info)] text-sm text-[var(--text-primary)]">
                You'll get an API key and installation snippet on the next screen.
             </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:bg-black/5 border-[var(--border-default)] text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.domain || isLoading}
              className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--brand-primary)] text-white"
            >
              {isLoading ? 'Creating...' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
