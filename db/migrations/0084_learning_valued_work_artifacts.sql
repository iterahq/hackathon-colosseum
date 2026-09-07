-- C1: delivery, expectation, product, and its evidence (plan 20260903, T23).
-- Merge requires full CI under the ITERA authorization from PR 467.
-- No seeds, backfill, renames or deletions.
-- target_autonomy is PROPOSED nullable text, with no invented scale or enum.
-- C.1 explicitly relaxes claims.objective_id to nullable; existing rows stay.
begin;

create table if not exists learning.valued_work (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learning.learners(id) on delete cascade,
  title text not null,
  description text,
  kind text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_valued_work_id_learner on learning.valued_work(id,learner_id);
alter table learning.valued_work drop constraint if exists valued_work_presence;
alter table learning.valued_work add constraint valued_work_presence check
  (length(btrim(title))>0 and length(btrim(status))>0 and (kind is null or length(btrim(kind))>0));

create table if not exists learning.task_models (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references learning.learners(id) on delete cascade,
  objective_id uuid,
  valued_work_id uuid,
  title text not null,
  expectation text not null,
  scaffold jsonb,
  rubric jsonb,
  kind text,
  created_at timestamptz not null default now()
);
alter table learning.task_models drop constraint if exists task_models_presence;
alter table learning.task_models add constraint task_models_presence check
  (length(btrim(title))>0 and length(btrim(expectation))>0 and (kind is null or length(btrim(kind))>0));
-- A shared expectation cannot expose a learner-owned objective or delivery.
alter table learning.task_models drop constraint if exists task_models_shared_has_no_private_parent;
alter table learning.task_models add constraint task_models_shared_has_no_private_parent check
  (learner_id is not null or (objective_id is null and valued_work_id is null));
alter table learning.task_models drop constraint if exists task_models_objective_same_learner;
alter table learning.task_models add constraint task_models_objective_same_learner
  foreign key(objective_id,learner_id) references learning.learning_objectives(id,learner_id)
  on delete set null (objective_id);
alter table learning.task_models drop constraint if exists task_models_work_same_learner;
alter table learning.task_models add constraint task_models_work_same_learner
  foreign key(valued_work_id,learner_id) references learning.valued_work(id,learner_id)
  on delete set null (valued_work_id);

create table if not exists learning.artifacts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learning.learners(id) on delete cascade,
  episode_id uuid,
  task_model_id uuid references learning.task_models(id) on delete set null,
  kind text not null,
  title text,
  uri text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_artifacts_id_learner on learning.artifacts(id,learner_id);
alter table learning.artifacts drop constraint if exists artifacts_presence;
alter table learning.artifacts add constraint artifacts_presence check
  (length(btrim(kind))>0 and (title is null or length(btrim(title))>0));
alter table learning.artifacts drop constraint if exists artifacts_episode_same_learner;
alter table learning.artifacts add constraint artifacts_episode_same_learner
  foreign key(episode_id,learner_id) references learning.work_episodes(id,learner_id)
  on delete set null (episode_id);

alter table learning.claims add column if not exists valued_work_id uuid;
alter table learning.claims alter column objective_id drop not null;
alter table learning.claims drop constraint if exists claims_work_same_learner;
alter table learning.claims add constraint claims_work_same_learner
  foreign key(valued_work_id,learner_id) references learning.valued_work(id,learner_id)
  on delete set null (valued_work_id);
alter table learning.evidence add column if not exists artifact_id uuid;
alter table learning.evidence drop constraint if exists evidence_artifact_same_learner;
alter table learning.evidence add constraint evidence_artifact_same_learner
  foreign key(artifact_id,learner_id) references learning.artifacts(id,learner_id)
  on delete set null (artifact_id);
alter table learning.learning_objectives add column if not exists target_autonomy text;
alter table learning.learning_objectives drop constraint if exists objectives_autonomy_present;
alter table learning.learning_objectives add constraint objectives_autonomy_present
  check (target_autonomy is null or length(btrim(target_autonomy))>0);

-- Nullable shared ownership cannot be enforced by a composite FK alone.
-- This invoker guard checks the owner explicitly, including for operators.
-- Ownership is immutable so a later edit cannot hide an attached expectation.
create or replace function learning.guard_c1_links() returns trigger
language plpgsql security invoker set search_path=pg_catalog,learning,itera
as $$
begin
  if tg_table_name='task_models' then
    if tg_op='UPDATE' and new.learner_id is distinct from old.learner_id then
      raise exception using errcode='42501', message='Task model ownership is immutable';
    end if;
  elsif tg_table_name='artifacts' and new.task_model_id is not null then
    if not exists(select 1 from learning.task_models m where m.id=new.task_model_id
      and (m.learner_id is null or m.learner_id=new.learner_id)) then
      raise exception using errcode='23503', message='Artifact task model must be shared or owned by the learner';
    end if;
  elsif tg_table_name='valued_work' then
    new.updated_at:=now();
  end if;
  return new;
end;
$$;
drop trigger if exists task_models_owner_immutable on learning.task_models;
create trigger task_models_owner_immutable before update of learner_id on learning.task_models
  for each row execute function learning.guard_c1_links();
drop trigger if exists artifacts_task_model_owner on learning.artifacts;
create trigger artifacts_task_model_owner before insert or update of task_model_id,learner_id on learning.artifacts
  for each row execute function learning.guard_c1_links();
drop trigger if exists valued_work_updated_at on learning.valued_work;
create trigger valued_work_updated_at before update on learning.valued_work
  for each row execute function learning.guard_c1_links();
revoke all on function learning.guard_c1_links() from public,anon;
grant execute on function learning.guard_c1_links() to authenticated;

alter table learning.valued_work enable row level security;
drop policy if exists valued_work_rw_self on learning.valued_work;
create policy valued_work_rw_self on learning.valued_work for all
  using(learner_id=itera.current_itera_user_id()) with check(learner_id=itera.current_itera_user_id());
drop policy if exists valued_work_read_operator on learning.valued_work;
create policy valued_work_read_operator on learning.valued_work for select using(itera.is_learning_operator());
grant select,insert,update,delete on learning.valued_work to authenticated;
revoke all on learning.valued_work from anon;

alter table learning.task_models enable row level security;
drop policy if exists task_models_rw_self on learning.task_models;
create policy task_models_rw_self on learning.task_models for all
  using(learner_id=itera.current_itera_user_id()) with check(learner_id=itera.current_itera_user_id());
drop policy if exists task_models_read_shared_operator on learning.task_models;
create policy task_models_read_shared_operator on learning.task_models for select
  using(learner_id is null or itera.is_learning_operator());
drop policy if exists task_models_rw_shared_operator on learning.task_models;
create policy task_models_rw_shared_operator on learning.task_models for all
  using(learner_id is null and itera.is_learning_operator())
  with check(learner_id is null and itera.is_learning_operator());
grant select,insert,update,delete on learning.task_models to authenticated;
revoke all on learning.task_models from anon;

alter table learning.artifacts enable row level security;
drop policy if exists artifacts_rw_self on learning.artifacts;
create policy artifacts_rw_self on learning.artifacts for all
  using(learner_id=itera.current_itera_user_id()) with check(learner_id=itera.current_itera_user_id());
drop policy if exists artifacts_read_operator on learning.artifacts;
create policy artifacts_read_operator on learning.artifacts for select using(itera.is_learning_operator());
grant select,insert,update,delete on learning.artifacts to authenticated;
revoke all on learning.artifacts from anon;

create index if not exists idx_valued_work_learner on learning.valued_work(learner_id);
create index if not exists idx_task_models_learner on learning.task_models(learner_id);
create index if not exists idx_task_models_objective on learning.task_models(objective_id);
create index if not exists idx_task_models_work on learning.task_models(valued_work_id);
create index if not exists idx_artifacts_episode on learning.artifacts(episode_id);
create index if not exists idx_artifacts_task_model on learning.artifacts(task_model_id);
create index if not exists idx_artifacts_learner on learning.artifacts(learner_id);
create index if not exists idx_claims_valued_work on learning.claims(valued_work_id);
create index if not exists idx_evidence_artifact on learning.evidence(artifact_id);

comment on table learning.valued_work is 'A learner delivery, independent of learning objectives (ADR-19). Claims may refer to either or both; no parent FK joins these two roots.';
comment on table learning.task_models is 'The expectation for a work product (ADR-20). NULL learner_id means a shared editorial expectation; its learner-owned parent links must be NULL.';
comment on table learning.artifacts is 'The tangible work product (ADR-20), optionally attached to an episode and a shared or same-learner task model. Its judgments are learning.evidence rows; no artifact_evaluations table.';
comment on column learning.learning_objectives.target_autonomy is 'Proposed C1 representation: optional authored autonomy target as text. No numeric scale, enum or inferred value; existing rows remain NULL. The authored text is the C1 representation; no scale is imposed.';
comment on column learning.claims.valued_work_id is 'Optional same-learner delivery beside the now-nullable objective_id (ADR-19/C.1). Existing claim parents are preserved.';
comment on column learning.evidence.artifact_id is 'Optional same-learner product judged by this evidence row. Existing evidence remains unlinked; no judgment rows are moved.';
commit;
notify pgrst,'reload schema';
