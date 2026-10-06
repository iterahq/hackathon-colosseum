import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { withoutStaleChunkReload } from '@/lib/stale-chunk-reload';
import { LEARNER_PAGE_LOADERS } from '@/pages/learnerPageLoaders';

const IDLE_FALLBACK_MS = 2000;

function savesData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * Once a learner is signed in, fetches the learner pages while the browser is
 * idle, so the first tap on a program or a lesson does not wait on a chunk. A
 * failed fetch is dropped: the route asks again when it renders.
 */
export function LearnerPagePrefetch() {
  const { session } = useAuth();
  const signedIn = session !== null;

  useEffect(() => {
    if (!signedIn || !navigator.onLine || savesData()) return;
    const run = () => {
      void withoutStaleChunkReload(() => Promise.allSettled(LEARNER_PAGE_LOADERS.map((load) => load())));
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: IDLE_FALLBACK_MS });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, IDLE_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [signedIn]);

  return null;
}
