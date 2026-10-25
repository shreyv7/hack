/**
 * Shows a brief, non-blocking toast notification in the top-right corner.
 *
 * Replaces the old blocking `window.alert()` so user actions (save, update,
 * delete, etc.) give feedback without interrupting the flow. Falls back to
 * console logging in non-browser/headless environments.
 */
export function notify(message: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    console.log('[Notification]', message);
    return;
  }

  const CONTAINER_ID = 'app-toast-container';
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:9999;display:flex;' +
      'flex-direction:column;gap:8px;max-width:360px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  toast.style.cssText =
    'background:#1e293b;color:#fff;padding:10px 14px;border-radius:8px;' +
    'font-size:13px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.25);' +
    'opacity:0;transform:translateY(-6px);transition:opacity .2s ease,transform .2s ease;' +
    'pointer-events:auto;';
  container.appendChild(toast);

  // Animate in on the next frame.
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Auto-dismiss after a few seconds.
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    window.setTimeout(() => toast.remove(), 250);
  }, 3000);
}

notify.success = (message: string): void => notify(`✓ ${message}`);
notify.error = (message: string): void => notify(`❌ ${message}`);
