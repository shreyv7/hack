import type { ReactElement } from 'react';
import { ChevronDown, Download, Files } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import type { EvidencePackSection } from '@/lib/workspace/evidencePack';

interface WorkspaceEvidenceExportButtonsProps {
  section: EvidencePackSection;
  onExportSection: (section: EvidencePackSection) => void;
  onExportFull: () => void;
  disabled?: boolean;
}

const triggerBtn =
  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--surface-card)]';

export function WorkspaceEvidenceExportButtons({
  section,
  onExportSection,
  onExportFull,
  disabled = false,
}: WorkspaceEvidenceExportButtonsProps): ReactElement {
  const disabledTitle = disabled ? 'Load workspace settings before exporting' : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          title={disabledTitle ?? 'Export evidence pack options'}
          className={triggerBtn}
        >
          <Download className="size-4 shrink-0" aria-hidden />
          Export Evidence Pack
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)]"
      >
        <DropdownMenuItem
          onClick={() => onExportSection(section)}
          className="cursor-pointer text-[var(--text-primary)] focus:bg-[var(--surface-raised)] focus:text-[var(--text-primary)]"
        >
          <Download className="size-4 text-[var(--text-secondary)]" />
          Export evidence pack
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onExportFull}
          className="cursor-pointer text-[var(--text-primary)] focus:bg-[var(--surface-raised)] focus:text-[var(--text-primary)]"
        >
          <Files className="size-4 text-[var(--text-secondary)]" />
          Full export evidence pack
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
