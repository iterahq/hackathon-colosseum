/** An item that is also earned: free once the learner's level reaches `level`. */
export interface UnlockView {
  level: number;
  /** `null` when nobody is signed in. */
  current_level: number | null;
  unlocked: boolean;
}

/** The level an item's `effect.unlock.level` asks for; `null` when the item is only sold. */
export function unlockLevelOf(effect: Record<string, unknown> | null | undefined): number | null {
  const unlock = effect?.unlock;
  if (!unlock || typeof unlock !== 'object' || Array.isArray(unlock)) return null;
  const level = (unlock as Record<string, unknown>).level;
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 ? level : null;
}

export function unlockView(effect: Record<string, unknown> | null | undefined, currentLevel: number | null): UnlockView | null {
  const level = unlockLevelOf(effect);
  if (level === null) return null;
  return { level, current_level: currentLevel, unlocked: currentLevel !== null && currentLevel >= level };
}

export type ClaimVerdict = 'claim' | 'already_owned' | 'not_claimable' | 'locked';

/** What a free claim does. Owning the item (bought or claimed before) always wins: the claim is idempotent. */
export function claimVerdict(facts: { kind: string; effect: Record<string, unknown> | null | undefined; level: number; owned: boolean }): ClaimVerdict {
  const unlock = unlockView(facts.effect, facts.level);
  if (!unlock || facts.kind !== 'outfit') return 'not_claimable';
  if (facts.owned) return 'already_owned';
  return unlock.unlocked ? 'claim' : 'locked';
}
