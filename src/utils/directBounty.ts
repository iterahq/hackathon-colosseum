import { looksLikeAddress } from '@/utils/credential';
import type { Bounty, InviteeCheck, InviteeReason } from '@/types/bounty';

export type InviteeParam = { kind: 'none' } | { kind: 'ok'; wallet: string } | { kind: 'invalid' };

/** The `?to=` of /bounties/post: absent, a wallet-shaped value, or something to ignore with a visible note. */
export function parseInviteeParam(search: string | URLSearchParams): InviteeParam {
  const raw = (typeof search === 'string' ? new URLSearchParams(search) : search).get('to');
  if (raw === null || raw.trim() === '') return { kind: 'none' };
  const wallet = raw.trim();
  return looksLikeAddress(wallet) ? { kind: 'ok', wallet } : { kind: 'invalid' };
}

export type InviteeVerdict =
  | { kind: 'eligible'; daysDone: number }
  | { kind: 'missing'; reason: InviteeReason; daysDone: number; minDays: number }
  | { kind: 'unknown_learner' };

/** What the form tells the sponsor before the reward is locked. */
export function inviteeVerdict(check: InviteeCheck): InviteeVerdict {
  const daysDone = check.proof?.daysDone ?? 0;
  if (check.eligible) return { kind: 'eligible', daysDone };
  if (!check.knownLearner && !check.proof) return { kind: 'unknown_learner' };
  return { kind: 'missing', reason: check.reason ?? 'no_certification', daysDone, minDays: check.requirement.minDays };
}

export const INVITEE_ERROR_CODES = ['invalid_invitee', 'own_invitee', 'direct_unavailable'] as const;

/** Direct bounties that are still waiting on the invited wallet, newest first as the server sent them. */
export const openInvites = (bounties: readonly Bounty[]): Bounty[] => bounties.filter((b) => b.direct && b.status === 'open');

/** Seconds left before the bounty expires, or null when it has no date or is past it. */
export function secondsLeft(expiresAt: string | null, now: number): number | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at) || at <= now) return null;
  return Math.floor((at - now) / 1000);
}
