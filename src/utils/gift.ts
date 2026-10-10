/** Pure helpers of the gift and invite links. */
const ACTION_FUNCTION = 'action-gift';
const REF_KEY = 'itera.ref';
const REF_PATTERN = /^[a-z0-9]{6,12}$/;

/** `7xKpAbcd…3FaZ`, the same short form the backend uses in the Action title. */
export const shortWallet = (address: string): string => (address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address);

/** A learner as shown in a gift line: the nickname when there is one, else the short wallet. */
export const giftLabel = (name: string | null | undefined, wallet: string): string => name?.trim() || shortWallet(wallet);

/** The Solana Action behind a recipient's gift link. */
export function giftActionUrl(supabaseUrl: string, wallet: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${ACTION_FUNCTION}?to=${wallet}`;
}

/** The shareable blink: Dialect's public client, which needs no registry approval. */
export function giftBlinkUrl(supabaseUrl: string, wallet: string): string {
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${giftActionUrl(supabaseUrl, wallet)}`)}&cluster=devnet`;
}

export const inviteLink = (origin: string, code: string): string => `${origin.replace(/\/+$/, '')}/?ref=${code}`;

type RefStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Keeps `?ref=<code>` from the landing URL so it survives the trip through sign-in. Returns the code kept. */
export function captureRef(search: string, store: RefStore): string | null {
  const code = new URLSearchParams(search).get('ref')?.trim().toLowerCase() ?? '';
  if (!REF_PATTERN.test(code)) return pendingRef(store);
  try {
    store.setItem(REF_KEY, code);
  } catch {
    /* private mode: the invite is simply not kept */
  }
  return code;
}

export function pendingRef(store: RefStore): string | null {
  try {
    const code = store.getItem(REF_KEY);
    return code && REF_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function clearRef(store: RefStore): void {
  try {
    store.removeItem(REF_KEY);
  } catch {
    /* nothing to clear */
  }
}
