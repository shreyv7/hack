import type { ReactElement } from 'react';
import { ChevronDown, Download, Files } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { consentToolbarExportBtn } from '@/app/components/pages/consentToolbarStyles';

interface ConsentEvidenceExportButtonsProps {
  onExportSection: () => void;
  onExportFull: () => void;
  disabled?: boolean;
}

export function ConsentEvidenceExportButtons({
  onExportSection,
  onExportFull,
  disabled = false,
}: ConsentEvidenceExportButtonsProps): ReactElement {
  const disabledTitle = disabled ? 'Load consent data before exporting' : undefined;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          title={disabledTitle ?? 'Export evidence pack options'}
          className={consentToolbarExportBtn}
        >
          <Download className="size-4 shrink-0" aria-hidden />
          Export pack
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="z-[200] w-56 bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-lg"
      >
        <DropdownMenuItem
          onSelect={() => onExportSection()}
          className="cursor-pointer text-[var(--text-primary)] focus:bg-[var(--surface-raised)] focus:text-[var(--text-primary)]"
        >
          <Download className="size-4 text-[var(--text-secondary)]" />
          Export evidence pack
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onExportFull()}
          className="cursor-pointer text-[var(--text-primary)] focus:bg-[var(--surface-raised)] focus:text-[var(--text-primary)]"
        >
          <Files className="size-4 text-[var(--text-secondary)]" />
          Full export evidence pack
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
