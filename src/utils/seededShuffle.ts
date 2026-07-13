/**
 * Deterministic Fisher–Yates shuffle keyed by a string seed. Same seed always
 * yields the same permutation, so a per-learner order (seed = userId+activityId)
 * stays stable across re-renders/refetches while differing between learners.
 * Correctness is keyed by option id, so reordering the DISPLAY is always safe.
 */
export function seededShuffle<T>(items: readonly T[], seedKey: string): T[] {
  let h = 1779033703 ^ seedKey.length;
  for (let i = 0; i < seedKey.length; i++) {
    h = Math.imul(h ^ seedKey.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = (h ^= h >>> 16) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
