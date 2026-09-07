-- Origin: agent
-- Gate A correction. Plan 20260903-itera-learning-schema-v04-remodel, T34.
-- Append-only: 0078 and 0079 already applied. Tainan merges this file.
-- This same-row derivation repairs ADR-26's ancestor predicate (ADR-10).
-- A home directory or repository container is never an inferred project root
-- for descendants. Match literal path segments, never LIKE wildcards.
-- Only known ancestors followed by apps/src/packages/tests/docs qualify.
-- This is conservative: unknown boundaries retain the raw cwd. In particular,
-- gestorai/extracted/Gestor.AI remains separate. No Mac Git root is asserted.
-- The three local repositories dfl-components-cli, dfl-plans and
-- itera-learning-monorepo have matching git rev-parse --show-toplevel results.
-- New v2 clients will supply an explicit Git root; this correction targets
-- legacy rows whose context still equals the original ancestor derivation.
-- No existing context or episode is deleted. Evidence and session keys stay.

create unique index if not exists uq_episode_moments_id_episode_learner
  on learning.episode_moments(id, episode_id, learner_id);

-- Preserve the accepted calibration domain of generation_config (0070/0072).
-- 0078 rejected per_episode_cap=0 and accepted zero distinctness floors.
alter table learning.evidence_models drop constraint if exists evidence_models_calibration_sane;
alter table learning.evidence_models add constraint evidence_models_calibration_sane
  check (decay_half_life_days > 0 and strong_min_distinct_episodes >= 1
    and strong_min_distinct_projects >= 1 and per_episode_cap >= 0);
alter table learning.assembly_models drop constraint if exists assembly_models_cadence_sane;
alter table learning.assembly_models add constraint assembly_models_cadence_sane
  check (cadence_min_per_hour >= 0 and cadence_max_per_hour >= 1
    and cadence_max_per_hour >= cadence_min_per_hour and daily_cap >= 0 and ttl_hours > 0);

-- One mapping feeds both the inserts and updates in this statement.
-- The INSERT CTE returns new rows; its UNION with existing contexts is needed
-- because sibling data-modifying CTEs share the same pre-statement snapshot.
with known_refs as (
 select distinct learner_id,project_ref from learning.work_episodes
 where project_ref is not null
), roots as (
 select r.learner_id,r.project_ref,
   (select a.project_ref from known_refs a where a.learner_id=r.learner_id
     -- Match 0078 exactly only to identify its old assignments, including LIKE.
     and (a.project_ref=r.project_ref or r.project_ref like a.project_ref||'/%')
     order by length(a.project_ref),a.project_ref limit 1) as old_root,
   (select a.project_ref from known_refs a where a.learner_id=r.learner_id
     and (a.project_ref=r.project_ref or (
       a.project_ref !~ '^(/|/root|/home/[^/]+|/Users/[^/]+)$'
       and a.project_ref !~ '/(repos|repositories|Downloads|projects|workspaces)$'
       and starts_with(r.project_ref,a.project_ref||'/')
       and split_part(substr(r.project_ref,length(a.project_ref)+2),'/',1)
         in ('apps','src','packages','tests','docs')))
     order by length(a.project_ref),a.project_ref limit 1) as project_root
 from known_refs r
), eligible as (
 select e.id,e.learner_id,e.project_ref,r.project_root,e.machine,e.machine_class,e.started_at,e.created_at
 from learning.work_episodes e join roots r using(learner_id,project_ref)
 left join learning.work_contexts c on c.id=e.work_context_id
 where e.grain in ('turn','unknown') and e.schema_version=1
   and (e.work_context_id is null or c.project_root=r.old_root)
), derived as (
 select distinct learner_id,project_root,machine,machine_class,
   first_value(project_ref) over(partition by learner_id,project_root,machine,machine_class
     order by started_at nulls last,created_at,id) as project_ref
 from eligible
), inserted as (
 insert into learning.work_contexts(learner_id,project_root,machine,machine_class,project_ref)
 select learner_id,project_root,machine,machine_class,project_ref from derived
 on conflict do nothing returning id,learner_id,project_root,machine,machine_class
), contexts as (
 select id,learner_id,project_root,machine,machine_class from learning.work_contexts
 union all select * from inserted
)
update learning.work_episodes e set work_context_id=c.id
from eligible x join contexts c on c.learner_id=x.learner_id and c.project_root=x.project_root
 and c.machine is not distinct from x.machine and c.machine_class=x.machine_class
where e.id=x.id and e.work_context_id is distinct from c.id;

comment on column learning.work_contexts.project_root is
  'Project identity. Explicit client Git root takes precedence. Legacy normalization uses the shortest known ancestor followed by apps/src/packages/tests/docs. Home paths and repository containers do not absorb descendants. Unknown boundaries retain raw cwd (0080, plan ADR-26 correction).';
notify pgrst, 'reload schema';
