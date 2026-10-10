import { GLOBAL_REF } from './awards.ts';
import { grantLifeOnce } from './companion-store.ts';
import { earnCrystals } from './crystals-store.ts';
import type { IteraClient } from './db.ts';
import { CODE_LENGTH, claimVerdict, codeFromBytes, isReferralCode, takeRewardSlot, type ClaimRefusal, type ReferralEntry } from './referral.ts';

const UNIQUE_VIOLATION = '23505';
const CODE_ATTEMPTS = 5;
const STATUS_LIMIT = 200;

/** The learner's invite code, created on first use and never changed. */
export async function ensureCode(db: IteraClient, userId: string): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const { data: existing, error: readError } = await db.from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
    if (readError) throw new Error(`referral_codes: ${readError.message}`);
    if (existing) return existing.code;
    const code = codeFromBytes(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)));
    const { error } = await db.from('referral_codes').insert({ user_id: userId, code });
    if (!error) return code;
    // Either the code is taken or a concurrent call created this learner's row: read again.
    if (error.code !== UNIQUE_VIOLATION) throw new Error(`referral_codes insert: ${error.message}`);
  }
  throw new Error('referral_codes: could not create a code');
}

export async function loadEntries(db: IteraClient, inviterId: string): Promise<ReferralEntry[]> {
  const { data, error } = await db
    .from('referrals')
    .select('status,claimed_at,rewarded_at')
    .eq('inviter_user_id', inviterId)
    .order('claimed_at', { ascending: false })
    .limit(STATUS_LIMIT);
  if (error) throw new Error(`referrals: ${error.message}`);
  return (data ?? []) as ReferralEntry[];
}

/** Records that the caller arrived by `code`. Refusals are answers, not errors: the app just moves on. */
export async function claimReferral(db: IteraClient, callerId: string, code: unknown): Promise<{ claimed: boolean; reason?: ClaimRefusal }> {
  if (!isReferralCode(code)) return { claimed: false, reason: 'unknown_code' };
  const [owner, caller, existing] = await Promise.all([
    db.from('referral_codes').select('user_id').eq('code', code).maybeSingle(),
    db.from('users').select('created_at').eq('id', callerId).single(),
    db.from('referrals').select('invited_user_id').eq('invited_user_id', callerId).maybeSingle(),
  ]);
  if (owner.error) throw new Error(`referral_codes: ${owner.error.message}`);
  if (caller.error) throw new Error(`users: ${caller.error.message}`);
  if (existing.error) throw new Error(`referrals: ${existing.error.message}`);

  const verdict = claimVerdict({
    inviterId: owner.data?.user_id ?? null,
    callerId,
    callerCreatedAt: caller.data.created_at,
    alreadyClaimed: existing.data !== null,
    now: new Date(),
  });
  if (verdict !== 'ok') return { claimed: false, reason: verdict };

  const { error } = await db.from('referrals').insert({ invited_user_id: callerId, inviter_user_id: owner.data?.user_id, code });
  if (error?.code === UNIQUE_VIOLATION) return { claimed: false, reason: 'already_claimed' };
  if (error) throw new Error(`referrals insert: ${error.message}`);
  return { claimed: true };
}

export type ReferralReward =
  | {
      rewarded: true;
      inviterUserId: string;
      /** The `invited` medal row of the invited learner, when this call created it. */
      createdRowIds: string[];
    }
  /** The inviter is at the daily or lifetime cap: nothing was given, the invite stays pending. */
  | { rewarded: false; reason: 'cap' };

/**
 * Pays an invite once the invited learner has finished a first day: a medal
 * and a life for each side. The invite first takes one of the inviter's reward
 * slots (`REWARDS_PER_DAY`, `REWARDS_LIFETIME`, atomically per inviter); with
 * no slot nothing is given and the invite stays `pending`. Every step is
 * idempotent and the referral is marked `rewarded` last, so a call that died
 * halfway is completed by the next one. `null` when the learner has no invite waiting.
 */
export async function rewardReferral(db: IteraClient, invitedUserId: string): Promise<ReferralReward | null> {
  const { data: referral, error } = await db
    .from('referrals')
    .select('inviter_user_id')
    .eq('invited_user_id', invitedUserId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw new Error(`referrals: ${error.message}`);
  if (!referral) return null;
  const inviterUserId = referral.inviter_user_id as string;

  const verdict = await takeRewardSlot((name, args) => db.rpc(name, args), invitedUserId);
  if (verdict === 'none') return null;
  if (verdict === 'cap') return { rewarded: false, reason: 'cap' };
  const now = new Date().toISOString();

  const { data: created, error: awardError } = await db
    .from('user_achievements')
    .upsert(
      [
        { user_id: invitedUserId, achievement_key: 'invited', ref_id: GLOBAL_REF, earned_at: now, state: {} },
        { user_id: inviterUserId, achievement_key: 'friend_brought', ref_id: invitedUserId, earned_at: now, state: {} },
      ],
      { onConflict: 'user_id,achievement_key,ref_id', ignoreDuplicates: true },
    )
    .select('id,user_id');
  if (awardError) throw new Error(`user_achievements referral: ${awardError.message}`);

  await Promise.all([
    grantLifeOnce(db, invitedUserId, 'referral:invited', 'referral'),
    grantLifeOnce(db, inviterUserId, `referral:${invitedUserId}`, 'referral'),
  ]);

  // Phoenix Crystals on top of the medal and the life: once per invite for each side. Never throws.
  await earnCrystals(db, [
    { userId: inviterUserId, reason: 'invite_friend', refId: invitedUserId },
    { userId: invitedUserId, reason: 'invited', refId: GLOBAL_REF },
  ]);

  const { error: settleError } = await db
    .from('referrals')
    .update({ status: 'rewarded', rewarded_at: now })
    .eq('invited_user_id', invitedUserId)
    .eq('status', 'pending');
  if (settleError) throw new Error(`referrals settle: ${settleError.message}`);
  return { rewarded: true, inviterUserId, createdRowIds: (created ?? []).filter((row) => row.user_id === invitedUserId).map((row) => row.id) };
}
