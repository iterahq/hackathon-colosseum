-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Tera NFT, step 2: the day chest (a Tera earned by a stamped day).
--
-- * `itera.tera_chests`: one row per (certification, day). The commitment
--   written on the certification asset at stamp time (`chest:<day>` =
--   `<target slot>.<effort level>.<pool hash>`), then the seed block, the roll
--   and the Tera it minted. Unique (certification_id, day): a day opens ONE chest.
-- * `itera.tera_chest_pools`: every pool document a commitment ever named, by
--   its SHA-256, so a chest is recomputed against the pool it committed to.
-- * `itera.avatar_assets.origin` (`bought` | `earned` | `sponsor`) and
--   `chest_id` (unique: a chest mints at most one Tera, whatever races).
-- * `itera.onchain_config.tera_chest`: the kill switch, inserted `off`. With it
--   off no commitment is written and no chest is settled.
--
-- RLS is on with NO policy on the two new tables: only the service role (the
-- edge functions) reads or writes them. Idempotent.
-- ============================================================================

create table if not exists itera.tera_chest_pools (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  document text not null,
  created_at timestamptz not null default now()
);
alter table itera.tera_chest_pools enable row level security;
revoke all on itera.tera_chest_pools from anon, authenticated;
grant select, insert on itera.tera_chest_pools to service_role;

create table if not exists itera.tera_chests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references itera.users(id) on delete cascade,
  certification_id uuid not null references itera.user_achievements(id) on delete cascade,
  lesson_id uuid not null,
  day integer not null check (day between 1 and 99),
  status text not null default 'committed' check (status in ('committed', 'rolling', 'minted', 'failed')),
  commit_slot bigint not null check (commit_slot > 0),
  commit_value text not null,
  commit_via text not null default 'stamp' check (commit_via in ('stamp', 'own_write')),
  commit_tx text,
  commit_tx_slot bigint,
  commits integer not null default 1,
  level integer not null check (level between 0 and 3),
  inputs jsonb not null default '{}'::jsonb,
  pool_hash text not null references itera.tera_chest_pools(hash),
  seed_slot bigint,
  seed_blockhash text,
  seed text,
  tier text,
  item_key text references itera.shop_items(key),
  roll jsonb,
  error text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (certification_id, day)
);
create index if not exists tera_chests_user_idx on itera.tera_chests (user_id, created_at desc);
alter table itera.tera_chests enable row level security;
revoke all on itera.tera_chests from anon, authenticated;
grant select, insert, update on itera.tera_chests to service_role;

alter table itera.avatar_assets add column if not exists origin text not null default 'bought';
alter table itera.avatar_assets add column if not exists chest_id uuid references itera.tera_chests(id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avatar_assets_origin_check') then
    alter table itera.avatar_assets add constraint avatar_assets_origin_check check (origin in ('bought', 'earned', 'sponsor'));
  end if;
end $$;
create unique index if not exists avatar_assets_chest_id_key on itera.avatar_assets (chest_id) where chest_id is not null;

insert into itera.onchain_config (key, value) values ('tera_chest', 'off') on conflict (key) do nothing;
