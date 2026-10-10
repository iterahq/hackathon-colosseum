-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Shop v3, step 6: lives. The maximum is 10 (was 5), packs ADD lives and may
-- go above it (a reserve: regeneration only runs below the maximum), and an
-- infinite pack switches losing off for 30 days.
--
-- * `itera.companions.max_lives` default 10; every row below 10 is raised to
--   10 and its `lives` left as they are. A learner who was full (lives at the
--   old maximum) gets a fresh regeneration interval, so the raise does not
--   hand out the lives of the idle time. Minted companions are flagged
--   `mirror_due`: the asset's `max_lives` follows at their next mirror.
-- * `lives <= max_lives + 1` goes away (a pack may add 100). A sanity ceiling
--   stays.
-- * `itera.companions.unlimited_until`: while in the future a mistake costs no life.
-- * `itera.crystal_spend` also writes `unlimited_until` when `p_lives` carries it.
-- * `shop_items`: `life_refill` costs US$ 0.20 / 30 crystals; packs `lives_10`,
--   `lives_30`, `lives_50`, `lives_100` (`effect.add_lives`) and `lives_infinite`
--   (`effect.unlimited_days`).
-- Idempotent.
-- ============================================================================

alter table itera.companions add column if not exists unlimited_until timestamptz;
alter table itera.companions alter column max_lives set default 10;

alter table itera.companions drop constraint if exists companions_lives_bonus_check;
alter table itera.companions drop constraint if exists companions_lives_cap_check;
alter table itera.companions add constraint companions_lives_cap_check check (lives <= 100000);

-- Full at the old maximum: the regeneration clock restarts now.
update itera.companions set last_regen_at = now() where max_lives < 10 and lives >= max_lives;
update itera.companions
   set mirror_due = case when mint_status = 'minted' then true else mirror_due end,
       max_lives = 10,
       version = version + 1,
       updated_at = now()
 where max_lives < 10;

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
           unlimited_until = coalesce((p_lives->>'unlimited_until')::timestamptz, unlimited_until),
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

revoke all on function itera.crystal_spend(uuid, integer, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function itera.crystal_spend(uuid, integer, text, text, jsonb, jsonb) to service_role;

update itera.shop_items
   set price_usd_cents = 20, price_lamports = 1100000, price_label = 'US$ 0.20 ≈ 0.0011 SOL', price_crystals = 30
 where key = 'life_refill';

insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, price_crystals, title_i18n, description_i18n, effect, active, sort)
values
  ('lives_10', 'life', 1650000, 30, 'US$ 0.30 ≈ 0.00165 SOL', 40,
   '{"pt": "10 vidas", "en": "10 lives"}', '{"pt": "Soma 10 vidas, mesmo acima do máximo.", "en": "Adds 10 lives, even above the maximum."}', '{"add_lives": 10}', true, 91),
  ('lives_30', 'life', 4400000, 80, 'US$ 0.80 ≈ 0.0044 SOL', 100,
   '{"pt": "30 vidas", "en": "30 lives"}', '{"pt": "Soma 30 vidas, mesmo acima do máximo.", "en": "Adds 30 lives, even above the maximum."}', '{"add_lives": 30}', true, 92),
  ('lives_50', 'life', 6600000, 120, 'US$ 1.20 ≈ 0.0066 SOL', 150,
   '{"pt": "50 vidas", "en": "50 lives"}', '{"pt": "Soma 50 vidas, mesmo acima do máximo.", "en": "Adds 50 lives, even above the maximum."}', '{"add_lives": 50}', true, 93),
  ('lives_100', 'life', 11000000, 200, 'US$ 2.00 ≈ 0.011 SOL', 250,
   '{"pt": "100 vidas", "en": "100 lives"}', '{"pt": "Soma 100 vidas, mesmo acima do máximo.", "en": "Adds 100 lives, even above the maximum."}', '{"add_lives": 100}', true, 94),
  ('lives_infinite', 'life', 55000000, 1000, 'US$ 10.00 ≈ 0.055 SOL', 1000,
   '{"pt": "Vidas infinitas (30 dias)", "en": "Infinite lives (30 days)"}', '{"pt": "Por 30 dias, errar não custa vida.", "en": "For 30 days a mistake costs no life."}', '{"unlimited_days": 30}', true, 96)
on conflict (key) do nothing;
