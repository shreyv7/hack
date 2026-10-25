import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { captureRegion } from '@/app/components/overlay/captureRegion';
import type { CaptureRect } from '@/types/overlay';

interface ScreenshotSelectionOverlayProps {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}

interface Point {
  x: number;
  y: number;
}

function normalizeRect(start: Point, end: Point): CaptureRect {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { left, top, width, height };
}

export function ScreenshotSelectionOverlay({
  onCapture,
  onCancel,
  onError,
}: ScreenshotSelectionOverlayProps): ReactElement | null {
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [capturing, setCapturing] = useState(false);
  const finishingRef = useRef(false);
  const startRef = useRef<Point | null>(null);

  const selection = start && current ? normalizeRect(start, current) : null;

  const finishSelection = useCallback(
    async (rect: CaptureRect) => {
      if (finishingRef.current) return;
      if (rect.width < 8 || rect.height < 8) {
        onCancel();
        return;
      }
      finishingRef.current = true;
      setCapturing(true);
      setStart(null);
      setCurrent(null);
      startRef.current = null;

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      try {
        const dataUrl = await captureRegion(rect);
        onCapture(dataUrl);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Capture failed — please try again.';
        if (onError) onError(message);
        else onCancel();
      } finally {
        finishingRef.current = false;
        setCapturing(false);
      }
    },
    [onCapture, onCancel, onError]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !capturing) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capturing, onCancel]);

  useEffect(() => {
    if (!start || capturing) return;

    const onMove = (event: MouseEvent) => {
      setCurrent({ x: event.clientX, y: event.clientY });
    };

    const onUp = (event: MouseEvent) => {
      const origin = startRef.current;
      if (!origin) return;
      const end = { x: event.clientX, y: event.clientY };
      setCurrent(end);
      void finishSelection(normalizeRect(origin, end));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, true);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp, true);
    };
  }, [start, capturing, finishSelection]);

  return createPortal(
    <div
      data-shield-capture-ui
      className="fixed inset-0 z-[10000] select-none"
      style={{ cursor: capturing ? 'wait' : 'crosshair' }}
      onMouseDown={(e) => {
        if (capturing) return;
        e.preventDefault();
        e.stopPropagation();
        const point = { x: e.clientX, y: e.clientY };
        startRef.current = point;
        setStart(point);
        setCurrent(point);
      }}
    >
      {!selection && (
        <div className="absolute inset-0 bg-black/10 pointer-events-none" aria-hidden />
      )}

      {selection && selection.width > 0 && selection.height > 0 && (
        <>
          <div
            className="absolute border-2 border-[var(--brand-primary)] rounded-sm pointer-events-none bg-transparent"
            style={{
              left: selection.left,
              top: selection.top,
              width: selection.width,
              height: selection.height,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.18)',
            }}
          />
          <div
            className="absolute px-2 py-1 rounded-md text-xs font-medium text-gray-900 bg-white/90 border border-black/20 pointer-events-none"
            style={{
              left: selection.left,
              top: Math.max(8, selection.top - 28),
            }}
          >
            {Math.round(selection.width)} × {Math.round(selection.height)}
          </div>
        </>
      )}

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm text-gray-900 bg-white/90 border border-black/20 pointer-events-none shadow-sm">
        {capturing ? 'Capturing…' : 'Drag to select a region · Esc to cancel'}
      </div>
    </div>,
    document.body
  );
}
