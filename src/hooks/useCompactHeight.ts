import { useEffect, useState } from 'react';

/**
 * Short viewports (13" laptop, tablet in landscape) get a denser sidebar:
 * paddings and rows shrink so the room list keeps its height budget instead of
 * pushing "encerrar aula" off the screen. 820px is where a full flow + stats +
 * list stops fitting.
 */
const COMPACT_HEIGHT_QUERY = '(max-height: 820px)';

export function useCompactHeight(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(COMPACT_HEIGHT_QUERY);
    const sync = () => setCompact(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  return compact;
}
