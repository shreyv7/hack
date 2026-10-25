import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { BannerBuilderDashboard } from '@/app/components/pages/BannerBuilderDashboard';
import { integrationsApi } from '@/lib/api/integrations';

export function BannerBuilderDashboardRoute(): ReactElement {
  const navigate = useNavigate();

  return (
    <BannerBuilderDashboard
      onNavigateToTechnicalIntegration={async (targetId) => {
        if (!targetId) {
          navigate('/integrations/website');
          return;
        }

        try {
          const prop = await integrationsApi.getProperty(targetId);
          navigate(`/integrations/website/${prop.id}`);
          return;
        } catch {
          // fall through
        }

        try {
          const props = await integrationsApi.listProperties();
          for (const p of props) {
            try {
              const assoc = await integrationsApi.getPropertyBanner(p.id);
              if (assoc && assoc.banner_id === targetId) {
                navigate(`/integrations/website/${p.id}`);
                return;
              }
            } catch {
              // continue
            }
          }
        } catch {
          // fall through
        }

        navigate('/integrations/website');
      }}
    />
  );
}
