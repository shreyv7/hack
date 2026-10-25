import type { ReactElement } from 'react';
import { CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { notify } from '@/app/utils/notify';
import {
  downloadSubmissionReceiptPdf,
  submissionReceiptMessage,
  type SubmissionReceiptInput,
} from '@/lib/dsar/submissionReceiptPdf';

interface SubmissionConfirmationProps extends SubmissionReceiptInput {
  /** Invoked when the user dismisses the confirmation screen. */
  onDone: () => void;
}

/**
 * Success screen shown after a data-rights request is verified and queued.
 */
export function SubmissionConfirmation({
  trackingId,
  organizationName,
  rightType,
  requesterName,
  requesterEmail,
  submittedAt,
  dpoEmail,
  dpoName,
  onDone,
}: SubmissionConfirmationProps): ReactElement {
  const receiptInput: SubmissionReceiptInput = {
    trackingId,
    organizationName,
    rightType,
    requesterName,
    requesterEmail,
    submittedAt,
    dpoEmail,
    dpoName,
  };

  const handleDownloadPdf = (): void => {
    try {
      const filename = downloadSubmissionReceiptPdf(receiptInput);
      notify(`Receipt downloaded (${filename})`);
    } catch {
      notify('Could not generate PDF receipt');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-8">
      <div className="p-12 rounded-xl text-center bg-[var(--surface-card)] border border-[var(--border-default)]">
        <div className="mb-6 flex justify-center">
          <div className="size-20 rounded-full flex items-center justify-center bg-[var(--status-success-bg)]">
            <CheckCircle2 className="size-12 text-[var(--status-success)]" />
          </div>
        </div>

        <h1 className="text-3xl font-semibold mb-6 text-[var(--text-primary)]">Request submitted</h1>

        <div className="mb-6">
          <div className="text-sm font-medium mb-2 text-[var(--text-tertiary)]">TRACKING ID</div>
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)]">
            <span className="text-2xl font-mono font-semibold text-[var(--text-primary)]">{trackingId}</span>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="p-1 rounded hover:bg-black/5 transition-colors"
              title="Download receipt PDF"
              aria-label="Download receipt PDF"
            >
              <Download className="size-5 text-[var(--text-tertiary)]" />
            </button>
          </div>
        </div>

        <p className="text-base mb-8 max-w-lg mx-auto text-[var(--text-secondary)]">
          {submissionReceiptMessage(receiptInput)}
        </p>

        <div className="flex gap-3 justify-center flex-wrap">
          <Button variant="secondary" size="md" onClick={handleDownloadPdf}>
            Download receipt (PDF)
          </Button>
          <Button variant="primary" size="md" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
