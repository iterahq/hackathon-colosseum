-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0013_reap_stale_live_class_sessions.sql`.
-- Moved here 2026-08-04. Renumbered 0013 -> 0053.
--
-- Tainan, TG 2026-08-04: *"deleta /migrations nesses dois repos e não permite
-- mais criar via CI check"*. `itera-player` is now the SINGLE owner of the Itera
-- schema; `itera-api` and `itera-mcp` no longer carry a `migrations/` directory
-- and a CI guard in each fails if one reappears. This file exists so the DDL
-- behind live production objects keeps a home in a repository — deleting it
-- outright would have destroyed the provenance of objects that are still there.
--
-- ⚠️ ALREADY APPLIED BEFORE CONSOLIDATION — merging it applies NOTHING.
-- It was applied to the Itera database (kjefmwlopzeaqgqtlbdn) by hand out of
-- `itera-api` around 2026-07-23, long before it arrived here. Every object it
-- creates was confirmed present by a read-only SELECT on 2026-08-04, and it is
-- recorded in `itera.schema_migrations` as applied WITHOUT being executed, via
-- `db/scripts/apply-migrations.sh baseline-add`. Do NOT "re-apply" it.
--
-- The new number is the order in which it was ACTUALLY applied, which is also
-- its dependency order — the old numbers could not be: itera-api's 0003 landed
-- after its 0010/0011, and itera-mcp's 0002 must precede itera-api's 0012, which
-- calls itera.current_author_tenant_ids(). Three independent 00NN sequences
-- against one database is exactly the collision this consolidation ends.
--
-- THE SQL BELOW IS BYTE-FOR-BYTE THE ORIGINAL. Nothing was edited — an edited
-- migration and a live database that disagree is the failure this file guards.
-- ============================================================================

-- ============================================================================
-- Itera — REAPER for forgotten `live` class sessions (pg_cron)
-- Plan: (live-session reaper — Tainan approved direction 2026-07-23)
--
-- WHY THIS EXISTS
-- ---------------
-- A `class_sessions` row stuck in status='live' that nobody ever ends BLOCKS the
-- instructor: /live/instructor renders THAT session instead of the "start a
-- class" form. This happened for real during testing (2026-07-23): a professor
-- closes the tab without hitting "end", presence drops to 0, the session sits
-- `live` forever. Tainan's ask: "um cron que mata a aula se tiver 0 users 15min
-- após ela supostamente terminar."
--
-- THE CONSTRAINT THAT SHAPES THE DESIGN
-- -------------------------------------
-- "0 users present" is REALTIME state (ephemeral Supabase-channel presence). It
-- does NOT live in the DB. A DB-side cron can't observe presence, so it needs a
-- DB-observable PROXY for abandonment. The signals available on a `live` row:
--   * class_sessions.started_at         — when it went live (absolute clock)
--   * class_answers.created_at          — a student answered (activity heartbeat)
--   * class_attendance.joined_at        — a student joined (join heartbeat)
-- There is NO scheduled END time in the schema (only scheduled_at = intended
-- START), so we can't compute "15min after it supposedly ended" literally. We
-- translate the intent into: define last_activity_at as the newest of the three
-- signals above, and treat a `live` session as abandoned when it has gone quiet.
--
-- HEURISTIC (conservative combination — prefer false-negative over false-positive)
-- --------------------------------------------------------------------------------
-- last_activity_at := GREATEST(
--     COALESCE(started_at, created_at),
--     max(class_answers.created_at)  for the session,
--     max(class_attendance.joined_at) for the session )
--
-- A `live` session is reaped (status -> 'ended', ended_at -> now()) when EITHER:
--   (idle)     last_activity_at < now() - p_idle_minutes   [default 30 min]
--   (absolute) started_at       < now() - p_absolute_hours [default  3 h]
--
--   * The IDLE rule is the workhorse and is purely conservative: an abandoned
--     session ALWAYS goes quiet (no answers, no new joins), so 30 min of total
--     silence is a strong abandonment signal. A brand-new session that just
--     started has last_activity_at = started_at (recent) -> never touched. A
--     genuinely active class virtually always has SOME answer/join inside 30 min.
--   * The ABSOLUTE rule is a backstop for the pathological "stuck live forever"
--     case. It can, in theory, end an unusually-long (>3h) but still-active class
--     -- an accepted, extremely-rare tradeoff because no real Itera live class
--     runs 3h. Raise p_absolute_hours if that ever becomes a real workload.
--
-- LIMITATION (documented on purpose): this is NOT literally "0 users present" --
-- presence isn't in the DB. It is the best DB-observable proxy for abandonment.
--
-- SAFETY: only ever touches status='live' rows. Never `pending`, never `ended`.
-- The UPDATE re-checks status='live' to guard against a concurrent human "end".
--
-- Target: ITERA Supabase project (kjefmwlopzeaqgqtlbdn) -- ours. Applied via the
-- itera-supabase-helpers `migrate` flow. Idempotent + safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. pg_cron (Supabase-supported; extension lives in pg_catalog, callable fns
--    in the `cron` schema). Idempotent.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- 1. The reaper function. Returns the rows it ended (for observability + the
--    verification proof). SECURITY DEFINER (owned by postgres, the table owner)
--    so it ends sessions regardless of the RLS UPDATE policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION itera.reap_stale_class_sessions(
  p_idle_minutes   integer DEFAULT 30,
  p_absolute_hours integer DEFAULT 3
)
RETURNS TABLE (
  id               uuid,
  tenant_id        uuid,
  instructor_id    uuid,
  started_at       timestamptz,
  last_activity_at timestamptz,
  reason           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'itera', 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      s.id,
      s.tenant_id,
      s.instructor_id,
      s.started_at,
      GREATEST(
        COALESCE(s.started_at, s.created_at),
        COALESCE(
          (SELECT max(a.created_at) FROM itera.class_answers a WHERE a.session_id = s.id),
          COALESCE(s.started_at, s.created_at)
        ),
        COALESCE(
          (SELECT max(t.joined_at) FROM itera.class_attendance t WHERE t.session_id = s.id),
          COALESCE(s.started_at, s.created_at)
        )
      ) AS last_activity_at
    FROM itera.class_sessions s
    WHERE s.status = 'live'
  ),
  to_reap AS (
    SELECT
      c.id,
      c.tenant_id,
      c.instructor_id,
      c.started_at,
      c.last_activity_at,
      CASE
        WHEN c.started_at IS NOT NULL
             AND c.started_at < now() - make_interval(hours => p_absolute_hours)
          THEN format('absolute: live for >%s h', p_absolute_hours)
        ELSE format('idle: no answers/joins for >%s min', p_idle_minutes)
      END AS reason
    FROM candidates c
    WHERE
      -- (absolute) live longer than the hard cap, regardless of activity
      (c.started_at IS NOT NULL AND c.started_at < now() - make_interval(hours => p_absolute_hours))
      -- (idle) no observable activity within the idle window
      OR (c.last_activity_at < now() - make_interval(mins => p_idle_minutes))
  )
  UPDATE itera.class_sessions s
     SET status   = 'ended',
         ended_at = now()
    FROM to_reap r
   WHERE s.id = r.id
     AND s.status = 'live'   -- re-check: never clobber a concurrent human "end"
  RETURNING s.id, r.tenant_id, r.instructor_id, r.started_at, r.last_activity_at, r.reason;
END;
$function$;

COMMENT ON FUNCTION itera.reap_stale_class_sessions(integer, integer) IS
  'Ends forgotten live class sessions. Reaps status=live rows that are idle '
  '(no answers/joins for p_idle_minutes, default 30) OR live beyond an absolute '
  'cap (p_absolute_hours, default 3). DB-side proxy for "0 users present" '
  '(realtime presence is not in the DB). Conservative: only touches live rows.';

-- Least-privilege: only postgres/service_role should ever run the reaper. No
-- learner/instructor JWT (anon/authenticated) may end sessions via this fn.
REVOKE ALL ON FUNCTION itera.reap_stale_class_sessions(integer, integer) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Schedule it every 5 minutes. cron.schedule(name, ...) upserts by name, so
--    re-running this migration just refreshes the job (idempotent).
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'itera-reap-stale-live-class-sessions',
  '*/5 * * * *',
  $$SELECT itera.reap_stale_class_sessions();$$
);
