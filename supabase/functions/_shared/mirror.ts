/** A claim older than this belongs to an invocation that died; the next caller takes it over. */
export const MIRROR_STALE_MS = 60_000;
/** How many times one holder rewrites the asset before it leaves the rest to the next mirror moment. */
export const MAX_MIRROR_PASSES = 5;
/** The least time between two ordinary on-chain writes of one companion. */
export const MIRROR_COOLDOWN_MS = 30_000;
/** The most on-chain writes one companion gets in a UTC day, whatever the reason. */
export const MIRROR_DAILY_CAP = 60;
/** An outfit put on this soon after it was bought (or claimed) is part of the purchase. */
export const PURCHASE_EQUIP_WINDOW_MS = 10 * 60_000;

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

/**
 * Why a mirror is asked for. `purchase`: somebody paid (a refill, a gift, an
 * outfit put on right after it was bought). `reached_zero`: the last life was
 * lost. `routine`: everything else (an equip, a lesson end, a retry).
 */
export type MirrorReason = 'routine' | 'purchase' | 'reached_zero';

export interface MirrorFacts {
  reason: MirrorReason;
  /** When the asset was last written (`companions.mirrored_at`). */
  lastWriteAt: string | null;
  /** The day and count of `companions.mirror_day` / `mirror_writes`. */
  countedDay: string | null;
  countedWrites: number;
  now: Date;
}

export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/** How long until an ordinary mirror may write again. Zero when it may now. */
export function cooldownLeftMs(lastWriteAt: string | null, now: Date): number {
  if (lastWriteAt === null) return 0;
  const sinceLast = now.getTime() - new Date(lastWriteAt).getTime();
  return sinceLast >= 0 && sinceLast < MIRROR_COOLDOWN_MS ? MIRROR_COOLDOWN_MS - sinceLast : 0;
}

/** On-chain writes this companion already had today (UTC). A count from another day is zero. */
export function writesToday(facts: Pick<MirrorFacts, 'countedDay' | 'countedWrites' | 'now'>): number {
  return facts.countedDay === utcDay(facts.now) ? Math.max(0, facts.countedWrites) : 0;
}

/**
 * Whether the authority pays for a write of this companion now.
 * - `daily_cap`: the companion had its writes for today; nothing skips this.
 * - `cooldown`: an ordinary mirror less than 30 s after the last write.
 *   Purchases and "reached zero" skip the cooldown (the demo's two moments)
 *   but count toward the cap.
 * A refused mirror is not lost: the caller flags the row and the latest state
 * is written by the next eligible call.
 */
export function mirrorPolicy(facts: MirrorFacts): 'write' | 'cooldown' | 'daily_cap' {
  if (writesToday(facts) >= MIRROR_DAILY_CAP) return 'daily_cap';
  if (facts.reason !== 'routine') return 'write';
  return cooldownLeftMs(facts.lastWriteAt, facts.now) > 0 ? 'cooldown' : 'write';
}
