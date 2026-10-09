import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { trailIdFromHash } from '@/utils/courses';

const HIGHLIGHT_MS = 1500;

/** Scrolls to the trail named by the URL hash and returns its id for a brief highlight. */
export function useTrailHighlight(unitIds: readonly string[]): string | null {
  const { hash } = useLocation();
  const [active, setActive] = useState<string | null>(null);
  const key = unitIds.join('|');

  useEffect(() => {
    const id = trailIdFromHash(hash, key ? key.split('|') : []);
    if (!id) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const el = document.getElementById(`trail-${id}`);
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (reduced) return;
    setActive(id);
    const timer = window.setTimeout(() => setActive(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [hash, key]);

  return active;
}
