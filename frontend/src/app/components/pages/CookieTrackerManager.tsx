import { TablePager } from '@/app/components/common/TablePager';
import { notify } from '@/app/utils/notify';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { AlertTriangle, Check, X, RefreshCw, Shield, ListFilter, Play } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchPurposes } from '@/lib/api/consent';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';
import type { Property } from '@/types/integrations';

/**
 * Cookie and tracker inventory with consent category mapping.
 */
export function CookieTrackerManager(): ReactElement {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  
  const [trackers, setTrackers] = useState<any[]>([]);
  const [loadingTrackers, setLoadingTrackers] = useState(false);
  const [scanStatus, setScanStatus] = useState<any>(null);
  const [purposes, setPurposes] = useState<any[]>([]);
  
  const [selectedTracker, setSelectedTracker] = useState<any | null>(null);

  // Fetch properties and purposes on mount
  useEffect(() => {
    integrationsApi.listProperties(orgId)
      .then((data) => {
        setProperties(data);
        if (data.length > 0) {
          setSelectedProperty(data[0]);
        }
      })
      .catch(() => notify('Failed to fetch properties'));

    fetchPurposes(orgId)
      .then((data) => setPurposes(data))
      .catch((err) => console.error('Failed to fetch purposes', err));
  }, []);

  // Fetch trackers when property changes
  useEffect(() => {
    if (!selectedProperty) return;
    fetchTrackers();
    checkScanStatus();
  }, [selectedProperty]);

  const fetchTrackers = async () => {
    if (!selectedProperty) return;
    setLoadingTrackers(true);
    try {
      const data = await integrationsApi.listTrackers(selectedProperty.id, orgId);
      setTrackers(data);
    } catch (err) {
      notify('Failed to fetch trackers');
    } finally {
      setLoadingTrackers(false);
    }
  };

  const checkScanStatus = async () => {
    if (!selectedProperty) return;
    try {
      const status = await integrationsApi.getCookieScanStatus(selectedProperty.id, orgId);
      setScanStatus(status);
      
      if (status && status.status === 'running') {
        // Poll every 5 seconds if running
        setTimeout(checkScanStatus, 5000);
      } else if (status && status.status === 'completed') {
        fetchTrackers(); // Refresh trackers if just finished
      }
    } catch (err) {
      console.error('Failed to get scan status', err);
    }
  };

  const startScan = async () => {
    if (!selectedProperty) return;
    try {
      await integrationsApi.triggerCookieScan(selectedProperty.id, orgId);
      notify('Cookie scan started successfully');
      checkScanStatus();
    } catch (err) {
      notify('Failed to start scan');
    }
  };

  const handleUpdateTracker = async (trackerId: string, overrides: { overridden_category?: string, action?: string, purpose_id?: string }) => {
    if (!selectedProperty) return;
    try {
      await integrationsApi.updateTrackerOverride(
        selectedProperty.id,
        trackerId,
        overrides.overridden_category,
        overrides.action,
        overrides.purpose_id,
        orgId
      );
      notify('Tracker updated successfully');
      fetchTrackers();
      if (selectedTracker && selectedTracker.id === trackerId) {
        setSelectedTracker({ ...selectedTracker, ...overrides });
        setSelectedTracker(null); // Close modal to reflect changes easily
      }
    } catch (err) {
      notify('Failed to update tracker');
    }
  };

  const trackersPager = useClientPagination(trackers);

  useEffect(() => {
    trackersPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProperty?.id]);

  return (
    <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="mb-2 text-[var(--text-primary)]">Cookie & Tracker Manager</h1>
            <div className="flex items-center gap-3">
              <DPDPAChip
                sections={[
                  {
                    chapter: 2,
                    section: 5,
                    name: 'Notice',
                    url: '/dpdpa2023/chapter-2/section5.html',
                  },
                  {
                    chapter: 2,
                    section: 6,
                    name: 'Consent',
                    url: '/dpdpa2023/chapter-2/section6.html',
                    excerpt: 'Cookie consent required...',
                  },
                ]}
                size="detailed"
              />
              <PenaltyChip amount={150} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] bg-[var(--surface-card)] text-[var(--text-primary)] flex items-center gap-2"
              onClick={startScan}
              disabled={scanStatus?.status === 'running'}
            >
              {scanStatus?.status === 'running' ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4" />}
              {scanStatus?.status === 'running' ? 'Scanning...' : 'Run New Scan'}
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => notify('Evidence pack exported successfully!')}
            >
              Export Report
            </button>
          </div>
        </div>
        <SectionReference section="DPDPA Section 6, IT Rules 2021 — Cookie Consent" />
      </div>

      {/* Property Tabs */}
      <div className="mb-6 flex gap-2 border-b border-[var(--border-default)] overflow-x-auto">
        {properties.map((property) => (
          <button
            key={property.id}
            onClick={() => setSelectedProperty(property)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
              selectedProperty?.id === property.id ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {property.domain}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4 shadow-sm">
          <div className="text-2xl font-semibold text-[var(--text-primary)]">{trackers.length}</div>
          <div className="text-sm text-[var(--text-secondary)]">Detected Trackers</div>
        </div>
        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4 shadow-sm">
          <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
            {trackers.filter(t => t.active_category !== 'unknown').length}
          </div>
          <div className="text-sm text-[var(--text-secondary)] flex items-center gap-1">
            <Check className="size-3 text-green-600 dark:text-green-400" />
            Categorized
          </div>
        </div>
        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4 shadow-sm">
          <div className="text-2xl font-semibold text-yellow-600 dark:text-yellow-400">
            {trackers.filter(t => t.active_category === 'unknown').length}
          </div>
          <div className="text-sm text-[var(--text-secondary)] flex items-center gap-1">
            <AlertTriangle className="size-3 text-yellow-600 dark:text-yellow-400" />
            Uncategorized
          </div>
        </div>
        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-4 shadow-sm">
          <div className="text-2xl font-semibold text-red-600 dark:text-red-400">
            {trackers.filter(t => t.override_action === 'block').length}
          </div>
          <div className="text-sm text-[var(--text-secondary)] flex items-center gap-1">
            <Shield className="size-3 text-red-600 dark:text-red-400" />
            Explicitly Blocked
          </div>
        </div>
      </div>

      {/* Global Controls HUD */}
      <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-2">Consent Enforcement Engine</h3>
            <p className="text-sm text-indigo-700 dark:text-indigo-300 max-w-2xl">
              Vajra SDK automatically intercepts and blocks unrecognized scripts. Strict Mode ensures zero trackers fire before active consent is obtained under DPDPA Section 6.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-indigo-100 dark:border-indigo-900 p-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xs text-[var(--text-secondary)] mb-1">Blocker Mode</div>
                <div className="text-sm font-semibold flex items-center gap-1">
                  {selectedProperty?.blocker_mode === 'strict' ? (
                    <><Shield className="size-4 text-green-600" /> Strict Mode</>
                  ) : (
                    <><AlertTriangle className="size-4 text-yellow-600" /> Standard</>
                  )}
                </div>
              </div>
              <div className="w-px h-8 bg-[var(--border-default)]"></div>
              <div>
                <div className="text-xs text-[var(--text-secondary)] mb-1">Last Scan</div>
                <div className="text-sm font-medium">
                  {scanStatus?.completed_at ? new Date(scanStatus.completed_at).toLocaleDateString() : 'Never'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] shadow-sm">
        <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
          <h3 className="font-medium text-[var(--text-primary)] flex items-center gap-2">
            <ListFilter className="size-4" />
            Detected Trackers Inventory
          </h3>
          <div className="flex items-center gap-2">
             <span className="text-xs text-[var(--text-secondary)]">Showing {trackers.length} trackers</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loadingTrackers ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">Loading trackers...</div>
          ) : trackers.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)]">No trackers detected yet. Run a scan to populate the inventory.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
                  <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-secondary)]">Tracker Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-secondary)]">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-secondary)]">Active Category</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-secondary)]">Domain</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-secondary)]">Enforcement</th>
                </tr>
              </thead>
              <tbody>
                {trackersPager.slice.map(tracker => (
                  <tr
                    key={tracker.id}
                    onClick={() => setSelectedTracker(tracker)}
                    className="border-b border-[var(--border-default)] text-sm hover:bg-[var(--surface-raised)] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-indigo-600 dark:text-indigo-400">{tracker.name}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] capitalize">{tracker.type.replace('_', ' ')}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        tracker.active_category === 'analytics' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        tracker.active_category === 'marketing' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        tracker.active_category === 'essential' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {tracker.active_category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] truncate max-w-[200px]">{tracker.domain || 'N/A'}</td>
                    <td className="py-3 px-4">
                      {tracker.override_action === 'block' ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium text-xs">
                          <X className="size-3" /> Force Blocked
                        </span>
                      ) : tracker.override_action === 'allow' ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-xs">
                          <Check className="size-3" /> Force Allowed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--text-secondary)] text-xs">
                          Auto (SDK)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TablePager
            page={trackersPager.page}
            pageCount={trackersPager.pageCount}
            total={trackersPager.total}
            pageSize={trackersPager.pageSize}
            onPage={trackersPager.setPage}
          />
        </div>
      </div>

      {/* Tracker Details Drawer/Modal */}
      {selectedTracker && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedTracker(null)}>
          <div className="bg-[var(--surface-card)] rounded-xl shadow-2xl max-w-2xl w-full border border-[var(--border-default)] flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-[var(--border-default)]">
              <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Shield className="size-5 text-indigo-500" />
                Tracker Configuration
              </h2>
              <button onClick={() => setSelectedTracker(null)} className="p-2 hover:bg-[var(--surface-raised)] rounded-full text-[var(--text-secondary)] transition-colors">
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Info Header */}
              <div className="bg-[var(--surface-raised)] rounded-lg p-4 border border-[var(--border-default)]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-1 uppercase tracking-wider font-semibold">Identifier</div>
                    <div className="font-mono font-bold text-[var(--text-primary)] text-lg">{selectedTracker.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-1 uppercase tracking-wider font-semibold">Domain</div>
                    <div className="text-[var(--text-primary)] font-medium truncate">{selectedTracker.domain || '1st Party'}</div>
                  </div>
                </div>
                {selectedTracker.description && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {selectedTracker.description}
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Categorization</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">Map this tracker to a consent category.</p>
                  <select 
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md p-2 text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
                    value={selectedTracker.active_category}
                    onChange={(e) => handleUpdateTracker(selectedTracker.id, { overridden_category: e.target.value, action: selectedTracker.override_action, purpose_id: selectedTracker.active_purpose_id })}
                  >
                    <option value="essential">Strictly Necessary (Essential)</option>
                    <option value="analytics">Analytics</option>
                    <option value="marketing">Marketing & Advertising</option>
                    <option value="functional">Functional & Preferences</option>
                    <option value="unknown">Uncategorized</option>
                  </select>

                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">DPDPA Purpose Mapping</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">Link this cookie/tracker directly to a dynamic DPDPA purpose.</p>
                  <select 
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md p-2 text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={selectedTracker.active_purpose_id || ''}
                    onChange={(e) => handleUpdateTracker(selectedTracker.id, { overridden_category: selectedTracker.active_category, action: selectedTracker.override_action, purpose_id: e.target.value || undefined })}
                  >
                    <option value="">-- No Purpose (Fallback to Category) --</option>
                    {purposes.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.legal_basis.replace('_', ' ')})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">SDK Enforcement</label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">Override the default SDK blocking behavior for this specific tracker.</p>
                  <div className="flex rounded-md shadow-sm">
                    <button
                      onClick={() => handleUpdateTracker(selectedTracker.id, { action: 'auto' })}
                      className={`flex-1 py-2 text-sm font-medium border ${selectedTracker.override_action === 'auto' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300 z-10' : 'bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'} rounded-l-md`}
                    >
                      Auto
                    </button>
                    <button
                      onClick={() => handleUpdateTracker(selectedTracker.id, { action: 'allow' })}
                      className={`flex-1 py-2 text-sm font-medium border-y border-r ${selectedTracker.override_action === 'allow' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300 z-10' : 'bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'}`}
                    >
                      Force Allow
                    </button>
                    <button
                      onClick={() => handleUpdateTracker(selectedTracker.id, { action: 'block' })}
                      className={`flex-1 py-2 text-sm font-medium border-y border-r ${selectedTracker.override_action === 'block' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300 z-10' : 'bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'} rounded-r-md`}
                    >
                      Force Block
                    </button>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-[var(--surface-raised)] rounded-lg p-4 border border-[var(--border-default)]">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Detection Metadata</h4>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-[var(--text-secondary)]">First detected:</div>
                  <div className="text-[var(--text-primary)] text-right">{new Date(selectedTracker.first_detected_at).toLocaleString()}</div>
                  <div className="text-[var(--text-secondary)]">Last seen:</div>
                  <div className="text-[var(--text-primary)] text-right">{new Date(selectedTracker.last_seen_at).toLocaleString()}</div>
                  <div className="text-[var(--text-secondary)]">Path:</div>
                  <div className="text-[var(--text-primary)] text-right truncate">{selectedTracker.path || '/'}</div>
                  <div className="text-[var(--text-secondary)]">Expiry:</div>
                  <div className="text-[var(--text-primary)] text-right">{selectedTracker.expiry || 'Session'}</div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-[var(--border-default)] bg-[var(--surface-raised)] rounded-b-xl flex justify-end">
              <button 
                onClick={() => setSelectedTracker(null)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
