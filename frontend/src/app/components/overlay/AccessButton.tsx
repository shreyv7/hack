import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue } from 'motion/react';
import { MessageSquare, Sparkles, X } from 'lucide-react';
import { CommentsPanel } from '@/app/components/overlay/CommentsPanel';
import { ScreenshotSelectionOverlay } from '@/app/components/overlay/ScreenshotSelectionOverlay';
import { VisionCapturePanel } from '@/app/components/overlay/VisionCapturePanel';
import {
  overlayBtnActiveClass,
  overlayBtnClass,
  overlayPanelClass,
  overlayPanelStyle,
} from '@/app/components/overlay/overlayStyles';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'shield_access_button_pos';
const BUTTON_SIZE = 56;
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 420;
type TabId = 'comments' | 'vision';

interface StoredPosition {
  x: number;
  y: number;
}

function readStoredPosition(): StoredPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPosition;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function defaultPosition(): StoredPosition {
  return {
    x: Math.max(16, window.innerWidth - BUTTON_SIZE - 24),
    y: Math.max(16, window.innerHeight - BUTTON_SIZE - 24),
  };
}

function clampPosition(pos: StoredPosition): StoredPosition {
  const maxX = Math.max(8, window.innerWidth - BUTTON_SIZE - 8);
  const maxY = Math.max(8, window.innerHeight - BUTTON_SIZE - 8);
  return {
    x: Math.min(Math.max(8, pos.x), maxX),
    y: Math.min(Math.max(8, pos.y), maxY),
  };
}

function panelPosition(button: StoredPosition): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 12;

  let left = button.x + BUTTON_SIZE - PANEL_WIDTH;
  if (left < 8) left = 8;
  if (left + PANEL_WIDTH > vw - 8) left = vw - PANEL_WIDTH - 8;

  let top = button.y - PANEL_HEIGHT - gap;
  if (top < 8) {
    top = button.y + BUTTON_SIZE + gap;
  }
  if (top + PANEL_HEIGHT > vh - 8) {
    top = Math.max(8, vh - PANEL_HEIGHT - 8);
  }

  return { left, top };
}

export function AccessButton(): ReactElement {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('comments');
  const [position, setPosition] = useState<StoredPosition>(() =>
    clampPosition(readStoredPosition() ?? defaultPosition())
  );
  const [captureMode, setCaptureMode] = useState(false);
  const [visionSelecting, setVisionSelecting] = useState(false);
  const [visionAttachedImage, setVisionAttachedImage] = useState<string | null>(null);
  const [visionCaptureError, setVisionCaptureError] = useState<string | null>(null);
  const wasDragging = useRef(false);
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);

  useEffect(() => {
    x.set(position.x);
    y.set(position.y);
  }, [position.x, position.y, x, y]);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => clampPosition(prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clearVisionSession = useCallback(() => {
    setVisionAttachedImage(null);
    setVisionCaptureError(null);
    setVisionSelecting(false);
    setCaptureMode(false);
  }, []);

  useEffect(() => {
    if (!open) clearVisionSession();
  }, [open, clearVisionSession]);

  const persistPosition = useCallback((pos: StoredPosition) => {
    const clamped = clampPosition(pos);
    setPosition(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const startVisionCapture = () => {
    setTab('vision');
    setVisionCaptureError(null);
    setVisionSelecting(true);
    setCaptureMode(true);
  };

  const handleVisionCaptureComplete = useCallback((dataUrl: string) => {
    setVisionSelecting(false);
    setCaptureMode(false);
    setTab('vision');
    setVisionAttachedImage(dataUrl);
    setVisionCaptureError(null);
  }, []);

  const handleVisionCaptureError = useCallback((message: string) => {
    setVisionSelecting(false);
    setCaptureMode(false);
    setTab('vision');
    setVisionCaptureError(message);
  }, []);

  const handleVisionCaptureCancel = useCallback(() => {
    setVisionSelecting(false);
    setCaptureMode(false);
  }, []);

  const panelPos = panelPosition(position);

  return (
    <>
      {visionSelecting && (
        <ScreenshotSelectionOverlay
          onCapture={handleVisionCaptureComplete}
          onCancel={handleVisionCaptureCancel}
          onError={handleVisionCaptureError}
        />
      )}

      {open && (
        <motion.div
          data-shield-assistant="panel"
          initial={{ opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: captureMode ? 0 : 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className={overlayPanelClass}
          style={{
            left: panelPos.left,
            top: panelPos.top,
            width: PANEL_WIDTH,
            pointerEvents: captureMode ? 'none' : 'auto',
            ...overlayPanelStyle,
          }}
        >
          <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-black/15">
            <div className="flex gap-1 p-0.5 rounded-xl bg-white/40 border border-black/10">
              <button
                type="button"
                onClick={() => setTab('comments')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                  tab === 'comments' ? overlayBtnActiveClass : overlayBtnClass
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Comments
              </button>
              <button
                type="button"
                onClick={() => setTab('vision')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                  tab === 'vision' ? overlayBtnActiveClass : overlayBtnClass
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Vajra AI
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn('p-1.5 rounded-lg', overlayBtnClass)}
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 py-3 text-gray-900">
            <div className={tab === 'comments' ? undefined : 'hidden'}>
              <CommentsPanel active={open && tab === 'comments'} />
            </div>
            <div className={tab === 'vision' ? undefined : 'hidden'}>
              <VisionCapturePanel
                active={open}
                attachedImage={visionAttachedImage}
                onAttachedImageChange={setVisionAttachedImage}
                onStartCapture={startVisionCapture}
                captureError={visionCaptureError}
              />
            </div>
          </div>
        </motion.div>
      )}

      {!captureMode && (
        <motion.button
          type="button"
          data-shield-assistant="fab"
          drag
          dragMomentum={false}
          dragElastic={0}
          style={{ x, y, width: BUTTON_SIZE, height: BUTTON_SIZE }}
          className="fixed top-0 left-0 z-[9991] rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent border border-black/20"
          onDragStart={() => {
            wasDragging.current = false;
          }}
          onDrag={(_, info) => {
            if (Math.abs(info.offset.x) > 3 || Math.abs(info.offset.y) > 3) {
              wasDragging.current = true;
            }
          }}
          onDragEnd={() => {
            persistPosition({ x: x.get(), y: y.get() });
          }}
          onTap={() => {
            if (!wasDragging.current) {
              setOpen((prev) => !prev);
            }
            wasDragging.current = false;
          }}
          aria-label="Open Shield assistant"
          aria-expanded={open}
        >
          <span
            className="absolute inset-0 rounded-full animate-pulse opacity-60 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(99,102,241,0.45) 0%, rgba(139,92,246,0.2) 50%, transparent 70%)',
            }}
            aria-hidden
          />
          <span
            className="absolute inset-[3px] rounded-full border border-black/20 pointer-events-none"
            style={{
              background:
                'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(99,102,241,0.25) 45%, rgba(139,92,246,0.2) 100%)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow:
                '0 8px 32px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.8)',
            }}
            aria-hidden
          />
          <Sparkles className="relative h-6 w-6 text-gray-900 drop-shadow-sm pointer-events-none" />
        </motion.button>
      )}
    </>
  );
}
