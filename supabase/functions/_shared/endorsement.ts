import { isSolanaAddress } from './address.ts';

/** A certification holds at most this many teacher endorsements, one per instructor. */
export const MAX_ENDORSEMENTS = 3;
export const NOTE_MAX = 140;

export interface Endorsement {
  slot: number;
  /** The instructor's full wallet address: it is what goes on chain. */
  wallet: string;
  at: string;
}

/**
 * The optional note: plain text, control characters dropped, at most 140
 * characters. `null`: no note. `false`: refused. It is stored in the database
 * only; it never reaches the asset's attributes or the artwork.
 */
export function cleanNote(value: unknown): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return false;
  const text = [...value]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 0x20 || char === '\n' || char === '\t' || char === '\r') && !(code >= 0x7f && code <= 0x9f);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if ([...text].length > NOTE_MAX) return false;
  return text.length > 0 ? text : null;
}

/** The endorsements a certification row carries in `state.endorsements`, well-formed ones only, by slot. */
export function endorsementsOf(state: Record<string, unknown>): Endorsement[] {
  const stored = state.endorsements;
  if (!Array.isArray(stored)) return [];
  const bySlot = new Map<number, Endorsement>();
  for (const entry of stored) {
    if (!entry || typeof entry !== 'object') continue;
    const { slot, wallet, at } = entry as Record<string, unknown>;
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > MAX_ENDORSEMENTS) continue;
    if (!isSolanaAddress(wallet) || typeof at !== 'string' || bySlot.has(slot)) continue;
    bySlot.set(slot, { slot, wallet: wallet as string, at });
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/** `endorsed_by_<slot>` (the full wallet) and `endorsed_at_<slot>` for each endorsement. */
export function endorsementAttributes(endorsements: readonly Endorsement[]): Array<{ key: string; value: string }> {
  return endorsements.flatMap(({ slot, wallet, at }) => [
    { key: `endorsed_by_${slot}`, value: wallet },
    { key: `endorsed_at_${slot}`, value: at },
  ]);
}

export function sameEndorsements(a: readonly Endorsement[], b: readonly Endorsement[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry.slot === b[index].slot && entry.wallet === b[index].wallet && entry.at === b[index].at);
}

/** The row with `state.endorsements` set from the table of record. Untouched when they already agree. */
export function withEndorsements<Row extends { state: Record<string, unknown> }>(row: Row, endorsements: readonly Endorsement[]): Row {
  const wanted = endorsementsOf({ endorsements });
  if (sameEndorsements(wanted, endorsementsOf(row.state)) && (wanted.length > 0 || !('endorsements' in row.state))) return row;
  return { ...row, state: { ...row.state, endorsements: wanted } };
}

export type EndorseVerdict = { action: 'endorse'; slot: number } | { action: 'already'; slot: number } | { action: 'full' };

/** One endorsement per instructor per certification, three per certification. */
export function endorseVerdict(existing: ReadonlyArray<{ instructor_user_id: string; slot: number }>, callerId: string): EndorseVerdict {
  const mine = existing.find((entry) => entry.instructor_user_id === callerId);
  if (mine) return { action: 'already', slot: mine.slot };
  const taken = new Set(existing.map((entry) => entry.slot));
  for (let slot = 1; slot <= MAX_ENDORSEMENTS; slot += 1) {
    if (!taken.has(slot)) return { action: 'endorse', slot };
  }
  return { action: 'full' };
}
