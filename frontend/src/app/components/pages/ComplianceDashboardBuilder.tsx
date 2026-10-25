import type { ReactElement } from 'react';
import { GovernanceDashboardPage } from '@/app/components/governance-dashboards/GovernanceDashboardPage';

/**
 * Governance → Compliance Dashboards
 * Enterprise dashboard builder module (not the application home dashboard).
 */
export function ComplianceDashboardBuilder(): ReactElement {
  return <GovernanceDashboardPage />;
}
