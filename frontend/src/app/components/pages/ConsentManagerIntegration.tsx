import { notify } from '@/app/utils/notify';
import { SectionReference } from '@/app/components/common/SectionReference';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { Check, Link as LinkIcon, Search, Users, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';

const CROSS_CM_CONSENTS = [
  {
    key: 'priya',
    principalName: 'Priya S***a',
    principalId: 'DP_a8b3c9',
    manager: 'Sahamati',
    purpose: 'Account aggregation',
    granted: '12 Mar 2026',
    expires: '12 Mar 2027',
    status: 'active' as const,
    detail: 'Data Principal: Priya S***a\nDP ID: DP_a8b3c9\n\nConsent Details:\n• Purpose: Account aggregation\n• Provider: Sahamati\n• Granted: 12 Mar 2026\n• Expires: 12 Mar 2027\n• Status: Active',
  },
  {
    key: 'aditya',
    principalName: 'Aditya Y***v',
    principalId: 'DP_d4e5f6',
    manager: 'Setu CM',
    purpose: 'Financial data sharing',
    granted: '05 Apr 2026',
    expires: '05 Oct 2026',
    status: 'active' as const,
    detail: 'Data Principal: Aditya Y***v\nDP ID: DP_d4e5f6\n\nConsent Details:\n• Purpose: Financial data sharing\n• Provider: Setu CM\n• Granted: 05 Apr 2026\n• Expires: 05 Oct 2026\n• Status: Active',
  },
  {
    key: 'pranav',
    principalName: 'Pranav V***h',
    principalId: 'DP_g7h8i9',
    manager: 'Sahamati',
    purpose: 'Investment tracking',
    granted: '18 Feb 2026',
    expires: '18 Aug 2026',
    status: 'withdrawn' as const,
    detail: 'Data Principal: Pranav V***h\nDP ID: DP_g7h8i9\n\nConsent Details:\n• Purpose: Investment tracking\n• Provider: Sahamati\n• Granted: 18 Feb 2026\n• Withdrawn: 25 Apr 2026\n• Status: Withdrawn',
  },
];

/**
 * Consent manager SDK integration and deployment settings.
 */
export function ConsentManagerIntegration(): ReactElement {
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConsents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return CROSS_CM_CONSENTS;
    return CROSS_CM_CONSENTS.filter(
      (row) =>
        row.principalName.toLowerCase().includes(q) ||
        row.principalId.toLowerCase().includes(q),
    );
  }, [searchTerm]);

  const consentsPager = useClientPagination(filteredConsents);

  useEffect(() => {
    consentsPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  return (
    <div className="p-8 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1>Consent Manager Integration</h1>
          <button
            onClick={() => setShowConnectModal(true)}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Connect New Consent Manager
          </button>
        </div>
        <SectionReference section="DPDPA Section 6(7) — Registered Consent Manager Intermediaries" />
      </div>

      {/* Education Card */}
      <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)]/30 rounded-lg p-4 mb-6">
        <div className="text-sm text-[var(--text-primary)]">
          <strong>DPDPA Section 6(7):</strong> Data Principals may give, manage, review, and withdraw consent through
          Consent Managers registered with the Data Protection Board of India. Vajra integrates with DPB-registered
          Consent Managers to honor consents granted through these intermediaries.
        </div>
      </div>

      {/* Current Integrations */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Sahamati */}
        <div
          onClick={() => notify('Sahamati Integration\n\nStatus: Connected\nConsents: 12,450\nActive: 11,287\nWithdrawn: 1,163\n\nLast sync: 2 minutes ago')}
          className="bg-[var(--surface-card)] rounded-lg border-2 border-[var(--status-success)]/30 p-6 cursor-pointer hover:shadow-md transition-shadow text-[var(--text-primary)]"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="size-10 rounded-lg bg-[var(--status-success-bg)] flex items-center justify-center">
                <Check className="size-6 text-[var(--status-success)]" />
              </div>
              <h3 className="font-medium text-[var(--text-primary)]">Sahamati</h3>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">
              <Check className="size-3" />
              Connected
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Consents received</span>
              <span className="font-semibold text-[var(--text-primary)]">12,450</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Active consents</span>
              <span className="font-semibold text-[var(--status-success)]">11,287</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Withdrawn</span>
              <span className="font-semibold text-[var(--text-secondary)]">1,163</span>
            </div>
            <div className="pt-3 border-t border-[var(--border-default)]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-info-bg)] text-[var(--status-info)] text-xs border border-[var(--status-info)]/20">
                DPB Registered ✓
              </span>
            </div>
          </div>
        </div>

        {/* Setu */}
        <div
          onClick={() => notify('Setu CM Integration\n\nStatus: Connected\nConsents: 3,287\nActive: 3,102\nWithdrawn: 185\n\nLast sync: 5 minutes ago')}
          className="bg-[var(--surface-card)] rounded-lg border-2 border-[var(--status-success)]/30 p-6 cursor-pointer hover:shadow-md transition-shadow text-[var(--text-primary)]"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="size-10 rounded-lg bg-[var(--status-success-bg)] flex items-center justify-center">
                <Check className="size-6 text-[var(--status-success)]" />
              </div>
              <h3 className="font-medium text-[var(--text-primary)]">Setu CM</h3>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">
              <Check className="size-3" />
              Connected
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Consents received</span>
              <span className="font-semibold text-[var(--text-primary)]">3,287</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Active consents</span>
              <span className="font-semibold text-[var(--status-success)]">3,102</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Withdrawn</span>
              <span className="font-semibold text-[var(--text-secondary)]">185</span>
            </div>
            <div className="pt-3 border-t border-[var(--border-default)]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-info-bg)] text-[var(--status-info)] text-xs border border-[var(--status-info)]/20">
                DPB Registered ✓
              </span>
            </div>
          </div>
        </div>

        {/* OneMoney */}
        <div
          onClick={() => {
            setSelectedProvider('OneMoney');
            setShowConnectModal(true);
          }}
          className="bg-[var(--surface-card)] rounded-lg border-2 border-[var(--border-default)] p-6 cursor-pointer hover:shadow-md transition-shadow text-[var(--text-primary)]"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="size-10 rounded-lg bg-[var(--surface-raised)] flex items-center justify-center">
                <LinkIcon className="size-6 text-[var(--text-tertiary)]" />
              </div>
              <h3 className="font-medium text-[var(--text-primary)]">OneMoney</h3>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs border border-[var(--border-default)]">
              Not Connected
            </span>
          </div>

          <div className="space-y-3">
            <div className="text-sm text-[var(--text-secondary)] mb-4">
              Connect OneMoney to receive consents from their platform
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProvider('OneMoney');
                setShowConnectModal(true);
              }}
              className="w-full px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
            >
              Connect OneMoney
            </button>
            <div className="pt-3 border-t border-[var(--border-default)]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-info-bg)] text-[var(--status-info)] text-xs border border-[var(--status-info)]/20">
                DPB Registered ✓
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Integration Setup */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 mb-6 text-[var(--text-primary)]">
        <h3 className="font-medium mb-4 text-[var(--text-primary)]">New Integration Setup</h3>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="size-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm">
                1
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-2 text-[var(--text-primary)]">Select Consent Manager Provider</h4>
              <select
                className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                <option value="" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Choose a DPB-registered Consent Manager...</option>
                <option value="Sahamati" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Sahamati</option>
                <option value="Setu CM" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Setu CM</option>
                <option value="OneMoney" className="bg-[var(--surface-card)] text-[var(--text-primary)]">OneMoney</option>
                <option value="Finvu" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Finvu</option>
                <option value="NADL" className="bg-[var(--surface-card)] text-[var(--text-primary)]">NADL (National Account Aggregator Directory)</option>
              </select>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="size-8 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)] flex items-center justify-center font-semibold text-sm">
                2
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-2 text-[var(--text-primary)]">Enter API Credentials</h4>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Client ID"
                  className="px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  disabled={!selectedProvider}
                />
                <input
                  type="password"
                  placeholder="Client Secret"
                  className="px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  disabled={!selectedProvider}
                />
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="size-8 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)] flex items-center justify-center font-semibold text-sm">
                3
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-2 text-[var(--text-primary)]">Map Purposes to Consent Manager Categories</h4>
              <div className="text-sm text-[var(--text-secondary)]">Purpose mapping will be configured after provider selection</div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="size-8 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)] flex items-center justify-center font-semibold text-sm">
                4
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-2 text-[var(--text-primary)]">Test Connection</h4>
              <button
                onClick={() => notify(`Testing connection to ${selectedProvider}...\n\n✓ Connection successful!\n✓ API credentials valid\n✓ DPB registration verified`)}
                className="px-4 py-2 rounded-md border border-[var(--border-strong)] text-sm hover:bg-[var(--surface-raised)] text-[var(--text-primary)] bg-transparent"
                disabled={!selectedProvider}
              >
                Test Connection
              </button>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="size-8 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)] flex items-center justify-center font-semibold text-sm">
                5
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-2 text-[var(--text-primary)]">Go Live</h4>
              <button
                onClick={() => {
                  notify(`${selectedProvider} integration activated!\n\nYou will now receive consents from ${selectedProvider} platform.`);
                  setSelectedProvider('');
                }}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700"
                disabled={!selectedProvider}
              >
                Activate Integration
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-CM Unified View */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 text-[var(--text-primary)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-medium text-[var(--text-primary)]">Cross-CM Unified Consent View</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search by Data Principal ID or email..."
                className="pl-10 pr-4 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md w-80 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Data Principal</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Consent Manager</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Purpose</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Granted</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Expires</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-primary)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {consentsPager.slice.map((row) => (
                <tr
                  key={row.key}
                  onClick={() => notify(row.detail)}
                  className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="text-sm font-medium text-[var(--text-primary)]">{row.principalName}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{row.principalId}</div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{row.manager}</td>
                  <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{row.purpose}</td>
                  <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{row.granted}</td>
                  <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">{row.expires}</td>
                  <td className="py-3 px-4">
                    {row.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs border border-[var(--status-success)]/20">
                        <Check className="size-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs border border-[var(--border-default)]">
                        Withdrawn
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager
          page={consentsPager.page}
          pageCount={consentsPager.pageCount}
          total={consentsPager.total}
          pageSize={consentsPager.pageSize}
          onPage={consentsPager.setPage}
        />
      </div>

      {/* Connect New Manager Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowConnectModal(false)}>
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-lg p-6 max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto text-[var(--text-primary)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Connect Consent Manager</h2>
              <button onClick={() => setShowConnectModal(false)} className="p-1 hover:bg-[var(--surface-raised)] rounded text-[var(--text-secondary)]">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Select Provider</label>
                <select
                  className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                >
                  <option value="" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Choose a DPB-registered Consent Manager...</option>
                  <option value="Sahamati" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Sahamati</option>
                  <option value="Setu CM" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Setu CM</option>
                  <option value="OneMoney" className="bg-[var(--surface-card)] text-[var(--text-primary)]">OneMoney</option>
                  <option value="Finvu" className="bg-[var(--surface-card)] text-[var(--text-primary)]">Finvu</option>
                  <option value="NADL" className="bg-[var(--surface-card)] text-[var(--text-primary)]">NADL (National Account Aggregator Directory)</option>
                </select>
              </div>

              {selectedProvider && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Client ID</label>
                      <input type="text" className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]" placeholder="Enter Client ID" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Client Secret</label>
                      <input type="password" className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]" placeholder="Enter Client Secret" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">API Endpoint</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      defaultValue={`https://api.${selectedProvider.toLowerCase().replace(' ', '')}.in/v1`}
                    />
                  </div>

                  <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)]/30 rounded p-3">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <Check className="size-4 text-[var(--status-success)]" />
                      <span>{selectedProvider} is DPB registered and verified</span>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    if (selectedProvider) {
                      notify(`Testing connection to ${selectedProvider}...\n\n✓ Connection successful!\n✓ API credentials valid\n✓ DPB registration verified`);
                    }
                  }}
                  className="px-4 py-2 rounded-md border border-[var(--border-strong)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] bg-transparent"
                  disabled={!selectedProvider}
                >
                  Test Connection
                </button>
                <button
                  onClick={() => {
                    if (selectedProvider) {
                      notify(`${selectedProvider} integrated successfully!\n\nYou will now receive consents from ${selectedProvider}.`);
                      setShowConnectModal(false);
                      setSelectedProvider('');
                    }
                  }}
                  className="flex-1 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                  disabled={!selectedProvider}
                >
                  Connect & Activate
                </button>
                <button
                  onClick={() => {
                    setShowConnectModal(false);
                    setSelectedProvider('');
                  }}
                  className="px-4 py-2 rounded-md border border-[var(--border-strong)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] bg-transparent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
