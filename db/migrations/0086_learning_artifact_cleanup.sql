-- T40: caller-owned, unreferenced artifact cleanup for the generic MCP tool.
-- Requires 0083's evidence lock protocol and 0084's artifact FK.
-- Schema only. No artifact or evidence row is changed by this migration.
begin;
create or replace function learning.delete_artifact(p_artifact_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, learning, itera
as $$
declare
  caller uuid := itera.current_itera_user_id();
  found_id uuid;
begin
  if current_user <> 'authenticated' or caller is null then
    raise exception using errcode='42501', message='A regular Itera user session is required';
  end if;
  if not exists(select 1 from learning.learners where id=caller) then
    raise exception using errcode='42501', message='A registered learner is required';
  end if;
  if p_artifact_id is null then
    raise exception using errcode='22023', message='An artifact id is required';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25000', message='Artifact cleanup requires READ COMMITTED isolation';
  end if;
  -- Match 0083 BEFORE taking the artifact row lock. Reversing the order can
  -- deadlock with the evidence FK or its ON DELETE SET NULL statement trigger.
  perform pg_advisory_xact_lock(hashtextextended('learning.evidence.status:'||caller::text,0));
  select id into found_id from learning.artifacts
    where id=p_artifact_id and learner_id=caller for update;
  if not found then
    raise exception using errcode='P0002', message='Artifact not found';
  end if;
  -- FOR UPDATE conflicts with FK key-share locks. This separate command sees
  -- the committed reference after any wait. RLS plus the composite FK ensures
  -- every reference to this owned artifact is visible to the caller.
  if exists(select 1 from learning.evidence where artifact_id=p_artifact_id and learner_id=caller) then
    raise exception using errcode='23503', message='Referenced artifacts cannot be deleted';
  end if;
  delete from learning.artifacts where id=p_artifact_id and learner_id=caller returning id into found_id;
  if not found then
    raise exception using errcode='P0002', message='Artifact not found';
  end if;
  return jsonb_build_object('artifact_id',found_id,'deleted',true);
end;
$$;
revoke all on function learning.delete_artifact(uuid) from public,anon,service_role;
grant execute on function learning.delete_artifact(uuid) to authenticated;
comment on function learning.delete_artifact(uuid) is 'Delete one owned artifact only when no evidence refers to it. SECURITY INVOKER; regular caller JWT; learner advisory lock before artifact row lock; READ COMMITTED required. Missing or foreign artifacts are indistinguishable.';
commit;
notify pgrst,'reload schema';
