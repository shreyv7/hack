import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { PropertyManagement } from '@/app/components/pages/PropertyManagement';

interface PropertyManagementRouteProps {
  filterType: 'website' | 'mobile';
}

export function PropertyManagementRoute({ filterType }: PropertyManagementRouteProps): ReactElement {
  const navigate = useNavigate();
  const base = filterType === 'mobile' ? '/integrations/mobile' : '/integrations/website';

  return (
    <PropertyManagement
      filterType={filterType}
      onSelectProperty={(id) => navigate(`${base}/${id}`)}
    />
  );
}
