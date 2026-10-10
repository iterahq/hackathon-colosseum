-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- "Dar uma vida" (a life paid by one wallet for another learner, in the app or
-- through a Solana Action) and the invite reward.
--
-- * `itera.companions`: a gift or an invite reward may put ONE life above the
--   maximum (the bonus life), so the check becomes `lives <= max_lives + 1`.
-- * `itera.life_events`: two more kinds, `gift` and `referral`.
-- * `itera.gifts`: one row per gift intent. `id` is the intent id and the memo
--   of the payment. The in-app path shares the id with its `purchases` row; the
--   Action path has no purchase (the payer may not be a learner at all).
-- * `itera.referral_codes`: the short stable invite code of a learner.
-- * `itera.referrals`: who invited whom; `rewarded` once the invited learner
--   earned `first_stamp`.
-- * Catalog: item `life_gift` (kind `gift`) and the medals `friend_brought` and
--   `invited`.
--
-- Rules live in TypeScript (edge functions, service role). Clients read their
-- own rows, nobody but the service role writes.
-- Idempotent.
-- ============================================================================

alter table itera.companions drop constraint if exists companions_check;
alter table itera.companions drop constraint if exists companions_lives_bonus_check;
alter table itera.companions add constraint companions_lives_bonus_check check (lives <= max_lives + 1);

alter table itera.life_events drop constraint if exists life_events_kind_check;
alter table itera.life_events add constraint life_events_kind_check
  check (kind in ('lose', 'lesson_bonus', 'refill', 'gift', 'referral'));

create table if not exists itera.gifts (
  -- The intent id: the memo the payment carries.
  id                      uuid primary key default gen_random_uuid(),
  source                  text not null check (source in ('app', 'action')),
  from_wallet             text not null,
  -- The payer when the paying wallet belongs to a learner.
  from_user_id            uuid references itera.users(id) on delete set null,
  to_user_id              uuid not null references itera.users(id) on delete cascade,
  to_wallet               text not null,
  lamports                bigint not null check (lamports > 0),
  status                  text not null default 'pending'
                            check (status in ('pending', 'paid', 'delivered', 'expired')),
  -- The payment, and the write of the recipient's companion asset when there was one.
  tx_signature            text unique,
  mirror_signature        text,
  last_valid_block_height bigint,
  expires_at              timestamptz not null,
  created_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  delivered_at            timestamptz,
  -- When the recipient saw the "you got a life" moment.
  seen_at                 timestamptz,
  error                   text,
  check (from_user_id is null or from_user_id <> to_user_id)
);

create index if not exists gifts_to_user_idx on itera.gifts (to_user_id, status, paid_at);
create index if not exists gifts_from_wallet_idx on itera.gifts (from_wallet, status);

create table if not exists itera.referral_codes (
  user_id    uuid primary key references itera.users(id) on delete cascade,
  code       text not null unique check (code ~ '^[a-z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);

create table if not exists itera.referrals (
  -- One invite per invited learner, for ever.
  invited_user_id uuid primary key references itera.users(id) on delete cascade,
  inviter_user_id uuid not null references itera.users(id) on delete cascade,
  code            text not null,
  status          text not null default 'pending' check (status in ('pending', 'rewarded')),
  claimed_at      timestamptz not null default now(),
  rewarded_at     timestamptz,
  check (invited_user_id <> inviter_user_id)
);

create index if not exists referrals_inviter_idx on itera.referrals (inviter_user_id, claimed_at);

alter table itera.gifts enable row level security;
alter table itera.referral_codes enable row level security;
alter table itera.referrals enable row level security;

drop policy if exists gifts_read_own on itera.gifts;
create policy gifts_read_own on itera.gifts
  for select to authenticated
  using (to_user_id = itera.current_itera_user_id() or from_user_id = itera.current_itera_user_id());

drop policy if exists referral_codes_read_own on itera.referral_codes;
create policy referral_codes_read_own on itera.referral_codes
  for select to authenticated using (user_id = itera.current_itera_user_id());

drop policy if exists referrals_read_own on itera.referrals;
create policy referrals_read_own on itera.referrals
  for select to authenticated
  using (inviter_user_id = itera.current_itera_user_id() or invited_user_id = itera.current_itera_user_id());

revoke all on itera.gifts, itera.referral_codes, itera.referrals from anon, authenticated;
grant select on itera.gifts, itera.referral_codes, itera.referrals to authenticated;
grant all on itera.gifts, itera.referral_codes, itera.referrals to service_role;

-- Same pinned rate as every item: 1 US cent = 55 000 lamports, label = exact SOL.
insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, effect, art, active, sort) values
  ('life_gift', 'gift', 550000, 10, 'US$ 0.10 ≈ 0.00055 SOL',
   '{"pt": "Dar uma vida", "en": "Gift a life"}',
   '{"pt": "Uma vida para o Tera de outra pessoa, gravada no companheiro on-chain dela.", "en": "One life for another learner''s Tera, written on their on-chain companion."}',
   '{}', '{"icon": "heart"}', true, 95)
on conflict (key) do update set
  kind = excluded.kind,
  price_lamports = excluded.price_lamports,
  price_usd_cents = excluded.price_usd_cents,
  price_label = excluded.price_label,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  effect = excluded.effect,
  art = excluded.art,
  sort = excluded.sort;

insert into itera.achievements (key, kind, tier, title_i18n, description_i18n, art, sort) values
  ('friend_brought', 'milestone', 'bronze',
   '{"pt": "Trouxe um amigo", "en": "Brought a friend"}',
   '{"pt": "Um amigo que você convidou concluiu o primeiro dia.", "en": "A friend you invited finished their first day."}',
   '{"shape": "medal", "glyph": "+1", "accent": "#3FD17F"}', 100),
  ('invited', 'milestone', 'bronze',
   '{"pt": "Chegou por convite", "en": "Arrived by invite"}',
   '{"pt": "Você chegou pelo convite de um amigo e concluiu o primeiro dia.", "en": "You arrived by a friend''s invite and finished your first day."}',
   '{"shape": "medal", "glyph": "♥", "accent": "#3FD17F"}', 110)
on conflict (key) do update set
  kind = excluded.kind,
  tier = excluded.tier,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  art = excluded.art,
  sort = excluded.sort;
