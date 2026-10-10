-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Teacher endorsement of a certification.
--
-- `itera.endorsements`: one row per (certification row, instructor). `slot`
-- (1 to 3) is the on-chain attribute pair it occupies (`endorsed_by_<slot>` =
-- the instructor's full wallet, `endorsed_at_<slot>`), so a certification
-- holds three at most and an instructor endorses it once: the authority signs
-- at most three endorsement writes per certification, ever. `note` is plain
-- text of at most 140 characters; it stays in this table and is never written
-- to the asset or drawn in the artwork.
--
-- Who may endorse is decided in TypeScript (`_shared/staff.ts`) from
-- `itera.memberships`. No client policy: wallets and transactions are public
-- through `credential-verify`, the rest through `endorse`. Only the service
-- role writes. Idempotent.
-- ============================================================================

create table if not exists itera.endorsements (
  id                  uuid primary key default gen_random_uuid(),
  user_achievement_id uuid not null references itera.user_achievements(id) on delete cascade,
  instructor_user_id  uuid not null references itera.users(id) on delete cascade,
  wallet              text not null check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  note                text check (note is null or char_length(note) <= 140),
  slot                smallint not null check (slot between 1 and 3),
  tx_signature        text,
  created_at          timestamptz not null default now(),
  unique (user_achievement_id, instructor_user_id),
  unique (user_achievement_id, slot)
);

create index if not exists endorsements_instructor_idx on itera.endorsements (instructor_user_id);

alter table itera.endorsements enable row level security;
revoke all on itera.endorsements from anon, authenticated;
grant all on itera.endorsements to service_role;
