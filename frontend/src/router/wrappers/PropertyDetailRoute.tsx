import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PropertyDetailView } from '@/app/components/pages/PropertyDetail';

interface PropertyDetailRouteProps {
  filterType: 'website' | 'mobile';
}

export function PropertyDetailRoute({ filterType }: PropertyDetailRouteProps): ReactElement {
  const navigate = useNavigate();
  const { propertyId = '' } = useParams<{ propertyId: string }>();
  const listPath = filterType === 'mobile' ? '/integrations/mobile' : '/integrations/website';

  return (
    <PropertyDetailView
      propertyId={propertyId}
      onBack={() => navigate(listPath)}
      onNavigateToBannerBuilder={() => navigate('/consent/banner')}
      onNavigateToTagManager={() => navigate('/integrations/tag-manager')}
    />
  );
}
