#!/usr/bin/env node
// Origin: agent. Local PostgreSQL only; never a production backfill.
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
if (!['127.0.0.1','localhost'].includes(process.env.PGHOST)) throw Error('Local database required');
const migration=readFileSync(new URL('../migrations/0090_learning_digest_extraction.sql',import.meta.url),'utf8');
const boundary='2026-09-07T20:00:00+00:00';
assert.ok(migration.includes("t14_boundary constant timestamptz:='2026-09-07T21:01:16Z';"),'production boundary is the verified T14 mergedAt');
const heldMigration=migration.replace(/t14_boundary constant timestamptz:=[^;]+;/,'t14_boundary constant timestamptz:=null;');
const fixtureMigration=migration.replace(/t14_boundary constant timestamptz:=[^;]+;/,`t14_boundary constant timestamptz:='${boundary}';`);
assert.notEqual(fixtureMigration,migration,'fixture must replace the held boundary');
const id=n=>`00900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=s=>execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const asUser=(s,who=1)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(who)}',true);${s};commit;`;
const call=(r,who=1)=>JSON.parse(sql(asUser(`select learning.record_extraction_pass(${q(JSON.stringify(r))}::jsonb)`,who)).split('\n').find(x=>x.startsWith('{')));
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS: '+label)};
const ev={claim_id:id(11),observed:'The learner compared two criteria.',actor:'learner',direction:'supports',strength:'medium',confidence:.8,capability_id:null};
const observations=[{observation_id:'o1',moment_id:null,evidence:[ev,{...ev,direction:'neutral'}],residue:null},{observation_id:'o2',moment_id:null,evidence:[],residue:{candidate:'The learner explained an unmatched skill.',suggested_label:'Explanation',nearest_capability_id:null,nearest_score:null}}];
const baseline=ep=>JSON.parse(sql(`select jsonb_build_object('t14_merged_at','${boundary}','evidence_ids',coalesce((select jsonb_agg(id order by id)from learning.evidence where episode_id='${ep}'),'[]'::jsonb),'turn_ids',coalesce((select jsonb_agg(id order by id)from learning.work_episodes where session_episode_id='${ep}'),'[]'::jsonb),'moment_ids',coalesce((select jsonb_agg(id order by id)from learning.episode_moments where episode_id='${ep}'),'[]'::jsonb))`));
const request=ep=>({episode_id:ep,pass_id:'digest-backfill-v1',pass_at:'2026-09-07T21:00:00Z',ontology_version:Number(sql('select max(version) from learning.ontology_versions')),quality:'digest',provenance:{extractor:'closed-set-extractor',digest_backfill:baseline(ep)},observations});
try {
 sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in ('${id(1)}','${id(2)}');insert into itera.users(id,email)values('${id(1)}','digest-a@example.invalid'),('${id(2)}','digest-b@example.invalid');insert into itera.identities(user_id,provider,provider_subject)values('${id(1)}','password','${id(1)}'),('${id(2)}','password','${id(2)}');insert into learning.learners(id)values('${id(1)}'),('${id(2)}');insert into learning.learning_objectives(id,learner_id,title)values('${id(12)}','${id(1)}','Test');insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(12)}','Test');commit;`);
 for(let n=21;n<=27;n++) sql(`insert into learning.work_episodes(id,learner_id,source,grain,created_at,payload)values('${id(n)}','${id(1)}','test','session','2026-09-07T19:00:00Z','{"regroup_migration":"0088_learning_session_regroup","freeze_before":"2026-09-07T18:30:00Z"}');insert into learning.work_episodes(id,learner_id,source,grain,session_episode_id,payload)values('${id(n+100)}','${id(1)}','test','turn','${id(n)}','{"agent_turn":{"text":"A complete captured agent answer."}}');insert into learning.episode_moments(id,learner_id,episode_id,kind,payload,at)values('${id(n+200)}','${id(1)}','${id(n)}','turn','{}','2026-09-07T18:00:00Z');`);
 sql(`update learning.work_episodes set started_at='2026-09-07T18:00:00Z' where learner_id='${id(1)}' and session_episode_id is not null;
 update learning.episode_moments m set payload=jsonb_build_object('turn_episode_id',t.id,'digest_ref',jsonb_build_object('table','learning.work_episodes','id',t.id))from learning.work_episodes t where t.session_episode_id=m.episode_id and t.learner_id='${id(1)}';
 update learning.work_episodes s set payload=s.payload||jsonb_build_object('turn_manifest',(select jsonb_agg(jsonb_build_object('id',t.id,'moment_id',m.id))from learning.work_episodes t join learning.episode_moments m on m.episode_id=t.session_episode_id where t.session_episode_id=s.id)) where s.learner_id='${id(1)}' and s.grain='session';`);
 sql(heldMigration);
 const inventory=JSON.parse(sql(asUser('select learning.export_inventory()')).split('\n').find(x=>x.startsWith('[')));
 check(inventory.includes('extraction_passes')&&inventory.includes('work_episodes')&&!inventory.includes('users'),'caller inventory exposes learning table names only');
 assert.throws(()=>sql("begin;set local role service_role;select learning.export_inventory();rollback;"),/permission denied/);check(true,'service role cannot execute inventory RPC');
 assert.throws(()=>call(request(id(21))),/boundary is not finalized/);check(true,'held production boundary rejects digest writes');
 const forgedEmpty=request(id(21));forgedEmpty.observations=[];
 assert.throws(()=>sql(asUser(`insert into learning.extraction_passes(learner_id,episode_id,pass_id,request,result)values('${id(1)}','${id(21)}','digest-backfill-v1',${q(JSON.stringify(forgedEmpty))},'{"evidence_ids":[],"residue_ids":[],"evidence_inserted":0,"residue_inserted":0}')`)),/boundary is not finalized/);
 check(true,'direct zero-output receipt cannot bypass the held boundary');
 sql(fixtureMigration);
 sql(`insert into learning.evidence(id,learner_id,claim_id,episode_id,observed,actor,direction,strength,confidence,created_at,provenance)values('${id(50)}','${id(1)}','${id(11)}','${id(21)}','Historical evidence','learner','supports','weak',.5,'2026-09-07T19:00:00Z','{"pass_at":"2026-09-07T19:00:00Z"}')`);
 const r=request(id(21));const first=call(r);check(first.evidence_inserted===2&&first.residue_inserted===1,'mixed digest pass preserves several evidence rows and distinct residue');
 check(sql(`select count(*)from learning.evidence where episode_id='${id(21)}' and moment_id is null`)==='3','historical and digest evidence keep NULL observation moment identity');
 check(sql(`select count(*)from learning.residue where episode_id='${id(21)}' and quality='digest' and moment_id is null`)==='1','digest residue stays NULL despite preserved A2 turn moments');
 check(sql(`select count(*)from learning.evidence where id='${id(50)}'`)==='1','old evidence is preserved');
 check(JSON.stringify(call(r))===JSON.stringify(first),'exact retry precedes already-extracted eligibility');
 sql(`insert into learning.evidence(learner_id,claim_id,episode_id,observed,actor,direction,strength,confidence,provenance)values('${id(1)}','${id(11)}','${id(21)}','A later legitimate pass','learner','supports','medium',.7,'{"pass_at":"2026-09-08T00:00:00Z"}')`);
 check(JSON.stringify(call(r))===JSON.stringify(first),'later evidence does not invalidate an existing digest receipt');
 assert.throws(()=>call({...r,pass_id:'different'}),/already has an extraction pass/);check(true,'another pass ID cannot duplicate the historical backfill');
 assert.throws(()=>call({...r,observations:[]}),/retry payload conflicts/);check(true,'changed retry payload conflicts');
 assert.throws(()=>call(request(id(22)),2),/not owned/);check(true,'another learner cannot backfill the session');
 assert.throws(()=>call({...request(id(22)),observations:[{...observations[0],moment_id:id(222)}]}),/cannot claim captured moment/);check(true,'digest rejects a real captured moment as observation identity');
 const stale=request(id(22));stale.provenance.digest_backfill.turn_ids=[];
 assert.throws(()=>call(stale),/baseline differs/);check(true,'omitted baseline source IDs fail before writes');
 assert.throws(()=>call({...request(id(22)),quality:'transcript'}),/require digest/);check(true,'A2 digests cannot be mislabeled as transcripts');
 assert.throws(()=>call({...request(id(22)),observations:[observations[1],{...observations[0],evidence:[{...ev,claim_id:id(999)}]}]}));
 check(sql(`select count(*)from learning.residue where episode_id='${id(22)}'`)==='0','late invalid observation rolls back residue');
 const zero=request(id(22));zero.observations=[];check(call(zero).evidence_inserted===0,'zero-output digest stores a retry receipt');check(call(zero).residue_inserted===0,'zero-output retry is idempotent');
 sql(`update learning.work_episodes set payload='{}' where id='${id(123)}'`);
 assert.throws(()=>call(request(id(23))),/no complete captured agent half/);check(true,'missing agent half is ineligible');
 sql(`update learning.work_episodes set payload='{}' where id='${id(24)}'`);
 assert.throws(()=>call(request(id(24))),/requires a preserved historical/);check(true,'new untagged session is ineligible');
 sql(`insert into learning.evidence(learner_id,claim_id,episode_id,observed,actor,direction,strength,confidence,provenance)values('${id(1)}','${id(11)}','${id(25)}','A newer pass','learner','supports','medium',.7,'{"pass_at":"2026-09-07T20:00:00Z"}')`);
 assert.throws(()=>call(request(id(25))),/already has post-T14/);check(true,'evidence at the exact inclusive release boundary blocks digest');
 // Real writer commits while the digest waits on the same learner lock.
 const concurrent=request(id(26));const writer=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'digest-evidence-writer'}});let output='';writer.stdout.on('data',b=>output+=b);writer.stderr.on('data',b=>output+=b);const writerDone=new Promise((resolve,reject)=>writer.on('exit',c=>c===0?resolve():reject(Error(output))));
 writer.stdin.write(asUser(`insert into learning.evidence(learner_id,claim_id,episode_id,observed,actor,direction,strength,confidence,provenance)values('${id(1)}','${id(11)}','${id(26)}','Concurrent newer pass','learner','supports','medium',.7,'{"pass_at":"2026-09-07T20:01:00Z"}');select 'writer_ready'`).replace('commit;','')+'\n');
 for(let n=0;!output.includes('writer_ready');n++){if(n>100)throw Error(output||'writer timeout');await new Promise(r=>setTimeout(r,20));}
 const pending=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGAPPNAME:'digest-waiter'}});let err='';pending.stderr.on('data',b=>err+=b);const done=new Promise(resolve=>pending.on('exit',resolve));pending.stdin.end(asUser(`select learning.record_extraction_pass(${q(JSON.stringify(concurrent))}::jsonb)`));
 let waiting=false;for(let n=0;n<100;n++){waiting=sql("select exists(select 1 from pg_stat_activity where application_name='digest-waiter' and wait_event='advisory')")==='t';if(waiting)break;await new Promise(r=>setTimeout(r,20));}
 writer.stdin.end('commit;\n');await writerDone;const code=await done;check(waiting&&code!==0&&err.includes('post-T14'),'concurrent newer evidence commits before digest eligibility is evaluated');
 check(sql(`select count(*)from learning.extraction_passes where episode_id='${id(26)}'`)==='0','concurrent refusal leaves no partial receipt');
 if(process.env.ITERA_DIGEST_ENGINE_ROOT){
  const root=process.env.ITERA_DIGEST_ENGINE_ROOT;
  const initial=request(id(27));initial.provenance.digest_backfill.t14_merged_at='2026-09-07T20:00:00Z';
  const wire=JSON.parse(execFileSync(`${root}/node_modules/.bin/tsx`,[`${root}/apps/engine/scripts/digest-contract-request.ts`],{
   input:JSON.stringify({episodeId:id(27),passAt:'2026-09-07T21:00:00Z',ontologyVersion:initial.ontology_version,provenance:initial.provenance,model:'fixture-model',observations:initial.observations}),encoding:'utf8',
   env:{...process.env,SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_JWT_SECRET:'fixture-secret-not-for-production-use',OPENROUTER_API_KEY:'fixture-key'},stdio:['pipe','pipe','pipe']}));
  check(wire.provenance.digest_backfill.t14_merged_at.endsWith('Z'),'engine wire preserves GitHub Z timestamp');
  check(call(wire).evidence_inserted===2,'real engine-produced Z request commits against timestamptz SQL boundary');
 }else console.log('Cross-layer engine wire check requires ITERA_DIGEST_ENGINE_ROOT (local paired-checkout verification).');
 console.log(`${checks} digest extraction assertions passed`);
} finally {
 sql(migration);
 sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in ('${id(1)}','${id(2)}');commit;`);
}
