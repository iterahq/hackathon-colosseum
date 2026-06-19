-- ============================================================================
-- Itera tenant-admin observability — VERIFICATION FIXTURE (deterministic UUIDs).
-- Plan: 20260619-itera-tenant-admin-metrics (gate V1/V2/V3).
--
-- Seeds, idempotently:
--   * Tenant A = Itera (96786037-…), Tenant B = Acme (0618cad6-…) already exist.
--   * 3 learners in Tenant A + 2 learners in Tenant B (itera.users + memberships).
--   * activity_results + progress for the Tenant-A learners (against Itera's
--     3 activities) so roster/completion/engagement render with data.
--   * 1 activity_result for a Tenant-B learner so cross-tenant denial is
--     observable (a Tenant-A admin must NEVER see it).
--
-- The tenant_admin auth user + its identity link are created out-of-band by the
-- verification script (Supabase admin API) — this file seeds the learner data
-- the admin observes. Re-runnable.
-- ============================================================================

-- Stable fixture UUIDs (fx_ prefix mnemonic in the high bits).
-- Tenant A learners
-- a1 11111111-…  a2 22222222-…  a3 33333333-…
-- Tenant B learners
-- b1 b1b1b1b1-…  b2 b2b2b2b2-…

insert into itera.users (id, email, display_name, locale) values
  ('11111111-1111-1111-1111-111111111111', 'a1@acme-fixture.itera.dev', 'Ana (Itera)',   'pt'),
  ('22222222-2222-2222-2222-222222222222', 'a2@acme-fixture.itera.dev', 'Bruno (Itera)', 'pt'),
  ('33333333-3333-3333-3333-333333333333', 'a3@acme-fixture.itera.dev', 'Carla (Itera)', 'en'),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'b1@acme-fixture.itera.dev', 'Dora (Acme)',   'pt'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'b2@acme-fixture.itera.dev', 'Eli (Acme)',    'en')
on conflict (id) do update set display_name = excluded.display_name;

-- Memberships: A-learners -> Itera tenant, B-learners -> Acme tenant.
insert into itera.memberships (user_id, tenant_id, role) values
  ('11111111-1111-1111-1111-111111111111', '96786037-6c76-47e0-959d-359a5fe02d56', 'learner'),
  ('22222222-2222-2222-2222-222222222222', '96786037-6c76-47e0-959d-359a5fe02d56', 'learner'),
  ('33333333-3333-3333-3333-333333333333', '96786037-6c76-47e0-959d-359a5fe02d56', 'learner'),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', '0618cad6-b829-4caf-9bae-c3932164383f', 'learner'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', '0618cad6-b829-4caf-9bae-c3932164383f', 'learner')
on conflict (user_id, tenant_id) do update set role = excluded.role;

-- ---------------------------------------------------------------------------
-- activity_results + progress for Tenant-A learners against Itera's activities.
-- Completion signal: activity_results.passed (bool) + progress.status.
-- We give each learner a different completion level so the metrics are visible:
--   Ana   -> all 3 passed (100%)
--   Bruno -> 2 of 3 passed
--   Carla -> 1 of 3 passed
-- ---------------------------------------------------------------------------
do $$
declare
  act uuid[];
  a1 uuid := '11111111-1111-1111-1111-111111111111';
  a2 uuid := '22222222-2222-2222-2222-222222222222';
  a3 uuid := '33333333-3333-3333-3333-333333333333';
  b1 uuid := 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
  bact uuid;
begin
  -- Itera (Tenant A) activities, ordered for determinism.
  select array_agg(a.id order by a.id) into act
  from itera.activities a
  join itera.lessons l on l.id = a.lesson_id
  join itera.units u   on u.id = l.unit_id
  join itera.programs p on p.id = u.program_id
  where p.tenant_id = '96786037-6c76-47e0-959d-359a5fe02d56';

  if act is null or array_length(act,1) < 3 then
    raise notice 'Tenant-A has < 3 activities (%); fixture partial', coalesce(array_length(act,1),0);
  end if;

  -- Helper-free explicit inserts (idempotent on (user_id, activity_id, attempt)
  -- — there is a unique on activity_results? fall back to delete+insert per pair).
  -- Clear prior fixture rows for these learners to stay idempotent.
  delete from itera.activity_results where user_id in (a1,a2,a3,b1);
  delete from itera.progress         where user_id in (a1,a2,a3,b1);

  -- Ana: 3/3
  if array_length(act,1) >= 1 then
    insert into itera.activity_results (user_id, activity_id, attempt, passed, score_internal, created_at)
      values (a1, act[1], 1, true, 95, now() - interval '5 days'),
             (a1, act[2], 1, true, 88, now() - interval '3 days'),
             (a1, act[3], 1, true, 92, now() - interval '1 days');
    insert into itera.progress (user_id, activity_id, status, completed_at)
      values (a1, act[1], 'completed', now() - interval '5 days'),
             (a1, act[2], 'completed', now() - interval '3 days'),
             (a1, act[3], 'completed', now() - interval '1 days');

    -- Bruno: 2/3
    insert into itera.activity_results (user_id, activity_id, attempt, passed, score_internal, created_at)
      values (a2, act[1], 1, true, 80, now() - interval '6 days'),
             (a2, act[2], 1, true, 75, now() - interval '4 days'),
             (a2, act[3], 1, false, 40, now() - interval '2 days');
    insert into itera.progress (user_id, activity_id, status, completed_at)
      values (a2, act[1], 'completed', now() - interval '6 days'),
             (a2, act[2], 'completed', now() - interval '4 days'),
             (a2, act[3], 'in_progress', null);

    -- Carla: 1/3
    insert into itera.activity_results (user_id, activity_id, attempt, passed, score_internal, created_at)
      values (a3, act[1], 1, true, 70, now() - interval '10 days');
    insert into itera.progress (user_id, activity_id, status, completed_at)
      values (a3, act[1], 'completed', now() - interval '10 days'),
             (a3, act[2], 'not_started', null),
             (a3, act[3], 'not_started', null);
  end if;

  -- Tenant-B learner: 1 result on a Tenant-B activity if one exists, else on a
  -- Tenant-A activity (still cross-tenant: B-learner is NOT in Tenant A, so a
  -- Tenant-A admin must not see this row regardless of which activity).
  select a.id into bact
  from itera.activities a
  join itera.lessons l on l.id = a.lesson_id
  join itera.units u   on u.id = l.unit_id
  join itera.programs p on p.id = u.program_id
  where p.tenant_id = '0618cad6-b829-4caf-9bae-c3932164383f'
  limit 1;

  if bact is null then
    bact := act[1]; -- fall back to a Tenant-A activity; scoping is by membership
  end if;

  if bact is not null then
    insert into itera.activity_results (user_id, activity_id, attempt, passed, score_internal, created_at)
      values (b1, bact, 1, true, 99, now() - interval '2 days');
    insert into itera.progress (user_id, activity_id, status, completed_at)
      values (b1, bact, 'completed', now() - interval '2 days');
  end if;
end $$;
