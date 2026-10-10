import type { PurchaseProof } from '@/utils/purchaseMachine';
import type { ShopItemKind } from '@/types/shop';

/** `5Kq9Zm2p…Xv81aB` */
export const shortSignature = (signature: string): string => (signature.length > 18 ? `${signature.slice(0, 8)}…${signature.slice(-6)}` : signature);

export interface CopyLine {
  key: string;
  params: Record<string, string | number>;
}

export interface PaidCopy {
  /** What was bought and what it did, in one human sentence. */
  body: CopyLine;
  /** Only when the backend says it wrote to the chain. */
  note: CopyLine | null;
}

interface PaidContext {
  itemTitle: string;
  /** Name of the certification an ink or frame was applied to. */
  targetTitle?: string | null;
}

/** Built from the item kind and the backend's `written` list, never from raw attributes. */
export function paidCopy(kind: ShopItemKind, { itemTitle, targetTitle }: PaidContext, proof: PurchaseProof | null): PaidCopy {
  const written = proof?.written ?? [];
  if (kind === 'life') {
    const wroteLives = written.find((w) => w.attribute === 'lives');
    const current = wroteLives ? Number(wroteLives.value) : proof?.lives?.current;
    const max = proof?.lives?.max ?? 5;
    const body = Number.isFinite(current) && current !== undefined ? { key: 'purchase.paid.life', params: { current, max } } : { key: 'purchase.paid.lifeBare', params: {} };
    return { body, note: wroteLives ? { key: 'purchase.note.life', params: {} } : null };
  }
  if (kind === 'outfit') return { body: { key: 'purchase.paid.outfit', params: { name: itemTitle } }, note: null };
  const wroteCosmetic = written.some((w) => w.attribute !== 'lives');
  return {
    body: { key: targetTitle ? 'purchase.paid.cosmetic' : 'purchase.paid.cosmeticBare', params: { name: itemTitle, trail: targetTitle ?? '' } },
    note: wroteCosmetic ? { key: 'purchase.note.cosmetic', params: {} } : null,
  };
}

/** The success lines of a gift: whose Tera got the life, and that a life above the maximum became a bonus. */
export function giftCopy(gift: NonNullable<PurchaseProof['gift']>): PaidCopy {
  const body = gift.lives === null ? { key: 'gift.paid.bodyBare', params: { name: gift.name } } : { key: 'gift.paid.body', params: { name: gift.name, current: gift.lives, max: gift.max } };
  return { body, note: gift.lives !== null && gift.lives > gift.max ? { key: 'gift.paid.bonus', params: {} } : null };
}

/** Codes a learner can act on without a technical trace. */
const TECHNICAL_CODES: ReadonlySet<string> = new Set(['payment_mismatch', 'broadcast_failed', 'rpc_unavailable']);

/** The raw error disclosure is for unexpected failures only: never for the insufficient-funds path. */
export function showTechnicalDetail(phase: string, code: string | null, friendlyCodes: ReadonlySet<string>): boolean {
  if (phase !== 'failed') return false;
  return !code || !friendlyCodes.has(code) || TECHNICAL_CODES.has(code);
}

export const lamportsToSol = (lamports: number): string => {
  const sol = lamports / 1_000_000_000;
  return sol >= 0.01 ? sol.toFixed(3) : sol.toFixed(5);
};
