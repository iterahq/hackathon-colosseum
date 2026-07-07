import type { ClassAnswerer, ClassCompleter } from '@/types/liveClass';

export function mergeLiveAnswers(
  completers: ClassCompleter[],
  liveAnswers: Record<string, boolean> | undefined
): ClassAnswerer[] {
  return completers.map(({ userId, name, done }) => {
    const live = liveAnswers?.[userId];
    const state = done || live === true ? 'done' : live === false ? 'wrong' : 'pending';
    return { userId, name, state };
  });
}
