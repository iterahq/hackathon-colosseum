-- Origin: agent. T6: preserve original ingest UUIDs before any later contraction.
-- Additive only. Applied migrations and immutable A2 manifests remain unchanged.
begin;
lock table learning.work_episodes in access exclusive mode nowait;
do $$
declare source_attribute record;
begin
 select a.atttypid,a.atttypmod,a.attnotnull,a.attgenerated,a.attidentity,
  exists(select 1 from pg_catalog.pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum) has_default
 into source_attribute from pg_catalog.pg_attribute a
 where a.attrelid='learning.work_episodes'::regclass and a.attname='source_ingest_batch_id'
  and a.attnum>0 and not a.attisdropped;
 if found and (source_attribute.atttypid<>'pg_catalog.uuid'::regtype
  or source_attribute.atttypmod<>-1 or source_attribute.attnotnull
  or source_attribute.attgenerated<>'' or source_attribute.attidentity<>''
  or source_attribute.has_default) then
  raise exception 'Existing source ingest column must be nullable UUID without default or generation' using errcode='22023';
 end if;
 if not exists(select 1 from pg_catalog.pg_attribute where attrelid='learning.work_episodes'::regclass
  and attname='source_ingest_batch_id' and attnum>0 and not attisdropped) then
  alter table learning.work_episodes add column source_ingest_batch_id uuid;
  update learning.work_episodes set source_ingest_batch_id=ingest_batch_id;
 end if;
 -- Replay audits existing values; it never repairs a disagreement silently.
 if exists(select 1 from learning.work_episodes where source_ingest_batch_id is distinct from ingest_batch_id) then
  raise exception 'Original ingest source differs during coexistence' using errcode='22023';
 end if;
end $$;
-- A row cannot distinguish omitted nullable inputs from explicit NULL. Audited
-- current v1/v2 writers omit BOTH fields. A future non-null adapter must provide
-- BOTH equal UUIDs. No automatic one-sided mirroring or privileged writer bypass.
alter table learning.work_episodes drop constraint if exists work_episodes_source_ingest_equal;
alter table learning.work_episodes add constraint work_episodes_source_ingest_equal
 check(source_ingest_batch_id is not distinct from ingest_batch_id);
comment on column learning.work_episodes.source_ingest_batch_id is 'Exact original nullable ingest batch UUID; paired values must agree during coexistence. No invented batch or inferred source.';

create or replace function learning.export_work_episode_columns()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
 if current_user <> 'authenticated' or itera.current_itera_user_id() is null then
  raise exception 'An authenticated caller identity is required' using errcode='42501';
 end if;
 if not pg_catalog.has_table_privilege(current_user,'learning.work_episodes','SELECT') then
  raise exception 'Work episode SELECT privilege is required' using errcode='42501';
 end if;
 return (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'name',a.attname::text,'udt_schema',n.nspname::text,'udt_name',t.typname::text,'nullable',not a.attnotnull)
   order by a.attname::text collate "C")
  from pg_catalog.pg_attribute a join pg_catalog.pg_type t on t.oid=a.atttypid
  join pg_catalog.pg_namespace n on n.oid=t.typnamespace
  where a.attrelid='learning.work_episodes'::pg_catalog.regclass and a.attnum>0 and not a.attisdropped);
end $$;

create or replace function learning.a2_legacy_episode_row(p_row learning.work_episodes,p_kind text)
returns jsonb language plpgsql immutable parallel safe security invoker
set search_path = pg_catalog, learning set TimeZone = 'UTC' as $$
declare original jsonb:=to_jsonb(p_row);
begin
 if p_kind not in ('turn','session') or p_kind is null then
  raise exception 'A2 episode projection requires turn or session kind' using errcode='22023';
 end if;
 -- The composite column is UUID-typed. Its SQL NULL is an original JSON null.
 -- Existing physical values are cross-checked until a later reviewed drop.
 if original ? 'ingest_batch_id' and original->'ingest_batch_id' is distinct from
  coalesce(to_jsonb(p_row.source_ingest_batch_id),'null'::jsonb) then
  raise exception 'A2 original ingest source differs from physical value' using errcode='22023';
 end if;
 return learning.a2_frozen_row(original||jsonb_build_object('ingest_batch_id',p_row.source_ingest_batch_id),p_kind);
end $$;

create or replace function learning.verify_a2_manifest()
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, learning, itera
set TimeZone = 'UTC'
as $$
declare
 caller_id uuid; s learning.work_episodes; t learning.work_episodes; e learning.evidence;
 m learning.episode_moments; entry jsonb; context_row learning.work_contexts;
 session_ids uuid[]:='{}'; turn_ids uuid[]:='{}'; moment_ids uuid[]:='{}'; evidence_ids uuid[]:='{}';
 local_turn_ids uuid[]; local_refs text[]; earliest timestamptz; latest timestamptz;
 expected uuid; frozen_count bigint; dependencies jsonb;
 tag constant text:='0088_learning_session_regroup';
 cutoff constant timestamptz:='2026-09-07T18:30:00Z';
begin
 if current_user='authenticated' then
  caller_id:=itera.current_itera_user_id();
  if caller_id is null then raise exception 'A2 verification requires a caller identity' using errcode='42501'; end if;
 elsif current_user not in ('postgres','supabase_admin') then
  raise exception 'A2 verification requires an authenticated caller' using errcode='42501';
 end if;
 -- STABLE uses one statement snapshot. This function takes no locks and writes
 -- no temporary tables. A reversal must separately take the existing 0088 locks.
 for s in select * from learning.work_episodes
  where payload->>'regroup_migration'=tag and (caller_id is null or learner_id=caller_id) order by id
 loop
  session_ids:=array_append(session_ids,s.id);
  if s.grain is distinct from 'session' or s.session_episode_id is not null
   or (s.payload->>'freeze_before')::timestamptz is distinct from cutoff
   or (s.payload->>'session_gap_minutes')::integer is distinct from 30
   or jsonb_typeof(s.payload->'turn_manifest') is distinct from 'array'
   or jsonb_typeof(s.payload->'evidence_manifest') is distinct from 'array'
   or jsonb_array_length(s.payload->'turn_manifest')=0 then
   raise exception 'A2 manifest metadata invalid for session %',s.id using errcode='22023';
  end if;
  if s.payload->>'manifest_fingerprint' is distinct from encode(sha256(convert_to(
    (s.payload-array['manifest_fingerprint','session_fingerprint'])::text,'UTF8')),'hex')
   or s.payload->>'session_fingerprint' is distinct from encode(sha256(convert_to(
    learning.a2_legacy_episode_row(s,'session')::text,'UTF8')),'hex') then
   raise exception 'A2 manifest or session fingerprint changed for %',s.id using errcode='22023';
  end if;
  local_turn_ids:='{}';local_refs:='{}';earliest:=null;latest:=null;
  for entry in select value from jsonb_array_elements(s.payload->'turn_manifest') loop
   expected:=(entry->>'id')::uuid;
   if expected is null or expected=any(turn_ids) then
    raise exception 'A2 duplicate or missing original turn ID' using errcode='22023';
   end if;
   select * into t from learning.work_episodes where id=expected and learner_id=s.learner_id;
   if not found or t.session_episode_id is distinct from s.id or t.grain is distinct from 'turn'
    or t.created_at>cutoff or t.work_context_id is distinct from s.work_context_id
    or entry->>'fingerprint' is distinct from encode(sha256(convert_to(
     learning.a2_legacy_episode_row(t,'turn')::text,'UTF8')),'hex') then
    raise exception 'A2 original turn missing or changed: %',expected using errcode='22023';
   end if;
   select * into context_row from learning.work_contexts where id=t.work_context_id and learner_id=s.learner_id;
   if not found or context_row.project_root is null or context_row.machine is distinct from t.machine
    or context_row.machine_class is distinct from t.machine_class or t.started_at is null
    or t.ended_at<t.started_at then
    raise exception 'A2 original context tuple invalid: %',t.id using errcode='22023';
   end if;
   expected:=(entry->>'moment_id')::uuid;
   if expected is null or expected=any(moment_ids) then
    raise exception 'A2 duplicate or missing original moment ID' using errcode='22023';
   end if;
   select * into m from learning.episode_moments where id=expected and learner_id=s.learner_id;
   if not found or m.episode_id is distinct from s.id or m.kind is distinct from 'turn'
    or m.at is distinct from t.started_at or m.payload is distinct from jsonb_build_object(
     'regroup_migration',tag,'turn_episode_id',t.id,
     'digest_ref',jsonb_build_object('table','learning.work_episodes','id',t.id),'session_ref',t.session_ref) then
    raise exception 'A2 original moment missing or changed: %',expected using errcode='22023';
   end if;
   turn_ids:=array_append(turn_ids,t.id);local_turn_ids:=array_append(local_turn_ids,t.id);
   moment_ids:=array_append(moment_ids,m.id);
   if t.session_ref is not null then local_refs:=array_append(local_refs,t.session_ref); end if;
   earliest:=least(earliest,t.started_at);latest:=greatest(latest,coalesce(t.ended_at,t.started_at));
  end loop;
  if s.started_at is distinct from earliest or s.ended_at is distinct from latest
   or s.session_refs is distinct from array(select distinct r from unnest(local_refs)r order by r) then
   raise exception 'A2 session bounds or capture references changed: %',s.id using errcode='22023';
  end if;
  for entry in select value from jsonb_array_elements(s.payload->'evidence_manifest') loop
   expected:=(entry->>'id')::uuid;
   if expected is null or expected=any(evidence_ids) or (entry->>'turn_id') is null
    or not (entry->>'turn_id')::uuid=any(local_turn_ids) then
    raise exception 'A2 duplicate or invalid original evidence ID' using errcode='22023';
   end if;
   select * into e from learning.evidence where id=expected and learner_id=s.learner_id;
   if not found or e.episode_id is distinct from s.id
    or e.turn_episode_id is distinct from (entry->>'turn_id')::uuid
    or entry->>'fingerprint' is distinct from encode(sha256(convert_to(
     learning.a2_legacy_evidence_row(e)::text,'UTF8')),'hex') then
    raise exception 'A2 original evidence missing or changed: %',expected using errcode='22023';
   end if;
   evidence_ids:=array_append(evidence_ids,e.id);
  end loop;
 end loop;
 select count(*) into frozen_count from learning.work_episodes
  where grain='turn' and created_at<=cutoff and (caller_id is null or learner_id=caller_id);
 if frozen_count<>cardinality(turn_ids) or exists(select 1 from learning.work_episodes
  where grain='turn' and created_at<=cutoff and (caller_id is null or learner_id=caller_id) and not id=any(turn_ids)) then
  raise exception 'A2 manifest omits original frozen turns' using errcode='22023';
 end if;
 -- Later legitimate rows do not invalidate immutable history. These counts are
 -- diagnostic only; they never authorize a reverse or replace its all-FK scan.
 dependencies:=jsonb_build_object(
  'evidence',(select count(*) from learning.evidence where episode_id=any(session_ids) and (caller_id is null or learner_id=caller_id) and not id=any(evidence_ids)),
  'moments',(select count(*) from learning.episode_moments where episode_id=any(session_ids) and (caller_id is null or learner_id=caller_id) and not id=any(moment_ids)),
  'turns',(select count(*) from learning.work_episodes where session_episode_id=any(session_ids) and (caller_id is null or learner_id=caller_id) and not id=any(turn_ids)),
  'extraction_passes',(select count(*) from learning.extraction_passes where episode_id=any(session_ids) and (caller_id is null or learner_id=caller_id)),
  'residue_repasses',(select count(*) from learning.residue_repasses where episode_id=any(session_ids) and (caller_id is null or learner_id=caller_id)),
  'residue',(select count(*) from learning.residue where episode_id=any(session_ids) and (caller_id is null or learner_id=caller_id)));
 return jsonb_build_object('contract','a2-native-projection/v1','verified',true,
  'sessions',cardinality(session_ids),'turns',cardinality(turn_ids),'moments',cardinality(moment_ids),
  'evidence',cardinality(evidence_ids),'later_dependencies',dependencies,'reverse_checked',false);
end $$;

revoke all on function learning.export_work_episode_columns(),
 learning.a2_legacy_episode_row(learning.work_episodes,text) from public,anon,service_role;
grant execute on function learning.export_work_episode_columns(),
 learning.a2_legacy_episode_row(learning.work_episodes,text) to authenticated;
comment on function learning.export_work_episode_columns() is 'Read-only physical work episode descriptors for exact export inventories. Authenticated resolved caller and SELECT privilege required; no arguments or identity override.';
notify pgrst,'reload schema';
commit;
