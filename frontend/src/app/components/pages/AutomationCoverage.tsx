import type { ReactElement } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Download, Gauge, HelpCircle, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CoverageMapTab } from '@/app/components/pages/automation-coverage/CoverageMapTab';
import { RationaleTab } from '@/app/components/pages/automation-coverage/RationaleTab';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { useAutomationCoverage } from '@/hooks/useAutomationCoverage';
import { downloadAutomationCoveragePdf } from '@/lib/dashboard/automationCoveragePdf';
import { notify } from '@/app/utils/notify';
import '@/app/components/pages/automation-coverage.css';

type CoverageTab = 'map' | 'why';

/**
 * Automation Coverage — maps Vajra platform capabilities to the Act section by section.
 */
export function AutomationCoverage(): ReactElement {
  const [activeTab, setActiveTab] = useState<CoverageTab>('why');
  const navigate = useNavigate();
  const {
    data,
    loading,
    error,
    reload,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    orgName,
  } = useAutomationCoverage();

  const handleExport = (): void => {
    if (!data) return;
    downloadAutomationCoveragePdf(data, orgName);
    notify('Automation coverage PDF downloaded');
  };

  return (
    <ConsentManagementGate
      title="Automation Coverage"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="automation-coverage">
        <div className="subcrumb">
          <Link to="/dashboard">Dashboard</Link>
          <span style={{ color: 'var(--ac-muted-2)' }}>/</span>
          <span className="cur">Automation Coverage</span>
        </div>

        <div className="page-head">
          <div>
            <h1>Automation Coverage</h1>
            <p className="page-sub">
              How Vajra maps to the Digital Personal Data Protection Act, 2023 — what the
              platform automates, and the reasoning behind every decision.
            </p>
          </div>
        </div>

        {error ? (
          <div className="px-4 py-3 mb-4 text-sm border border-red-300 rounded">
            {error}{' '}
            <button type="button" className="underline" onClick={() => void reload()}>
              Retry
            </button>
          </div>
        ) : null}

        <div className="tabbar">
          <button
            type="button"
            className={cn('tab', activeTab === 'map' && 'active')}
            onClick={() => setActiveTab('map')}
          >
            <LayoutGrid strokeWidth={2} />
            Coverage Map
          </button>
          <button
            type="button"
            className={cn('tab', activeTab === 'why' && 'active')}
            onClick={() => setActiveTab('why')}
          >
            <HelpCircle strokeWidth={2} />
            Automation Rationale
          </button>
        </div>

        {activeTab === 'map' ? (
          <CoverageMapTab data={data} loading={loading} />
        ) : (
          <RationaleTab data={data} loading={loading} />
        )}

        <div className="footer-bar">
          <button type="button" className="btn btn-primary" onClick={handleExport} disabled={!data}>
            <Download strokeWidth={2} />
            Export coverage map as PDF
          </button>
          <div className="grow" />
          <button type="button" className="btn" onClick={() => navigate('/compliance/score')}>
            <Gauge strokeWidth={2} />
            View Compliance Score
          </button>
        </div>
      </div>
    </ConsentManagementGate>
  );
}
