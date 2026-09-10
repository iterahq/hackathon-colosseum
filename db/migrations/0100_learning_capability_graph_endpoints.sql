-- Itera migration 0100 — additive capability endpoints for the learning graph.
--
-- This migration changes graph shape only. It moves no production row.
-- Callers later move reviewed rows through two SECURITY INVOKER functions.
-- Each call supplies the complete original row preimage. The database derives
-- capability targets from the retained capabilities.concept_id pointers.
--
-- Plan: 20260909-itera-capability-graph-transition, task T2.
begin;

alter table learning.concept_relations
  alter column from_concept_id drop not null,
  alter column to_concept_id drop not null,
  add column if not exists from_capability_id text,
  add column if not exists to_capability_id text;

alter table learning.concept_relations
  drop constraint if exists concept_relations_from_capability_fk;
alter table learning.concept_relations
  add constraint concept_relations_from_capability_fk
  foreign key (from_capability_id) references learning.capabilities(id)
  on update cascade on delete restrict;

alter table learning.concept_relations
  drop constraint if exists concept_relations_to_capability_fk;
alter table learning.concept_relations
  add constraint concept_relations_to_capability_fk
  foreign key (to_capability_id) references learning.capabilities(id)
  on update cascade on delete restrict;

alter table learning.concept_relations
  drop constraint if exists concept_relations_from_endpoint_xor;
alter table learning.concept_relations
  add constraint concept_relations_from_endpoint_xor
  check (num_nonnulls(from_concept_id, from_capability_id) = 1);

alter table learning.concept_relations
  drop constraint if exists concept_relations_to_endpoint_xor;
alter table learning.concept_relations
  add constraint concept_relations_to_endpoint_xor
  check (num_nonnulls(to_concept_id, to_capability_id) = 1);

alter table learning.concept_relations
  drop constraint if exists concept_relations_no_self_loop;
alter table learning.concept_relations
  drop constraint if exists concept_relations_no_typed_self_loop;
alter table learning.concept_relations
  add constraint concept_relations_no_typed_self_loop
  check (
    from_concept_id is distinct from to_concept_id
    or from_capability_id is distinct from to_capability_id
  );

-- Keep the original full index. Existing PostgREST writers name these three
-- columns in ON CONFLICT. A partial replacement cannot infer that conflict
-- target. PostgreSQL's NULL-distinct behavior leaves every typed shape valid.
create unique index if not exists uq_concept_relations_concept_capability
  on learning.concept_relations(from_concept_id, to_capability_id, relation_type)
  where from_concept_id is not null and to_capability_id is not null;
create unique index if not exists uq_concept_relations_capability_concept
  on learning.concept_relations(from_capability_id, to_concept_id, relation_type)
  where from_capability_id is not null and to_concept_id is not null;
create unique index if not exists uq_concept_relations_capability_capability
  on learning.concept_relations(from_capability_id, to_capability_id, relation_type)
  where from_capability_id is not null and to_capability_id is not null;
create index if not exists idx_concept_relations_from_capability
  on learning.concept_relations(from_capability_id)
  where from_capability_id is not null;
create index if not exists idx_concept_relations_to_capability
  on learning.concept_relations(to_capability_id)
  where to_capability_id is not null;

alter table learning.claim_concepts
  alter column concept_id drop not null,
  add column if not exists capability_id text;

alter table learning.claim_concepts
  drop constraint if exists claim_concepts_capability_fk;
alter table learning.claim_concepts
  add constraint claim_concepts_capability_fk
  foreign key (capability_id) references learning.capabilities(id)
  on update cascade on delete restrict;

alter table learning.claim_concepts
  drop constraint if exists claim_concepts_target_xor;
alter table learning.claim_concepts
  add constraint claim_concepts_target_xor
  check (num_nonnulls(concept_id, capability_id) = 1);

-- Keep the original full index for the existing (claim_id, concept_id)
-- ON CONFLICT writer. Typed rows contain a NULL concept_id and do not collide.
create unique index if not exists uq_claim_concepts_claim_capability
  on learning.claim_concepts(claim_id, capability_id)
  where capability_id is not null;
create index if not exists idx_claim_concepts_capability
  on learning.claim_concepts(capability_id)
  where capability_id is not null;

create or replace function learning.upsert_capability_graph_relations(
  p_rows jsonb
) returns table(id uuid, source jsonb)
language plpgsql
security invoker
set search_path = pg_catalog, learning, itera
as $$
declare
  input_count integer;
  input_row record;
  derived_from_capability_id text;
  derived_to_capability_id text;
  matching_ids uuid[];
  matching_count integer;
  matching_id uuid;
  matching_is_valid boolean;
begin
  if current_user <> 'authenticated' then
    raise exception using errcode = '42501',
      message = 'An authenticated caller is required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023',
      message = 'Relation rows must be a JSON array';
  end if;
  input_count := jsonb_array_length(p_rows);
  if input_count not between 1 and 1000 then
    raise exception using errcode = '22023',
      message = 'Relation rows must contain 1 to 1000 items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) <> 'object'
  ) then
    raise exception using errcode = '22023',
      message = 'Each relation row must be an object';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where (select array_agg(key order by key collate "C")
           from jsonb_object_keys(item) key)
      is distinct from array[
        'from_concept_id', 'relation_type', 'source', 'to_concept_id', 'updated_at'
      ]::text[]
       or jsonb_typeof(item->'from_concept_id') <> 'string'
       or jsonb_typeof(item->'to_concept_id') <> 'string'
       or jsonb_typeof(item->'relation_type') <> 'string'
       or jsonb_typeof(item->'source') <> 'object'
       or jsonb_typeof(item->'updated_at') <> 'string'
       or length(btrim(item->>'from_concept_id')) = 0
       or length(btrim(item->>'to_concept_id')) = 0
       or length(btrim(item->>'relation_type')) = 0
       or item->>'from_concept_id' = item->>'to_concept_id'
  ) then
    raise exception using errcode = '22023',
      message = 'A relation row has an invalid shape';
  end if;
  if input_count <> (
    select count(*)
    from (
      select item->>'from_concept_id', item->>'to_concept_id', item->>'relation_type'
      from jsonb_array_elements(p_rows) item
      group by 1, 2, 3
    ) distinct_rows
  ) then
    raise exception using errcode = '22023',
      message = 'Relation input tuples must be distinct';
  end if;

  -- Serialize shared-edge writers and freeze the complete physical pointer map.
  -- This closes the gap that separate partial indexes cannot close across shapes.
  lock table learning.capabilities in share mode;
  lock table learning.concept_relations in share row exclusive mode;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as expected(
      from_concept_id text,
      to_concept_id text,
      relation_type text,
      source jsonb,
      updated_at timestamptz
    )
    left join learning.concepts from_concept on from_concept.id = expected.from_concept_id
    left join learning.concepts to_concept on to_concept.id = expected.to_concept_id
    where from_concept.id is null or to_concept.id is null
  ) then
    raise exception using errcode = '23503',
      message = 'Every relation endpoint must reference an existing concept';
  end if;

  -- Different legacy tuples can denote one physical edge. Reject that batch
  -- before the first change, instead of relying on one of four physical indexes.
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as expected(
      from_concept_id text,
      to_concept_id text,
      relation_type text,
      source jsonb,
      updated_at timestamptz
    )
    left join learning.capabilities from_capability
      on from_capability.concept_id = expected.from_concept_id
    left join learning.capabilities to_capability
      on to_capability.concept_id = expected.to_concept_id
    group by
      case when from_capability.id is null then 'concept' else 'capability' end,
      coalesce(from_capability.id, expected.from_concept_id),
      case when to_capability.id is null then 'concept' else 'capability' end,
      coalesce(to_capability.id, expected.to_concept_id),
      expected.relation_type
    having count(*) > 1
  ) then
    raise exception using errcode = '22023',
      message = 'Relation inputs must have distinct derived logical edges';
  end if;

  for input_row in
    select
      input.item->>'from_concept_id' as from_concept_id,
      input.item->>'to_concept_id' as to_concept_id,
      input.item->>'relation_type' as relation_type,
      input.item->'source' as source,
      (input.item->>'updated_at')::timestamptz as updated_at,
      input.input_order
    from jsonb_array_elements(p_rows) with ordinality as input(item, input_order)
    order by input.input_order
  loop
    select capability.id into derived_from_capability_id
    from learning.capabilities capability
    where capability.concept_id = input_row.from_concept_id;
    select capability.id into derived_to_capability_id
    from learning.capabilities capability
    where capability.concept_id = input_row.to_concept_id;

    select array_agg(relation.id order by relation.id), count(*)
      into matching_ids, matching_count
    from learning.concept_relations relation
    left join learning.capabilities current_from_capability
      on current_from_capability.concept_id = relation.from_concept_id
    left join learning.capabilities current_to_capability
      on current_to_capability.concept_id = relation.to_concept_id
    where relation.relation_type = input_row.relation_type
      and case
        when relation.from_capability_id is not null then 'capability'
        when current_from_capability.id is not null then 'capability'
        else 'concept'
      end = case when derived_from_capability_id is null then 'concept' else 'capability' end
      and coalesce(
        relation.from_capability_id,
        current_from_capability.id,
        relation.from_concept_id
      ) = coalesce(derived_from_capability_id, input_row.from_concept_id)
      and case
        when relation.to_capability_id is not null then 'capability'
        when current_to_capability.id is not null then 'capability'
        else 'concept'
      end = case when derived_to_capability_id is null then 'concept' else 'capability' end
      and coalesce(
        relation.to_capability_id,
        current_to_capability.id,
        relation.to_concept_id
      ) = coalesce(derived_to_capability_id, input_row.to_concept_id);

    if matching_count > 1 then
      raise exception using errcode = 'P0001',
        message = 'A relation input has ambiguous mixed-shape matches';
    end if;

    if matching_count = 1 then
      matching_id := matching_ids[1];
      select
        (
          relation.from_concept_id is not distinct from input_row.from_concept_id
          and relation.to_concept_id is not distinct from input_row.to_concept_id
          and relation.from_capability_id is null
          and relation.to_capability_id is null
        )
        or
        (
          relation.from_concept_id is not distinct from
            case when derived_from_capability_id is null then input_row.from_concept_id else null end
          and relation.from_capability_id is not distinct from derived_from_capability_id
          and relation.to_concept_id is not distinct from
            case when derived_to_capability_id is null then input_row.to_concept_id else null end
          and relation.to_capability_id is not distinct from derived_to_capability_id
        )
        into matching_is_valid
      from learning.concept_relations relation
      where relation.id = matching_id;
      if not matching_is_valid then
        raise exception using errcode = 'P0001',
          message = 'A relation input matches a partial or conflicting endpoint state';
      end if;
      update learning.concept_relations relation
      set source = input_row.source,
          updated_at = input_row.updated_at
      where relation.id = matching_id;
    else
      insert into learning.concept_relations as inserted(
        from_concept_id,
        from_capability_id,
        to_concept_id,
        to_capability_id,
        relation_type,
        source,
        updated_at
      ) values (
        case when derived_from_capability_id is null then input_row.from_concept_id else null end,
        derived_from_capability_id,
        case when derived_to_capability_id is null then input_row.to_concept_id else null end,
        derived_to_capability_id,
        input_row.relation_type,
        input_row.source,
        input_row.updated_at
      ) returning inserted.id into matching_id;
    end if;

    id := matching_id;
    source := input_row.source;
    return next;
  end loop;
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023',
      message = 'A relation row contains an invalid typed value';
end;
$$;

create or replace function learning.migrate_capability_relation_endpoints(
  p_expected_rows jsonb
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, learning, itera
as $$
declare
  expected_count integer;
  locked_count integer;
  changed_count integer;
begin
  if current_user <> 'authenticated' or not itera.is_learning_operator() then
    raise exception using errcode = '42501',
      message = 'An authenticated learning operator is required';
  end if;
  if p_expected_rows is null or jsonb_typeof(p_expected_rows) <> 'array' then
    raise exception using errcode = '22023',
      message = 'Expected rows must be a JSON array';
  end if;
  expected_count := jsonb_array_length(p_expected_rows);
  if expected_count not between 1 and 100 then
    raise exception using errcode = '22023',
      message = 'Expected rows must contain 1 to 100 items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_expected_rows) item
    where jsonb_typeof(item) <> 'object'
  ) then
    raise exception using errcode = '22023',
      message = 'Each expected relation must be an object';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_expected_rows) item
    where (select array_agg(key order by key collate "C")
           from jsonb_object_keys(item) key)
      is distinct from array[
        'created_at', 'from_concept_id', 'id', 'relation_type',
        'source', 'to_concept_id', 'updated_at'
      ]::text[]
       or jsonb_typeof(item->'id') <> 'string'
       or jsonb_typeof(item->'from_concept_id') <> 'string'
       or jsonb_typeof(item->'to_concept_id') <> 'string'
       or jsonb_typeof(item->'relation_type') <> 'string'
       or jsonb_typeof(item->'source') <> 'object'
       or jsonb_typeof(item->'created_at') <> 'string'
       or jsonb_typeof(item->'updated_at') <> 'string'
       or length(btrim(item->>'from_concept_id')) = 0
       or length(btrim(item->>'to_concept_id')) = 0
       or length(btrim(item->>'relation_type')) = 0
  ) then
    raise exception using errcode = '22023',
      message = 'An expected relation has an invalid preimage';
  end if;
  if expected_count <> (
    select count(distinct (item->>'id')::uuid)
    from jsonb_array_elements(p_expected_rows) item
  ) then
    raise exception using errcode = '22023',
      message = 'Expected relation IDs must be distinct';
  end if;

  -- SHARE blocks every pointer INSERT/UPDATE while this transaction derives
  -- targets. Row locks alone cannot protect a concept that has no pointer yet.
  lock table learning.capabilities in share mode;
  lock table learning.concept_relations in share row exclusive mode;

  perform relation.id
  from learning.concept_relations relation
  join jsonb_to_recordset(p_expected_rows) as expected(
    id uuid,
    from_concept_id text,
    to_concept_id text,
    relation_type text,
    source jsonb,
    created_at timestamptz,
    updated_at timestamptz
  ) on expected.id = relation.id
  order by relation.id
  for update of relation;
  get diagnostics locked_count = row_count;
  if locked_count <> expected_count then
    raise exception using errcode = 'P0002',
      message = 'Every expected relation must be visible and present';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_expected_rows) as expected(
      id uuid,
      from_concept_id text,
      to_concept_id text,
      relation_type text,
      source jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
    left join learning.capabilities from_capability
      on from_capability.concept_id = expected.from_concept_id
    left join learning.capabilities to_capability
      on to_capability.concept_id = expected.to_concept_id
    where from_capability.id is null and to_capability.id is null
  ) then
    raise exception using errcode = 'P0002',
      message = 'Each relation needs at least one physical capability mapping';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_expected_rows) as expected(
      id uuid,
      from_concept_id text,
      to_concept_id text,
      relation_type text,
      source jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
    join learning.concept_relations relation on relation.id = expected.id
    left join learning.capabilities from_capability
      on from_capability.concept_id = expected.from_concept_id
    left join learning.capabilities to_capability
      on to_capability.concept_id = expected.to_concept_id
    where relation.relation_type is distinct from expected.relation_type
       or relation.source is distinct from expected.source
       or relation.created_at is distinct from expected.created_at
       or relation.updated_at is distinct from expected.updated_at
       or not (
         (
           relation.from_concept_id is not distinct from expected.from_concept_id
           and relation.to_concept_id is not distinct from expected.to_concept_id
           and relation.from_capability_id is null
           and relation.to_capability_id is null
         )
         or
         (
           (
             (from_capability.id is null
              and relation.from_concept_id is not distinct from expected.from_concept_id
              and relation.from_capability_id is null)
             or
             (from_capability.id is not null
              and relation.from_concept_id is null
              and relation.from_capability_id is not distinct from from_capability.id)
           )
           and
           (
             (to_capability.id is null
              and relation.to_concept_id is not distinct from expected.to_concept_id
              and relation.to_capability_id is null)
             or
             (to_capability.id is not null
              and relation.to_concept_id is null
              and relation.to_capability_id is not distinct from to_capability.id)
           )
         )
       )
  ) then
    raise exception using errcode = 'P0001',
      message = 'A relation differs from its original or derived preimage';
  end if;

  -- Four physical indexes cannot see that an old concept endpoint and its
  -- typed capability endpoint name the same logical node. Refuse that mixed
  -- duplicate before UPDATE so the caller gets one stable domain error.
  if exists (
    with expected as (
      select *
      from jsonb_to_recordset(p_expected_rows) as item(
        id uuid,
        from_concept_id text,
        to_concept_id text,
        relation_type text,
        source jsonb,
        created_at timestamptz,
        updated_at timestamptz
      )
    ), expected_final as (
      select
        expected.id,
        expected.relation_type,
        case when from_capability.id is null then 'concept' else 'capability' end
          as from_kind,
        coalesce(from_capability.id, expected.from_concept_id) as from_id,
        case when to_capability.id is null then 'concept' else 'capability' end
          as to_kind,
        coalesce(to_capability.id, expected.to_concept_id) as to_id
      from expected
      left join learning.capabilities from_capability
        on from_capability.concept_id = expected.from_concept_id
      left join learning.capabilities to_capability
        on to_capability.concept_id = expected.to_concept_id
    ), current_final as (
      select
        relation.id,
        relation.relation_type,
        case
          when relation.from_capability_id is not null
            or from_capability.id is not null then 'capability'
          else 'concept'
        end as from_kind,
        coalesce(
          relation.from_capability_id,
          from_capability.id,
          relation.from_concept_id
        ) as from_id,
        case
          when relation.to_capability_id is not null
            or to_capability.id is not null then 'capability'
          else 'concept'
        end as to_kind,
        coalesce(
          relation.to_capability_id,
          to_capability.id,
          relation.to_concept_id
        ) as to_id
      from learning.concept_relations relation
      left join learning.capabilities from_capability
        on from_capability.concept_id = relation.from_concept_id
      left join learning.capabilities to_capability
        on to_capability.concept_id = relation.to_concept_id
    )
    select 1
    from expected_final expected
    join current_final current
      on current.id <> expected.id
     and current.relation_type = expected.relation_type
     and current.from_kind = expected.from_kind
     and current.from_id = expected.from_id
     and current.to_kind = expected.to_kind
     and current.to_id = expected.to_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'A mixed-shape relation duplicates the derived edge';
  end if;

  with expected as (
    select *
    from jsonb_to_recordset(p_expected_rows) as item(
      id uuid,
      from_concept_id text,
      to_concept_id text,
      relation_type text,
      source jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ), mapped as (
    select
      expected.*,
      from_capability.id as derived_from_capability_id,
      to_capability.id as derived_to_capability_id
    from expected
    left join learning.capabilities from_capability
      on from_capability.concept_id = expected.from_concept_id
    left join learning.capabilities to_capability
      on to_capability.concept_id = expected.to_concept_id
  )
  update learning.concept_relations relation
  set
    from_concept_id = case
      when mapped.derived_from_capability_id is null then mapped.from_concept_id
      else null
    end,
    from_capability_id = mapped.derived_from_capability_id,
    to_concept_id = case
      when mapped.derived_to_capability_id is null then mapped.to_concept_id
      else null
    end,
    to_capability_id = mapped.derived_to_capability_id
  from mapped
  where relation.id = mapped.id
    and relation.from_concept_id is not distinct from mapped.from_concept_id
    and relation.to_concept_id is not distinct from mapped.to_concept_id
    and relation.from_capability_id is null
    and relation.to_capability_id is null;
  get diagnostics changed_count = row_count;
  return changed_count;
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023',
      message = 'An expected relation contains an invalid typed value';
end;
$$;

create or replace function learning.migrate_claim_concept_capability_links(
  p_expected_rows jsonb
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, learning, itera
as $$
declare
  expected_count integer;
  locked_count integer;
  changed_count integer;
begin
  if current_user <> 'authenticated' then
    raise exception using errcode = '42501',
      message = 'An authenticated learner is required';
  end if;
  if p_expected_rows is null or jsonb_typeof(p_expected_rows) <> 'array' then
    raise exception using errcode = '22023',
      message = 'Expected rows must be a JSON array';
  end if;
  expected_count := jsonb_array_length(p_expected_rows);
  if expected_count not between 1 and 100 then
    raise exception using errcode = '22023',
      message = 'Expected rows must contain 1 to 100 items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_expected_rows) item
    where jsonb_typeof(item) <> 'object'
  ) then
    raise exception using errcode = '22023',
      message = 'Each expected claim link must be an object';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_expected_rows) item
    where (select array_agg(key order by key collate "C")
           from jsonb_object_keys(item) key)
      is distinct from array[
        'claim_id', 'concept_id', 'created_at', 'id', 'learner_id', 'relation'
      ]::text[]
       or jsonb_typeof(item->'id') <> 'string'
       or jsonb_typeof(item->'claim_id') <> 'string'
       or jsonb_typeof(item->'learner_id') <> 'string'
       or jsonb_typeof(item->'concept_id') <> 'string'
       or jsonb_typeof(item->'relation') <> 'string'
       or jsonb_typeof(item->'created_at') <> 'string'
       or length(btrim(item->>'concept_id')) = 0
       or length(btrim(item->>'relation')) = 0
  ) then
    raise exception using errcode = '22023',
      message = 'An expected claim link has an invalid preimage';
  end if;
  if expected_count <> (
    select count(distinct (item->>'id')::uuid)
    from jsonb_array_elements(p_expected_rows) item
  ) then
    raise exception using errcode = '22023',
      message = 'Expected claim-link IDs must be distinct';
  end if;

  lock table learning.capabilities in share mode;
  lock table learning.claim_concepts in share row exclusive mode;

  perform link.id
  from learning.claim_concepts link
  join jsonb_to_recordset(p_expected_rows) as expected(
    id uuid,
    claim_id uuid,
    learner_id uuid,
    concept_id text,
    relation text,
    created_at timestamptz
  ) on expected.id = link.id
  order by link.id
  for update of link;
  get diagnostics locked_count = row_count;
  if locked_count <> expected_count then
    raise exception using errcode = 'P0002',
      message = 'Every expected claim link must be visible and present';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_expected_rows) as expected(
      id uuid,
      claim_id uuid,
      learner_id uuid,
      concept_id text,
      relation text,
      created_at timestamptz
    )
    left join learning.capabilities capability
      on capability.concept_id = expected.concept_id
    where capability.id is null
  ) then
    raise exception using errcode = 'P0002',
      message = 'Every claim link needs a physical capability mapping';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_expected_rows) as expected(
      id uuid,
      claim_id uuid,
      learner_id uuid,
      concept_id text,
      relation text,
      created_at timestamptz
    )
    join learning.claim_concepts link on link.id = expected.id
    join learning.capabilities capability
      on capability.concept_id = expected.concept_id
    where link.claim_id is distinct from expected.claim_id
       or link.learner_id is distinct from expected.learner_id
       or link.relation is distinct from expected.relation
       or link.created_at is distinct from expected.created_at
       or not (
         (
           link.concept_id is not distinct from expected.concept_id
           and link.capability_id is null
         )
         or
         (
           link.concept_id is null
           and link.capability_id is not distinct from capability.id
         )
       )
  ) then
    raise exception using errcode = 'P0001',
      message = 'A claim link differs from its original or derived preimage';
  end if;

  if exists (
    with expected as (
      select *
      from jsonb_to_recordset(p_expected_rows) as item(
        id uuid,
        claim_id uuid,
        learner_id uuid,
        concept_id text,
        relation text,
        created_at timestamptz
      )
    ), expected_final as (
      select expected.id, expected.claim_id, capability.id as capability_id
      from expected
      join learning.capabilities capability
        on capability.concept_id = expected.concept_id
    ), current_final as (
      select
        link.id,
        link.claim_id,
        coalesce(link.capability_id, capability.id) as capability_id
      from learning.claim_concepts link
      left join learning.capabilities capability
        on capability.concept_id = link.concept_id
    )
    select 1
    from expected_final expected
    join current_final current
      on current.id <> expected.id
     and current.claim_id = expected.claim_id
     and current.capability_id = expected.capability_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'A mixed-shape claim link duplicates the derived target';
  end if;

  with expected as (
    select *
    from jsonb_to_recordset(p_expected_rows) as item(
      id uuid,
      claim_id uuid,
      learner_id uuid,
      concept_id text,
      relation text,
      created_at timestamptz
    )
  ), mapped as (
    select expected.*, capability.id as derived_capability_id
    from expected
    join learning.capabilities capability
      on capability.concept_id = expected.concept_id
  )
  update learning.claim_concepts link
  set concept_id = null,
      capability_id = mapped.derived_capability_id
  from mapped
  where link.id = mapped.id
    and link.concept_id is not distinct from mapped.concept_id
    and link.capability_id is null;
  get diagnostics changed_count = row_count;
  return changed_count;
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023',
      message = 'An expected claim link contains an invalid typed value';
end;
$$;

revoke all on function learning.upsert_capability_graph_relations(jsonb)
  from public, anon, service_role;
grant execute on function learning.upsert_capability_graph_relations(jsonb)
  to authenticated;
revoke all on function learning.migrate_capability_relation_endpoints(jsonb)
  from public, anon, service_role;
grant execute on function learning.migrate_capability_relation_endpoints(jsonb)
  to authenticated;
revoke all on function learning.migrate_claim_concept_capability_links(jsonb)
  from public, anon, service_role;
grant execute on function learning.migrate_claim_concept_capability_links(jsonb)
  to authenticated;

comment on function learning.migrate_capability_relation_endpoints(jsonb) is
  'Moves reviewed relation endpoints through locked capabilities.concept_id pointers. Requires an operator JWT and complete original row preimages. Exact replay returns zero.';
comment on function learning.migrate_claim_concept_capability_links(jsonb) is
  'Moves reviewed owner-scoped claim links through locked capabilities.concept_id pointers. Requires complete original row preimages. Exact replay returns zero.';
comment on function learning.upsert_capability_graph_relations(jsonb) is
  'Atomically upserts dual-shape shared relations through locked physical capability pointers. Uses the existing authenticated shared-edge policy and returns stable row IDs with sources.';

comment on column learning.concept_relations.from_capability_id is
  'Typed capability endpoint. Exactly one from endpoint column is present.';
comment on column learning.concept_relations.to_capability_id is
  'Typed capability endpoint. Exactly one to endpoint column is present.';
comment on column learning.claim_concepts.capability_id is
  'Typed capability target. Exactly one target column is present.';

notify pgrst, 'reload schema';
commit;
