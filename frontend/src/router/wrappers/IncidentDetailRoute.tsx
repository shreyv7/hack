import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { IncidentDetail } from '@/app/components/pages/IncidentDetail';

export function IncidentDetailRoute(): ReactElement {
  const navigate = useNavigate();
  const { incidentId = '' } = useParams<{ incidentId: string }>();

  const id = decodeURIComponent(incidentId);

  return (
    <IncidentDetail
      incidentId={id}
      onBack={() => navigate('/breach')}
      onOpenWizard={() => navigate(`/breach/${encodeURIComponent(id)}/wizard`)}
    />
  );
}
