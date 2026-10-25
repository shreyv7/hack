import type { ReactElement } from 'react';
import type { EvidencePackSection } from '@/lib/workspace/evidencePack';

interface ExportEvidencePackButtonProps {
  section: EvidencePackSection;
  onExport: (section: EvidencePackSection) => void;
  disabled?: boolean;
  className?: string;
}

const defaultClassName =
  'px-4 py-2 text-sm rounded-md border border-[var(--border-strong)] hover:bg-[var(--surface-raised)] flex items-center gap-2 text-[var(--text-primary)] bg-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent';

export function ExportEvidencePackButton({
  section,
  onExport,
  disabled = false,
  className = defaultClassName,
}: ExportEvidencePackButtonProps): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? 'Load workspace settings before exporting' : undefined}
      onClick={() => onExport(section)}
      className={className}
    >
      Export evidence pack
    </button>
  );
}
