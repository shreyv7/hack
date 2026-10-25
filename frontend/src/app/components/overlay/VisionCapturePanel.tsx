import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Camera, Info, Loader2, Sparkles, X } from 'lucide-react';
import {
  overlayBtnClass,
  overlayCardClass,
} from '@/app/components/overlay/overlayStyles';
import { askVisionQuery } from '@/lib/api/overlayAssistant';
import type { VisionExchange } from '@/types/overlay';
import { cn } from '@/lib/utils';

interface VisionCapturePanelProps {
  active: boolean;
  attachedImage: string | null;
  onAttachedImageChange: (image: string | null) => void;
  onStartCapture: () => void;
  captureError?: string | null;
}

/** Ephemeral in-memory Q&A only — nothing is written to storage or the database. */
export function VisionCapturePanel({
  active,
  attachedImage,
  onAttachedImageChange,
  onStartCapture,
  captureError = null,
}: VisionCapturePanelProps): ReactElement {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<VisionExchange[]>([]);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [showInfo, setShowInfo] = useState(() => {
    try {
      return localStorage.getItem('shield_vision_info_seen') !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (attachedImage) {
      composerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      window.setTimeout(() => questionInputRef.current?.focus(), 100);
    }
  }, [attachedImage]);

  const dismissInfo = () => {
    setShowInfo(false);
    try {
      localStorage.setItem('shield_vision_info_seen', '1');
    } catch {
      /* ignore */
    }
  };

  const attachImageFromDataUrl = (dataUrl: string) => {
    onAttachedImageChange(dataUrl);
    setError(null);
  };

  const handleClipboardPaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      event.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') attachImageFromDataUrl(reader.result);
      };
      reader.readAsDataURL(file);
      return;
    }
  };

  const handleAsk = async () => {
    const q = question.trim();
    if (!attachedImage || !q || asking) return;
    setAsking(true);
    setError(null);
    const imageForRequest = attachedImage;
    try {
      const { answer } = await askVisionQuery(imageForRequest, q);
      setExchanges((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: q,
          answer,
        },
      ]);
      setQuestion('');
      onAttachedImageChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get an answer');
    } finally {
      setAsking(false);
    }
  };

  if (!active) {
    return <div className="h-[320px]" aria-hidden />;
  }

  return (
    <div className="flex flex-col h-[320px]">
      {(showInfo || error || captureError) && (
        <div className="mb-3 space-y-2">
          {showInfo && (
            <div className={cn(overlayCardClass, 'flex gap-2 items-start text-xs text-gray-800')}>
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[var(--status-ai)]" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Shield AI Vision</p>
                <p className="mt-0.5">
                  Capture any part of this screen and ask what a feature is for or how to use it.
                  Chats and screenshots are not saved.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissInfo}
                className={cn('p-0.5 rounded', overlayBtnClass)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-700 px-1">{error}</p>}
          {captureError && !error && (
            <p className="text-xs text-red-700 px-1">{captureError}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={onStartCapture}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium',
            overlayBtnClass
          )}
        >
          <Camera className="h-3.5 w-3.5" />
          Capture
        </button>
        {!showInfo && (
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className={cn('p-1.5 rounded-xl', overlayBtnClass)}
            aria-label="About Shield AI Vision"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
        {exchanges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Sparkles className="h-8 w-8 text-[var(--status-ai)] mb-2" />
            <p className="text-sm text-gray-600">Capture UI or paste an image, then ask a question.</p>
          </div>
        ) : (
          exchanges.map((ex) => (
            <div key={ex.id} className="space-y-2">
              <div className={cn(overlayCardClass, 'text-sm text-gray-900')}>
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">You</span>
                <p className="mt-0.5">{ex.question}</p>
              </div>
              <div className={cn(overlayCardClass, 'text-sm text-gray-900 bg-[var(--status-ai)]/10')}>
                <span className="text-[10px] uppercase tracking-wide text-[var(--status-ai)] font-medium">
                  Shield AI
                </span>
                <p className="mt-0.5 whitespace-pre-wrap">{ex.answer}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        ref={composerRef}
        className={cn('mt-3 rounded-xl border border-black/25 bg-white/70 overflow-hidden shrink-0')}
        onPaste={handleClipboardPaste}
      >
        {attachedImage && (
          <div className="flex items-center gap-2 px-2 pt-2 pb-1 border-b border-black/10 bg-white/50">
            <img
              src={attachedImage}
              alt="Screenshot preview"
              className="h-10 w-14 shrink-0 object-cover rounded-md border border-black/20"
            />
            <span className="text-[10px] text-gray-600 flex-1">Screenshot attached</span>
            <button
              type="button"
              onClick={() => onAttachedImageChange(null)}
              className={cn('p-1 rounded-md shrink-0', overlayBtnClass)}
              aria-label="Remove screenshot"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-center p-2">
          <input
            ref={questionInputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onPaste={handleClipboardPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAsk();
            }}
            placeholder={
              attachedImage
                ? 'What is this feature for?'
                : 'Capture or paste (⌘V) a screenshot, then ask…'
            }
            disabled={asking}
            maxLength={500}
            className={cn('flex-1 min-w-0 disabled:opacity-50 border-0 bg-transparent px-1 py-1 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none')}
          />
          <button
            type="button"
            onClick={() => void handleAsk()}
            disabled={!attachedImage || !question.trim() || asking}
            className={cn(
              'shrink-0 h-9 px-3 flex items-center gap-1.5 rounded-xl text-xs font-medium disabled:opacity-40',
              overlayBtnClass,
              'bg-[var(--status-ai)]/90 text-white border-[var(--status-ai)] hover:bg-[var(--status-ai)]'
            )}
          >
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
