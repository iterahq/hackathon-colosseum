import type { ChainRead } from '@/types/chainRead';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** "12 s", "3 min", "2 h": how long ago a cached answer was read from the chain. */
export function formatAge(ms: number, t: T): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return t('chain.age.s', { n: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('chain.age.min', { n: minutes });
  return t('chain.age.h', { n: Math.round(minutes / 60) });
}

/** One honest line: a live read says how long it took; a cached one says how old it is. */
export function chainReadLabel(read: ChainRead | undefined, ms: number, t: T): string {
  if (!read || read.source === 'chain') return t('passport.credential.readIn', { ms: read?.ms ?? ms });
  return t('chain.readAgo', { age: formatAge(read.ageMs, t) });
}
