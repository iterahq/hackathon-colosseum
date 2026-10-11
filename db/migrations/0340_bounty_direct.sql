-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Direct bounties: a reward locked for ONE invited wallet.
--
-- * `bounties.invitee_wallet`: the only wallet that may accept the bounty.
--   Null: open to any wallet whose certification qualifies. The escrow
--   program is what enforces it (`create_direct`: the invitee is in the
--   account and in its address, `accept` answers `NotInvited` to anyone
--   else); this column is what the pages and the inbox are read from.
-- * It is never the sponsor's own wallet.
-- * `bounties_invitee_idx`: "the bounties addressed to wallet X".
-- * `itera.bounty_accept` answers `not_invited` when the wallet is not the
--   invitee: a second line behind the program, same signature and grants.
--
-- Additive and idempotent.
-- ============================================================================

alter table itera.bounties
  add column if not exists invitee_wallet text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bounties_invitee_wallet_check' and conrelid = 'itera.bounties'::regclass) then
    alter table itera.bounties
      add constraint bounties_invitee_wallet_check
      check (invitee_wallet is null or (invitee_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' and invitee_wallet is distinct from sponsor_wallet and invitee_wallet <> refund_address));
  end if;
end
$$;

create index if not exists bounties_invitee_idx on itera.bounties (invitee_wallet, created_at desc) where invitee_wallet is not null;

-- open -> claimed. status: ok | not_open | not_invited | already_claiming (this learner holds another live claim).
create or replace function itera.bounty_accept(
  p_bounty uuid,
  p_user_id uuid,
  p_wallet text,
  p_proof_asset text,
  p_proof jsonb
)
returns table (status text, claim_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bounty itera.bounties%rowtype;
  v_claim uuid;
begin
  select * into v_bounty from itera.bounties as bounty where bounty.id = p_bounty for update;
  if not found or v_bounty.status <> 'open' or v_bounty.expires_at <= now() then
    return query select 'not_open'::text, null::uuid;
    return;
  end if;
  if v_bounty.invitee_wallet is not null and v_bounty.invitee_wallet is distinct from p_wallet then
    return query select 'not_invited'::text, null::uuid;
    return;
  end if;

  begin
    insert into itera.bounty_claims (bounty_id, user_id, wallet, proof_asset, proof, deadline_at)
    values (p_bounty, p_user_id, p_wallet, p_proof_asset, p_proof,
            least(now() + make_interval(hours => v_bounty.claim_hours), v_bounty.expires_at))
    returning id into v_claim;
  exception when unique_violation then
    return query select 'already_claiming'::text, null::uuid;
    return;
  end;

  update itera.bounties set status = 'claimed', claim_id = v_claim, updated_at = now() where id = p_bounty;
  insert into itera.bounty_events (bounty_id, claim_id, kind, wallet) values (p_bounty, v_claim, 'accepted', p_wallet);
  return query select 'ok'::text, v_claim;
end;
$$;

revoke all on function itera.bounty_accept(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function itera.bounty_accept(uuid, uuid, text, text, jsonb) to service_role;
