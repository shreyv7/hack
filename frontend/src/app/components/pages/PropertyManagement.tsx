import type { ReactElement } from 'react';
import { useState } from 'react';
import { Plus, Search, Globe, Smartphone } from 'lucide-react';
import { PropertyCard } from '../integrations/PropertyCard';
import { PropertyCreateModal } from '../integrations/PropertyCreateModal';
import { useProperties } from '@/hooks/useProperties';
import { integrationsApi } from '@/lib/api/integrations';
import { ApiError } from '@/lib/api/client';
import type { PropertyCreate } from '@/types/integrations';
import { DPDPALabelChip } from '../common/DPDPAChip';
import { IntegrationSetupGuideButton } from '../common/IntegrationSetupGuideButton';

export function PropertyManagement({ 
  onSelectProperty,
  filterType = 'website'
}: { 
  onSelectProperty: (id: string) => void;
  filterType?: 'website' | 'mobile';
}): ReactElement {
  const { properties, isLoading, error, refresh } = useProperties();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const handleCreate = async (data: PropertyCreate) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await integrationsApi.createProperty(data);
      setShowCreateModal(false);
      await refresh();
      onSelectProperty(result.id);
    } catch (err) {
      console.error(err);
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create property');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredProperties = properties.filter(p => {
    // 1. Search term filter
    const matchesSearch = 
      p.domain.toLowerCase().includes(search.toLowerCase()) || 
      p.display_name?.toLowerCase().includes(search.toLowerCase());
      
    if (!matchesSearch) return false;

    // 2. Platform target type filter
    if (filterType === 'website') {
      return p.property_type === 'website';
    }
    if (filterType === 'mobile') {
      return ['android', 'ios', 'flutter', 'react_native'].includes(p.property_type);
    }
    return true;
  });

  const isMobile = filterType === 'mobile';
  const pageTitle = isMobile ? 'Mobile SDK Integrations' : 'Website Integrations';
  const pageDesc = isMobile 
    ? 'Manage the iOS and Android applications where your headless SDKs are deployed.' 
    : 'Manage the domains and apps where your consent banners are deployed.';
  const addBtnText = isMobile ? 'Add App Target' : 'Add Property';
  const searchPlaceholder = isMobile ? 'Search apps by identifier or name...' : 'Search properties by domain...';

  return (
    <div className="h-full overflow-auto bg-[var(--surface-base)] font-sans">
      <div className="max-w-[1200px] mx-auto p-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">{pageTitle}</h1>
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              {pageDesc}
            </p>
            <div className="flex items-center gap-2">
              <DPDPALabelChip text="Ch.2 §6(1)" />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <IntegrationSetupGuideButton guideId={isMobile ? 'mobile_sdk' : 'website'} />
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-all bg-[var(--brand-primary)] text-white flex items-center gap-2 hover:opacity-90 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {addBtnText}
            </button>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-primary)] shadow-sm focus:ring-2 focus:ring-[var(--brand-primary)] outline-none"
          />
        </div>

        {error && (
          <div className="mb-6 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--status-danger)', backgroundColor: 'color-mix(in srgb, var(--status-danger) 8%, white)', color: 'var(--text-primary)' }}>
            Could not load properties from the backend. Your saved properties may still exist.
            {' '}
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] animate-pulse"></div>
            ))}
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed rounded-xl border-[var(--border-default)] bg-[var(--surface-card)]">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-[var(--surface-raised)]">
              {isMobile ? <Smartphone className="w-8 h-8 text-[var(--text-tertiary)]" /> : <Globe className="w-8 h-8 text-[var(--text-tertiary)]" />}
            </div>
            <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">
              {isMobile ? 'No mobile applications registered' : 'No properties found'}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-sm mx-auto">
              {isMobile 
                ? 'Register your mobile target environment to generate private API keys and download native build instructions.'
                : 'Get started by adding your first website domain to generate an installation snippet.'}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border transition-all hover:bg-black/5 dark:hover:bg-white/5 border-[var(--border-default)] text-[var(--text-primary)] inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {isMobile ? 'Register App Target' : 'Add Domain'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProperties.map(property => (
              <PropertyCard
                key={property.id}
                property={property}
                onClick={() => onSelectProperty(property.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <PropertyCreateModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          isLoading={isCreating}
          error={createError}
          propertyTypeFilter={filterType}
        />
      )}
    </div>
  );
}
