/** A referral is only accepted from an account this young: an existing learner cannot be "invited". */
export const CLAIM_WINDOW_MS = 10 * 60_000;
export const CODE_LENGTH = 8;
/** No vowels and no look-alikes: a code never spells a word and survives being read aloud. */
const ALPHABET = 'bcdfghjkmnpqrstvwxz23456789';

export function isReferralCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{6,12}$/.test(value);
}

/** A code from random bytes, one character per byte. */
export function codeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < CODE_LENGTH) throw new Error('not enough bytes for a referral code');
  return Array.from(bytes.slice(0, CODE_LENGTH), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function inviteLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, '')}/?ref=${code}`;
}

export type ClaimRefusal = 'unknown_code' | 'self_referral' | 'already_claimed' | 'account_too_old';

export interface ClaimFacts {
  /** The learner the code belongs to; `null` when nobody has it. */
  inviterId: string | null;
  callerId: string;
  callerCreatedAt: string;
  /** The caller already arrived by an invite (any code). */
  alreadyClaimed: boolean;
  now: Date;
}

/** Whether a learner who just signed in may be recorded as invited by the owner of a code. */
export function claimVerdict(facts: ClaimFacts, windowMs = CLAIM_WINDOW_MS): 'ok' | ClaimRefusal {
  if (!facts.inviterId) return 'unknown_code';
  if (facts.inviterId === facts.callerId) return 'self_referral';
  if (facts.alreadyClaimed) return 'already_claimed';
  const age = facts.now.getTime() - new Date(facts.callerCreatedAt).getTime();
  return Number.isFinite(age) && age <= windowMs ? 'ok' : 'account_too_old';
}

export interface ReferralEntry {
  status: 'pending' | 'rewarded';
  claimed_at: string;
  rewarded_at: string | null;
}

/** What an inviter sees: their link and how each invite stands. No name, e-mail, wallet or id of anyone else. */
export function referralStatus(code: string, appUrl: string, entries: ReferralEntry[]) {
  const invited = entries.map((entry) => ({
    status: entry.status,
    at: entry.status === 'rewarded' ? (entry.rewarded_at ?? entry.claimed_at) : entry.claimed_at,
  }));
  const rewarded = invited.filter((entry) => entry.status === 'rewarded').length;
  return { code, link: inviteLink(appUrl, code), invited, rewarded_count: rewarded, pending_count: invited.length - rewarded };
}
