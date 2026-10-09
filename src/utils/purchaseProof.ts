import type { PurchaseProof } from '@/utils/purchaseMachine';
import type { ShopItemKind } from '@/types/shop';

/** `5Kq9Zm2p…Xv81aB` */
export const shortSignature = (signature: string): string => (signature.length > 18 ? `${signature.slice(0, 8)}…${signature.slice(-6)}` : signature);

export interface ChangeLine {
  key: string;
  params: Record<string, string | number>;
}

/** One line of what the purchase changed on-chain: the backend's `written` list wins, then what the item kind implies. */
export function changeLine(kind: ShopItemKind, itemTitle: string, proof: PurchaseProof | null): ChangeLine | null {
  const lives = proof?.written.find((w) => w.attribute === 'lives');
  if (kind === 'life') {
    const current = lives ? Number(lives.value) : proof?.lives?.current;
    const max = proof?.lives?.max ?? 5;
    return Number.isFinite(current) && current !== undefined ? { key: 'purchase.proof.lives', params: { current, max } } : null;
  }
  const first = proof?.written.find((w) => w.attribute !== 'lives');
  if (first) return { key: 'purchase.proof.written', params: { attribute: first.attribute, value: first.value } };
  if (kind === 'outfit') return { key: 'purchase.proof.outfit', params: { name: itemTitle } };
  return { key: 'purchase.proof.cosmetic', params: { name: itemTitle } };
}
