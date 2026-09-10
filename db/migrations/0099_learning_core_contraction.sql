-- Origin: agent. Plan T6/P4 core contraction, after 0098 and deployed native readers.
-- Drop only physical evidence.provenance, checkpoints and generation_config.
-- Keep ingest_batch_id, native fields, concepts/links and capabilities.concept_id.
-- Immutable wire JSON and receipt/manifests remain byte-for-byte unchanged.
-- Historical migrations are a prefix; only the contracted suffix replays here.
begin;
lock table learning.evidence in access exclusive mode nowait;

do $$
declare legacy_count integer; e learning.evidence; g record;
 em learning.evidence_models; am learning.assembly_models;
begin
 if to_regprocedure('learning.verify_a2_manifest()') is null
 or to_regprocedure('learning.evidence_metadata_from_json(jsonb)') is null then
  raise exception 'Core contraction requires0095 and0097' using errcode='55000';
 end if;
 select (to_regclass('learning.checkpoints') is not null)::integer
  +(to_regclass('learning.generation_config') is not null)::integer
  +(exists(select 1 from pg_attribute where attrelid='learning.evidence'::regclass
     and attname='provenance' and not attisdropped))::integer into legacy_count;
 if legacy_count not in(0,3) then
  raise exception 'Partial core contraction is not an approved schema' using errcode='55000';
 end if;
 if legacy_count=3 then
  lock table learning.checkpoints,learning.generation_config in access exclusive mode nowait;
  lock table learning.evidence_models,learning.assembly_models,
   learning.evidence_model_objectives,learning.assembly_model_objectives in share mode nowait;
  if (select array_agg(attname::text order by attname collate "C") from pg_attribute where attrelid='learning.generation_config'::regclass and attnum>0 and not attisdropped)
   is distinct from array['cadence_max_per_hour','cadence_min_per_hour','daily_cap','decay_half_life_days','id','per_episode_cap','ranking_mode','strong_min_distinct_episodes','strong_min_distinct_projects','ttl_hours','updated_at','updated_by'] then
   raise exception 'Legacy configuration has an unaccounted field' using errcode='55000';
  end if;
  if exists(select 1 from learning.checkpoints) then
   raise exception 'Core contraction requires zero checkpoints; no data conversion is authorized' using errcode='55000';
  end if;
  if (select count(*)from learning.generation_config)<>1 then
   raise exception 'Core contraction requires the approved singleton config' using errcode='55000';
  end if;
  select * into strict g from learning.generation_config;
  if row(g.id,g.decay_half_life_days,g.strong_min_distinct_episodes,g.strong_min_distinct_projects,g.per_episode_cap,
      g.cadence_min_per_hour,g.cadence_max_per_hour,g.daily_cap,g.ttl_hours,g.ranking_mode)
    is distinct from row(1::smallint,30::numeric,3,2,3::numeric,1,5,5,48,'info_gain'::text)
   or g.updated_by is not null then
   raise exception 'Legacy configuration changed from its approved replacement boundary' using errcode='55000';
  end if;
  if (select count(*)from learning.evidence_models m where not exists(select 1 from learning.evidence_model_objectives l where l.evidence_model_id=m.id))<>1
   or (select count(*)from learning.assembly_models m where not exists(select 1 from learning.assembly_model_objectives l where l.assembly_model_id=m.id))<>1 then
   raise exception 'Model replacement must have exactly one zero-link default of each type' using errcode='55000';
  end if;
  select * into strict em from learning.evidence_models m where not exists(select 1 from learning.evidence_model_objectives l where l.evidence_model_id=m.id);
  select * into strict am from learning.assembly_models m where not exists(select 1 from learning.assembly_model_objectives l where l.assembly_model_id=m.id);
  if g.updated_at>em.created_at or g.updated_at>am.created_at then
   raise exception 'Legacy configuration changed after its model replacement was created' using errcode='55000';
  end if;
  if row(em.decay_half_life_days,em.strong_min_distinct_episodes,em.strong_min_distinct_projects,em.per_episode_cap)
    is distinct from row(g.decay_half_life_days,g.strong_min_distinct_episodes,g.strong_min_distinct_projects,g.per_episode_cap)
   or row(am.scope,am.cadence_min_per_hour,am.cadence_max_per_hour,am.daily_cap,am.ttl_hours,am.ranking_mode)
    is distinct from row('global'::text,g.cadence_min_per_hour,g.cadence_max_per_hour,g.daily_cap,g.ttl_hours,g.ranking_mode) then
   raise exception 'Model replacement does not preserve every legacy configuration value' using errcode='55000';
  end if;
  -- Invoke the still-installed0094 audit before replacing its physical body.
  for e in select * from learning.evidence loop
   perform learning.assert_evidence_metadata_lossless(e);
  end loop;
 end if;
 perform learning.verify_a2_manifest();
end $$;

-- Preserve the public signature/ACL. After contraction this checks native
-- validity; there is no physical JSON representation left to compare.
create or replace function learning.assert_evidence_metadata_lossless(value learning.evidence)
returns void language plpgsql immutable strict parallel safe security invoker
set search_path=pg_catalog,learning as $$
declare
 known_keys constant text[]:=array['extractor','prompt_version','model','model_version','relevance_extractor','relevance_model','activity_id','activity_kind','source','surface','assessment_method','pass_id','pass_at','ontology_version','quality','observation_id','capability_id','provider','source_residue_id','source_pass_id','digest_dropped_chars','digest_backfill','episode_id','activity_response_id'];
 sorted_keys text[]; all_fields jsonb;
begin
 if value.source_metadata_keys is null or cardinality(value.source_metadata_keys)=0
  or array_ndims(value.source_metadata_keys)<>1 or array_lower(value.source_metadata_keys,1)<>1 then
  raise exception 'Native metadata requires a nonempty one-dimensional key marker' using errcode='22023';
 end if;
 select array_agg(k order by k collate "C") into sorted_keys
  from(select distinct k from unnest(value.source_metadata_keys) k) keys;
 if value.source_metadata_keys is distinct from sorted_keys
  or array_position(value.source_metadata_keys,null) is not null
  or not value.source_metadata_keys <@ known_keys then
  raise exception 'Native metadata keys must be sorted, unique and known' using errcode='22023';
 end if;
 -- Reconstruct every typed field, including fields omitted from the marker,
 -- to reject a non-null value that the requested projection would discard.
 all_fields:=learning.native_evidence_metadata(jsonb_populate_record(value,jsonb_build_object('source_metadata_keys',known_keys)));
 if exists(select 1 from jsonb_each(all_fields) p where p.value<>'null'::jsonb
  and not(p.key=any(value.source_metadata_keys))) then
  raise exception 'Native metadata field is absent from key marker' using errcode='22023';
 end if;
 if value.digest_backfill is not null and not('digest_backfill'=any(value.source_metadata_keys)) then
  raise exception 'Native metadata field is absent from key marker' using errcode='22023';
 end if;
 if learning.native_evidence_metadata(value)='{}'::jsonb then
  raise exception 'Evidence metadata must be nonempty' using errcode='23514';
 end if;
end $$;
comment on function learning.assert_evidence_metadata_lossless(learning.evidence) is
 'After 0099, validates complete native metadata key presence and nonempty semantics. Physical/JSON lossless equality was checked under the contraction table lock; immutable wire constructors retain their separate exact equality check.';

create or replace function learning.bridge_evidence_metadata()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning as $$
begin
 perform learning.assert_evidence_metadata_lossless(NEW);
 return NEW;
end $$;
comment on function learning.bridge_evidence_metadata() is
 'After 0099, native-only validation under the existing trigger name/order. No JSON column read/write. Status-only updates preserve metadata and retain the0083 status projection locks.';
-- CREATE OR REPLACE retains existing narrow grants. Do not broaden ACLs.

do $$ declare e learning.evidence; begin
 for e in select * from learning.evidence loop
  perform learning.assert_evidence_metadata_lossless(e);
 end loop;
end $$;

-- No CASCADE: an unexpected dependent object blocks the complete transaction.
alter table learning.evidence drop column if exists provenance;
drop table if exists learning.checkpoints;
drop table if exists learning.generation_config;

-- The native0088 projection must still match each immutable stored manifest.
select learning.verify_a2_manifest();
notify pgrst,'reload schema';
commit;
