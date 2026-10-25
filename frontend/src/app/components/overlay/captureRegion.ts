import { domToCanvas } from 'modern-screenshot';
import type { CaptureRect } from '@/types/overlay';

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.7;

function downscaleCanvas(source: HTMLCanvasElement): string {
  const scale = source.width > MAX_WIDTH ? MAX_WIDTH / source.width : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return source.toDataURL('image/jpeg', JPEG_QUALITY);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

function isBlankCanvas(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return true;
  const sample = ctx.getImageData(0, 0, Math.min(canvas.width, 32), Math.min(canvas.height, 32));
  let nonEmpty = 0;
  for (let i = 0; i < sample.data.length; i += 4) {
    if (sample.data[i + 3] > 8) nonEmpty++;
  }
  return nonEmpty === 0;
}

function shouldIncludeNode(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  if (node.closest('[data-shield-assistant]')) return false;
  if (node.closest('[data-shield-capture-ui]')) return false;
  return true;
}

/**
 * Capture a viewport region (client coordinates) and return a compressed JPEG data URL.
 * Uses modern-screenshot (not html2canvas) so Tailwind v4 / oklab() colors render correctly.
 */
export async function captureRegion(rect: CaptureRect): Promise<string> {
  const left = Math.max(0, Math.round(rect.left));
  const top = Math.max(0, Math.round(rect.top));
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const viewportCanvas = await domToCanvas(document.documentElement, {
    width: window.innerWidth,
    height: window.innerHeight,
    scale: 1,
    backgroundColor: '#ffffff',
    filter: shouldIncludeNode,
  });

  const cropWidth = Math.min(width, viewportCanvas.width - left);
  const cropHeight = Math.min(height, viewportCanvas.height - top);
  if (cropWidth < 1 || cropHeight < 1) {
    throw new Error('Selection is outside the visible area');
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create capture canvas');
  }
  ctx.drawImage(viewportCanvas, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  if (isBlankCanvas(cropCanvas)) {
    throw new Error('Capture returned a blank image');
  }

  const dataUrl = downscaleCanvas(cropCanvas);
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Invalid capture output');
  }
  return dataUrl;
}
