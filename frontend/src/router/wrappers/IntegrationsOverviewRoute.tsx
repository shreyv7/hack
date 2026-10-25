import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { IntegrationsOverview } from '@/app/components/pages/IntegrationsOverview';
import type { Page } from '@/types';
import { pageToPath } from '@/router/pathMap';

const INTEGRATION_PAGE_OVERRIDES: Partial<Record<Page, string>> = {
  'technical-integration': '/integrations/website',
  'integration-website': '/integrations/website',
  'integration-mobile': '/integrations/mobile',
  'integration-api': '/integrations/api',
  'tag-manager': '/integrations/tag-manager',
  'deployment-settings': '/settings/deployment',
  'dpdpa-consent-managers': '/integrations/consent-managers',
};

export function IntegrationsOverviewRoute(): ReactElement {
  const navigate = useNavigate();

  return (
    <IntegrationsOverview
      onNavigate={(page: Page) => {
        const path = INTEGRATION_PAGE_OVERRIDES[page] ?? pageToPath(page);
        navigate(path);
      }}
    />
  );
}
