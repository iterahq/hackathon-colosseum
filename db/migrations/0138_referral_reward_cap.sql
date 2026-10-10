-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- A cap on invite rewards (security review, finding 5): free accounts could be
-- invited without limit, and each one gave the inviter a medal minted by the
-- authority and a life.
--
-- * `referrals.reward_claimed_at`: the moment an invite took one of the
--   inviter's reward slots. Backfilled for invites already rewarded.
-- * `itera.claim_referral_reward(invited, daily, lifetime)`: takes a slot for
--   the invited learner's pending invite, atomically per inviter (advisory
--   lock), unless the inviter already used `daily` slots in the last 24 hours
--   or `lifetime` slots in all. Answers:
--     ok   : the invite holds a slot (now or from an earlier call: idempotent)
--     cap  : no slot; the invite stays `pending` and may be rewarded later
--     none : the learner has no pending invite
--   The limits are constants of `_shared/referral.ts`; the reward itself
--   (medals, lives) stays in TypeScript and marks the invite `rewarded` last.
-- Service role only.
-- Idempotent.
-- ============================================================================

alter table itera.referrals add column if not exists reward_claimed_at timestamptz;

update itera.referrals
   set reward_claimed_at = coalesce(rewarded_at, claimed_at)
 where status = 'rewarded' and reward_claimed_at is null;

create index if not exists referrals_inviter_reward_idx
  on itera.referrals (inviter_user_id, reward_claimed_at) where reward_claimed_at is not null;

create or replace function itera.claim_referral_reward(p_invited uuid, p_daily int, p_lifetime int)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inviter uuid;
  v_claimed timestamptz;
  v_day     int;
  v_all     int;
begin
  select inviter_user_id, reward_claimed_at into v_inviter, v_claimed
    from itera.referrals
   where invited_user_id = p_invited and status = 'pending'
     for update;
  if not found then
    return 'none';
  end if;
  if v_claimed is not null then
    return 'ok';
  end if;

  -- One invite of this inviter at a time: two first days finishing together cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended('referral_reward:' || v_inviter::text, 0));

  select count(*) filter (where reward_claimed_at > now() - interval '24 hours'), count(*)
    into v_day, v_all
    from itera.referrals
   where inviter_user_id = v_inviter and reward_claimed_at is not null;
  if v_day >= p_daily or v_all >= p_lifetime then
    return 'cap';
  end if;

  update itera.referrals set reward_claimed_at = now() where invited_user_id = p_invited;
  return 'ok';
end;
$$;

revoke all on function itera.claim_referral_reward(uuid, int, int) from public, anon, authenticated;
grant execute on function itera.claim_referral_reward(uuid, int, int) to service_role;
