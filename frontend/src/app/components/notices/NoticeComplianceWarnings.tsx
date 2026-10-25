import { AlertTriangle } from 'lucide-react';
import type { ReactElement } from 'react';
import type { ComplianceWarning } from '@/types/consent';

interface NoticeComplianceWarningsProps {
  warnings: ComplianceWarning[];
  onAutoFix?: () => void;
  fixing?: boolean;
}

export function NoticeComplianceWarnings({
  warnings,
  onAutoFix,
  fixing = false,
}: NoticeComplianceWarningsProps): ReactElement {
  if (warnings.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
        No compliance warnings — ready to publish.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-yellow-200 dark:border-yellow-900">
        <div className="flex items-center gap-2 text-sm font-medium text-yellow-900 dark:text-yellow-200">
          <AlertTriangle className="size-4 shrink-0" />
          {warnings.length} Rule 3 warning{warnings.length === 1 ? '' : 's'}
        </div>
        {onAutoFix && (
          <button
            type="button"
            disabled={fixing}
            onClick={onAutoFix}
            className="text-xs text-indigo-600 hover:text-indigo-700 underline disabled:opacity-50 dark:text-indigo-400"
          >
            {fixing ? 'Fixing…' : 'Auto-fix'}
          </button>
        )}
      </div>
      <ul className="px-4 py-3 space-y-2 text-sm text-yellow-900 dark:text-yellow-100">
        {warnings.map((w) => (
          <li key={w.code}>
            <span className="font-mono text-xs text-yellow-700 dark:text-yellow-300">{w.code}</span>
            {' — '}
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
