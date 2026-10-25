import type { WorkspaceSettings } from '@/types/workspace';

export function isSignificantDataFiduciary(settings: WorkspaceSettings): boolean {
  return (
    settings.is_significant_data_fiduciary || settings.dpdp_role === 'significant_data_fiduciary'
  );
}
