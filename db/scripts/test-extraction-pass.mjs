#!/usr/bin/env node
// Origin: agent. Local throwaway database only.
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
if(!['127.0.0.1','localhost'].includes(process.env.PGHOST))throw Error('Local database required');
const id=n=>`00850000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let extraVersion=null;
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=s=>execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const asUser=(s,who=1)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(who)}',true);${s};commit;`;
const call=(r,who=1)=>{const output=sql(asUser(`select learning.record_extraction_pass(${q(JSON.stringify(r))}::jsonb)`,who));return output.split('\n').find(line=>line.startsWith('{'));};
const evidence={claim_id:id(11),observed:'The learner selected a boundary test.',actor:'learner',direction:'supports',strength:'medium',confidence:.8,capability_id:null};
const observation={observation_id:'o1',moment_id:null,evidence:[evidence,{...evidence,direction:'neutral'}],residue:null};
const residue={observation_id:'o2',moment_id:null,evidence:[],residue:{candidate:'The learner checked a deployment.',suggested_label:'Deployment check',nearest_capability_id:null,nearest_score:null}};
let checks=0;const check=(v,s)=>{assert.ok(v,s);checks++;console.log('PASS: '+s)};
try{
 // Model Supabase default privileges, then prove the migration removes both grants.
 sql('grant all on learning.extraction_passes to service_role;grant execute on function learning.record_extraction_pass(jsonb) to service_role');
 sql(readFileSync(new URL('../migrations/0085_learning_extraction_pass_atomic.sql',import.meta.url),'utf8'));
 check(sql("select has_function_privilege('service_role','learning.record_extraction_pass(jsonb)','EXECUTE')") === 'f','migration revokes default service-role EXECUTE');
 sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in ('${id(1)}','${id(2)}');
 insert into itera.users(id,email) values ('${id(1)}','pass-a@example.invalid'),('${id(2)}','pass-b@example.invalid');
 insert into itera.identities(user_id,provider,provider_subject) values ('${id(1)}','password','${id(1)}'),('${id(2)}','password','${id(2)}');
 insert into learning.learners(id) values ('${id(1)}'),('${id(2)}');
 insert into learning.learning_objectives(id,learner_id,title) values ('${id(31)}','${id(1)}','Test');
 insert into learning.claims(id,learner_id,objective_id,title) values ('${id(11)}','${id(1)}','${id(31)}','Test');
 insert into learning.work_episodes(id,learner_id,source) values ('${id(21)}','${id(1)}','test'),('${id(22)}','${id(2)}','test');commit;`);

 // Even inherited/default EXECUTE privileges cannot substitute a bypass role for a caller.
 const serviceUsage=Object.fromEntries(['learning','itera'].map(schema=>[schema,sql(`select has_schema_privilege('service_role','${schema}','USAGE')`)==='t']));
 sql('grant usage on schema learning,itera to service_role;grant execute on function learning.record_extraction_pass(jsonb) to service_role');
 try { assert.throws(()=>sql(`begin;set local role service_role;select set_config('request.jwt.claim.sub','${id(1)}',true);select learning.record_extraction_pass('{}');rollback;`),/authenticated caller/);check(true,'service role cannot impersonate a caller through inherited EXECUTE'); }
 finally { sql('revoke execute on function learning.record_extraction_pass(jsonb) from service_role');for(const [schema,hadUsage] of Object.entries(serviceUsage))if(!hadUsage)sql(`revoke usage on schema ${schema} from service_role`); }
 check(sql("select has_table_privilege('service_role','learning.extraction_passes','INSERT')") === 'f','service role has no receipt INSERT grant');
 const version=Number(sql('select max(version) from learning.ontology_versions'));
 const request={episode_id:id(21),pass_id:'test-pass',pass_at:'2026-09-07T00:00:00Z',ontology_version:version,quality:'transcript',provenance:{extractor:'test'},observations:[observation,residue]};
 assert.throws(()=>sql(asUser(`insert into learning.extraction_passes(learner_id,episode_id,pass_id,request,result) values ('${id(1)}','${id(21)}','test-pass',${q(JSON.stringify(request))},'{}')`)));checks++;
 const first=JSON.parse(call(request));check(first.evidence_inserted===2&&first.residue_inserted===1,'NULL moments permit distinct logical evidence and residue observations');
 check(sql(`select count(*) from learning.evidence where episode_id='${id(21)}' and status='active'`)==='2','same-pass supports and neutral remain active');
 // A caller must not forge an exact receipt with metadata different from stored rows.
 const forged = [
  ['evidence capability', r=>r.observations[0].evidence[0].capability_id='different'],
  ['ontology version', r=>r.ontology_version+=1],
  ['quality', r=>r.quality='digest'],
  ['pass timestamp', r=>r.pass_at='2026-09-08T00:00:00Z'],
  ['misconception', r=>r.observations[0].evidence[0].misconception_refs=[{misconception_id:'different'}]],
  ['base provenance', r=>r.provenance.extractor='different'],
  ['residue score', r=>r.observations[1].residue.nearest_score=.7],
 ];
 for(const [label,change] of forged){
  const altered=structuredClone(request);change(altered);
  assert.throws(()=>sql(`begin;delete from learning.extraction_passes where learner_id='${id(1)}' and pass_id='test-pass';set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true);insert into learning.extraction_passes(learner_id,episode_id,pass_id,request,result) values ('${id(1)}','${id(21)}','test-pass',${q(JSON.stringify(altered))},${q(JSON.stringify(first))});rollback;`), /Receipt (evidence|residue) does not exist or differs/, label);
  check(true,`direct receipt rejects mismatched ${label}`);
 }

 check(call(request)===JSON.stringify(first)||JSON.parse(call(request)).evidence_inserted===2,'identical retry returns receipt');
 check(sql(`select count(*) from learning.evidence where episode_id='${id(21)}'`)==='2','retry writes no duplicate rows');
 assert.throws(()=>call({...request,observations:[residue]}));checks++;
 const invalid={...request,pass_id:'invalid',observations:[{...observation,residue:residue.residue}]};assert.throws(()=>call(invalid));checks++;
 assert.throws(()=>call({...request,pass_id:'duplicate-observation',observations:[observation,{...residue,observation_id:'o1'}]}));checks++;
 assert.throws(()=>call({...request,pass_id:'stale',ontology_version:version-1}));checks++;
 assert.throws(()=>call({...request,pass_id:'foreign',episode_id:id(22)}));checks++;
 assert.throws(()=>call(request,2));checks++;
 assert.throws(()=>call({...request,pass_id:'invented',observations:[{...observation,evidence:[{...evidence,capability_id:'cap_invented'}]}]}));checks++;
 check(sql(`select count(*) from learning.extraction_passes where learner_id='${id(1)}'`)==='1','invalid passes leave no receipts');
 const residueRequest={...request,pass_id:'residue-metadata',observations:[residue]};
 const residueResult=JSON.parse(call(residueRequest));
 for(const [label,change] of [
  ['score', r=>r.observations[0].residue.nearest_score=.7],
  ['ontology version',r=>r.ontology_version+=1],
  ['quality',r=>r.quality='digest'],
  ['pass timestamp',r=>r.pass_at='2026-09-08T00:00:00Z'],
 ]){
  const altered=structuredClone(residueRequest);change(altered);
  assert.throws(()=>sql(`begin;delete from learning.extraction_passes where learner_id='${id(1)}' and pass_id='residue-metadata';set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true);insert into learning.extraction_passes(learner_id,episode_id,pass_id,request,result) values ('${id(1)}','${id(21)}','residue-metadata',${q(JSON.stringify(altered))},${q(JSON.stringify(residueResult))});rollback;`), /Receipt residue does not exist or differs/,label);
  check(true,`residue-only receipt rejects mismatched ${label}`);
 }
 const empty=JSON.parse(call({...request,pass_id:'empty',observations:[]}));check(empty.evidence_inserted===0&&empty.residue_inserted===0,'zero-output pass has a receipt');
 check(sql(`select count(*) from learning.episode_moments where learner_id='${id(1)}'`)==='0','no capture moments invented');
 // A failure after a valid first observation must roll back both tables.
 assert.throws(()=>call({...request,pass_id:'rollback',observations:[residue,{...observation,observation_id:'bad',evidence:[{...evidence,claim_id:id(99)}]}]}));
 check(sql(`select count(*) from learning.residue where pass_id='rollback'`)==='0','later invalid observation rolls back earlier residue');
 sql(`insert into learning.episode_moments(id,episode_id,learner_id,kind,payload,at) values ('${id(41)}','${id(21)}','${id(1)}','prompt','{}',now())`);
 assert.throws(()=>call({...request,pass_id:'needs-moment'}));checks++;
 const withMoment={...request,pass_id:'captured',observations:[{...observation,moment_id:id(41)}]};
 check(JSON.parse(call(withMoment)).evidence_inserted===2,'captured moment retains multiple same-pass evidence rows');
 assert.throws(()=>call({...withMoment,pass_id:'moment-conflict',observations:[{...observation,moment_id:id(41)},{...residue,moment_id:id(41)}]}));checks++;
 assert.throws(()=>call({...withMoment,pass_id:'foreign-moment',observations:[{...observation,moment_id:id(99)}]}));checks++;
 // Two real caller sessions send one identical pass concurrently.
 const same={...withMoment,pass_id:'concurrent-identical'};
 const firstWriter=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'extraction-first-retry'}});
 let ready='',firstErrors='';firstWriter.stdout.on('data',b=>ready+=b);firstWriter.stderr.on('data',b=>firstErrors+=b);
 const firstDone=new Promise((resolve,reject)=>firstWriter.on('exit',c=>c===0?resolve():reject(Error(firstErrors))));
 firstWriter.stdin.write(asUser(`select learning.record_extraction_pass(${q(JSON.stringify(same))}::jsonb);select 'receipt_ready'`).replace('commit;','')+'\n');
 for(let n=0;!ready.includes('receipt_ready');n++){if(n>100)throw Error(firstErrors||'retry writer timeout');await new Promise(r=>setTimeout(r,20));}
 const retry=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'extraction-second-retry'}});
 let retryOutput='',retryErrors='';retry.stdout.on('data',b=>retryOutput+=b);retry.stderr.on('data',b=>retryErrors+=b);
 const retryDone=new Promise((resolve,reject)=>retry.on('exit',c=>c===0?resolve():reject(Error(retryErrors))));
 retry.stdin.end(asUser(`select learning.record_extraction_pass(${q(JSON.stringify(same))}::jsonb)`));
 try{let waiting=false;for(let n=0;n<100;n++){waiting=sql("select exists(select 1 from pg_stat_activity where application_name='extraction-second-retry' and wait_event='advisory')")==='t';if(waiting)break;await new Promise(r=>setTimeout(r,20));}check(waiting,'identical retry waits before row writes');}finally{firstWriter.stdin.end('commit;\n');}
 await Promise.all([firstDone,retryDone]);
 check(JSON.parse(retryOutput.split('\n').find(l=>l.startsWith('{'))).evidence_inserted===2,'concurrent retry returns original receipt');
 check(sql(`select count(*) from learning.evidence where provenance->>'pass_id'='concurrent-identical'`)==='2','concurrent retry persists one set of evidence rows');
 // A direct editorial writer takes the common exclusive lock via its trigger.
 extraVersion=version+1;
 const writer=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'extraction-editorial-writer'}});
 let output='',errors='';writer.stdout.on('data',b=>output+=b);writer.stderr.on('data',b=>errors+=b);
 const writerDone=new Promise((resolve,reject)=>writer.on('exit',c=>c===0?resolve():reject(Error(errors))));
 writer.stdin.write(`begin;insert into learning.ontology_versions(version,note) values (${extraVersion},'local concurrency test');select 'writer_ready';\n`);
 for(let n=0;!output.includes('writer_ready');n++){if(n>100)throw Error(errors||'writer timeout');await new Promise(r=>setTimeout(r,20));}
 const waiter=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'extraction-stale-reader'}});
 let waiterErrors='';waiter.stderr.on('data',b=>waiterErrors+=b);
 const waiterDone=new Promise(resolve=>waiter.on('exit',resolve));
 waiter.stdin.end(asUser(`select learning.record_extraction_pass(${q(JSON.stringify({...withMoment,pass_id:'concurrent-stale'}))}::jsonb)`));
 try{
 let waiting=false;for(let n=0;n<100;n++){waiting=sql("select exists(select 1 from pg_stat_activity where application_name='extraction-stale-reader' and wait_event='advisory')")==='t';if(waiting)break;await new Promise(r=>setTimeout(r,20));}
 check(waiting,'pass waits on direct ontology writer');
 }finally{writer.stdin.end('commit;\n');}
 await writerDone;check(await waiterDone!==0&&waiterErrors.includes('Ontology changed'),'waiting pass rejects stale version after writer commits');
 check(JSON.parse(call(request)).evidence_inserted===2,'identical completed receipt survives later ontology growth');
 check(sql(`select count(*) from learning.extraction_passes where pass_id='concurrent-stale'`)==='0','stale concurrent pass creates no receipt');
 console.log(`PASS: ${checks} extraction assertions`);
}finally{if(extraVersion!==null)sql(`delete from learning.ontology_versions where version=${extraVersion}`);sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in ('${id(1)}','${id(2)}');commit;`);}
