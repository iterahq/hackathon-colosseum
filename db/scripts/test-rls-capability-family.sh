#!/usr/bin/env bash
# Behavioural gate for 0079 + 0081. Synthetic fixtures, rolled back.
# Run after fresh-apply.sh, only against a throwaway local database.
set -euo pipefail
case "${PGHOST:-}" in localhost|127.0.0.1) ;; *) echo 'REFUSED: local throwaway database required' >&2; exit 2;; esac
psql -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
create function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
create function pg_temp.denied(statement text, label text) returns void
language plpgsql as $$ begin
  begin
    execute statement;
  exception when insufficient_privilege or check_violation or foreign_key_violation or unique_violation then
    raise notice 'PASS: %', label; return;
  end;
  raise exception 'FAIL: % was allowed', label;
end $$;

insert into itera.users(id,email) values
 ('00810000-0000-4000-8000-000000000001','gate-b-a@example.invalid'),
 ('00810000-0000-4000-8000-000000000002','gate-b-b@example.invalid');
insert into itera.identities(user_id,provider,provider_subject) values
 ('00810000-0000-4000-8000-000000000001','password','00810000-0000-4000-8000-000000000001'),
 ('00810000-0000-4000-8000-000000000002','password','00810000-0000-4000-8000-000000000002');
insert into learning.learners(id,display_name) values
 ('00810000-0000-4000-8000-000000000001','Gate B learner'),
 ('00810000-0000-4000-8000-000000000002','Gate B operator');
insert into itera.memberships(tenant_id,user_id,role)
 select id,'00810000-0000-4000-8000-000000000002','tenant_admin'
 from itera.tenants where slug='itera';
insert into learning.work_episodes(id,learner_id,source,session_ref,started_at) values
 ('00810000-0000-4000-8000-000000000011','00810000-0000-4000-8000-000000000001','selftest','gate-b-1',now()),
 ('00810000-0000-4000-8000-000000000012','00810000-0000-4000-8000-000000000002','selftest','gate-b-2',now()),
 ('00810000-0000-4000-8000-000000000013','00810000-0000-4000-8000-000000000001','selftest','gate-b-3',now());
insert into learning.episode_moments(id,episode_id,learner_id,kind,payload,at) values
 ('00810000-0000-4000-8000-000000000021','00810000-0000-4000-8000-000000000011','00810000-0000-4000-8000-000000000001','turn','{}',now()),
 ('00810000-0000-4000-8000-000000000022','00810000-0000-4000-8000-000000000012','00810000-0000-4000-8000-000000000002','turn','{}',now()),
 ('00810000-0000-4000-8000-000000000023','00810000-0000-4000-8000-000000000013','00810000-0000-4000-8000-000000000001','turn','{}',now());
insert into learning.ontology_versions(version,note) values (81001,'selftest re-pass');
insert into learning.capabilities(id,title,learner_id,source,introduced_in) values
 ('gate_b_shared','Shared',null,'{"kind":"editorial"}',1),
 ('gate_b_private','Private','00810000-0000-4000-8000-000000000002','{"kind":"editorial"}',1),
 ('gate_b_own','Own override','00810000-0000-4000-8000-000000000001','{"kind":"editorial"}',1);
insert into learning.residue(id,learner_id,episode_id,candidate,pass_id,pass_at,ontology_version)
 values ('00810000-0000-4000-8000-000000000032','00810000-0000-4000-8000-000000000002','00810000-0000-4000-8000-000000000012','Other learner','selftest',now(),1);
set local role authenticated;
select set_config('request.jwt.claim.sub','00810000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00810000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true(current_user='authenticated' and not itera.is_learning_operator()
 and itera.current_itera_user_id()='00810000-0000-4000-8000-000000000001'::uuid,'real learner role and identity');
insert into learning.residue(id,learner_id,episode_id,moment_id,candidate,pass_id,pass_at,ontology_version) values
 ('00810000-0000-4000-8000-000000000031','00810000-0000-4000-8000-000000000001','00810000-0000-4000-8000-000000000011','00810000-0000-4000-8000-000000000021','Synthetic residue','selftest',now(),1);
select pg_temp.assert_true((select count(*)=1 from learning.residue where id in
 ('00810000-0000-4000-8000-000000000031','00810000-0000-4000-8000-000000000032')),'learner reads own residue only');
select pg_temp.denied($q$update learning.residue set status='dismissed'
 where id='00810000-0000-4000-8000-000000000031'$q$,'learner cannot decide residue');
select pg_temp.denied($q$update learning.residue set promoted_by='00810000-0000-4000-8000-000000000001'
 where id='00810000-0000-4000-8000-000000000031'$q$,'learner cannot forge decision metadata');
update learning.residue set ontology_version=81001 where id='00810000-0000-4000-8000-000000000031';
select pg_temp.assert_true((select ontology_version=81001 from learning.residue
 where id='00810000-0000-4000-8000-000000000031'),'learner re-pass advances ontology version');
select pg_temp.denied($q$insert into learning.residue(learner_id,episode_id,candidate,pass_id,pass_at,ontology_version,status)
 values ('00810000-0000-4000-8000-000000000001','00810000-0000-4000-8000-000000000011','forged','forged',now(),1,'dismissed')$q$,'learner cannot insert decided residue');
select pg_temp.denied($q$insert into learning.residue(learner_id,episode_id,moment_id,candidate,pass_id,pass_at,ontology_version)
 values ('00810000-0000-4000-8000-000000000001','00810000-0000-4000-8000-000000000011','00810000-0000-4000-8000-000000000022','foreign','foreign',now(),1)$q$,'residue cannot name another learner moment');
select pg_temp.denied($q$insert into learning.residue(learner_id,episode_id,moment_id,candidate,pass_id,pass_at,ontology_version)
 values ('00810000-0000-4000-8000-000000000001','00810000-0000-4000-8000-000000000011','00810000-0000-4000-8000-000000000023','wrong episode','foreign',now(),1)$q$,'residue cannot name same learner other episode');
select pg_temp.denied($q$insert into learning.capability_states(learner_id,capability_id,state,reducer_version,inputs)
 values ('00810000-0000-4000-8000-000000000001','gate_b_private','unknown','test','{"source":"test"}')$q$,'state cannot name another learner capability');
select pg_temp.denied($q$insert into learning.capabilities(id,learner_id,title,source,introduced_in)
 values ('gate_b_learner_mint','00810000-0000-4000-8000-000000000001','Forbidden own mint','{"kind":"editorial"}',1)$q$,'learner cannot mint own vocabulary');
select pg_temp.assert_true((select count(*)=1 from learning.capabilities where id='gate_b_shared'),'learner reads shared capability');
select pg_temp.assert_true((select count(*)=1 from learning.capabilities where id='gate_b_own'),'learner reads own override');
select pg_temp.assert_true((select count(*)=0 from learning.capabilities where id='gate_b_private'),'learner cannot read foreign override');
select pg_temp.denied($q$insert into learning.capabilities(id,title,source,introduced_in)
 values ('gate_b_forbidden','Forbidden','{"kind":"editorial"}',1)$q$,'learner cannot create shared vocabulary');
insert into learning.capability_proposals(id,title,residue_ids,proposed_by_kind,proposed_by)
 values ('00810000-0000-4000-8000-000000000041','Valid proposal',array['00810000-0000-4000-8000-000000000031'::uuid],'agent','selftest');
select pg_temp.denied($q$insert into learning.capability_proposals(title,residue_ids,proposed_by_kind,proposed_by,status)
 values ('Forged',array['00810000-0000-4000-8000-000000000031'::uuid],'agent','selftest','approved')$q$,'learner cannot insert approved proposal');
select pg_temp.denied($q$insert into learning.capability_proposals(title,residue_ids,proposed_by_kind,proposed_by,decided_by,decided_at)
 values ('Forged',array['00810000-0000-4000-8000-000000000031'::uuid],'agent','selftest','00810000-0000-4000-8000-000000000001',now())$q$,'learner cannot insert proposal decision metadata');
select pg_temp.denied($q$insert into learning.capability_proposals(title,residue_ids,proposed_by_kind,proposed_by)
 values ('Foreign',array['00810000-0000-4000-8000-000000000032'::uuid],'agent','selftest')$q$,'learner cannot propose foreign residue');
with changed as (update learning.capability_proposals set status='approved'
 where id='00810000-0000-4000-8000-000000000041' returning id)
 select pg_temp.assert_true((select count(*)=0 from changed),'learner cannot update proposal decision');
select set_config('request.jwt.claim.sub','00810000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00810000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(itera.is_learning_operator(),'operator positive control');
insert into learning.capabilities(id,learner_id,title,source,introduced_in)
 values ('gate_b_operator_override','00810000-0000-4000-8000-000000000001','Operator override','{"kind":"editorial"}',1);
select pg_temp.assert_true((select count(*)=4 from learning.capabilities
 where id in ('gate_b_shared','gate_b_private','gate_b_own','gate_b_operator_override')),'operator creates override and reads every scope');
update learning.residue set status='promoted', promoted_to_capability_id='gate_b_shared',
 promoted_by='00810000-0000-4000-8000-000000000002',promoted_at=now()
 where id='00810000-0000-4000-8000-000000000031';
select pg_temp.assert_true((select status='promoted' from learning.residue
 where id='00810000-0000-4000-8000-000000000031'),'operator promotes residue');
update learning.capability_proposals set status='approved',capability_id='gate_b_shared',
 decided_by='00810000-0000-4000-8000-000000000002',decided_at=now(),ontology_version=81001
 where id='00810000-0000-4000-8000-000000000041';
select pg_temp.assert_true((select status='approved' from learning.capability_proposals
 where id='00810000-0000-4000-8000-000000000041'),'operator decides proposal');
select pg_temp.denied($q$insert into learning.capabilities(id,title,source,introduced_in)
 values ('gate_b_null_kind','Null kind','{"kind":null}',1)$q$,'JSON null cannot bypass source presence');
select pg_temp.denied($q$insert into learning.claim_templates(capability_id,statement,introduced_in)
 values ('gate_b_private','Shared template cannot point at private capability',1)$q$,'shared template cannot name private capability');
select pg_temp.denied($q$update learning.capabilities set learner_id='00810000-0000-4000-8000-000000000002'
 where id='gate_b_shared'$q$,'shared ownership cannot invalidate existing references');
reset role;
delete from learning.episode_moments where id='00810000-0000-4000-8000-000000000021';
select pg_temp.assert_true((select moment_id is null and episode_id is not null and learner_id is not null
 from learning.residue where id='00810000-0000-4000-8000-000000000031'),'moment delete clears only moment_id');
rollback;
SQL
