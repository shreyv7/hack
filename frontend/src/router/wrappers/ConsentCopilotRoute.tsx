import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { ConsentCopilot } from '@/app/components/pages/ConsentCopilot';
import type { Page } from '@/types';
import { pageToPath } from '@/router/pathMap';

export function ConsentCopilotRoute(): ReactElement {
  const navigate = useNavigate();

  return <ConsentCopilot onNavigate={(page: Page) => navigate(pageToPath(page))} />;
}
