-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounties: a certification opens a paid door.
--
-- * `itera.bounties`: one paid task. The reward sits in ONE on-chain escrow
--   account per bounty (`escrow_address`); `status` follows the money.
-- * `itera.bounty_claims`: who took a bounty, with the proof read from chain
--   at that moment. At most one live claim per bounty and one per learner.
-- * `itera.bounty_events`: the public ledger, one row per step, with the
--   transaction signature when the step moved money.
-- * `itera.bounty_accept` / `bounty_submit` / `bounty_review` /
--   `bounty_release_claim` / `bounty_mark`: the only writers of a status. Each
--   is one transaction and refuses a transition that does not start from the
--   expected status. Who may call, eligibility and amounts are decided in
--   TypeScript (`_shared/bounty.ts`).
--
-- Nothing here is readable by `anon` or `authenticated`: the edge functions
-- (`bounty-*`) are the only readers and choose what is public.
--
-- Additive and idempotent.
-- ============================================================================

create table if not exists itera.bounties (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  tenant_id          uuid not null references itera.tenants(id) on delete restrict,
  created_by         uuid references itera.users(id) on delete set null,
  sponsor_name       text not null check (length(sponsor_name) between 1 and 80),
  title_i18n         jsonb not null,
  summary_i18n       jsonb not null,
  brief_i18n         jsonb not null,
  deliverable_i18n   jsonb not null,
  requirement        jsonb not null,
  reward_lamports    bigint not null check (reward_lamports >= 1000000),
  escrow_kind        text not null default 'derived_account' check (escrow_kind in ('derived_account', 'program')),
  escrow_address     text not null unique,
  refund_address     text not null,
  status             text not null default 'awaiting_funding'
    check (status in ('awaiting_funding', 'open', 'claimed', 'submitted', 'paying', 'paid', 'refunding', 'refunded')),
  claim_id           uuid,
  claim_hours        integer not null default 72 check (claim_hours between 1 and 720),
  expires_at         timestamptz not null,
  funded_at          timestamptz,
  funded_lamports    bigint,
  funding_signature  text,
  transfer_signature text,
  transfer_sent_at   timestamptz,
  transfer_lamports  bigint,
  paid_at            timestamptz,
  paid_wallet        text,
  payout_lamports    bigint,
  payout_signature   text,
  refunded_at        timestamptz,
  refund_lamports    bigint,
  refund_signature   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists itera.bounty_claims (
  id              uuid primary key default gen_random_uuid(),
  bounty_id       uuid not null references itera.bounties(id) on delete restrict,
  user_id         uuid not null references itera.users(id) on delete restrict,
  wallet          text not null,
  proof_asset     text not null,
  proof           jsonb not null,
  status          text not null default 'active'
    check (status in ('active', 'submitted', 'approved', 'rejected', 'expired', 'withdrawn')),
  accepted_at     timestamptz not null default now(),
  deadline_at     timestamptz not null,
  submission_url  text check (submission_url is null or length(submission_url) between 8 and 500),
  submission_note text check (submission_note is null or length(submission_note) <= 1000),
  submitted_at    timestamptz,
  reviewed_by     uuid references itera.users(id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or length(review_note) <= 1000)
);

create unique index if not exists bounty_claims_one_live_per_bounty
  on itera.bounty_claims (bounty_id) where status in ('active', 'submitted', 'approved');
create unique index if not exists bounty_claims_one_open_per_user
  on itera.bounty_claims (user_id) where status in ('active', 'submitted');
create index if not exists bounty_claims_wallet_idx on itera.bounty_claims (wallet);

create table if not exists itera.bounty_events (
  id         bigint generated always as identity primary key,
  bounty_id  uuid not null references itera.bounties(id) on delete restrict,
  claim_id   uuid references itera.bounty_claims(id) on delete set null,
  kind       text not null check (kind in (
    'created', 'funded', 'accepted', 'submitted', 'approved', 'rejected',
    'withdrawn', 'expired', 'paid', 'refund_started', 'refunded')),
  wallet     text,
  lamports   bigint,
  signature  text,
  created_at timestamptz not null default now()
);

create index if not exists bounty_events_bounty_idx on itera.bounty_events (bounty_id, id);
create index if not exists bounties_status_idx on itera.bounties (status, created_at desc);
create index if not exists bounties_paid_wallet_idx on itera.bounties (paid_wallet) where status = 'paid';

alter table itera.bounties enable row level security;
alter table itera.bounty_claims enable row level security;
alter table itera.bounty_events enable row level security;

revoke all on itera.bounties, itera.bounty_claims, itera.bounty_events from public, anon, authenticated;
grant all on itera.bounties, itera.bounty_claims, itera.bounty_events to service_role;

-- open -> claimed. status: ok | not_open | already_claiming (this learner holds another live claim).
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

-- claimed -> submitted, by the learner who holds the claim. status: ok | not_active.
create or replace function itera.bounty_submit(p_bounty uuid, p_user_id uuid, p_url text, p_note text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bounty itera.bounties%rowtype;
  v_claim itera.bounty_claims%rowtype;
begin
  select * into v_bounty from itera.bounties as bounty where bounty.id = p_bounty for update;
  if not found or v_bounty.status <> 'claimed' then
    return 'not_active';
  end if;
  select * into v_claim from itera.bounty_claims as claim where claim.id = v_bounty.claim_id for update;
  if not found or v_claim.user_id <> p_user_id or v_claim.status <> 'active' or v_claim.deadline_at <= now() then
    return 'not_active';
  end if;

  update itera.bounty_claims
     set status = 'submitted', submission_url = p_url, submission_note = p_note, submitted_at = now()
   where id = v_claim.id;
  update itera.bounties set status = 'submitted', updated_at = now() where id = p_bounty;
  insert into itera.bounty_events (bounty_id, claim_id, kind, wallet) values (p_bounty, v_claim.id, 'submitted', v_claim.wallet);
  return 'ok';
end;
$$;

-- submitted -> paying (approve) or back to open (reject). status: ok | not_submitted.
create or replace function itera.bounty_review(p_bounty uuid, p_reviewer uuid, p_approve boolean, p_note text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bounty itera.bounties%rowtype;
  v_wallet text;
begin
  select * into v_bounty from itera.bounties as bounty where bounty.id = p_bounty for update;
  if not found or v_bounty.status <> 'submitted' then
    return 'not_submitted';
  end if;

  update itera.bounty_claims
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = p_reviewer, reviewed_at = now(), review_note = p_note
   where id = v_bounty.claim_id and status = 'submitted'
   returning wallet into v_wallet;
  if not found then
    return 'not_submitted';
  end if;

  if p_approve then
    update itera.bounties set status = 'paying', updated_at = now() where id = p_bounty;
  else
    update itera.bounties set status = 'open', claim_id = null, updated_at = now() where id = p_bounty;
  end if;
  insert into itera.bounty_events (bounty_id, claim_id, kind, wallet)
  values (p_bounty, v_bounty.claim_id, case when p_approve then 'approved' else 'rejected' end, v_wallet);
  return 'ok';
end;
$$;

-- claimed -> open: the learner gave up (`withdrawn`, p_user_id set) or ran out of time (`expired`).
-- status: ok | not_active.
create or replace function itera.bounty_release_claim(p_bounty uuid, p_reason text, p_user_id uuid default null)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bounty itera.bounties%rowtype;
  v_claim itera.bounty_claims%rowtype;
begin
  if p_reason not in ('withdrawn', 'expired') then
    raise exception 'bounty_release_claim: unknown reason %', p_reason;
  end if;
  select * into v_bounty from itera.bounties as bounty where bounty.id = p_bounty for update;
  if not found or v_bounty.status <> 'claimed' then
    return 'not_active';
  end if;
  select * into v_claim from itera.bounty_claims as claim where claim.id = v_bounty.claim_id for update;
  if not found or v_claim.status <> 'active' then
    return 'not_active';
  end if;
  if p_reason = 'withdrawn' and (p_user_id is null or v_claim.user_id <> p_user_id) then
    return 'not_active';
  end if;
  if p_reason = 'expired' and v_claim.deadline_at > now() then
    return 'not_active';
  end if;

  update itera.bounty_claims set status = p_reason where id = v_claim.id;
  update itera.bounties set status = 'open', claim_id = null, updated_at = now() where id = p_bounty;
  insert into itera.bounty_events (bounty_id, claim_id, kind, wallet) values (p_bounty, v_claim.id, p_reason, v_claim.wallet);
  return 'ok';
end;
$$;

-- The money steps. Moves a bounty from one of `p_from` to `p_to` and writes the ledger row.
--   open (funded) | refunding | paid | refunded. False when the bounty was not in `p_from`.
create or replace function itera.bounty_mark(
  p_bounty uuid,
  p_from text[],
  p_to text,
  p_wallet text default null,
  p_lamports bigint default null,
  p_signature text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bounty itera.bounties%rowtype;
begin
  select * into v_bounty from itera.bounties as bounty where bounty.id = p_bounty for update;
  if not found or not (v_bounty.status = any (p_from)) then
    return false;
  end if;

  if p_to = 'open' then
    update itera.bounties
       set status = 'open', funded_at = now(), funded_lamports = p_lamports, funding_signature = p_signature, updated_at = now()
     where id = p_bounty;
    insert into itera.bounty_events (bounty_id, kind, wallet, lamports, signature) values (p_bounty, 'funded', p_wallet, p_lamports, p_signature);
  elsif p_to = 'refunding' then
    update itera.bounties set status = 'refunding', transfer_signature = null, transfer_sent_at = null, transfer_lamports = null, updated_at = now() where id = p_bounty;
    insert into itera.bounty_events (bounty_id, kind, wallet) values (p_bounty, 'refund_started', p_wallet);
  elsif p_to = 'paid' then
    update itera.bounties
       set status = 'paid', paid_at = now(), paid_wallet = p_wallet, payout_lamports = p_lamports, payout_signature = p_signature, updated_at = now()
     where id = p_bounty;
    insert into itera.bounty_events (bounty_id, claim_id, kind, wallet, lamports, signature)
    values (p_bounty, v_bounty.claim_id, 'paid', p_wallet, p_lamports, p_signature);
  elsif p_to = 'refunded' then
    update itera.bounties
       set status = 'refunded', refunded_at = now(), refund_lamports = p_lamports, refund_signature = p_signature, updated_at = now()
     where id = p_bounty;
    insert into itera.bounty_events (bounty_id, kind, wallet, lamports, signature) values (p_bounty, 'refunded', p_wallet, p_lamports, p_signature);
  else
    raise exception 'bounty_mark: unknown target %', p_to;
  end if;
  return true;
end;
$$;

revoke all on function itera.bounty_accept(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function itera.bounty_submit(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function itera.bounty_review(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function itera.bounty_release_claim(uuid, text, uuid) from public, anon, authenticated;
revoke all on function itera.bounty_mark(uuid, text[], text, text, bigint, text) from public, anon, authenticated;
grant execute on function itera.bounty_accept(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function itera.bounty_submit(uuid, uuid, text, text) to service_role;
grant execute on function itera.bounty_review(uuid, uuid, boolean, text) to service_role;
grant execute on function itera.bounty_release_claim(uuid, text, uuid) to service_role;
grant execute on function itera.bounty_mark(uuid, text[], text, text, bigint, text) to service_role;

-- The tenant whose staff may fund a bounty from the Itera treasury (DevFellowship, the first sponsor).
-- Every other sponsor funds the escrow account from their own wallet.
insert into itera.onchain_config (key, value)
select 'bounty_treasury_tenant', tenant.id::text from itera.tenants as tenant where tenant.slug = 'dfl-batch'
on conflict (key) do nothing;
