import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { notify } from '@/app/utils/notify';
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  updateSchedule,
} from '@/lib/api/piiScan';
import type { DataSource } from '@/types/dataSource';
import { isPiiScannableSource } from '@/types/dataSource';
import type { ScanFrequency, ScanSchedule } from '@/types/piiScan';

interface ScheduleManagerProps {
  sources: DataSource[];
  orgId?: string;
  onClose: () => void;
}

const FREQUENCIES: { value: ScanFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString();
}

export function ScheduleManager({ sources, orgId, onClose }: ScheduleManagerProps): ReactElement {
  const [schedules, setSchedules] = useState<ScanSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSource, setNewSource] = useState('');
  const [newFrequency, setNewFrequency] = useState<ScanFrequency>('weekly');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchSchedules(orgId)
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [orgId]);

  const handleCreate = async () => {
    if (!newSource) {
      notify('Select a data source for the schedule.');
      return;
    }
    setSaving(true);
    try {
      await createSchedule({ data_source_id: newSource, frequency: newFrequency }, orgId);
      notify('Recurring scan scheduled.');
      setNewSource('');
      load();
    } catch (error) {
      notify(`Failed to create schedule: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule: ScanSchedule) => {
    setBusyId(schedule.id);
    try {
      await updateSchedule(schedule.id, { is_active: !schedule.is_active }, orgId);
      load();
    } catch (error) {
      notify(`Failed to update schedule: ${(error as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (schedule: ScanSchedule) => {
    if (!window.confirm(`Remove the recurring scan for ${schedule.data_source_name ?? 'this source'}?`)) return;
    setBusyId(schedule.id);
    try {
      await deleteSchedule(schedule.id, orgId);
      load();
    } catch (error) {
      notify(`Failed to delete schedule: ${(error as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="rounded-lg max-w-xl w-full bg-[var(--surface-card)] border border-[var(--border-default)] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b flex items-center justify-between border-[var(--border-default)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recurring Scans</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              DPDPA Sec 10 expects continuous monitoring, not one-off checks. Schedule automatic re-scans
              for business-critical sources.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border-default)] p-3">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium mb-1 text-[var(--text-primary)]">Data source</label>
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
              >
                <option value="">Select a source&hellip;</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id} disabled={!isPiiScannableSource(s)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--text-primary)]">Frequency</label>
              <select
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value as ScanFrequency)}
                className="px-3 py-2 text-sm rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)]"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-3 py-2 text-sm rounded-md text-white bg-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-[var(--text-secondary)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading&hellip;
            </div>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-center py-6 text-[var(--text-secondary)]">
              No recurring scans configured yet.
            </p>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {s.data_source_name ?? 'Unknown source'}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      {s.frequency} &middot; next run {formatDate(s.next_run_at)}
                      {s.last_run_at ? ` \u00b7 last run ${formatDate(s.last_run_at)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(s)}
                      disabled={busyId === s.id}
                      className={
                        s.is_active
                          ? 'px-2.5 py-1 rounded text-xs border border-[var(--status-success)] text-[var(--status-success)]'
                          : 'px-2.5 py-1 rounded text-xs border border-[var(--border-default)] text-[var(--text-secondary)]'
                      }
                    >
                      {s.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      className="p-1.5 rounded hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                      aria-label="Delete schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-end border-[var(--border-default)]">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-black/5 text-[var(--text-primary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
