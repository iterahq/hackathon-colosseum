#!/usr/bin/env node
// Origin: agent. Real local sessions only; no production writes.
import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
if (!['127.0.0.1','localhost','::1'].includes(process.env.PGHOST)) throw Error('Local throwaway PGHOST required');
const id=n=>`00830000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=s=>execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',s],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const asUser=(s,n=1)=>`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',true); ${s}; commit;`;
const insert=(n,{learner=1,claim=11,episode=21,pass='old',at='2026-01-01T00:00:00Z',created='2026-01-01T00:00:00Z',direction='supports',response=null}={})=>`insert into learning.evidence(id,learner_id,claim_id,episode_id,activity_response_id,actor,direction,strength,observed,provenance,created_at,status) values ('${id(n)}','${id(learner)}','${id(claim)}',${episode===null?'null':quote(id(episode))},${response===null?'null':quote(id(response))},'learner','${direction}','weak','Synthetic status test',${quote(JSON.stringify({pass_id:pass,pass_at:at}))},'${created}','active')`;
const status=n=>sql(`select status from learning.evidence where id='${id(n)}'`);
let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS: '+label)};
const denied=s=>{assert.throws(()=>sql(s));checks++;};
const cleanup=()=>sql(`begin; lock table learning.evidence in share row exclusive mode; delete from itera.users where id in ('${id(1)}','${id(2)}'); commit;`);
try {
 cleanup();
 sql(`begin; lock table learning.evidence in share row exclusive mode;
 insert into itera.users(id,email) values ('${id(1)}','status-a@example.invalid'),('${id(2)}','status-b@example.invalid');
 insert into itera.identities(user_id,provider,provider_subject) values ('${id(1)}','password','${id(1)}'),('${id(2)}','password','${id(2)}');
 insert into learning.learners(id,display_name) values ('${id(1)}','Status A'),('${id(2)}','Status B');
 insert into learning.learning_objectives(id,learner_id,title) values ('${id(31)}','${id(1)}','Synthetic A'),('${id(32)}','${id(2)}','Synthetic B');
 insert into learning.claims(id,learner_id,objective_id,title) values ('${id(11)}','${id(1)}','${id(31)}','First'),('${id(12)}','${id(1)}','${id(31)}','Second'),('${id(13)}','${id(2)}','${id(32)}','Foreign');
 insert into learning.work_episodes(id,learner_id,source,session_ref,started_at) values ('${id(21)}','${id(1)}','selftest','status-a',now()),('${id(22)}','${id(1)}','selftest','status-b',now()),('${id(23)}','${id(2)}','selftest','status-foreign',now());
 insert into learning.activities(id,learner_id,kind,spec) values ('${id(41)}','${id(1)}','question','{}');
 insert into learning.activity_responses(id,learner_id,activity_id,response) values ('${id(42)}','${id(1)}','${id(41)}','{}'); commit;`);
 sql(asUser(insert(101)));
 sql(asUser(`${insert(102,{pass:'new',at:'2026-02-01T00:00:00Z'})};${insert(103,{pass:'new',at:'2026-02-01T00:00:00Z',direction:'neutral'})}`));
 check(status(101)==='superseded'&&status(102)==='active'&&status(103)==='active','newest pass preserves supports and neutral rows');
 sql(asUser(insert(104,{pass:'older'})));
 check(status(104)==='superseded','late old pass remains superseded');
 sql(asUser(`${insert(105,{episode:null})};${insert(106,{response:42})};${insert(107,{claim:12})}`));
 check([105,106,107].every(n=>status(n)==='active'),'no episode, response, and other claim stay active');
 sql(asUser(`update learning.evidence set status='superseded' where id='${id(102)}'; update learning.evidence set status='active' where id='${id(101)}'`));
 check(status(101)==='superseded'&&status(102)==='active','direct status updates restore parity without recursion');
 sql(asUser(`delete from learning.evidence where id in ('${id(102)}','${id(103)}')`));
 check(status(101)==='superseded'&&status(104)==='active','delete newest pass reactivates prior selected pass by key tie');
 sql(asUser(insert(108,{pass:'tie-z'}))); sql(asUser(insert(109,{pass:'tie-a'})));
 check(status(108)==='active'&&status(109)==='superseded','equal pass times use key tie');
 sql(asUser(insert(110,{pass:'\u{10000}',at:'zz'})));sql(asUser(insert(111,{pass:'\ue000',at:'zz'})));
 check(status(110)==='superseded'&&status(111)==='active','UTF-16 ordering matches JavaScript supplementary character tie');
 sql(asUser(`${insert(112,{episode:22,pass:null,at:null,created:'2026-03-01T01:02:03.123456Z'})};${insert(113,{episode:22,pass:null,at:null,created:'2026-03-01T01:02:03.123456Z',direction:'neutral'})};${insert(114,{episode:22,pass:null,at:null,created:'2026-03-01T01:02:03.124Z'})}`));
 check(status(112)==='superseded'&&status(113)==='superseded'&&status(114)==='active','legacy timestamps preserve microseconds and same pass identity');
 sql(asUser(insert(201,{learner:2,claim:13,episode:23}),2));
 denied(asUser(`select learning.refresh_evidence_status_for_learner('${id(2)}')`));
 sql(asUser(`update learning.evidence set status='superseded' where id='${id(201)}'`));
 check(status(201)==='active','RLS blocks foreign status changes');
 denied(asUser(`update learning.evidence set observed='forged' where id='${id(101)}'`));
 denied(`begin isolation level repeatable read;set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true);${insert(115)};commit;`);
 denied(`begin isolation level serializable;set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true);select learning.refresh_evidence_status();commit;`);
 // The first writer holds its transaction. The second starts INSERT before it
 // commits. Its original statement snapshot cannot see the first row.
 const first=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'evidence-status-first'}});
 let output='',errors='';first.stdout.on('data',b=>output+=b);first.stderr.on('data',b=>errors+=b);
 const firstDone=new Promise((resolve,reject)=>first.on('exit',c=>c===0?resolve():reject(Error(errors))));
 first.stdin.write(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true);${insert(120,{pass:'concurrent-new',at:'zzz'})};select 'writer_ready';\n`);
 for(let n=0;!output.includes('writer_ready');n++){if(n>100)throw Error('First writer never ready: '+errors);await new Promise(r=>setTimeout(r,20));}
 const second=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',asUser(insert(121,{pass:'concurrent-old',at:'zza'}))],{env:{...process.env,PGAPPNAME:'evidence-status-second'}});
 let secondErrors='';second.stderr.on('data',b=>secondErrors+=b);
 const secondDone=new Promise((resolve,reject)=>second.on('exit',c=>c===0?resolve():reject(Error(secondErrors))));
 try {
  let waiting=false;for(let n=0;n<100;n++){waiting=sql("select exists(select 1 from pg_stat_activity where application_name='evidence-status-second' and wait_event='advisory')")==='t';if(waiting)break;await new Promise(r=>setTimeout(r,20));}
  check(waiting,'second writer waits before its row change');
  check(sql(`select count(*) from learning.evidence where id in ('${id(120)}','${id(121)}')`)==='0','observer sees neither uncommitted writer');
 }finally{first.stdin.end('commit;\n');}
 await Promise.all([firstDone,secondDone]);
 check(status(120)==='active'&&status(121)==='superseded','second statement refresh sees first commit after stale initial snapshot');
 // A2 admin must take this lock before multi-learner regroup. It excludes all
 // concurrent writers and avoids learner-lock / row-lock order inversion.
 sql(`begin;lock table learning.evidence in share row exclusive mode;
 select learning.refresh_evidence_status_for_learner('${id(1)}');
 select learning.refresh_evidence_status_for_learner('${id(2)}');
 update learning.evidence set episode_id=case when learner_id='${id(1)}' then '${id(22)}'::uuid else '${id(23)}'::uuid end where id in ('${id(120)}','${id(201)}');
 select learning.refresh_evidence_status_for_learner('${id(1)}');
 select learning.refresh_evidence_status_for_learner('${id(2)}');commit;`);
 check(status(121)==='active'&&status(120)==='active'&&status(114)==='superseded'&&status(201)==='active','locked multi-learner regroup refreshes old and new groups');
 // Compare SQL output to the unchanged reader algorithm using JSON timestamp
 // representation (the same PostgreSQL encoder used by PostgREST).
 const rows=JSON.parse(sql(`select json_agg(e) from (select id,claim_id,episode_id,activity_response_id,provenance,created_at,status from learning.evidence where learner_id in ('${id(1)}','${id(2)}')) e`));
 const winners=new Map();const normalized=v=>typeof v==='string'&&v.length?v:null;
 const key=r=>normalized(r.provenance.pass_id)?'id:'+r.provenance.pass_id:'at:'+r.created_at;
 const group=r=>r.claim_id+'\0'+r.episode_id;
 for(const r of rows){if(!r.episode_id||r.activity_response_id)continue;const next={order:normalized(r.provenance.pass_at)??r.created_at,key:key(r)},old=winners.get(group(r));if(!old||next.order>old.order||(next.order===old.order&&next.key>old.key))winners.set(group(r),next);}
 check(rows.every(r=>r.status===(!r.episode_id||r.activity_response_id||key(r)===winners.get(group(r)).key?'active':'superseded')),'every stored status equals unchanged JavaScript reader calculation');
 console.log(`PASS: ${checks} evidence status assertions`);
} finally {cleanup();}
