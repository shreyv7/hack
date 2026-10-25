import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { NewConsentNotice } from '@/app/components/pages/NewConsentNotice';
import type { Page } from '@/types';
import { pageToPath, pathToPage } from '@/router/pathMap';
import { useNavigationGuard } from '@/router/NavigationGuardContext';

export function NewConsentNoticeRoute(): ReactElement {
  const navigate = useNavigate();
  const { noticeId, versionId } = useParams<{ noticeId?: string; versionId?: string }>();
  const { registerGuard } = useNavigationGuard();

  const handleNavigate = (page: Page): void => {
    navigate(pageToPath(page));
  };

  return (
    <NewConsentNotice
      noticeId={noticeId ?? null}
      versionId={versionId ?? null}
      onCancel={() => navigate('/consent/notices')}
      onPublished={() => navigate('/consent/notices')}
      onOpenMultiLanguageEditor={() => navigate('/consent/languages')}
      onNavigate={handleNavigate}
      registerNavigationGuard={(guard) => {
        registerGuard(
          guard ? async (path) => guard(pathToPage(path) ?? 'dashboard') : null,
        );
      }}
    />
  );
}
