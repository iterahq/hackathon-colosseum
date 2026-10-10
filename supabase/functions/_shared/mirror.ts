/** A claim older than this belongs to an invocation that died; the next caller takes it over. */
export const MIRROR_STALE_MS = 60_000;
/** How many times one holder rewrites the asset before it leaves the rest to the next mirror moment. */
export const MAX_MIRROR_PASSES = 3;

/** Whether a caller may take the mirror: nobody holds it, or the holder went silent. */
export function claimDecision(claimedAt: string | null, now: Date, staleMs = MIRROR_STALE_MS): 'claim' | 'defer' {
  if (claimedAt === null) return 'claim';
  return now.getTime() - new Date(claimedAt).getTime() > staleMs ? 'claim' : 'defer';
}

/**
 * What the holder does after a pass. `release`: nobody asked for another write
 * since the pass read the row. `rerun`: somebody did, so the row is read and
 * written again. `yield`: still dirty after the last pass; the row stays owed.
 */
export function afterPass(state: { dirty: boolean; pass: number }, maxPasses = MAX_MIRROR_PASSES): 'release' | 'rerun' | 'yield' {
  if (!state.dirty) return 'release';
  return state.pass < maxPasses ? 'rerun' : 'yield';
}

/** A caller that found the mirror taken keeps asking until its patience runs out, then defers. */
export function waitDecision(startedAt: number, now: number, waitMs: number): 'retry' | 'defer' {
  return now - startedAt < waitMs ? 'retry' : 'defer';
}
