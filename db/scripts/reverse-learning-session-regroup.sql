-- Origin: agent. Review/local-test rollback artifact, not an automatically applied migration.
-- Production rollback requires a new reviewed migration. Never run this through prod psql.
begin;
set local transaction isolation level read committed;
lock table learning.evidence,learning.work_episodes,learning.work_contexts,learning.episode_moments,
 learning.residue,learning.extraction_passes in share row exclusive mode nowait;
do $$
declare actor uuid; ref record; has_refs boolean; changed integer;
 -- Fingerprint keys are pinned to 0088; later additive columns cannot invalidate replay.
 turn_keys constant text[]:=array['id','learner_id','source','machine','session_ref','project_ref','started_at','ended_at','user_prompt','agent_summary','payload','schema_version','ingest_batch_id','created_at','machine_class','work_context_id','agent_version','session_refs','grain'];
 session_keys constant text[]:=array['id','learner_id','source','machine','session_ref','project_ref','started_at','ended_at','user_prompt','agent_summary','schema_version','ingest_batch_id','created_at','machine_class','work_context_id','agent_version','session_refs','grain','session_episode_id'];
 evidence_keys constant text[]:=array['id','claim_id','learner_id','activity_response_id','observed','actor','direction','strength','confidence','provenance','created_at','misconception_id','moment_id','extractor','prompt_version','model','model_version','relevance_extractor','relevance_model','activity_id','activity_kind','source','surface','assessment_method','artifact_id'];

begin
 if current_user not in('postgres','supabase_admin')then raise exception 'Historical reverse requires migration authority' using errcode='42501';end if;
 create temporary table a2_reverse_sessions on commit drop as
 select * from learning.work_episodes where payload->>'regroup_migration'='0088_learning_session_regroup';
 if not exists(select 1 from a2_reverse_sessions)then return;end if;
 for actor in select distinct learner_id from a2_reverse_sessions order by learner_id loop
  if not pg_try_advisory_xact_lock(hashtextextended('learning.evidence.status:'||actor::text,0))then
   raise exception 'A learner writer is busy; retry reverse after it commits' using errcode='55P03';end if;
 end loop;
 if exists(select 1 from a2_reverse_sessions s where true and (
  s.payload->>'manifest_fingerprint' is distinct from encode(sha256(convert_to((s.payload-array['manifest_fingerprint','session_fingerprint'])::text,'UTF8')),'hex')
  or s.payload->>'session_fingerprint' is distinct from encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(to_jsonb(s))j(k,v)where k=any(session_keys))::text,'UTF8')),'hex')))
 then raise exception 'Historical regroup manifest or session metadata changed';end if;
 -- Lock parent keys before inspecting all dependent tables. A new FK reference cannot race the guard.
 perform 1 from learning.work_episodes where id in(select id from a2_reverse_sessions)order by id for update nowait;
 create temporary table a2_reverse_turns on commit drop as
 select s.id session_id,s.learner_id,(j.value->>'id')::uuid turn_id,(j.value->>'moment_id')::uuid moment_id,j.value->>'fingerprint' fingerprint
 from a2_reverse_sessions s cross join lateral jsonb_array_elements(s.payload->'turn_manifest')j;
 create temporary table a2_reverse_evidence on commit drop as
 select s.id session_id,(j.value->>'id')::uuid id,(j.value->>'turn_id')::uuid turn_id,j.value->>'fingerprint' fingerprint
 from a2_reverse_sessions s cross join lateral jsonb_array_elements(s.payload->'evidence_manifest')j;
 if exists(select 1 from a2_reverse_turns m left join learning.work_episodes t on t.id=m.turn_id
  where t.id is null or t.session_episode_id is distinct from m.session_id or t.learner_id is distinct from m.learner_id
   or m.fingerprint is distinct from encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(to_jsonb(t))j(k,v)where k=any(turn_keys))::text,'UTF8')),'hex'))
  or exists(select 1 from a2_reverse_evidence m left join learning.evidence e using(id)
   where e.id is null or e.episode_id is distinct from m.session_id or e.turn_episode_id is distinct from m.turn_id
    or m.fingerprint is distinct from encode(sha256(convert_to((select jsonb_object_agg(k,v)from jsonb_each(to_jsonb(e))j(k,v)where k=any(evidence_keys))::text,'UTF8')),'hex'))
  or exists(select 1 from a2_reverse_turns m left join learning.episode_moments e on e.id=m.moment_id
   left join learning.work_episodes t on t.id=m.turn_id
   where e.id is null or e.episode_id is distinct from m.session_id or e.kind<>'turn' or e.learner_id is distinct from m.learner_id or e.at is distinct from t.started_at
   or e.payload is distinct from jsonb_build_object('regroup_migration','0088_learning_session_regroup','turn_episode_id',t.id,
    'digest_ref',jsonb_build_object('table','learning.work_episodes','id',t.id),'session_ref',t.session_ref))then
  raise exception 'Reverse manifest is incomplete or original content changed';
 end if;
 perform 1 from learning.episode_moments where id in(select moment_id from a2_reverse_turns)order by id for update nowait;
 if exists(select 1 from learning.work_episodes where session_episode_id in(select id from a2_reverse_sessions)and id not in(select turn_id from a2_reverse_turns))
  or exists(select 1 from learning.evidence where episode_id in(select id from a2_reverse_sessions)and id not in(select id from a2_reverse_evidence))
  or exists(select 1 from learning.episode_moments where episode_id in(select id from a2_reverse_sessions)and id not in(select moment_id from a2_reverse_turns))then
  raise exception 'New turn, evidence, or moment depends on regroup sessions';
 end if;
 -- Inspect every current FK, including future schema additions, rather than an incomplete table list.
 for ref in
  select c.conrelid::regclass relation,a.attname column_name
  from pg_constraint c cross join lateral generate_subscripts(c.conkey,1)i
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[i]
  join pg_attribute target on target.attrelid=c.confrelid and target.attnum=c.confkey[i]
  where c.contype='f'and c.confrelid='learning.work_episodes'::regclass and target.attname='id'
   and not ((c.conrelid='learning.work_episodes'::regclass and a.attname='session_episode_id')
    or (c.conrelid='learning.evidence'::regclass and a.attname='episode_id')
    or (c.conrelid='learning.episode_moments'::regclass and a.attname='episode_id'))
 loop
  execute format('select exists(select 1 from %s where %I in(select id from a2_reverse_sessions))',ref.relation,ref.column_name)into has_refs;
  if has_refs then raise exception 'Reverse blocked by dependent rows in %',ref.relation;end if;
 end loop;
 for ref in
  select c.conrelid::regclass relation,a.attname column_name
  from pg_constraint c cross join lateral generate_subscripts(c.conkey,1)i
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[i]
  join pg_attribute target on target.attrelid=c.confrelid and target.attnum=c.confkey[i]
  where c.contype='f'and c.confrelid='learning.episode_moments'::regclass and target.attname='id'
 loop
  execute format('select exists(select 1 from %s where %I in(select moment_id from a2_reverse_turns))',ref.relation,ref.column_name)into has_refs;
  if has_refs then raise exception 'Reverse blocked by moment references in %',ref.relation;end if;
 end loop;
 update learning.evidence e set episode_id=m.turn_id,turn_episode_id=null from a2_reverse_evidence m where e.id=m.id;
 update learning.work_episodes t set session_episode_id=null from a2_reverse_turns m where t.id=m.turn_id;
 delete from learning.episode_moments where id in(select moment_id from a2_reverse_turns);
 delete from learning.work_episodes where id in(select id from a2_reverse_sessions);
 for actor in select distinct learner_id from a2_reverse_sessions order by learner_id loop
  changed:=learning.refresh_evidence_status_for_learner(actor);
  if changed<>0 then raise exception 'Reverse status projection differs from trigger';end if;
 end loop;
end $$;
commit;
