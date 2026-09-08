-- Origin: agent. Plan ADR-5/P4, staged native metadata writer bridge after0093.
-- Keep provenance JSON, every row and every existing grant/RLS/receipt contract.
-- Caller statement locks from0083 run before this row trigger. Controlled admin
-- regroup still takes its write-conflicting table lock before learner locks.
-- New native writers must supply the exact sorted key-presence marker.
-- Unknown legacy shapes now fail explicitly; the locked preflight prevents loss.
begin;
lock table learning.evidence in access exclusive mode nowait;
do $$ declare e learning.evidence; begin
 if exists(select 1 from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where a.attrelid='learning.evidence'::regclass and a.attname='provenance') then
  raise exception 'Metadata bridge requires provenance with no default' using errcode='55000';
 end if;
 for e in select * from learning.evidence loop perform learning.assert_evidence_metadata_lossless(e); end loop;
end $$;
alter table learning.evidence alter column extractor drop expression if exists,
 alter column prompt_version drop expression if exists,
 alter column model drop expression if exists,
 alter column model_version drop expression if exists,
 alter column relevance_extractor drop expression if exists,
 alter column relevance_model drop expression if exists,
 alter column activity_id drop expression if exists,
 alter column activity_kind drop expression if exists,
 alter column source drop expression if exists,
 alter column surface drop expression if exists,
 alter column assessment_method drop expression if exists,
 alter column pass_id drop expression if exists,
 alter column pass_at drop expression if exists,
 alter column ontology_version drop expression if exists,
 alter column quality drop expression if exists,
 alter column observation_id drop expression if exists,
 alter column capability_id drop expression if exists,
 alter column provider drop expression if exists,
 alter column source_residue_id drop expression if exists,
 alter column source_pass_id drop expression if exists,
 alter column digest_dropped_chars drop expression if exists,
 alter column digest_backfill drop expression if exists,
 alter column source_episode_ref drop expression if exists,
 alter column source_activity_response_ref drop expression if exists,
 alter column source_metadata_keys drop expression if exists;
create or replace function learning.bridge_evidence_metadata()
returns trigger language plpgsql security invoker set search_path=pg_catalog,learning as $$
declare json_changed boolean; native_changed boolean; reconstructed jsonb; expected_keys text[];
begin
 if TG_OP='UPDATE' then
  json_changed:=NEW.provenance::text is distinct from OLD.provenance::text;
  native_changed:=row(NEW.extractor,NEW.prompt_version,NEW.model,NEW.model_version,NEW.relevance_extractor,NEW.relevance_model,NEW.activity_id,NEW.activity_kind,NEW.source,NEW.surface,NEW.assessment_method,NEW.pass_id,NEW.pass_at,NEW.ontology_version,NEW.quality,NEW.observation_id,NEW.capability_id,NEW.provider,NEW.source_residue_id,NEW.source_pass_id,NEW.digest_dropped_chars,NEW.digest_backfill,NEW.source_episode_ref,NEW.source_activity_response_ref,NEW.source_metadata_keys) is distinct from row(OLD.extractor,OLD.prompt_version,OLD.model,OLD.model_version,OLD.relevance_extractor,OLD.relevance_model,OLD.activity_id,OLD.activity_kind,OLD.source,OLD.surface,OLD.assessment_method,OLD.pass_id,OLD.pass_at,OLD.ontology_version,OLD.quality,OLD.observation_id,OLD.capability_id,OLD.provider,OLD.source_residue_id,OLD.source_pass_id,OLD.digest_dropped_chars,OLD.digest_backfill,OLD.source_episode_ref,OLD.source_activity_response_ref,OLD.source_metadata_keys) or NEW.digest_backfill::text is distinct from OLD.digest_backfill::text;
  if not json_changed and not native_changed then return NEW; end if;
 else
  json_changed:=NEW.provenance is not null;
  native_changed:=NEW.source_metadata_keys is not null;
  if not native_changed and (NEW.extractor is not null or NEW.prompt_version is not null or NEW.model is not null or NEW.model_version is not null or NEW.relevance_extractor is not null or NEW.relevance_model is not null or NEW.activity_id is not null or NEW.activity_kind is not null or NEW.source is not null or NEW.surface is not null or NEW.assessment_method is not null or NEW.pass_id is not null or NEW.pass_at is not null or NEW.ontology_version is not null or NEW.quality is not null or NEW.observation_id is not null or NEW.capability_id is not null or NEW.provider is not null or NEW.source_residue_id is not null or NEW.source_pass_id is not null or NEW.digest_dropped_chars is not null or NEW.digest_backfill is not null or NEW.source_episode_ref is not null or NEW.source_activity_response_ref is not null) then
   raise exception 'Native metadata requires the key-presence marker' using errcode='22023';
  end if;
 end if;
 if native_changed then
  if NEW.source_metadata_keys is null then raise exception 'Native metadata requires the key-presence marker' using errcode='22023'; end if;
  select coalesce(array_agg(k order by k collate "C"),'{}'::text[]) into expected_keys from (select distinct k from unnest(NEW.source_metadata_keys) k) unique_keys;
  if NEW.source_metadata_keys is distinct from expected_keys or array_position(NEW.source_metadata_keys,null) is not null
   or not NEW.source_metadata_keys <@ array['extractor','prompt_version','model','model_version','relevance_extractor','relevance_model','activity_id','activity_kind','source','surface','assessment_method','pass_id','pass_at','ontology_version','quality','observation_id','capability_id','provider','source_residue_id','source_pass_id','digest_dropped_chars','digest_backfill','episode_id','activity_response_id'] then
   raise exception 'Native metadata keys must be sorted, unique and known' using errcode='22023';
  end if;
  if NEW.extractor is not null and not ('extractor'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.prompt_version is not null and not ('prompt_version'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.model is not null and not ('model'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.model_version is not null and not ('model_version'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.relevance_extractor is not null and not ('relevance_extractor'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.relevance_model is not null and not ('relevance_model'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.activity_id is not null and not ('activity_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.activity_kind is not null and not ('activity_kind'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.source is not null and not ('source'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.surface is not null and not ('surface'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.assessment_method is not null and not ('assessment_method'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.pass_id is not null and not ('pass_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.pass_at is not null and not ('pass_at'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.ontology_version is not null and not ('ontology_version'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.quality is not null and not ('quality'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.observation_id is not null and not ('observation_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.capability_id is not null and not ('capability_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.provider is not null and not ('provider'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.source_residue_id is not null and not ('source_residue_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.source_pass_id is not null and not ('source_pass_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.digest_dropped_chars is not null and not ('digest_dropped_chars'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.digest_backfill is not null and not ('digest_backfill'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.source_episode_ref is not null and not ('episode_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  if NEW.source_activity_response_ref is not null and not ('activity_response_id'=any(NEW.source_metadata_keys)) then raise exception 'Native metadata field is absent from key marker' using errcode='22023'; end if;
  reconstructed:=learning.native_evidence_metadata(NEW);
  if json_changed and NEW.provenance::text is distinct from reconstructed::text then
   raise exception 'Conflicting JSON and native evidence metadata' using errcode='22023';
  end if;
  NEW.provenance:=reconstructed;
 else
  if NEW.provenance is null or jsonb_typeof(NEW.provenance)<>'object' then
   raise exception 'Legacy metadata must be an object' using errcode='22023';
  end if;
  NEW.extractor:=NEW.provenance->>'extractor';
  NEW.prompt_version:=NEW.provenance->>'prompt_version';
  NEW.model:=NEW.provenance->>'model';
  NEW.model_version:=NEW.provenance->>'model_version';
  NEW.relevance_extractor:=NEW.provenance->>'relevance_extractor';
  NEW.relevance_model:=NEW.provenance->>'relevance_model';
  NEW.activity_id:=NEW.provenance->>'activity_id';
  NEW.activity_kind:=NEW.provenance->>'activity_kind';
  NEW.source:=NEW.provenance->>'source';
  NEW.surface:=NEW.provenance->>'surface';
  NEW.assessment_method:=NEW.provenance->>'assessment_method';
  NEW.pass_id:=NEW.provenance->>'pass_id';
  NEW.pass_at:=NEW.provenance->>'pass_at';
  NEW.ontology_version:=learning.evidence_metadata_integer(NEW.provenance->'ontology_version');
  NEW.quality:=NEW.provenance->>'quality';
  NEW.observation_id:=NEW.provenance->>'observation_id';
  NEW.capability_id:=NEW.provenance->>'capability_id';
  NEW.provider:=NEW.provenance->>'provider';
  NEW.source_residue_id:=NEW.provenance->>'source_residue_id';
  NEW.source_pass_id:=NEW.provenance->>'source_pass_id';
  NEW.digest_dropped_chars:=learning.evidence_metadata_integer(NEW.provenance->'digest_dropped_chars');
  NEW.digest_backfill:=NEW.provenance->'digest_backfill';
  NEW.source_episode_ref:=NEW.provenance->>'episode_id';
  NEW.source_activity_response_ref:=NEW.provenance->>'activity_response_id';
  NEW.source_metadata_keys:=learning.evidence_metadata_keys(NEW.provenance);
 end if;
 perform learning.assert_evidence_metadata_lossless(NEW);
 return NEW;
end $$;
revoke all on function learning.bridge_evidence_metadata() from public,anon,service_role;
grant execute on function learning.bridge_evidence_metadata() to authenticated;
drop trigger if exists evidence_metadata_bridge on learning.evidence;
create trigger evidence_metadata_bridge before insert or update on learning.evidence for each row execute function learning.bridge_evidence_metadata();
notify pgrst,'reload schema';
commit;
