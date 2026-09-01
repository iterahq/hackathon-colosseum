-- ============================================================================
-- Itera migration 0070 — schema `learning`: the GLOBAL generation-governor
-- config. Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260828-itera-learning-engine-v1, question R5 (id 67591496), answer A.
--
-- WHAT THIS IS
-- -----------
-- The engine generates pedagogical activities from work episodes (M9). R5 sets
-- the policy that governs HOW OFTEN and WHICH ones:
--   cadence : 1 to 5 activities per HOUR, per learner;
--   cap     : at most 5 per DAY, per learner;
--   ttl     : a generated activity expires ~48h after it was created — a pending
--             activity past its TTL drops out of the pending set;
--   ranking : when there are more candidate claims than the cadence allows, rank
--             by info-gain — the activity that best resolves a weak/unknown claim.
--
-- WHY ONE GLOBAL ROW AND NOT A COLUMN PER LEARNER (R5)
-- ---------------------------------------------------
-- Tainan, 2026-09-01: "deixar isso ajustável global (não por user)". The four
-- parameters are one operator dial for the whole engine, not a learner
-- preference. So this is a SINGLE ROW, edited later at
-- learning-backoffice.iterahq.dev, and read by the engine for every learner.
--
-- The single-row shape is enforced by `id smallint primary key check (id = 1)`:
-- there is exactly one row, and its id is 1. A second row is refused by the
-- database, not by a convention a future writer has to remember.
--
-- WHY THE ENGINE STILL WORKS WITHOUT THIS TABLE
-- ---------------------------------------------
-- The engine hard-codes the R5 values as its fallback and reads this row only to
-- OVERRIDE them (apps/engine/src/pipeline/governor.ts,
-- GENERATION_CONFIG_DEFAULTS). A missing table, a missing row, or a read error
-- all degrade to the same hard-coded defaults. So the governor shipped and works
-- before this migration merges; this migration only makes the values EDITABLE.
--
-- RLS AND GRANTS — READABLE BY ALL, WRITABLE BY NONE (of the app roles)
-- --------------------------------------------------------------------
-- The engine reads this row with the LEARNER'S OWN JWT (plan ADR-2: no
-- service_role in a user-invoked path), so `authenticated` needs SELECT, and the
-- SELECT policy is `using (true)` — the single global row is the same for every
-- reader. `authenticated` gets NO write grant: a learner must not be able to
-- change the engine-wide policy. The backoffice edit path is an ELEVATED
-- operator surface (its own round, M11); it writes through a role that bypasses
-- RLS, so no app-role write grant belongs here. `anon` gets nothing, the posture
-- migration 0063 exists to enforce.
--
-- ⚠️ INVISIBLE TO THE DRIFT GUARDS, as all of schema `learning` is (0067
-- header): db/scripts/census.sql scopes to ('itera','billing'), so
-- db/census/expected-schema.txt needs no update for this PR. Extending the
-- census to `learning` is its own PR (named in 0067).
-- ============================================================================

create table if not exists learning.generation_config (
  id                   smallint primary key default 1,
  cadence_min_per_hour int         not null default 1,
  cadence_max_per_hour int         not null default 5,
  daily_cap            int         not null default 5,
  ttl_hours            int         not null default 48,
  ranking_mode         text        not null default 'info_gain',
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);

-- Exactly one row, and it is row 1. This is what makes "global" a database fact.
alter table learning.generation_config
  drop constraint if exists generation_config_singleton;
alter table learning.generation_config
  add constraint generation_config_singleton check (id = 1);

-- Cadence is a window, not a pair of unrelated numbers: the max is at least 1
-- (zero would turn generation off — use the daily cap or the engine flag for
-- that), the min is non-negative, and the min never exceeds the max.
alter table learning.generation_config
  drop constraint if exists generation_config_cadence_sane;
alter table learning.generation_config
  add constraint generation_config_cadence_sane
  check (
    cadence_min_per_hour >= 0
    and cadence_max_per_hour >= 1
    and cadence_min_per_hour <= cadence_max_per_hour
  );

alter table learning.generation_config
  drop constraint if exists generation_config_daily_cap_sane;
alter table learning.generation_config
  add constraint generation_config_daily_cap_sane
  check (daily_cap >= 0);

-- A TTL of zero would expire an activity the moment it is created. The floor is
-- one hour, so a pending activity always has a real lifetime.
alter table learning.generation_config
  drop constraint if exists generation_config_ttl_sane;
alter table learning.generation_config
  add constraint generation_config_ttl_sane
  check (ttl_hours >= 1);

-- The ranking vocabulary is small and known, so a typo is a refused write, not a
-- row the engine silently falls back on. It grows here when a new mode ships in
-- apps/engine/src/pipeline/governor.ts, the same discipline as the enums in 0067.
alter table learning.generation_config
  drop constraint if exists generation_config_ranking_mode_known;
alter table learning.generation_config
  add constraint generation_config_ranking_mode_known
  check (ranking_mode in ('info_gain', 'recency'));

comment on table learning.generation_config is
  $$The GLOBAL activity-generation governor policy (plan
20260828-itera-learning-engine-v1, R5). ONE row, id = 1, shared by every
learner — not a per-learner setting (Tainan 2026-09-01: "ajustável global, não
por user"). Edited at learning-backoffice.iterahq.dev; read by the engine for
every generation run.

cadence_min/max_per_hour, daily_cap, ttl_hours, ranking_mode. The engine
hard-codes these same values as its fallback and reads this row only to override
them, so it works before and after this table exists.$$;

comment on column learning.generation_config.cadence_min_per_hour is
  $$The per-hour, per-learner cadence FLOOR the scheduler aims for. It is a
target, not a forced floor: the engine never fabricates a candidate to hit it —
it only limits how many it may generate. See governor.ts.$$;

comment on column learning.generation_config.cadence_max_per_hour is
  $$The per-hour, per-learner cadence CEILING. The governor generates no more than
this many activities in the trailing hour.$$;

comment on column learning.generation_config.daily_cap is
  $$The per-day, per-learner cap. The governor generates no activity once the
learner already has this many in the trailing 24h (counted from
activities.created_at).$$;

comment on column learning.generation_config.ttl_hours is
  $$Generated-activity lifetime. A pending activity older than created_at +
ttl_hours is EXPIRED: it drops out of the pending set (computed, not a stored
status flip) and no longer blocks a fresh activity for its claim.$$;

comment on column learning.generation_config.ranking_mode is
  $$How the governor chooses WHICH claims to generate for when candidates exceed
the cadence. `info_gain` (default) ranks weak/unknown claims first — the ones
whose answer moves the reducer most. `recency` ranks by the most recent episode.$$;

-- Seed the single row with the R5 defaults, so the table is never empty. A
-- re-run keeps whatever the backoffice has since edited (do nothing on conflict).
insert into learning.generation_config (id) values (1)
  on conflict (id) do nothing;

-- ============================================================================
-- RLS — the single global row is world-readable to authenticated, written by
-- nobody holding an app role.
-- ============================================================================
alter table learning.generation_config enable row level security;

drop policy if exists generation_config_read_all on learning.generation_config;
create policy generation_config_read_all on learning.generation_config
  for select using (true);

-- SELECT only. No INSERT/UPDATE/DELETE for authenticated: the operator dial is
-- not a learner's to turn. The backoffice writes through an elevated role that
-- bypasses RLS (its own round). `anon` gets nothing.
grant select on learning.generation_config to authenticated;
revoke all on learning.generation_config from anon;
