import { useNavigate } from 'react-router';
import { NoticeApprovals } from '@/app/components/pages/NoticeApprovals';

export function NoticeApprovalsRoute() {
  const navigate = useNavigate();
  return (
    <NoticeApprovals
      onEditNotice={(noticeId, versionId) =>
        navigate(`/consent/notices/${noticeId}/edit/${versionId}`)
      }
    />
  );
}
