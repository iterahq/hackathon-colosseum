-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Lesson rules, round 2 (additive, idempotent).
--
-- `itera.record_graded_attempt` also returns the learner it resolved (`user_id`),
-- so the `grade` function can charge a life for a miss it graded without a second
-- lookup. Same writes as before; the new key is ignored by an older function.
-- ============================================================================

create or replace function itera.record_graded_attempt(
  p_subject text,
  p_activity_id uuid,
  p_lesson_id uuid,
  p_kind text,
  p_mode text,
  p_passed boolean,
  p_claimed_passed boolean,
  p_reason text,
  p_answer_hash text,
  p_spec_hash text,
  p_grader text,
  p_max_per_minute integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_recent integer;
  v_id uuid;
  v_at timestamptz;
begin
  select i.user_id into v_user from itera.identities as i where i.provider_subject = p_subject limit 1;
  if v_user is null then
    return jsonb_build_object('error', 'no_itera_profile');
  end if;

  select count(*) into v_recent
    from itera.graded_attempts as g
   where g.user_id = v_user and g.created_at >= now() - interval '60 seconds';
  if v_recent >= p_max_per_minute then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;

  insert into itera.graded_attempts
    (user_id, activity_id, lesson_id, kind, mode, passed, claimed_passed, reason, answer_hash, spec_hash, grader)
  values
    (v_user, p_activity_id, p_lesson_id, p_kind, p_mode, p_passed, p_claimed_passed, p_reason, p_answer_hash, p_spec_hash, p_grader)
  returning id, created_at into v_id, v_at;

  if p_passed then
    insert into itera.progress as p (user_id, activity_id, status, completed_at, written_by_client)
    values (v_user, p_activity_id, 'completed', v_at, false)
    on conflict (user_id, activity_id) do update
      set status = 'completed', completed_at = excluded.completed_at, written_by_client = false
      where p.status::text <> 'completed';
  else
    insert into itera.progress (user_id, activity_id, status, completed_at)
    values (v_user, p_activity_id, 'in_progress', null)
    on conflict (user_id, activity_id) do nothing;
  end if;

  return jsonb_build_object('attempt_id', v_id, 'graded_at', v_at, 'user_id', v_user);
end;
$$;

revoke all on function itera.record_graded_attempt(text, uuid, uuid, text, text, boolean, boolean, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function itera.record_graded_attempt(text, uuid, uuid, text, text, boolean, boolean, text, text, text, text, integer) to service_role;
