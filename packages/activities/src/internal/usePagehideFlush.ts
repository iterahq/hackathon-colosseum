import { useEffect, type RefObject } from 'react';

/**
 * Run a still-debounced write when the page is going away (reload, tab close,
 * navigation to another site) or drops to the background — a phone can kill a
 * backgrounded tab or WebView without ever firing `pagehide`. Never on unmount,
 * on purpose: a lesson reset clears the draft and re-mounts the editor, and
 * flushing on unmount would write the old draft straight back.
 */
export function usePagehideFlush(pendingWrite: RefObject<(() => void) | null>): void {
  useEffect(() => {
    const flush = () => pendingWrite.current?.();
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [pendingWrite]);
}
