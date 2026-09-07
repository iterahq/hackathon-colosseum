#!/usr/bin/env node
// Origin: agent. Real local PostgreSQL caller/concurrency contract.
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
if(!['127.0.0.1','localhost'].includes(process.env.PGHOST))throw Error('Local database required');
const id=n=>`00910000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=s=>execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const user=(s,n=1)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',true);${s};commit;`;
const json=s=>JSON.parse(sql(s).split('\n').find(x=>x.startsWith('{')));
const context=ep=>json(user(`select learning.residue_repass_context('${ep}')`));
const call=(r,n=1)=>json(user(`select learning.record_residue_repass(${q(JSON.stringify(r))}::jsonb)`,n));
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS: '+label)};
const ev={claim_id:id(11),observed:'The learner compared criteria.',actor:'learner',direction:'supports',strength:'medium',confidence:.8,capability_id:null};
let seq=0;const request=ep=>{const c=context(ep);return{episode_id:ep,pass_id:`rr:test-${++seq}`,pass_at:'2026-09-08T00:00:00Z',context:c,provenance:{extractor:'residue-repass'},observations:c.sources.map(s=>({source_id:s.id,evidence:[]}))}};
const fail=(fn,pattern,label)=>{assert.throws(fn,pattern);check(true,label)};
let version;
async function locked(statement,fn){
 const p=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1']);let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);const done=new Promise((resolve,reject)=>p.on('exit',c=>c===0?resolve():reject(Error(out))));
 p.stdin.write(`begin;${statement};select 'ready';\n`);
 for(let n=0;!out.includes('ready');n++){if(n>100)throw Error(out||'lock timeout');await new Promise(r=>setTimeout(r,20));}
 try{await fn()}finally{p.stdin.end('rollback;\n');await done}
}
try{
 sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}','${id(3)}');
 insert into itera.users(id,email)values('${id(1)}','repass-a@example.invalid'),('${id(2)}','repass-b@example.invalid'),('${id(3)}','repass-op@example.invalid');
 insert into itera.identities(user_id,provider,provider_subject)select id,'password',id::text from itera.users where id in('${id(1)}','${id(2)}','${id(3)}');
 insert into learning.learners(id)values('${id(1)}'),('${id(2)}'),('${id(3)}');
 insert into itera.tenants(slug,name)values('itera','Itera')on conflict(slug)do nothing;
 insert into itera.memberships(user_id,tenant_id,role)select '${id(3)}',id,'owner' from itera.tenants where slug='itera';
 insert into learning.learning_objectives(id,learner_id,title)values('${id(12)}','${id(1)}','Active');
 insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(12)}','Freeform');commit;`);
 version=Number(sql('select max(version)+1 from learning.ontology_versions'));
 sql(`insert into learning.ontology_versions(version,created_by,note,reason)values(${version},'${id(3)}','0091 fixture','test');`);
 for(let n=21;n<=26;n++){
  sql(`insert into learning.work_episodes(id,learner_id,source,grain)values('${id(n)}','${id(1)}','test','session');
  insert into learning.residue(id,learner_id,episode_id,candidate,pass_id,pass_at,ontology_version,quality)values('${id(n+100)}','${id(1)}','${id(n)}','A preserved unmatched observation','initial','2026-09-07T00:00:00Z',${version-1},'digest');`);
 }
 const r=request(id(21));r.observations[0].evidence=[ev,{...ev,direction:'neutral'}];
 const first=call(r);check(first.evidence_inserted===2&&first.affected_claim_ids[0]===id(11),'several evidence rows retain one pass and affected claim');
 check(first.episodes_read===0&&first.residue_rows_read===1&&first.residue_rows_updated===0,'receipt reports source reads separately and no editorial updates');
 check(sql(`select count(*)from learning.evidence where episode_id='${id(21)}' and moment_id is null and provenance->>'quality'='digest' and status='active'`)==='2','digest NULL identity and same-pass status parity are preserved');
 check(context(id(21)).sources.length===0,'matched source is consumed through receipt');
 check(JSON.stringify(call(r))===JSON.stringify(first),'exact retry returns prior result before eligibility');
 fail(()=>call({...r,pass_at:'2026-09-09T00:00:00Z'}),/retry payload conflicts/,'changed retry fails');
 const no=request(id(22));check(call(no).outcomes[0].outcome==='unmatched','unmatched outcome has a durable receipt');
 check(context(id(22)).sources.length===0,'unchanged unmatched input skips');
 sql(`update learning.claims set title='Changed active claim' where id='${id(11)}'`);
 check(context(id(22)).sources.length===1,'claim input change permits unmatched retry');
 const stale=request(id(22));sql(`update learning.claims set description='changed after freeze' where id='${id(11)}'`);
 fail(()=>call(stale),/changed; re-read inputs/,'stale claim context refuses before writes');
 check(sql(`select count(*)from learning.evidence where episode_id='${id(22)}'`)==='0','stale refusal writes no evidence');
 const other=request(id(23));fail(()=>call(other,2),/changed; re-read inputs/,'foreign learner context fails');
 const invalid=request(id(23));invalid.observations[0].evidence=[ev,{...ev,capability_id:'cap_invented'}];
 fail(()=>call(invalid),/outside current vocabulary/,'invalid later evidence rejects the whole pass');
 check(sql(`select count(*)from learning.evidence where episode_id='${id(23)}'`)==='0','late failure rolls back prior evidence');
 fail(()=>call({...request(id(23)),observations:[]}),/Every eligible source/,'omitted source fails');
 const direct=request(id(23));direct.observations[0].evidence=[ev];
 const directResult=json(user(`insert into learning.residue_repasses(learner_id,episode_id,pass_id,request,result)values('${id(1)}','${id(23)}','${direct.pass_id}',${q(JSON.stringify(direct))},'{"forged":true}')returning result`));
 check(directResult.evidence_inserted===1&&!directResult.forged,'direct receipt insert executes validated writes and computes actual result');
 fail(()=>sql(user(`update learning.residue_repasses set result='{}'`)),/permission denied/,'receipts are immutable');
 fail(()=>sql(`begin;set local role service_role;select set_config('request.jwt.claim.sub','${id(1)}',true);select learning.record_residue_repass('{}');rollback;`),/permission denied/,'service role cannot execute caller RPC');
 // Operator decision at the same map version re-enables an unmatched source.
 const promoted=request(id(24));call(promoted);
 const cap='cap_0091_fixture';
 sql(user(`insert into learning.capabilities(id,title,source,introduced_in)values('${cap}','Fixture','{"kind":"editorial"}',${version})`,3));
 sql(user(`update learning.residue set status='promoted',promoted_to_capability_id=${q(cap)},promoted_by='${id(3)}',promoted_at=now() where id='${id(124)}'`,3));
 check(context(id(24)).sources.length===1,'promotion permits retry without another ontology version');
 const pr=request(id(24));pr.observations[0].evidence=[{...ev,capability_id:cap}];call(pr);
 check(sql(`select status from learning.residue where id='${id(124)}'`)==='promoted','re-pass preserves operator promotion');
 sql(user(`update learning.residue set status='dismissed' where id='${id(125)}'`,3));
 check(context(id(25)).sources.length===0,'dismissed rows are excluded');
 const concurrent=request(id(26));
 await locked(`lock table learning.claims in row exclusive mode`,()=>fail(()=>call(concurrent),/could not obtain lock/,'concurrent claim writer refuses immediately'));
 await locked(`select pg_advisory_xact_lock(20260903,82)`,()=>fail(()=>call(concurrent),/Editorial writer busy/,'editorial advisory conflict refuses without deadlock'));
 await locked(`select pg_advisory_xact_lock(hashtextextended('learning.evidence.status:${id(1)}',0))`,()=>fail(()=>call(concurrent),/Evidence writer busy/,'concurrent evidence writer refuses without deadlock'));
 await locked(`select id from learning.residue where id='${id(126)}' for update`,()=>fail(()=>call(concurrent),/could not obtain lock/,'source row lock conflict refuses without waiting'));
 sql(`insert into learning.episode_moments(id,learner_id,episode_id,kind,payload,at)values('${id(226)}','${id(1)}','${id(26)}','turn','{}','2026-09-07T00:00:00Z');update learning.residue set quality='transcript',moment_id='${id(226)}' where id='${id(126)}'`);
 const captured=request(id(26));captured.observations[0].evidence=[ev];call(captured);
 check(sql(`select count(*)from learning.evidence where episode_id='${id(26)}' and moment_id='${id(226)}' and provenance->>'quality'='transcript'`)==='1','captured transcript source retains its actual moment');
 check(sql(user('select count(*)from learning.residue_repasses',2)).split('\n').includes('0'),'another learner reads no caller receipts');
 fail(()=>sql(user(`select learning.residue_repass_context('${id(26)}')`).replace('begin;','begin isolation level repeatable read;')),/requires READ COMMITTED/,'unsupported snapshot isolation is refused');
 console.log(`${checks} residue re-pass assertions passed`);
}finally{
 sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}','${id(3)}');commit;`);
 sql("delete from learning.capabilities where id='cap_0091_fixture'");
 if(version)sql(`delete from learning.ontology_versions where version=${version} and note='0091 fixture'`);
}
