import type { ClassAnswerer, ClassCompleter } from '@/types/liveClass';

export function mergeLiveAnswers(
  completers: ClassCompleter[],
  liveAnswers: Record<string, boolean> | undefined,
  liveElapsed?: Record<string, number>
): ClassAnswerer[] {
  return completers.map(({ userId, name, done }) => {
    const live = liveAnswers?.[userId];
    const state = done || live === true ? 'done' : live === false ? 'wrong' : 'pending';
    const elapsedMs = liveElapsed?.[userId];
    return { userId, name, state, elapsedMs };
  });
}
