#!/usr/bin/env node
// Origin: agent. Synthetic fixtures in a local throwaway database only.
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
if(!['localhost','127.0.0.1'].includes(process.env.PGHOST))throw Error('Local database required');
const id=n=>`00880000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=s=>execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const migration=new URL('../migrations/0088_learning_session_regroup.sql',import.meta.url);
const apply=()=>sql(readFileSync(migration,'utf8'));
const before=()=>sql(`select jsonb_agg(to_jsonb(e) order by id)::text from learning.evidence e where learner_id in('${id(1)}','${id(2)}')`);
async function holding(statement,fn){
 const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1']);let out='',errors='';
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>errors+=b);
 const done=new Promise((resolve,reject)=>child.on('exit',code=>code===0?resolve():reject(Error(errors))));
 child.stdin.write(`begin;${statement};select 'lock_ready';\n`);
 try{for(let n=0;!out.includes('lock_ready');n++){if(n>200)throw Error(errors||'lock fixture timeout');await new Promise(r=>setTimeout(r,25));}fn();}
 finally{child.stdin.end('rollback;\n');await done;}
}
let checks=0;const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS: '+label)};
try{
 sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');
 insert into itera.users(id,email)values('${id(1)}','a2-a@example.invalid'),('${id(2)}','a2-b@example.invalid');
 insert into learning.learners(id)values('${id(1)}'),('${id(2)}');
 insert into learning.learning_objectives(id,learner_id,title)values('${id(10)}','${id(1)}','Fixture');
 insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(10)}','Fixture claim');
 insert into learning.work_contexts(id,learner_id,project_root,project_ref,machine,machine_class)values
 ('${id(21)}','${id(1)}','/repo/a','/repo/a','fixture','human'),('${id(22)}','${id(1)}','/repo/b','/repo/b','fixture','human'),('${id(23)}','${id(1)}','/repo/a','/repo/a','fixture','agent'),('${id(24)}','${id(2)}','/repo/a','/repo/a','fixture','human');
 insert into learning.work_episodes(id,learner_id,source,machine,machine_class,project_ref,work_context_id,grain,started_at,ended_at,session_ref,created_at)values
 ('${id(31)}','${id(1)}','test','fixture','human','/repo/a','${id(21)}','turn','2026-09-01T10:00Z','2026-09-01T10:01Z','cli-a','2026-09-07T18:00Z'),
 ('${id(32)}','${id(1)}','other-source','fixture','human','/repo/a/src','${id(21)}','turn','2026-09-01T10:31Z',null,'cli-b','2026-09-07T18:00Z'),
 ('${id(33)}','${id(1)}','test','fixture','human','/repo/b','${id(22)}','turn','2026-09-01T10:32Z','2026-09-01T10:32Z','cli-b','2026-09-07T18:00Z'),
 ('${id(34)}','${id(1)}','test','fixture','human','/repo/a','${id(21)}','turn','2026-09-01T10:33Z','2026-09-01T10:33Z','cli-b','2026-09-07T18:00Z'),
 ('${id(35)}','${id(1)}','test','fixture','agent','/repo/a','${id(23)}','turn','2026-09-01T10:34Z','2026-09-01T10:35Z','cli-b','2026-09-07T18:00Z'),
 ('${id(36)}','${id(1)}','test','fixture','agent','/repo/a','${id(23)}','turn','2026-09-01T11:06Z','2026-09-01T11:07Z','cli-b','2026-09-07T18:00Z'),
 ('${id(37)}','${id(1)}','test','fixture','agent','/repo/a','${id(23)}','turn','2026-09-01T11:10Z','2026-09-01T11:11Z','cli-b','2026-09-07T18:30:00Z'),
 ('${id(38)}','${id(1)}','test','fixture','agent','/repo/a','${id(23)}','turn','2026-09-01T11:12Z','2026-09-01T11:13Z','cli-b','2026-09-07T18:30:00.001Z'),
 ('${id(39)}','${id(2)}','test','fixture','human','/repo/a','${id(24)}','turn','2026-09-01T10:00Z','2026-09-01T10:01Z','cli-a','2026-09-07T18:00Z');
 insert into learning.evidence(id,learner_id,claim_id,episode_id,observed,actor,direction,strength,confidence,provenance)values
 ('${id(41)}','${id(1)}','${id(11)}','${id(31)}','support','learner','supports','medium',.8,'{"pass_id":"old","pass_at":"2026-09-01T12:00:00Z"}'),
 ('${id(42)}','${id(1)}','${id(11)}','${id(31)}','neutral','learner','neutral','weak',.8,'{"pass_id":"old","pass_at":"2026-09-01T12:00:00Z"}'),
 ('${id(43)}','${id(1)}','${id(11)}','${id(32)}','new support','learner','supports','strong',.8,'{"pass_id":"new","pass_at":"2026-09-01T13:00:00Z"}'),
 ('${id(44)}','${id(1)}','${id(11)}',null,'activity response','learner','supports','weak',.8,'{"source":"fixture"}');commit;`);
 const evidenceBefore=before();
 apply();
 check(sql(`select count(*)from learning.work_episodes where learner_id in('${id(1)}','${id(2)}')and grain='session'`)==='6','project/context/gap boundaries yield six sessions');
 check(sql(`select count(*)from learning.work_episodes where learner_id in('${id(1)}','${id(2)}')and grain='turn'and session_episode_id is not null`)==='8','exact cutoff is included; later capture is excluded');
 check(sql(`select count(*)from learning.episode_moments where learner_id in('${id(1)}','${id(2)}')and kind='turn'`)==='8','one moment per frozen turn');
 check(sql(`select (select session_episode_id from learning.work_episodes where id='${id(31)}')=(select session_episode_id from learning.work_episodes where id='${id(32)}')`)==='t','exact 30-minute gap and changed CLI ref stay in one session');
 check(sql(`select session_refs @> array['cli-a','cli-b']from learning.work_episodes where id=(select session_episode_id from learning.work_episodes where id='${id(31)}')`)==='t','all original client references survive');
 check(sql(`select string_agg(status,','order by id)from learning.evidence where id in('${id(41)}','${id(42)}','${id(43)}')`)==='superseded,superseded,active','regroup refreshes newest-pass status without deleting older rows');
 const afterFirst=before();
 sql(`alter table learning.work_episodes add column a2_future_nullable text;alter table learning.work_episodes add column a2_future_default text default 'future';alter table learning.evidence add column a2_future_nullable text;alter table learning.evidence add column a2_future_default text default 'future'`);
 apply();
 // Remove the unrelated fixture columns before comparing the historical full-row snapshots.
 sql(`alter table learning.work_episodes drop column a2_future_nullable;alter table learning.work_episodes drop column a2_future_default;alter table learning.evidence drop column a2_future_nullable;alter table learning.evidence drop column a2_future_default`);
 check(before()===afterFirst,'additive nullable and defaulted columns preserve forward replay');apply();check(before()===afterFirst,'forward replay changes no evidence');
 const original=JSON.parse(evidenceBefore).find(r=>r.id===id(44));check(JSON.stringify(original)===JSON.stringify(JSON.parse(before()).find(r=>r.id===id(44))),'episode-less evidence remains exact');

 const reverse=()=>sql(readFileSync(new URL('./reverse-learning-session-regroup.sql',import.meta.url),'utf8'));
 // Every mutable field and manifest list is checked before forward or reverse writes.
 const savedSession=sql(`select payload::text from learning.work_episodes where id=(select session_episode_id from learning.work_episodes where id='${id(31)}')`);
 for(const [label,mutation] of [
  ['cutoff',"payload=jsonb_set(payload,'{freeze_before}','\"2026-09-07T19:00:00Z\"')"],
  ['gap',"payload=jsonb_set(payload,'{session_gap_minutes}','60')"],
  ['duplicate turn',"payload=jsonb_set(payload,'{turn_manifest}',jsonb_build_array(payload->'turn_manifest'->0,payload->'turn_manifest'->0))"],
  ['omitted evidence',"payload=jsonb_set(payload,'{evidence_manifest}','[]')"],
  ['session bounds',"ended_at=ended_at+interval '1 minute'"]]){
   sql(`update learning.work_episodes set ${mutation} where id=(select session_episode_id from learning.work_episodes where id='${id(31)}')`);
   assert.throws(apply,/metadata changed|manifest.*changed/);assert.throws(reverse,/manifest.*changed/);
   check(before()===afterFirst,`tampered ${label} refuses forward and reverse before evidence writes`);
   sql(`update learning.work_episodes set payload='${savedSession.replaceAll("'","''")}'::jsonb,ended_at='2026-09-01T10:31Z' where id=(select session_episode_id from learning.work_episodes where id='${id(31)}')`);
 }
 sql(`update learning.work_episodes set relevance_status='relevant',relevance_checked_at=now() where learner_id='${id(1)}'`);
 apply();check(before()===afterFirst,'normal relevance updates do not invalidate session or turn manifests');
 const savedMoment=JSON.parse(sql(`select row_to_json(m)::text from learning.episode_moments m where learner_id='${id(1)}'order by id limit 1`));
 for(const mutation of ["at=at+interval '1 second'", "payload=payload||'{\"extra\":true}'::jsonb"]){
  sql(`update learning.episode_moments set ${mutation} where id='${savedMoment.id}'`);
  assert.throws(apply,/manifest is incomplete/);assert.throws(reverse,/manifest is incomplete/);
  check(before()===afterFirst,'changed moment timestamp or payload refuses forward and reverse');
  sql(`update learning.episode_moments set at='${savedMoment.at}',payload='${JSON.stringify(savedMoment.payload).replaceAll("'","''")}'::jsonb where id='${savedMoment.id}'`);
 }
 const parent=sql(`select session_episode_id from learning.work_episodes where id='${id(31)}'`);
 sql(`insert into learning.artifacts(id,learner_id,episode_id,kind,title)values('${id(51)}','${id(1)}','${parent}','document','Fixture dependency')`);
 assert.throws(reverse,/Reverse blocked by dependent rows/);check(before()===afterFirst,'reverse refuses downstream artifact without changing evidence');
 sql(`delete from learning.artifacts where id='${id(51)}'`);
 sql(`alter table learning.work_episodes add column a2_future_nullable text;alter table learning.evidence add column a2_future_default text default 'future'`);
 reverse();
 sql(`alter table learning.work_episodes drop column a2_future_nullable;alter table learning.evidence drop column a2_future_default`);
 check(before()===evidenceBefore,'reverse restores every evidence field and status');
 check(sql(`select count(*)from learning.work_episodes where learner_id in('${id(1)}','${id(2)}')and grain='turn'`)==='9','reverse preserves frozen and post-cutoff turns');
 check(sql(`select count(*)from learning.episode_moments where learner_id in('${id(1)}','${id(2)}')`)==='0','reverse removes only created moments');
 sql(`insert into learning.episode_moments(id,learner_id,episode_id,kind,at,payload)values('${id(52)}','${id(1)}','${id(31)}','prompt',now(),'{}')`);
 assert.throws(apply,/receipt, residue, moment/);check(before()===evidenceBefore,'captured moment preflight fails before changes');
 sql(`delete from learning.episode_moments where id='${id(52)}'`);

 sql(`insert into learning.extraction_passes(learner_id,episode_id,pass_id,request,result)values('${id(1)}','${id(31)}','regroup-conflict',jsonb_build_object('episode_id','${id(31)}','pass_id','regroup-conflict','observations','[]'::jsonb),'{"evidence_inserted":0,"residue_inserted":0,"evidence_ids":[],"residue_ids":[]}')`);
 assert.throws(apply,/receipt, residue, moment/);check(before()===evidenceBefore,'immutable receipt preflight fails before changes');
 sql(`delete from learning.extraction_passes where pass_id='regroup-conflict'`);
 await holding(`select pg_advisory_xact_lock(hashtextextended('learning.evidence.status:${id(1)}',0))`,()=>{assert.throws(apply,/learner writer is busy/);check(before()===evidenceBefore,'learner-first RPC lock makes regroup abort without waiting');});
 await holding('lock table learning.evidence in row exclusive mode',()=>{assert.throws(apply,/could not obtain lock/);check(before()===evidenceBefore,'direct writer table lock makes regroup abort without changes');});
 await holding('lock table learning.work_contexts in row exclusive mode',()=>{assert.throws(apply,/could not obtain lock/);check(before()===evidenceBefore,'concurrent context writer aborts regroup before mapping');});
 apply();check(before()===afterFirst,'reverse then forward returns identical evidence projection');
 sql(`delete from learning.episode_moments where id=(select id from learning.episode_moments where learner_id='${id(1)}'limit 1)`);
 assert.throws(apply,/manifest is incomplete/);check(true,'rerun refuses a missing manifest moment');
 sql(`delete from learning.work_episodes where learner_id in('${id(1)}','${id(2)}')and grain='turn'`);
 assert.throws(apply,/manifest is incomplete/);check(true,'missing all original turns cannot silently no-op');
 console.log(`PASS: ${checks} regroup assertions`);
}finally{sql(`alter table learning.work_episodes drop column if exists a2_future_nullable,drop column if exists a2_future_default;alter table learning.evidence drop column if exists a2_future_nullable,drop column if exists a2_future_default;begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');commit;`);}
