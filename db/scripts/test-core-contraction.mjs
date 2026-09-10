#!/usr/bin/env node
// Origin: agent. Populated 0098 prefix -> real-applier 0099 -> native-only replay.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
if (!["localhost", "127.0.0.1"].includes(process.env.PGHOST))
  throw Error("Local database required");
const root = new URL("../../", import.meta.url).pathname;
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const migration = read("../migrations/0099_learning_core_contraction.sql");
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const id = (n) => `00980000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sql = (s) =>
  execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: s,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const caller = (s, n = 1) =>
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',true);${s};commit;`;
const json = (s) =>
  JSON.parse(
    sql(s)
      .split("\n")
      .find((x) => x.startsWith("{")),
  );
const rpc = (name, r, n = 1) =>
  json(caller(`select learning.${name}(${q(JSON.stringify(r))}::jsonb)`, n));
const census = () => sql(read("./census.sql"));
const snapshot = (includeRetired = false) => {
  const tables = sql(
    "select relname from pg_class where relnamespace='learning'::regnamespace and relkind='r' order by relname",
  )
    .split("\n")
    .filter(
      (t) =>
        includeRetired || !["checkpoints", "generation_config"].includes(t),
    );
  if (!includeRetired) assert.equal(tables.length, 30);
  return sql(
    "select jsonb_build_object(" +
      tables
        .map((t) => {
          const row =
            t === "evidence" && !includeRetired
              ? "(to_jsonb(r)-'provenance')||jsonb_build_object('compat_provenance',learning.native_evidence_metadata(r))"
              : "to_jsonb(r)";
          return (
            q(t) +
            ",(select coalesce(jsonb_agg(encode(sha256(convert_to((" +
            row +
            ")::text,'UTF8')),'hex')order by (" +
            row +
            ")::text),'[]'::jsonb)from learning." +
            t +
            " r)"
          );
        })
        .join(",") +
      ")::text",
  );
};
const allLearningRows = () => {
  const tables = sql(
    "select relname from pg_class where relnamespace='learning'::regnamespace and relkind='r' order by relname",
  ).split("\n");
  assert.equal(tables.length, 32);
  return sql(
    "select jsonb_build_object(" +
      tables
        .map(
          (t) =>
            q(t) +
            ",(select coalesce(jsonb_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex')order by to_jsonb(r)::text),'[]'::jsonb)from learning." +
            t +
            " r)",
        )
        .join(",") +
      ")::text",
  );
};
let checks = 0,
  version;
const check = (v, s) => {
  assert.ok(v, s);
  checks++;
  console.log("PASS: " + s);
};
const fail = (fn, re, s) => {
  assert.throws(fn, re);
  check(true, s);
};
const apply = () => {
  const out = execFileSync(
    "bash",
    [root + "db/scripts/apply-migrations.sh", "apply"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (process.env.CORE_CONTRACTION_APPLY_LOG)
    appendFileSync(process.env.CORE_CONTRACTION_APPLY_LOG, out);
  return out;
};
const refuse = (re, label) => {
  const before = snapshot(true),
    cat = census();
  fail(apply, re, label);
  check(
    before === snapshot(true) && cat === census(),
    "refusal leaves all rows/catalog unchanged: " + label,
  );
};
async function locked(statement, fn) {
  const p = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
  let out = "";
  p.stdout.on("data", (b) => (out += b));
  p.stderr.on("data", (b) => (out += b));
  const done = new Promise((resolve, reject) =>
    p.on("exit", (c) => (c === 0 ? resolve() : reject(Error(out)))),
  );
  p.stdin.write(`begin;${statement};select 'ready';\n`);
  for (let n = 0; !out.includes("ready"); n++) {
    if (n > 150) throw Error("local lock fixture not ready");
    await new Promise((r) => setTimeout(r, 20));
  }
  try {
    await fn();
  } finally {
    p.stdin.end("rollback;\n");
    await done;
  }
}
const ev = {
  claim_id: id(11),
  observed: "A local preserved observation.",
  actor: "learner",
  direction: "supports",
  strength: "medium",
  confidence: 0.8,
  capability_id: null,
};
const extract = (episode, pass) => ({
  episode_id: episode,
  pass_id: pass,
  pass_at: "2026-09-08T00:00:00.000+00:00",
  ontology_version: version,
  quality: "transcript",
  provenance: { extractor: "fixture", provider: null, model: "fixture" },
  observations: [
    {
      observation_id: "one",
      moment_id: episode === id(53) ? id(253) : null,
      evidence: [ev, { ...ev, direction: "neutral" }],
      residue: null,
    },
  ],
});
const repass = (ep) => {
  const context = json(
    caller(`select learning.residue_repass_context('${id(ep)}')`),
  );
  return {
    episode_id: id(ep),
    pass_id: `rr:core-${ep}`,
    pass_at: "2026-09-08T00:00:00Z",
    context,
    provenance: { extractor: "fixture" },
    observations: context.sources.map((s) => ({
      source_id: s.id,
      evidence: [ev, { ...ev, direction: "neutral" }],
    })),
  };
};
const digest = (ep, pass) => {
  const baseline = json(
    caller(
      `select jsonb_build_object('t14_merged_at','2026-09-07T21:01:16Z','evidence_ids',coalesce((select jsonb_agg(id order by id)from learning.evidence where episode_id='${ep}'),'[]'::jsonb),'turn_ids',(select jsonb_agg(id order by id)from learning.work_episodes where session_episode_id='${ep}'),'moment_ids',(select jsonb_agg(id order by id)from learning.episode_moments where episode_id='${ep}'))`,
    ),
  );
  return {
    ...extract(ep, pass),
    quality: "digest",
    provenance: {
      extractor: "closed-set-extractor",
      digest_backfill: baseline,
    },
  };
};
try {
  check(
    sql(
      "select count(*)from pg_attribute where attrelid='learning.evidence'::regclass and attname='provenance'and not attisdropped",
    ) === "1",
    "fixture starts with the physical 0098 prefix",
  );
  sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');
 insert into itera.users(id,email)values('${id(1)}','core-a@example.invalid'),('${id(2)}','core-b@example.invalid');
 insert into itera.identities(user_id,provider,provider_subject)select id,'password',id::text from itera.users where id in('${id(1)}','${id(2)}');
 insert into learning.learners(id)values('${id(1)}'),('${id(2)}');
 insert into learning.learning_objectives(id,learner_id,title)values('${id(10)}','${id(1)}','Fixture');
 insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(10)}','Free form');
 insert into learning.work_contexts(id,learner_id,project_root,project_ref,machine,machine_class)values('${id(20)}','${id(1)}','/fixture','/fixture','fixture','human');
 insert into learning.work_episodes(id,learner_id,source,machine,machine_class,project_ref,work_context_id,grain,started_at,ended_at,created_at,payload,ingest_batch_id,source_ingest_batch_id)values
 ('${id(31)}','${id(1)}','fixture','fixture','human','/fixture','${id(20)}','turn','2026-09-01T10:00Z','2026-09-01T10:01Z','2026-09-07T18:00Z','{"agent_turn":{"text":"A complete local agent answer."}}','${id(91)}','${id(91)}'),
 ('${id(32)}','${id(1)}','fixture','fixture','human','/fixture','${id(20)}','turn','2026-09-01T12:00Z','2026-09-01T12:01Z','2026-09-07T18:00Z','{"agent_turn":{"text":"Another complete local answer."}}',null,null);
 insert into learning.evidence(id,learner_id,claim_id,episode_id,observed,actor,direction,strength,provenance)values('${id(41)}','${id(1)}','${id(11)}','${id(31)}','Historical support','learner','supports','medium','{"extractor":"legacy","pass_id":"old","pass_at":"2026-09-01T13:00:00+00:00","surface":null,"digest_backfill":{"n":1.00},"episode_id":"old-source-ref"}');commit;`);
  sql(
    "alter table learning.work_episodes alter column created_at set default '2026-09-07T19:00Z'::timestamptz",
  );
  sql(read("../migrations/0088_learning_session_regroup.sql"));
  sql(
    "alter table learning.work_episodes alter column created_at set default now()",
  );
  const parent = (n) =>
    sql(
      `select session_episode_id from learning.work_episodes where id='${id(n)}'`,
    );
  version = Number(
    sql("select max(version)+1 from learning.ontology_versions"),
  );
  sql(
    `insert into learning.ontology_versions(version,created_by,note,reason)values(${version},'${id(1)}','0098 fixture','test')`,
  );
  for (const ep of [51, 52, 53, 54])
    sql(
      `insert into learning.work_episodes(id,learner_id,source,grain)values('${id(ep)}','${id(1)}','fixture','session')`,
    );
  for (const ep of [52, 54])
    sql(
      `insert into learning.residue(id,learner_id,episode_id,candidate,pass_id,pass_at,ontology_version,quality)values('${id(ep + 100)}','${id(1)}','${id(ep)}','Preserved local residue','before','2026-09-07T00:00Z',${version - 1},'digest')`,
    );
  sql(
    `insert into learning.episode_moments(id,learner_id,episode_id,kind,payload,at)values('${id(253)}','${id(1)}','${id(53)}','turn','{}','2026-09-07T00:00Z'),('${id(254)}','${id(1)}','${id(54)}','turn','{}','2026-09-07T00:00Z');update learning.residue set quality='transcript',moment_id='${id(254)}'where id='${id(154)}'`,
  );
  const oldExtraction = extract(id(51), "before"),
    oldExtractionResult = rpc("record_extraction_pass", oldExtraction);
  const oldRepass = repass(52),
    oldRepassResult = rpc("record_residue_repass", oldRepass);
  const oldDigest = digest(parent(31), "digest:before"),
    oldDigestResult = rpc("record_extraction_pass", oldDigest);
  // Historical suites exercise old RPC bodies. Reproduce that real drift
  // explicitly, then prove canonical restoration changes no populated rows.
  sql(read("../migrations/0090_learning_digest_extraction.sql"));
  check(
    sql(
      "select position('metadata_row:='in prosrc)=0 from pg_proc where oid='learning.record_extraction_pass(jsonb)'::regprocedure",
    ) === "t",
    "historical RPC replay reproduces the physical writer before restoration",
  );
  const preRestoreRows = allLearningRows();
  const restoreLog = execFileSync(
    "bash",
    [root + "db/scripts/test-core-contraction.sh", "restore"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (process.env.CORE_CONTRACTION_APPLY_LOG)
    appendFileSync(process.env.CORE_CONTRACTION_APPLY_LOG, restoreLog);
  check(
    allLearningRows() === preRestoreRows,
    "canonical prefix restoration preserves all32 populated table row hashes",
  );
  check(
    sql(
      "select position('metadata_row:='in prosrc)>0 from pg_proc where oid='learning.record_extraction_pass(jsonb)'::regprocedure",
    ) === "t",
    "populated suffix starts with the actual0095 native RPC writer",
  );
  const preserved = snapshot();
  const functions = () =>
    sql(
      "select jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('acl',proacl,'definer',prosecdef,'config',proconfig,'body',prosrc))from pg_proc where pronamespace='learning'::regnamespace and proname=any(array['record_extraction_pass','record_residue_repass','write_residue_repass','validate_extraction_receipt','refresh_evidence_status_for_learner','verify_a2_manifest','evidence_metadata_from_json','a2_legacy_episode_row','export_work_episode_columns'])",
    );
  const functionBefore = functions();
  sql(
    `insert into learning.checkpoints(id,episode_id,question)values('${id(71)}','${id(51)}','Preserve this checkpoint')`,
  );
  refuse(/zero checkpoints/, "nonempty checkpoints cannot be dropped");
  sql(`delete from learning.checkpoints where id='${id(71)}'`);
  sql("update learning.generation_config set daily_cap=6");
  refuse(/configuration changed/, "changed legacy setting cannot be dropped");
  sql("update learning.generation_config set daily_cap=5");
  const configTime = sql(
    "select updated_at::text from learning.generation_config",
  );
  sql(
    "update learning.generation_config set updated_at=now()+interval '1 day'",
  );
  refuse(/configuration changed after/, "later config edit timestamp refuses");
  sql(
    `update learning.generation_config set updated_at=${q(configTime)}::timestamptz`,
  );
  sql(`update learning.generation_config set updated_by='${id(1)}'`);
  refuse(
    /configuration changed/,
    "changed config attribution cannot be dropped",
  );
  sql("update learning.generation_config set updated_by=null");
  sql("alter table learning.generation_config add column unexpected text");
  refuse(/unaccounted field/, "unknown config data column refuses");
  sql("alter table learning.generation_config drop column unexpected");
  sql("update learning.evidence_models set per_episode_cap=4");
  refuse(/does not preserve/, "different model replacement refuses");
  sql("update learning.evidence_models set per_episode_cap=3");
  sql(
    `insert into learning.evidence_models(id,title)values('${id(72)}','Ambiguous')`,
  );
  refuse(/exactly one/, "ambiguous global model replacement refuses");
  sql(`delete from learning.evidence_models where id='${id(72)}'`);
  sql(
    `insert into learning.evidence_model_objectives(evidence_model_id,objective_id)select id,'${id(10)}'from learning.evidence_models`,
  );
  refuse(
    /exactly one/,
    "linked-only model is not the original global replacement",
  );
  sql(
    `delete from learning.evidence_model_objectives where objective_id='${id(10)}'`,
  );
  sql("alter table learning.generation_config rename to core_config_partial");
  refuse(/Partial core contraction/, "partially removed schema refuses");
  sql("alter table learning.core_config_partial rename to generation_config");
  sql(
    "create view learning.core_unexpected_dependency as select provenance from learning.evidence",
  );
  refuse(/depend on it/, "unexpected dependent view blocks without CASCADE");
  sql("drop view learning.core_unexpected_dependency");
  sql(
    `alter table learning.evidence disable trigger evidence_metadata_bridge;update learning.evidence set surface='lost'where id='${id(41)}';alter table learning.evidence enable trigger evidence_metadata_bridge`,
  );
  refuse(/not lossless/, "physical/native mismatch refuses");
  sql(
    `alter table learning.evidence disable trigger evidence_metadata_bridge;update learning.evidence set surface=null where id='${id(41)}';alter table learning.evidence enable trigger evidence_metadata_bridge`,
  );
  for (const table of [
    "evidence",
    "checkpoints",
    "generation_config",
    "evidence_models",
    "assembly_models",
    "evidence_model_objectives",
    "assembly_model_objectives",
  ])
    await locked(`lock table learning.${table} in row exclusive mode`, () => {
      const started = Date.now();
      fail(
        apply,
        /could not obtain lock/,
        "concurrent " + table + " writer refuses",
      );
      check(
        Date.now() - started < 10000,
        "NOWAIT refusal is bounded for " + table,
      );
    });
  check(
    snapshot() === preserved,
    "all negative fixtures restore every original surviving row",
  );
  const out = apply();
  check(
    out.includes("0099_learning_core_contraction.sql"),
    "real applier executes 0099",
  );
  check(
    snapshot() === preserved,
    "contraction preserves every surviving field/ID and derived JSON text",
  );
  check(
    functions() === functionBefore,
    "RPC/receipt/status/manifest bodies grants and settings stay exact",
  );
  check(
    sql(
      "select count(*)from pg_class where relnamespace='learning'::regnamespace and relkind='r'",
    ) === "30",
    "exactly the two approved tables retire",
  );
  check(
    sql(
      "select count(*)from pg_attribute where attrelid='learning.evidence'::regclass and attnum>0 and not attisdropped",
    ) === "41",
    "only the physical provenance column retires",
  );
  check(
    json(caller("select learning.verify_a2_manifest()")).verified,
    "all original A2 manifests verify after the drop",
  );
  for (const [name, r, result] of [
    ["record_extraction_pass", oldExtraction, oldExtractionResult],
    ["record_extraction_pass", oldDigest, oldDigestResult],
    ["record_residue_repass", oldRepass, oldRepassResult],
  ])
    check(
      JSON.stringify(rpc(name, r)) === JSON.stringify(result),
      "exact saved " + name + " receipt survives",
    );
  check(snapshot() === preserved, "exact retries produce no extra rows");
  check(
    rpc("record_extraction_pass", extract(id(53), "after"))
      .evidence_inserted === 2,
    "native transcript RPC preserves several rows per pass",
  );
  check(
    rpc("record_residue_repass", repass(54)).evidence_inserted === 2,
    "native re-pass RPC preserves several rows per pass",
  );
  check(
    rpc("record_extraction_pass", digest(parent(32), "digest:after"))
      .evidence_inserted === 2,
    "native historical digest RPC still validates its baseline",
  );
  check(
    sql(
      `select count(*)from learning.evidence where episode_id='${id(53)}'and moment_id='${id(253)}'and quality='transcript'`,
    ) === "2",
    "new transcript extraction retains the real captured moment",
  );
  check(
    sql(
      `select count(*)from learning.evidence where episode_id='${id(54)}'and moment_id='${id(254)}'and quality='transcript'and source_residue_id='${id(154)}'`,
    ) === "2",
    "new transcript re-pass retains captured moment and source residue",
  );
  const native = (marker, extra = "") =>
    caller(
      `insert into learning.evidence(learner_id,claim_id,episode_id,observed,actor,direction,strength,source_metadata_keys${extra ? "," + extra.split("=")[0] : ""})values('${id(1)}','${id(11)}','${id(53)}','Native activity','learner','supports','weak',${marker}${extra ? "," + extra.slice(extra.indexOf("=") + 1) : ""})`,
    );
  sql(native("array['surface']"));
  check(
    sql(
      `select count(*)from learning.evidence where learner_id='${id(1)}' and source_metadata_keys=array['surface']and surface is null`,
    ) === "1",
    "native explicit-null-only metadata remains valid",
  );
  for (const method of ["assessed", "graded", "engagement"]) {
    const metadata = {
      extractor: "activity-response/v1",
      source: "activity_response",
      assessment_method: method,
      activity_id: "activity-source-ref",
      activity_kind: "quiz",
      activity_response_id: "response-source-ref",
      surface: null,
      prompt_version: "v1",
    };
    sql(
      caller(
        `insert into learning.evidence(learner_id,claim_id,episode_id,observed,actor,direction,strength,extractor,source,assessment_method,activity_id,activity_kind,source_activity_response_ref,surface,prompt_version,source_metadata_keys)values('${id(1)}','${id(11)}','${id(53)}','Native activity ${method}','learner','supports','weak','activity-response/v1','activity_response',${q(method)},'activity-source-ref','quiz','response-source-ref',null,'v1',array['activity_id','activity_kind','activity_response_id','assessment_method','extractor','prompt_version','source','surface'])`,
      ),
    );
    check(
      sql(
        `select learning.native_evidence_metadata(e)=${q(JSON.stringify(metadata))}::jsonb and activity_response_id is null from learning.evidence e where learner_id='${id(1)}' and observed=${q("Native activity " + method)}`,
      ) === "t",
      `native ${method} activity payload preserves eight keys and separate source reference`,
    );
  }
  for (const marker of [
    "null",
    "'{}'::text[]",
    "array['unknown']",
    "array['surface','surface']",
    "array['surface','model']",
    "array['surface',null]",
    "'[0:0]={surface}'::text[]",
    "array[array['surface']]",
  ])
    fail(
      () => sql(native(marker)),
      /metadata/i,
      "malformed or empty marker refuses",
    );
  fail(
    () => sql(native("array['surface']", "model='missing-marker'")),
    /absent from key marker/,
    "nonnull field without its marker refuses",
  );
  fail(
    () => sql(native("array['surface']", "digest_backfill='null'::jsonb")),
    /absent from key marker/,
    "JSON null remains present and needs its source marker",
  );
  fail(
    () => sql(native("array['surface']").replace(id(1), id(2))),
    /row-level security|does not exist|learner/i,
    "foreign caller cannot write own fixture evidence",
  );
  for (const role of ["anon", "service_role"])
    fail(
      () =>
        sql(
          `begin;set local role ${role};select learning.evidence_metadata_from_json('{"surface":null}');rollback`,
        ),
      /permission denied/,
      "unauthorized " + role + " constructor refuses",
    );
  fail(
    () =>
      sql(
        caller(
          `update learning.evidence set pass_id='forged'where id='${id(41)}'`,
        ),
      ),
    /permission denied/,
    "metadata column UPDATE grant stays absent",
  );
  const statusRows = () =>
    sql(
      `select jsonb_agg(jsonb_build_array(id,status)order by id)from learning.evidence where episode_id='${id(53)}'`,
    );
  const statusBefore = statusRows();
  sql(
    caller(
      `update learning.evidence set status=case when status='active' then 'superseded' else 'active' end where episode_id='${id(53)}'`,
    ),
  );
  check(
    statusRows() === statusBefore,
    "status-only UPDATE retains the existing correction trigger",
  );
  const beforeReverse = snapshot();
  fail(
    () => sql(read("./reverse-learning-session-regroup-source.sql")),
    /New turn, evidence, or moment depends on regroup sessions/,
    "new digest evidence still blocks unsafe A2 reverse",
  );
  check(
    snapshot() === beforeReverse,
    "refused reverse preserves every original and newer row",
  );
  const replayRows = snapshot(),
    replayCatalog = census();
  sql(migration);
  check(
    snapshot() === replayRows && census() === replayCatalog,
    "0099 replay changes no rows or canonical facts",
  );
  check(
    sql(
      `select ingest_batch_id from learning.work_episodes where id='${id(31)}'`,
    ) === id(91),
    "original nonnull ingest_batch_id remains physical and exact",
  );
  check(
    sql(`select bool_and(ingest_batch_id is not distinct from source_ingest_batch_id) from learning.work_episodes`) === "t" &&
    sql(`select source_ingest_batch_id from learning.work_episodes where id='${id(31)}'`) === id(91) &&
    sql(`select source_ingest_batch_id is null from learning.work_episodes where id='${id(32)}'`) === "t",
    "original null and nonnull paired source UUIDs survive contraction and replay",
  );
  const beforeSourceRefusal = snapshot();
  fail(() => sql(`update learning.work_episodes set source_ingest_batch_id=null where id='${id(31)}'`), /check constraint/,
    "0098 paired-value constraint still refuses source disagreement after contraction");
  check(snapshot() === beforeSourceRefusal, "source mismatch refusal preserves every surviving row");
  const descriptors = JSON.parse(sql(caller(`select learning.export_work_episode_columns()`)).split("\n").find(x => x.startsWith("[")));
  check(descriptors.length === 23 && ["ingest_batch_id", "source_ingest_batch_id"].every(name =>
    descriptors.some(c => c.name === name && c.udt_schema === "pg_catalog" && c.udt_name === "uuid" && c.nullable === true)),
    "caller export retains exact 23-column coexistence inventory and both nullable UUIDs");
  console.log(`${checks} core contraction assertions passed`);
} finally {
  sql(
    `alter table learning.work_episodes alter column created_at set default now();begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');commit;`,
  );
  if (version)
    sql(
      `delete from learning.ontology_versions where version=${version} and note='0098 fixture'`,
    );
}
