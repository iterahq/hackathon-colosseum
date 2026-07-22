-- ============================================================================
-- Itera live-class persistence v1 — durable answers + attendance.
-- Plan: itera-live-gaps-batch-2026-07 (item C).
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Today only CORRECT answers survive a live class (itera.progress /
-- activity_results via persistActivityProgress); wrong answers and attendance
-- are broadcast/presence-only and die with the channel. These two THIN tables
-- (dfl-db-simplicity: no triggers, no plpgsql — aggregation happens in TS)
-- give the instructor a durable post-class report:
--   class_answers    — one row per learner per activity per session (latest
--                      attempt wins via upsert), right AND wrong.
--   class_attendance — who joined the session (first join timestamp).
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- class_answers — the learner's own record of one live answer.
-- ---------------------------------------------------------------------------
create table if not exists itera.class_answers (
  session_id  uuid not null references itera.class_sessions(id) on delete cascade,
  activity_id uuid not null references itera.activities(id)     on delete cascade,
  user_id     uuid not null references itera.users(id)          on delete cascade,
  correct     boolean not null,
  elapsed_ms  integer check (elapsed_ms is null or elapsed_ms >= 0),
  created_at  timestamptz not null default now(),
  primary key (session_id, activity_id, user_id)
);

-- ---------------------------------------------------------------------------
-- class_attendance — who was in the room (first join).
-- ---------------------------------------------------------------------------
create table if not exists itera.class_attendance (
  session_id uuid not null references itera.class_sessions(id) on delete cascade,
  user_id    uuid not null references itera.users(id)          on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- RLS — self-write, self-or-staff read. Session visibility rides on the
-- class_sessions SELECT policy (the subqueries below run WITH RLS, so a user
-- can only attach rows to sessions they can actually see).
-- ---------------------------------------------------------------------------
alter table itera.class_answers    enable row level security;
alter table itera.class_attendance enable row level security;

drop policy if exists class_answers_insert_self on itera.class_answers;
create policy class_answers_insert_self on itera.class_answers
  for insert to authenticated
  with check (
    user_id = itera.current_itera_user_id()
    and session_id in (select s.id from itera.class_sessions s)
  );

-- Upsert (latest attempt wins after a professor reset) needs UPDATE on the
-- caller's own row.
drop policy if exists class_answers_update_self on itera.class_answers;
create policy class_answers_update_self on itera.class_answers
  for update to authenticated
  using (user_id = itera.current_itera_user_id())
  with check (user_id = itera.current_itera_user_id());

drop policy if exists class_answers_select on itera.class_answers;
create policy class_answers_select on itera.class_answers
  for select to authenticated
  using (
    user_id = itera.current_itera_user_id()
    or session_id in (
      select s.id from itera.class_sessions s
      where s.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

drop policy if exists class_attendance_insert_self on itera.class_attendance;
create policy class_attendance_insert_self on itera.class_attendance
  for insert to authenticated
  with check (
    user_id = itera.current_itera_user_id()
    and session_id in (select s.id from itera.class_sessions s)
  );

drop policy if exists class_attendance_select on itera.class_attendance;
create policy class_attendance_select on itera.class_attendance
  for select to authenticated
  using (
    user_id = itera.current_itera_user_id()
    or session_id in (
      select s.id from itera.class_sessions s
      where s.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

-- No DELETE policies by design — the report is an audit trail; a professor
-- "reset" only overwrites the learner's own row via upsert.

-- ---------------------------------------------------------------------------
-- Grants — RLS still applies; these just allow the role to attempt access.
-- ---------------------------------------------------------------------------
grant select, insert, update on itera.class_answers    to authenticated;
grant select, insert         on itera.class_attendance to authenticated;
