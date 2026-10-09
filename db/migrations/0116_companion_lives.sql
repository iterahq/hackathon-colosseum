-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- "Tera companheiro": lives, a companion per learner mirrored on chain, and the
-- shop items sold against both.
--
-- * `itera.companions`: one row per learner. The database is the source of
--   truth for lives and the equipped outfit; the Solana asset is a mirror.
--   `mirrored` is the attribute list last written on chain and `mirror_due`
--   says a write failed and is owed.
-- * `itera.life_events`: one row per thing that moved lives, unique per
--   (learner, attempt id), so a replayed request changes nothing.
-- * Catalog: the item kinds become `life`, `outfit`, `ink`, `frame` and every
--   item is on sale. `art` is display data for the shop.
-- * The service role reads `xp_events` to derive level, xp and streak.
-- Idempotent.
-- ============================================================================

create table if not exists itera.companions (
  user_id         uuid primary key references itera.users(id) on delete cascade,
  -- Public id of the companion: keys its metadata URL, so no user id is exposed there.
  id              uuid not null unique default gen_random_uuid(),
  lives           int not null default 5 check (lives >= 0),
  max_lives       int not null default 5 check (max_lives > 0),
  last_regen_at   timestamptz not null default now(),
  outfit          text,
  wallet_address  text,
  asset_address   text,
  mint_status     text not null default 'unclaimed'
                    check (mint_status in ('unclaimed', 'pending', 'minted', 'failed')),
  mint_claimed_at timestamptz,
  mint_error      text,
  tx_signature    text,
  minted_at       timestamptz,
  mirrored        jsonb,
  mirror_due      boolean not null default false,
  mirror_error    text,
  -- Bumped on every write: the compare-and-swap token for lives changes.
  version         bigint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (lives <= max_lives)
);

create index if not exists companions_asset_idx on itera.companions (asset_address);

create table if not exists itera.life_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references itera.users(id) on delete cascade,
  attempt_id  text not null check (char_length(attempt_id) between 1 and 200),
  activity_id uuid,
  kind        text not null check (kind in ('lose', 'lesson_bonus', 'refill')),
  -- Set once the event has moved the lives counter.
  applied_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, attempt_id)
);

create index if not exists life_events_user_time_idx on itera.life_events (user_id, created_at);

alter table itera.companions enable row level security;
alter table itera.life_events enable row level security;

drop policy if exists companions_read_own on itera.companions;
create policy companions_read_own on itera.companions
  for select to authenticated using (user_id = itera.current_itera_user_id());

drop policy if exists life_events_read_own on itera.life_events;
create policy life_events_read_own on itera.life_events
  for select to authenticated using (user_id = itera.current_itera_user_id());

revoke all on itera.companions, itera.life_events from anon, authenticated;
grant select on itera.companions, itera.life_events to authenticated;
grant all on itera.companions, itera.life_events to service_role;
grant select on itera.xp_events to service_role;

alter table itera.shop_items add column if not exists art jsonb not null default '{}'::jsonb;

insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, effect, art, active, sort) values
  ('life_refill', 'life', 550000, 10, 'US$ 0.10 ≈ 0.0006 SOL',
   '{"pt": "Recarga de vidas", "en": "Life refill"}',
   '{"pt": "Enche as vidas do Tera na hora.", "en": "Fills Tera''s lives right away."}',
   '{}', '{"icon": "heart"}', true, 10),
  ('outfit_glasses', 'outfit', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL',
   '{"pt": "Óculos", "en": "Glasses"}',
   '{"pt": "Óculos para o Tera. Fica gravado no companheiro on-chain quando equipado.", "en": "Glasses for Tera. Written on the on-chain companion when equipped."}',
   '{}', '{"outfit": "outfit_glasses"}', true, 20),
  ('outfit_crown', 'outfit', 1650000, 30, 'US$ 0.30 ≈ 0.00165 SOL',
   '{"pt": "Coroa", "en": "Crown"}',
   '{"pt": "Uma coroa para o Tera. Fica gravada no companheiro on-chain quando equipada.", "en": "A crown for Tera. Written on the on-chain companion when equipped."}',
   '{}', '{"outfit": "outfit_crown"}', true, 30),
  ('outfit_headphones', 'outfit', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL',
   '{"pt": "Fones", "en": "Headphones"}',
   '{"pt": "Fones de ouvido para o Tera. Ficam gravados no companheiro on-chain quando equipados.", "en": "Headphones for Tera. Written on the on-chain companion when equipped."}',
   '{}', '{"outfit": "outfit_headphones"}', true, 40),
  ('ink_emerald', 'ink', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL',
   '{"pt": "Tinta esmeralda", "en": "Emerald ink"}',
   '{"pt": "Os carimbos e a página deste passaporte passam a ser em tinta esmeralda, gravada on-chain.", "en": "This passport page and its stamps switch to emerald ink, written on-chain."}',
   '{"value": "emerald"}', '{"ink": "emerald", "color": "#34D399"}', true, 50),
  ('ink_violet', 'ink', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL',
   '{"pt": "Tinta violeta", "en": "Violet ink"}',
   '{"pt": "Os carimbos deste passaporte passam a ser em tinta violeta, gravada on-chain.", "en": "The stamps of this passport switch to violet ink, written on-chain."}',
   '{"value": "violet"}', '{"ink": "violet", "color": "#A78BFA"}', true, 60),
  ('frame_gold_leaf', 'frame', 2750000, 50, 'US$ 0.50 ≈ 0.00275 SOL',
   '{"pt": "Moldura folha de ouro", "en": "Gold-leaf frame"}',
   '{"pt": "Uma moldura em folha de ouro na página deste passaporte, gravada on-chain.", "en": "A gold-leaf frame around this passport page, written on-chain."}',
   '{"value": "gold-leaf"}', '{"frame": "gold-leaf", "color": "#E8B84A"}', true, 70)
on conflict (key) do update set
  kind = excluded.kind,
  price_lamports = excluded.price_lamports,
  price_usd_cents = excluded.price_usd_cents,
  price_label = excluded.price_label,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  effect = excluded.effect,
  art = excluded.art,
  active = excluded.active,
  sort = excluded.sort;
