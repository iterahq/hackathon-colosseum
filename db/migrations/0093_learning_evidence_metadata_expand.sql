-- Origin: agent. Plan ADR-5/P4, native provenance EXPAND only.
-- Preserve JSON and the original eleven generated columns. Old writers remain valid.
-- Source references are exact text; operational UUID relationships stay separate.
begin;
lock table learning.evidence in access exclusive mode nowait;

do $$ begin
 if to_regclass('learning.residue_repasses') is null
 or to_regprocedure('learning.probe_authorization(text,text,text)') is null then
  raise exception 'Metadata expansion requires migrations0091 and0092 first';
 end if;
end $$;

create or replace function learning.evidence_metadata_keys(value jsonb)
returns text[] language sql immutable strict parallel safe security invoker
set search_path=pg_catalog as $$
 select coalesce(array_agg(key order by key collate "C"),'{}'::text[])
 from jsonb_object_keys(value) key;
$$;
create or replace function learning.evidence_metadata_integer(value jsonb)
returns integer language sql immutable strict parallel safe security invoker
set search_path=pg_catalog as $$
 select case when jsonb_typeof(value)='number' and value::text ~ '^-?(0|[1-9][0-9]*)$'
 then case when value::text::numeric between -2147483648 and 2147483647
 then value::text::integer end end;
$$;

alter table learning.evidence
 add column if not exists pass_id text generated always as (provenance->>'pass_id') stored,
 add column if not exists pass_at text generated always as (provenance->>'pass_at') stored,
 add column if not exists ontology_version integer generated always as (learning.evidence_metadata_integer(provenance->'ontology_version')) stored,
 add column if not exists quality text generated always as (provenance->>'quality') stored,
 add column if not exists observation_id text generated always as (provenance->>'observation_id') stored,
 add column if not exists capability_id text generated always as (provenance->>'capability_id') stored,
 add column if not exists provider text generated always as (provenance->>'provider') stored,
 add column if not exists source_residue_id text generated always as (provenance->>'source_residue_id') stored,
 add column if not exists source_pass_id text generated always as (provenance->>'source_pass_id') stored,
 add column if not exists digest_dropped_chars integer generated always as (learning.evidence_metadata_integer(provenance->'digest_dropped_chars')) stored,
 add column if not exists digest_backfill jsonb generated always as (provenance->'digest_backfill') stored,
 add column if not exists source_episode_ref text generated always as (provenance->>'episode_id') stored,
 add column if not exists source_activity_response_ref text generated always as (provenance->>'activity_response_id') stored,
 add column if not exists source_metadata_keys text[] generated always as (learning.evidence_metadata_keys(provenance)) stored;

-- Construct the exact old metadata object, including key absence and explicit null.
-- No SELECT occurs here: the row is a caller-supplied argument, under its own RLS read.
create or replace function learning.native_evidence_metadata(value learning.evidence)
returns jsonb language sql immutable strict parallel safe security invoker
set search_path=pg_catalog,learning as $$
 select coalesce(jsonb_object_agg(key,datum),'{}'::jsonb)
 from jsonb_each(jsonb_build_object(
  'extractor',value.extractor,'prompt_version',value.prompt_version,
  'model',value.model,'model_version',value.model_version,
  'relevance_extractor',value.relevance_extractor,'relevance_model',value.relevance_model,
  'activity_id',value.activity_id,'activity_kind',value.activity_kind,
  'source',value.source,'surface',value.surface,'assessment_method',value.assessment_method,
  'pass_id',value.pass_id,'pass_at',value.pass_at,'ontology_version',value.ontology_version,
  'quality',value.quality,'observation_id',value.observation_id,'capability_id',value.capability_id,
  'provider',value.provider,'source_residue_id',value.source_residue_id,'source_pass_id',value.source_pass_id,
  'digest_dropped_chars',value.digest_dropped_chars,'digest_backfill',value.digest_backfill,
  'episode_id',value.source_episode_ref,'activity_response_id',value.source_activity_response_ref
 )) pair(key,datum)
 where key=any(value.source_metadata_keys);
$$;
create or replace function learning.assert_evidence_metadata_lossless(value learning.evidence)
returns void language plpgsql immutable strict parallel safe security invoker
set search_path=pg_catalog,learning as $$
begin
 if learning.native_evidence_metadata(value)::text is distinct from value.provenance::text then
  raise exception 'Evidence metadata is not lossless for row %',value.id using errcode='23514';
 end if;
end $$;

revoke all on function learning.evidence_metadata_keys(jsonb),learning.evidence_metadata_integer(jsonb),
 learning.native_evidence_metadata(learning.evidence),learning.assert_evidence_metadata_lossless(learning.evidence)
 from public,anon,service_role;
grant execute on function learning.evidence_metadata_keys(jsonb),learning.evidence_metadata_integer(jsonb),
 learning.native_evidence_metadata(learning.evidence),learning.assert_evidence_metadata_lossless(learning.evidence)
 to authenticated;

-- Fail the complete migration if any existing key/type cannot be represented.
-- Future legacy writes retain their original JSON. Run this same strict audit
-- before reader conversion and contraction; unknown keys can never be dropped silently.
do $$ declare row learning.evidence; begin
 for row in select * from learning.evidence loop
  perform learning.assert_evidence_metadata_lossless(row);
 end loop;
end $$;
comment on column learning.evidence.pass_at is 'Exact source pass timestamp text. Preserve lexical JS ordering and original spelling; do not normalize to timestamptz.';
comment on column learning.evidence.source_episode_ref is 'Exact optional episode_id metadata value. Historical rows name original turns while the real episode_id points to regrouped sessions.';
comment on column learning.evidence.source_metadata_keys is 'Exact sorted metadata key presence. Distinguishes absent keys from explicit JSON null during native reconstruction.';
comment on column learning.evidence.digest_backfill is 'Exact structured historical baseline from the immutable digest extraction receipt; timestamp spelling and ID arrays remain unchanged.';
notify pgrst,'reload schema';
commit;
