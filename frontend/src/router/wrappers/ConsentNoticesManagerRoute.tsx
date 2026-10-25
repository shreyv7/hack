import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { ConsentNoticesManager } from '@/app/components/pages/ConsentNoticesManager';

export function ConsentNoticesManagerRoute(): ReactElement {
  const navigate = useNavigate();

  return (
    <ConsentNoticesManager
      onCreateNew={() => navigate('/consent/notices/new')}
      onEditNotice={(noticeId, versionId) =>
        navigate(`/consent/notices/${noticeId}/edit/${versionId}`)
      }
    />
  );
}
