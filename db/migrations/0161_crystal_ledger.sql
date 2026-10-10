-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Phoenix Crystals: the ledger.
--
-- * `itera.crystal_ledger`: one row per movement, unique on
--   (user_id, reason, ref_id), so the same event can never pay twice.
-- * `itera.crystal_accounts`: the balance (never below zero) and the state of
--   the on-chain mirror of that balance.
-- * `itera.crystal_grant` / `itera.crystal_spend`: the only writers. Each is one
--   transaction. `crystal_spend` locks the account row, and writes what was
--   bought in the same transaction as the debit: the `purchases` row (source
--   `crystals`) and, for lives, the companion row by compare-and-swap. Which
--   item, which price and how many lives are decided in TypeScript
--   (`_shared/crystals.ts`); the database only refuses a negative balance, a
--   repeated key and a stale companion version.
-- * `itera.shop_items.price_crystals`: what an item costs in crystals; null =
--   not sold for crystals. The SOL prices are not touched.
-- * `itera.purchases.source` accepts `crystals` (0 lamports, like a claim).
--
-- Additive and idempotent.
-- ============================================================================

create table if not exists itera.crystal_accounts (
  user_id           uuid primary key references itera.users(id) on delete cascade,
  balance           integer not null default 0 check (balance >= 0),
  wallet            text,
  token_account     text,
  mirrored_balance  integer,
  mirrored_at       timestamptz,
  mirror_claimed_at timestamptz,
  mirror_signature  text,
  mirror_error      text,
  updated_at        timestamptz not null default now()
);

create table if not exists itera.crystal_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references itera.users(id) on delete cascade,
  delta      integer not null check (delta <> 0),
  reason     text not null check (length(reason) between 1 and 64),
  ref_id     text not null check (length(ref_id) between 1 and 160),
  created_at timestamptz not null default now(),
  constraint crystal_ledger_once unique (user_id, reason, ref_id)
);

create index if not exists crystal_ledger_user_idx on itera.crystal_ledger (user_id, created_at desc);

alter table itera.crystal_accounts enable row level security;
alter table itera.crystal_ledger enable row level security;

drop policy if exists crystal_accounts_read_own on itera.crystal_accounts;
create policy crystal_accounts_read_own on itera.crystal_accounts
  for select to authenticated using (user_id = itera.current_itera_user_id());
drop policy if exists crystal_ledger_read_own on itera.crystal_ledger;
create policy crystal_ledger_read_own on itera.crystal_ledger
  for select to authenticated using (user_id = itera.current_itera_user_id());

revoke all on itera.crystal_accounts, itera.crystal_ledger from public, anon, authenticated;
grant select on itera.crystal_accounts, itera.crystal_ledger to authenticated;
grant all on itera.crystal_accounts, itera.crystal_ledger to service_role;

alter table itera.shop_items add column if not exists price_crystals integer;
alter table itera.shop_items drop constraint if exists shop_items_price_crystals_check;
alter table itera.shop_items add constraint shop_items_price_crystals_check
  check (price_crystals is null or price_crystals > 0);

update itera.shop_items as item
   set price_crystals = price.crystals
  from (values
    ('life_refill', 20),
    ('outfit_glasses', 100),
    ('outfit_headphones', 100),
    ('outfit_crown', 150),
    ('outfit_laurel', 150),
    ('ink_emerald', 150),
    ('ink_violet', 150),
    ('frame_gold_leaf', 400)
  ) as price(key, crystals)
 where item.key = price.key;

alter table itera.purchases drop constraint if exists purchases_source_check;
alter table itera.purchases add constraint purchases_source_check
  check (source in ('payment', 'claim', 'crystals'));
alter table itera.purchases drop constraint if exists purchases_lamports_check;
alter table itera.purchases add constraint purchases_lamports_check
  check (lamports > 0 or (lamports = 0 and source in ('claim', 'crystals')));

-- A crystal spend is found again by its ledger key, kept in `memo`.
create unique index if not exists purchases_crystals_memo_idx
  on itera.purchases (user_id, memo) where source = 'crystals';

-- Credits `p_amount` once per (user, reason, ref). `is_new` is false when the key was already paid.
create or replace function itera.crystal_grant(p_user_id uuid, p_amount integer, p_reason text, p_ref_id text)
returns table (balance integer, is_new boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'crystal_grant: amount must be positive';
  end if;

  insert into itera.crystal_accounts (user_id) values (p_user_id) on conflict (user_id) do nothing;
  insert into itera.crystal_ledger (user_id, delta, reason, ref_id)
  values (p_user_id, p_amount, p_reason, p_ref_id)
  on conflict on constraint crystal_ledger_once do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return query
      update itera.crystal_accounts as account
         set balance = account.balance + p_amount, updated_at = now()
       where account.user_id = p_user_id
       returning account.balance, true;
  else
    return query select account.balance, false from itera.crystal_accounts as account where account.user_id = p_user_id;
  end if;
end;
$$;

-- Debits `p_amount` once per (user, reason, ref) and writes what it bought, all or nothing.
--   p_purchase: { "item_key", "ref_id", "wallet" } -> a paid `purchases` row, source `crystals`.
--   p_lives:    { "version", "lives", "last_regen_at" } -> the companion row, only if still at `version`.
-- status: ok | duplicate (this key was already debited) | insufficient | conflict (companion moved: read again).
create or replace function itera.crystal_spend(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_ref_id text,
  p_purchase jsonb default null,
  p_lives jsonb default null
)
returns table (status text, balance integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'crystal_spend: amount must be positive';
  end if;

  insert into itera.crystal_accounts (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select account.balance into v_balance from itera.crystal_accounts as account where account.user_id = p_user_id for update;

  if exists (select 1 from itera.crystal_ledger as entry where entry.user_id = p_user_id and entry.reason = p_reason and entry.ref_id = p_ref_id) then
    return query select 'duplicate'::text, v_balance;
    return;
  end if;
  if v_balance < p_amount then
    return query select 'insufficient'::text, v_balance;
    return;
  end if;

  if p_lives is not null then
    update itera.companions
       set lives = (p_lives->>'lives')::integer,
           last_regen_at = (p_lives->>'last_regen_at')::timestamptz,
           version = version + 1,
           updated_at = now()
     where user_id = p_user_id and version = (p_lives->>'version')::bigint;
    if not found then
      return query select 'conflict'::text, v_balance;
      return;
    end if;
  end if;

  insert into itera.crystal_ledger (user_id, delta, reason, ref_id) values (p_user_id, -p_amount, p_reason, p_ref_id);
  update itera.crystal_accounts as account set balance = account.balance - p_amount, updated_at = now() where account.user_id = p_user_id;

  if p_purchase is not null then
    insert into itera.purchases (user_id, item_key, ref_id, lamports, price_usd_cents, status, source, wallet, memo, expires_at, paid_at, applied_at)
    values (
      p_user_id,
      p_purchase->>'item_key',
      (p_purchase->>'ref_id')::uuid,
      0,
      0,
      'paid',
      'crystals',
      coalesce(p_purchase->>'wallet', ''),
      p_ref_id,
      now(),
      now(),
      case when p_lives is not null then now() end
    );
  end if;

  return query select 'ok'::text, v_balance - p_amount;
end;
$$;

revoke all on function itera.crystal_grant(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function itera.crystal_grant(uuid, integer, text, text) to service_role;
revoke all on function itera.crystal_spend(uuid, integer, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function itera.crystal_spend(uuid, integer, text, text, jsonb, jsonb) to service_role;
