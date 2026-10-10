import { GLOBAL_REF } from './awards.ts';

export const ITEM_KINDS = ['life', 'outfit', 'ink', 'frame', 'gift', 'avatar', 'border'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type IneligibleCode =
  | 'invalid_ref'
  | 'not_needed'
  | 'already_owned'
  | 'passport_required'
  | 'self_gift'
  | 'recipient_full'
  | 'gift_limit'
  | 'free_item'
  | 'sold_out'
  | 'reservation_limit'
  | 'out_of_season';

/** A learner receives at most this many gifts in any 24 hours. */
export const GIFT_DAILY_LIMIT = 5;
export type Eligibility = { ok: true } | { ok: false; error: IneligibleCode };

export interface EligibilityFacts {
  refId: string;
  lives: number;
  maxLives: number;
  /** The learner already holds this item for this ref. */
  owned: boolean;
  /** The learner has a minted `trail_pass` for the trail in `refId`. */
  passportMinted: boolean;
  /** Only read for a gift (`refId` is the recipient): who pays, and how many gifts the recipient got in the last 24 h. */
  payerId?: string | null;
  giftsReceivedToday?: number;
  /** Lives above the maximum the recipient may hold. */
  bonusLives?: number;
  /** Only read for an avatar: it has no price, or its limited supply is all taken. */
  free?: boolean;
  soldOut?: boolean;
  /** Only read for an avatar that is sold in a season: the window is closed now. */
  outOfSeason?: boolean;
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
    case 'gift':
      // `lives` / `maxLives` are the recipient's: a gift may fill the one bonus slot, never more.
      if (isGlobal) return refuse('invalid_ref');
      if (facts.payerId === facts.refId) return refuse('self_gift');
      if ((facts.giftsReceivedToday ?? 0) >= GIFT_DAILY_LIMIT) return refuse('gift_limit');
      return facts.lives < facts.maxLives + (facts.bonusLives ?? 0) ? { ok: true } : refuse('recipient_full');
    case 'border':
      // Global and owned once; the default and the signature ones are not sold (the price check comes first).
      if (!isGlobal) return refuse('invalid_ref');
      return facts.owned ? refuse('already_owned') : { ok: true };
    case 'avatar':
      // A free avatar is everyone's already; a collectible is one per learner while units remain.
      if (!isGlobal) return refuse('invalid_ref');
      if (facts.free) return refuse('free_item');
      if (facts.owned) return refuse('already_owned');
      if (facts.outOfSeason) return refuse('out_of_season');
      return facts.soldOut ? refuse('sold_out') : { ok: true };
  }
}
