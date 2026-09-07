-- Gate B correction, plan 20260903-itera-learning-schema-v04-remodel.
-- 0079 is already merged: preserve its checksum. This file changes schema only.
-- Human merge required. Target: ITERA kjefmwlopzeaqgqtlbdn.
-- Residue decisions require an operator; the learner re-pass may advance the
-- ontology version. A proposal INSERT must not bypass the decision UPDATE gate.
begin;

-- Gate A (0078) must exist. The same index in 0080 makes either corrective
-- merge order safe. A moment belongs to both this episode and this learner.
create unique index if not exists uq_episode_moments_id_episode_learner
  on learning.episode_moments(id, episode_id, learner_id);
alter table learning.residue drop constraint if exists residue_moment_fk;
alter table learning.residue add constraint residue_moment_fk
  foreign key (moment_id, episode_id, learner_id)
  references learning.episode_moments(id, episode_id, learner_id)
  on delete set null (moment_id);

-- Q10=A and R.2: the extractor cannot mint vocabulary, including a private
-- row with learner_id=self. Only editorial operators write capabilities.
-- Keep the nullable owner for operator-managed overrides without exposing a
-- private override to another learner.
drop policy if exists capabilities_rw_self on learning.capabilities;
drop policy if exists capabilities_read_all on learning.capabilities;
drop policy if exists capabilities_rw_operator on learning.capabilities;
create policy capabilities_read_all on learning.capabilities
  for select using (learner_id is null
                    or learner_id = itera.current_itera_user_id()
                    or itera.is_learning_operator());
create policy capabilities_rw_operator on learning.capabilities
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());
comment on table learning.capabilities is
  'Versioned capability vocabulary. Only learning operators write rows. Learners read shared vocabulary and their own operator-managed overrides. Introduced/retired versions retain the editorial history; concept_id preserves lift provenance until merge D.';
comment on column learning.capabilities.learner_id is
  'NULL means shared vocabulary. A value means an operator-managed learner override. Learners can read their own overrides; only operators write vocabulary.';

-- A CHECK treats SQL NULL as success. JSON null must fail the presence check.
alter table learning.capabilities drop constraint if exists capabilities_source_names_kind;
alter table learning.capabilities add constraint capabilities_source_names_kind
  check (coalesce(jsonb_typeof(source->'kind') = 'string'
                 and length(btrim(source->>'kind')) > 0, false));

-- Both users have the authenticated DB role. Column grants alone cannot
-- reserve decision columns for the operator. Keep RLS for row ownership and
-- compare OLD/NEW in an invoker trigger for the decision columns.
create or replace function itera.guard_residue_decision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not itera.is_learning_operator() then
    if TG_OP = 'INSERT' then
      if new.status <> 'open' or new.promoted_to_capability_id is not null
         or new.promoted_by is not null or new.promoted_at is not null then
        raise exception 'residue decisions require a learning operator'
          using errcode = '42501';
      end if;
    elsif row(new.status, new.promoted_to_capability_id, new.promoted_by, new.promoted_at)
          is distinct from
          row(old.status, old.promoted_to_capability_id, old.promoted_by, old.promoted_at) then
      raise exception 'residue decisions require a learning operator'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function itera.guard_residue_decision() from public, anon, authenticated;
drop trigger if exists guard_residue_decision on learning.residue;
create trigger guard_residue_decision before insert or update on learning.residue
  for each row execute function itera.guard_residue_decision();

-- T15 must advance an open row's version when the new map still has no match.
-- Candidate and pass provenance remain immutable to both authenticated users.
grant update (ontology_version) on learning.residue to authenticated;

-- RLS still permits a learner to insert only a cluster it owns. The INSERT
-- now also requires the initial proposal shape, without binding a status enum.
drop policy if exists capability_proposals_insert_own_residue on learning.capability_proposals;
create policy capability_proposals_insert_own_residue on learning.capability_proposals
  for insert with check (
    status = 'proposed' and decided_by is null and decided_at is null
    and decision_note is null and capability_id is null and ontology_version is null
    and not exists (
      select 1 from unnest(residue_ids) as t(rid)
      where not exists (
        select 1 from learning.residue r
        where r.id = t.rid and r.learner_id = itera.current_itera_user_id()
      )
    )
  );

-- A learner-owned override must not attach another learner's state or residue.
-- Shared templates/proposals may reference only shared vocabulary. RLS protects
-- writes to the referencing row; this trigger protects the reference itself.
create or replace function itera.guard_learning_capability_reference()
returns trigger language plpgsql set search_path = '' as $$
declare
  row_data jsonb := to_jsonb(new);
  row_owner uuid := (row_data->>'learner_id')::uuid;
  field_name text;
  capability_ref text;
begin
  foreach field_name in array TG_ARGV loop
    capability_ref := row_data->>field_name;
    if capability_ref is not null and not exists (
      select 1 from learning.capabilities c
      where c.id = capability_ref
        and (c.learner_id is null or c.learner_id = row_owner)
    ) then
      raise exception 'capability reference must be shared or belong to the row learner'
        using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
revoke all on function itera.guard_learning_capability_reference() from public, anon, authenticated;

drop trigger if exists guard_capability_reference on learning.capability_states;
create trigger guard_capability_reference before insert or update on learning.capability_states
  for each row execute function itera.guard_learning_capability_reference('capability_id');
drop trigger if exists guard_capability_reference on learning.residue;
create trigger guard_capability_reference before insert or update on learning.residue
  for each row execute function itera.guard_learning_capability_reference('nearest_capability_id', 'promoted_to_capability_id');
drop trigger if exists guard_capability_reference on learning.claim_templates;
create trigger guard_capability_reference before insert or update on learning.claim_templates
  for each row execute function itera.guard_learning_capability_reference('capability_id');
drop trigger if exists guard_capability_reference on learning.capability_proposals;
create trigger guard_capability_reference before insert or update on learning.capability_proposals
  for each row execute function itera.guard_learning_capability_reference('nearest_capability_id', 'capability_id');

-- Ownership is part of a capability's identity. Changing it later would
-- invalidate references that were valid at INSERT time.
create or replace function itera.guard_capability_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'capability ownership is immutable' using errcode = '23514';
end $$;
revoke all on function itera.guard_capability_owner() from public, anon, authenticated;
drop trigger if exists guard_capability_owner on learning.capabilities;
create trigger guard_capability_owner before update of learner_id on learning.capabilities
  for each row when (new.learner_id is distinct from old.learner_id)
  execute function itera.guard_capability_owner();

comment on function itera.guard_residue_decision() is
  'Operator-only residue decisions; learner re-pass may update ontology_version under RLS.';
comment on function itera.guard_learning_capability_reference() is
  'Reject another learner''s private capability; shared templates and proposals require shared vocabulary.';
commit;
notify pgrst, 'reload schema';
