/**
 * Recovers a tab that outlived a deploy.
 *
 * Every merge to `main` ships a new bundle with new chunk hashes and the old
 * chunks are gone. A tab opened before that still runs the old entry, so the
 * first visit to a lazy route (/author, /admin) asks for a chunk that no longer
 * exists. The server answers it with index.html (200, text/html), the dynamic
 * import rejects, and the ObservabilityProvider error boundary shows "Something
 * went wrong" until the user reloads by hand.
 *
 * Vite dispatches `vite:preloadError` for exactly that failure. We reload once
 * so the tab picks up the current entry. The timestamp guard stops a loop when
 * the chunk is missing for another reason: a second failure inside the window
 * falls through to the error boundary instead of reloading forever.
 */

const RELOAD_KEY = 'itera.staleChunkReloadAt';
const RELOAD_WINDOW_MS = 10_000;

export function shouldReloadForStaleChunk(
  lastReloadAt: string | null,
  now: number,
): boolean {
  const last = Number(lastReloadAt);
  return !lastReloadAt || !Number.isFinite(last) || now - last > RELOAD_WINDOW_MS;
}

export function mountStaleChunkReload(win: Window = window): void {
  win.addEventListener('vite:preloadError', (event) => {
    const now = Date.now();
    let lastReloadAt: string | null = null;
    try {
      lastReloadAt = win.sessionStorage.getItem(RELOAD_KEY);
    } catch {
      // Storage blocked: without the guard a reload could loop, so let it throw.
      return;
    }
    if (!shouldReloadForStaleChunk(lastReloadAt, now)) return;
    win.sessionStorage.setItem(RELOAD_KEY, String(now));
    event.preventDefault();
    win.location.reload();
  });
}
