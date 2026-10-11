-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- The talent board: learners who opted in to be found by companies.
--
-- * `itera.talent_listings`: one row per listed learner. Listing is an explicit
--   act of the learner (`talent-board` POST `list`); nobody is listed by default
--   and `unlist` deletes the row. `wallet` is the wallet the sign-in proved when
--   the learner listed, never one named in a request.
-- * `headline`: one plain-text line the learner wrote, at most 120 characters.
-- * Every number on a card is read from other tables at request time: this
--   table holds only the consent and the headline.
-- * RLS on, no grant to anon or authenticated: only the edge function (service
--   role) reads and writes it, same as `itera.bounty_reports` in 0240.
--
-- Additive and idempotent.
-- ============================================================================

create table if not exists itera.talent_listings (
  user_id    uuid primary key references itera.users(id) on delete cascade,
  wallet     text not null unique,
  headline   text check (headline is null or char_length(headline) <= 120),
  listed_at  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_listings_listed_idx on itera.talent_listings (listed_at desc);

alter table itera.talent_listings enable row level security;
revoke all on itera.talent_listings from public, anon, authenticated;
grant all on itera.talent_listings to service_role;
