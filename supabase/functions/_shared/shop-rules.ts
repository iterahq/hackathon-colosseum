import { GLOBAL_REF } from './awards.ts';

export const ITEM_KINDS = ['life', 'outfit', 'ink', 'frame'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type IneligibleCode = 'invalid_ref' | 'not_needed' | 'already_owned' | 'passport_required';
export type Eligibility = { ok: true } | { ok: false; error: IneligibleCode };

export interface EligibilityFacts {
  refId: string;
  lives: number;
  maxLives: number;
  /** The learner already holds this item for this ref. */
  owned: boolean;
  /** The learner has a minted `trail_pass` for the trail in `refId`. */
  passportMinted: boolean;
}

export function isItemKind(kind: string): kind is ItemKind {
  return ITEM_KINDS.includes(kind as ItemKind);
}

/** Whether an item of this kind can be bought right now. */
export function eligibility(kind: ItemKind, facts: EligibilityFacts): Eligibility {
  const refuse = (error: IneligibleCode): Eligibility => ({ ok: false, error });
  const isGlobal = facts.refId === GLOBAL_REF;
  switch (kind) {
    case 'life':
      if (!isGlobal) return refuse('invalid_ref');
      return facts.lives < facts.maxLives ? { ok: true } : refuse('not_needed');
    case 'outfit':
      if (!isGlobal) return refuse('invalid_ref');
      return facts.owned ? refuse('already_owned') : { ok: true };
    case 'ink':
    case 'frame':
      if (isGlobal) return refuse('invalid_ref');
      if (!facts.passportMinted) return refuse('passport_required');
      return facts.owned ? refuse('already_owned') : { ok: true };
  }
}
