import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { TechnicalIntegration, type IntegrationTab } from '@/app/components/pages/TechnicalIntegration';
import { useProperties } from '@/hooks/useProperties';

interface TechnicalIntegrationRouteProps {
  defaultTab?: IntegrationTab;
}

export function TechnicalIntegrationRoute({ defaultTab = 'website' }: TechnicalIntegrationRouteProps): ReactElement {
  const navigate = useNavigate();
  const { properties } = useProperties();
  const primaryPropertyId = properties[0]?.id || 'prop-default';

  return (
    <TechnicalIntegration
      propertyId={primaryPropertyId}
      defaultTab={defaultTab}
      onNavigateToBannerBuilder={(bannerId) => navigate(`/consent/banner${bannerId ? `?id=${bannerId}` : ''}`)}
    />
  );
}
