import type { Program } from '@/types/content';

type Bucket = 0 | 1 | 2;

function bucketOf(p: Program): Bucket {
  const total = p.activityCount ?? 0;
  const done = p.completedCount ?? 0;
  if (total > 0 && done >= total) return 2;
  if (done > 0 && done < total) return 0;
  return 1;
}

function createdAtMs(p: Program): number {
  const ms = Date.parse(p.createdAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Home grid order: in progress first, then untouched newest-first, finished last. */
export function orderHomePrograms(programs: Program[]): Program[] {
  return [...programs].sort((a, b) => {
    const byBucket = bucketOf(a) - bucketOf(b);
    if (byBucket !== 0) return byBucket;
    return createdAtMs(b) - createdAtMs(a);
  });
}
