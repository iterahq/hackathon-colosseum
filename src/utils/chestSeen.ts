/** Which chests this browser has already shown opened, so a chest nobody saw can be offered once, quietly. Ids only: nothing personal. */
import type { Chest } from '@/types/tera';

const KEY = 'itera.chest.seen.v1';
const MAX = 300;

function read(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markChestsSeen(ids: readonly string[]): void {
  if (ids.length === 0) return;
  try {
    const next = [...new Set([...read(), ...ids])].slice(-MAX);
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the cue shows again on the next visit */
  }
}

/** Chests that are open or opening and that this browser never showed, newest first (the order the list comes in). */
export function unseenChests(chests: readonly Chest[]): Chest[] {
  const seen = new Set(read());
  return chests.filter((c) => c.status !== 'failed' && !seen.has(c.id));
}
