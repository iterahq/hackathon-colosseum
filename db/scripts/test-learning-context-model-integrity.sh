#!/usr/bin/env bash
# Origin: agent
# Throwaway Postgres only. Fixtures and migration replay roll back together.
set -euo pipefail
case "${PGHOST:-}" in localhost|127.0.0.1|::1) ;; *) echo 'Use a local throwaway database' >&2; exit 2 ;; esac
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="${LEARNING_CORRECTION_MIGRATION:-$ROOT/migrations/0080_learning_context_model_integrity.sql}"
psql -X -v ON_ERROR_STOP=1 <<SQL
begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as \$\$
begin if ok is distinct from true then raise exception '%',message; end if; end \$\$;
create temp table test_learner as select gen_random_uuid() as id;
insert into itera.users(id,email) select id,'context-test@example.invalid' from test_learner;
insert into learning.learners(id,display_name) select id,'context test' from test_learner;
create temp table root_cases(ref text primary key, expected text);
insert into root_cases values
('/root','/root'),('/root/src','/root/src'),
('/root/repos','/root/repos'),('/root/repos/apps/demo','/root/repos/apps/demo'),
('/root/repos/alpha','/root/repos/alpha'),
('/root/repos/alpha/apps/web/src','/root/repos/alpha'),
('/root/repos/alpha/src','/root/repos/alpha'),
('/root/repos/alpha-beta','/root/repos/alpha-beta'),
('/root/repos/beta','/root/repos/beta'),
('/Users/test','/Users/test'),('/Users/test/src','/Users/test/src'),
('/Users/test/podsfinance','/Users/test/podsfinance'),
('/Users/test/podsfinance/repo','/Users/test/podsfinance/repo'),
('/Users/test/podsfinance/repo/apps/web','/Users/test/podsfinance/repo'),
('/Users/test/Downloads/gestorai','/Users/test/Downloads/gestorai'),
('/Users/test/Downloads/gestorai/extracted/Gestor.AI','/Users/test/Downloads/gestorai/extracted/Gestor.AI'),
('/work/alpha_%','/work/alpha_%'),
('/work/alphaZX/apps/web','/work/alphaZX/apps/web'),
('/work/alpha_%/packages/core','/work/alpha_%');
insert into learning.work_episodes(learner_id,source,session_ref,started_at,project_ref,machine,machine_class)
select id,'selftest',ref,now(),ref,NULL,'human' from test_learner cross join root_cases;
\i $ROOT/migrations/0078_learning_merge_a_expand.sql
-- Existing client assignments and session rows must survive a legacy repair.
create temp table preserved as
select gen_random_uuid() id, t.id learner_id, v.root, v.grain, v.version
from test_learner t cross join (values
 ('/explicit-git-root','turn',1),('/session-root','session',1),('/v2-root','unknown',2)
) v(root,grain,version);
insert into learning.work_contexts(id,learner_id,project_root,machine_class)
select id,learner_id,root,'human' from preserved;
insert into learning.work_episodes(learner_id,source,session_ref,started_at,project_ref,work_context_id,grain,schema_version)
select learner_id,'selftest',root,now(),'/root/repos/alpha/src',id,grain,version from preserved;
\i $MIGRATION
select pg_temp.assert_ok(not exists (
 select 1 from learning.work_episodes e join test_learner t on t.id=e.learner_id
 join root_cases r on r.ref=e.project_ref left join learning.work_contexts c on c.id=e.work_context_id
 where e.session_ref=e.project_ref and c.project_root is distinct from r.expected), 'project roots merge unrelated paths');
create temp table first_assignment as
select e.id,e.work_context_id from learning.work_episodes e join test_learner t on t.id=e.learner_id;
\i $MIGRATION
select pg_temp.assert_ok(not exists(select 1 from first_assignment f join learning.work_episodes e using(id)
where e.work_context_id is distinct from f.work_context_id), 'replay changes context identity');
select pg_temp.assert_ok((select count(*) from learning.work_contexts c join test_learner t on c.learner_id=t.id)
= (select count(distinct expected) from root_cases)+3, 'replay duplicates null-machine contexts');
select pg_temp.assert_ok(not exists(select 1 from preserved p join learning.work_episodes e
 on e.session_ref=p.root where e.work_context_id<>p.id), 'explicit or non-legacy context changed');
-- The old singleton accepts zero cap. The replacement must accept it too.
update learning.evidence_models set per_episode_cap=0;
do \$\$ begin
 begin update learning.evidence_models set strong_min_distinct_episodes=0;
 raise exception 'zero episode floor accepted'; exception when check_violation then null; end;
 begin update learning.evidence_models set strong_min_distinct_projects=0;
 raise exception 'zero project floor accepted'; exception when check_violation then null; end;
 begin update learning.assembly_models set cadence_min_per_hour=0,cadence_max_per_hour=0;
 raise exception 'zero cadence ceiling accepted'; exception when check_violation then null; end;
end \$\$;
select pg_temp.assert_ok(exists(select 1 from pg_indexes where schemaname='learning'
 and indexname='uq_episode_moments_id_episode_learner'), 'same-episode moment key missing');
rollback;
SQL
echo 'PASS: conservative roots, literal path boundaries, replay, NULL machine, model constraint parity, moment key'
