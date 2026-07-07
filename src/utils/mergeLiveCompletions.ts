import type { ClassCompleter } from '@/types/liveClass';

export function mergeLiveCompletions(
  completers: ClassCompleter[],
  liveDoneUserIds: string[]
): ClassCompleter[] {
  if (liveDoneUserIds.length === 0) return completers;
  const live = new Set(liveDoneUserIds);
  return completers.map((c) => (c.done || !live.has(c.userId) ? c : { ...c, done: true }));
}
