/** Binds one Solana wallet to an e-mail account: status, challenge, verify, then the pending certifications. */
import { callPassport } from '@/services/passport.service';
import { callShop } from '@/services/shopTransport';

export type WalletSource = 'identity' | 'linked' | null;
export interface LinkStatus {
  wallet: string | null;
  source: WalletSource;
}
export interface LinkChallenge {
  challengeId: string;
  message: string;
}
export interface LinkResult {
  wallet: string;
  pendingMints: number;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const row = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export async function getLinkStatus(): Promise<LinkStatus> {
  const r = row((await callShop('link-wallet', { body: { action: 'status' } })).data);
  const source = r.source === 'identity' || r.source === 'linked' ? r.source : null;
  return { wallet: str(r.wallet) || null, source };
}

export async function requestChallenge(address: string): Promise<LinkChallenge> {
  const r = row((await callShop('link-wallet', { body: { action: 'challenge', address } })).data);
  return { challengeId: str(r.challenge_id), message: str(r.message) };
}

/** `signature` is base58 or base64 of the 64 signature bytes. */
export async function verifyChallenge(challengeId: string, signature: string): Promise<LinkResult> {
  const r = row((await callShop('link-wallet', { body: { action: 'verify', challenge_id: challengeId, signature } })).data);
  return { wallet: str(r.wallet), pendingMints: typeof r.pending_mints === 'number' ? r.pending_mints : 0 };
}

const MAX_PASSES = 60;

/**
 * Mints the certifications that were waiting for a wallet, one `passport` call at a time while the
 * backend reports `remaining > 0`. Resolves with what is left (0 = all written); a failing pass stops
 * the loop without failing the link: the rows mint on the next lesson.
 */
export async function mintPendingRows(lang: string, onProgress: (remaining: number) => void, initial: number): Promise<number> {
  let remaining = initial;
  for (let pass = 0; remaining > 0 && pass < MAX_PASSES; pass += 1) {
    try {
      const next = (await callPassport(lang)).remaining;
      if (next >= remaining && pass > 2) break;
      remaining = next;
    } catch {
      return remaining;
    }
    onProgress(remaining);
  }
  return remaining;
}
