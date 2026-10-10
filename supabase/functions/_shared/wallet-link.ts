export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const NONCE_BYTES = 16;

export type WalletSource = 'identity' | 'linked';

export interface ResolvedWallet {
  wallet: string | null;
  source: WalletSource | null;
}

/**
 * The one precedence rule: the wallet a learner signed in with wins; a wallet
 * linked to an e-mail account is used only when there is no such identity.
 */
export function pickWallet(identityWallet: string | null, linkedWallet: string | null): ResolvedWallet {
  if (identityWallet) return { wallet: identityWallet, source: 'identity' };
  if (linkedWallet) return { wallet: linkedWallet, source: 'linked' };
  return { wallet: null, source: null };
}

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface LinkMessageInput {
  address: string;
  userId: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

/** The text the wallet shows and signs. The account is named by a prefix of its id, never by e-mail or name. */
export function buildLinkMessage(input: LinkMessageInput): string {
  return [
    'Itera — link this wallet to your account',
    `Wallet: ${input.address}`,
    `Account: ${input.userId.slice(0, 8)}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expires At: ${input.expiresAt.toISOString()}`,
  ].join('\n');
}

export interface ChallengeState {
  used_at: string | null;
  expires_at: string;
}

/** A missing row is another learner's or an unknown challenge; a used or old one is expired. */
export function challengeVerdict(challenge: ChallengeState | null, now: Date): 'ok' | 'challenge_not_found' | 'challenge_expired' {
  if (!challenge) return 'challenge_not_found';
  if (challenge.used_at !== null || new Date(challenge.expires_at).getTime() <= now.getTime()) return 'challenge_expired';
  return 'ok';
}
