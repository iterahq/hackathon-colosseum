#!/usr/bin/env node
// Origin: agent. Populated historical prefix and additive native suffix, local only.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST))
  throw Error("Local database required");
const id = (n) => `00970000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const sql = (s) =>
  execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: s,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const historical = read("../migrations/0088_learning_session_regroup.sql");
const suffix = read("../migrations/0097_learning_a2_native_projection.sql");
const reverse = read("./reverse-learning-session-regroup-native.sql");
const caller = (s, who = 1) =>
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(who)}',true);${s};commit;`;
const result = (s) =>
  JSON.parse(
    sql(s)
      .split("\n")
      .find((x) => x.startsWith("{")),
  );
const verify = (who = 1) =>
  result(caller("select learning.verify_a2_manifest()", who));
const snapshot = () =>
  sql(`select jsonb_build_object(
 'episodes',(select jsonb_agg(to_jsonb(t) order by id)from learning.work_episodes t where learner_id in('${id(1)}','${id(2)}')),
 'evidence',(select jsonb_agg(to_jsonb(e) order by id)from learning.evidence e where learner_id in('${id(1)}','${id(2)}')),
 'moments',(select jsonb_agg(to_jsonb(m) order by id)from learning.episode_moments m where learner_id in('${id(1)}','${id(2)}')),
 'receipts',(select jsonb_agg(to_jsonb(p) order by pass_id)from learning.extraction_passes p where learner_id in('${id(1)}','${id(2)}')))::text`);
let count = 0;
const check = (value, label) => {
  assert.ok(value, label);
  count++;
  console.log("PASS: " + label);
};
try {
  for (const name of ["turn_keys", "session_keys", "evidence_keys"]) {
    const pattern = new RegExp(
      `${name} constant text\\[\\]:=array\\[([^;]+)\\];`,
    );
    check(
      suffix.match(pattern)?.[1] === historical.match(pattern)?.[1],
      `${name} matches the immutable 0088 array exactly`,
    );
  }
  sql(`begin;lock table learning.evidence in share row exclusive mode;
   delete from itera.users where id in('${id(1)}','${id(2)}');
   insert into itera.users(id,email)values('${id(1)}','a2-native-a@example.invalid'),('${id(2)}','a2-native-b@example.invalid');
   insert into itera.identities(user_id,provider,provider_subject)values('${id(1)}','password','${id(1)}'),('${id(2)}','password','${id(2)}');
   insert into learning.learners(id)values('${id(1)}'),('${id(2)}');
   insert into learning.learning_objectives(id,learner_id,title)values('${id(10)}','${id(1)}','Fixture');
   insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(10)}','Fixture');
   insert into learning.work_contexts(id,learner_id,project_root,project_ref,machine,machine_class)values
    ('${id(21)}','${id(1)}','/fixture','/fixture','fixture','human'),('${id(22)}','${id(2)}','/fixture','/fixture','fixture','human');
   insert into learning.work_episodes(id,learner_id,source,machine,machine_class,project_ref,work_context_id,grain,started_at,ended_at,session_ref,created_at,payload,ingest_batch_id)values
    ('${id(31)}','${id(1)}','test','fixture','human','/fixture','${id(21)}','turn','2026-09-01T10:00Z','2026-09-01T10:01Z','cli-a','2026-09-07T18:00Z','{"agent_turn":{"text":"Complete captured answer."}}','${id(91)}'),
    ('${id(32)}','${id(1)}','test','fixture','human','/fixture/src','${id(21)}','turn','2026-09-01T10:02Z','2026-09-01T10:03Z','cli-b','2026-09-07T18:00Z','{"agent_turn":{"text":"Another complete answer."}}',null),
    ('${id(33)}','${id(2)}','test','fixture','human','/fixture','${id(22)}','turn','2026-09-01T10:00Z','2026-09-01T10:01Z','cli-c','2026-09-07T18:00Z','{"agent_turn":{"text":"Other learner answer."}}',null);
   insert into learning.evidence(id,learner_id,claim_id,episode_id,observed,actor,direction,strength,confidence,provenance)values
    ('${id(41)}','${id(1)}','${id(11)}','${id(31)}','Historical support','learner','supports','medium',.8,
     '{"extractor":"legacy","pass_id":"old","pass_at":"2026-09-01T12:00:00+00:00","episode_id":"original-source-text","surface":null,"digest_backfill":{"nested":1.00}}'),
    ('${id(42)}','${id(1)}','${id(11)}','${id(32)}','Historical neutral','learner','neutral','weak',.7,
     '{"pass_id":"new","pass_at":"2026-09-01T13:00:00Z","activity_response_id":"legacy-source"}');commit;`);
  const beforeRegroup = snapshot();
  // Reproduce the real pre-T14 creation time when the immutable 0088 INSERT runs.
  sql(
    "alter table learning.work_episodes alter column created_at set default '2026-09-07T19:00:00Z'::timestamptz",
  );
  sql(historical);
  sql(
    "alter table learning.work_episodes alter column created_at set default now()",
  );
  const original = snapshot();
  sql(suffix);
  check(
    snapshot() === original,
    "populated suffix preserves every original row, manifest and metadata value",
  );
  check(
    verify().sessions === 1 && verify().turns === 2 && verify().evidence === 2,
    "caller verifies the complete original session",
  );
  check(
    verify(2).sessions === 1 &&
      verify(2).turns === 1 &&
      verify(2).evidence === 0,
    "foreign learner rows do not enter caller counts",
  );
  check(
    result("select learning.verify_a2_manifest()").sessions === 2,
    "read-only migration authority verifies the full frozen population",
  );
  sql(`insert into itera.tenants(id,slug,name)values('${id(70)}','itera','Fixture platform')on conflict(slug)do nothing;
    insert into itera.memberships(user_id,tenant_id,role)select '${id(1)}',id,'tenant_admin'from itera.tenants where slug='itera'`);
  check(
    sql(caller("select itera.is_learning_operator()")).endsWith("\nt") &&
      sql(
        caller(
          `select exists(select 1 from learning.work_episodes where learner_id='${id(2)}')`,
        ),
      ).endsWith("\nt"),
    "operator fixture has real cross-learner SELECT access",
  );
  check(
    verify().sessions === 1 && verify().turns === 2,
    "operator caller manifest remains explicitly limited to its own learner",
  );
  const foreignChanged = result(
    `begin;update learning.work_episodes set agent_summary='Foreign changed'where id='${id(33)}';set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true);select learning.verify_a2_manifest();rollback;`,
  );
  check(
    foreignChanged.verified && foreignChanged.sessions === 1,
    "operator verification does not inspect another learner original content",
  );
  check(
    sql(
      `select learning.a2_legacy_evidence_row(e)::text=(select jsonb_object_agg(k,v)from jsonb_each(to_jsonb(e))j(k,v)where k=any(array[${historical.match(/evidence_keys constant text\[\]:=array\[([^;]+)\];/)[1]}]))::text from learning.evidence e where id='${id(41)}'`,
    ) === "t",
    "native projection equals exact PostgreSQL legacy JSONB text",
  );
  check(
    sql(
      `select (learning.a2_legacy_evidence_row(e)->'provenance')::text like '%1.00%' and source_episode_ref='original-source-text' and pass_at='2026-09-01T12:00:00+00:00' from learning.evidence e where id='${id(41)}'`,
    ) === "t",
    "numeric spelling and original source/time strings survive",
  );
  check(
    sql(
      `select (learning.a2_legacy_evidence_row(e)->'provenance') ? 'surface' from learning.evidence e where id='${id(41)}'`,
    ) === "t" &&
      sql(
        `select (learning.a2_legacy_evidence_row(e)->'provenance') ? 'surface' from learning.evidence e where id='${id(42)}'`,
      ) === "f",
    "explicit null and absent metadata keys remain distinct",
  );
  assert.throws(
    () =>
      sql(
        `select learning.a2_legacy_evidence_row(jsonb_populate_record(null::learning.evidence,to_jsonb(e)||'{"source_metadata_keys":["unknown"]}'))from learning.evidence e where id='${id(41)}'`,
      ),
    /key-presence marker/,
  );
  check(
    true,
    "unknown native marker keys cannot disappear from the compatibility projection",
  );
  const canonicalHash = sql(
    `select encode(sha256(convert_to(learning.a2_legacy_evidence_row(e)::text,'UTF8')),'hex')from learning.evidence e where id='${id(41)}'`,
  );
  check(
    sql(
      `set timezone='Pacific/Honolulu';select encode(sha256(convert_to(learning.a2_legacy_evidence_row(e)::text,'UTF8')),'hex')from learning.evidence e where id='${id(41)}'`,
    ) === canonicalHash,
    "caller timezone cannot change original timestamp hash spelling",
  );
  for (const field of ["observed", "provenance", "artifact_id"]) {
    assert.throws(
      () =>
        sql(
          `select learning.a2_frozen_row(to_jsonb(e)-'${field}','evidence')from learning.evidence e where id='${id(41)}'`,
        ),
      /every original field/,
    );
    check(true, `missing original ${field} fails instead of becoming null`);
  }
  assert.throws(
    () =>
      sql(
        "begin;set local role anon;select learning.verify_a2_manifest();rollback;",
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      sql(
        "begin;set local role service_role;select learning.verify_a2_manifest();rollback;",
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      sql(
        "begin;set local role authenticated;select learning.verify_a2_manifest();rollback;",
      ),
    /caller identity/,
  );
  check(
    true,
    "anonymous, service role and missing caller identity are refused",
  );
  const parent = sql(
    `select session_episode_id from learning.work_episodes where id='${id(31)}'`,
  );
  const moment = sql(
    `select id from learning.episode_moments where episode_id='${parent}'order by at limit 1`,
  );
  // Each mutation is inside a rolled-back transaction. No repair/re-baseline is possible.
  for (const [label, mutation] of [
    [
      "evidence text",
      `update learning.evidence set observed='Changed' where id='${id(41)}'`,
    ],
    [
      "turn text",
      `update learning.work_episodes set agent_summary='Changed' where id='${id(31)}'`,
    ],
    [
      "session bounds",
      `update learning.work_episodes set ended_at=ended_at+interval '1 second' where id='${parent}'`,
    ],
    [
      "moment time",
      `update learning.episode_moments set at=at+interval '1 second' where id='${moment}'`,
    ],
    [
      "omitted evidence manifest",
      `update learning.work_episodes set payload=jsonb_set(payload,'{evidence_manifest}','[]')where id='${parent}'`,
    ],
    [
      "duplicate turn manifest",
      `update learning.work_episodes set payload=jsonb_set(payload,'{turn_manifest}',jsonb_build_array(payload->'turn_manifest'->0,payload->'turn_manifest'->0))where id='${parent}'`,
    ],
    [
      "cutoff",
      `update learning.work_episodes set payload=jsonb_set(payload,'{freeze_before}','"2026-09-08T00:00:00Z"')where id='${parent}'`,
    ],
    [
      "batch source",
      `update learning.work_episodes set ingest_batch_id='${id(92)}'where id='${id(31)}'`,
    ],
    ["missing evidence", `delete from learning.evidence where id='${id(41)}'`],
    [
      "missing moment",
      `delete from learning.episode_moments where id='${moment}'`,
    ],
    [
      "missing all original turns",
      `delete from learning.work_episodes where learner_id='${id(1)}'and grain='turn'`,
    ],
  ]) {
    assert.throws(
      () =>
        sql(
          `begin;lock table learning.evidence in share row exclusive mode;${mutation};select learning.verify_a2_manifest();rollback;`,
        ),
      /A2 /,
    );
    check(snapshot() === original, `${label} fails with exact rollback`);
  }
  sql(
    `alter table learning.evidence add column a2_future text default 'new';alter table learning.work_episodes add column a2_future text`,
  );
  check(
    verify().evidence === 2,
    "unrelated additive columns do not change frozen hashes",
  );
  sql(
    `alter table learning.evidence drop column a2_future;alter table learning.work_episodes drop column a2_future`,
  );
  // A whole verifier statement keeps its MVCC snapshot when a writer commits
  // after that statement starts. A fresh verifier sees the changed original.
  const processSql = (name, input) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: { ...process.env, PGAPPNAME: name },
    });
    let output = "",
      error = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (error += b));
    const done = new Promise((resolve) =>
      child.on("exit", (code) => resolve({ code, output, error })),
    );
    child.stdin.write(input);
    return { child, done, output: () => output };
  };
  const writer = processSql(
    "a2-snapshot-writer",
    "begin;select pg_advisory_xact_lock(9797,1);select 'ready';\n",
  );
  let reader;
  try {
    for (let n = 0; !writer.output().includes("ready"); n++) {
      if (n > 200) throw Error("Writer start timeout");
      await new Promise((r) => setTimeout(r, 20));
    }
    reader = processSql(
      "a2-snapshot-reader",
      caller(
        "with barrier as materialized(select pg_advisory_xact_lock(9797,1))select learning.verify_a2_manifest()from barrier",
      ) + "\n",
    );
    reader.child.stdin.end();
    let waiting = false;
    for (let n = 0; n < 200; n++) {
      waiting =
        sql(
          "select exists(select 1 from pg_stat_activity where application_name='a2-snapshot-reader'and wait_event='advisory')",
        ) === "t";
      if (waiting) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(
      waiting,
      "Reader must start its statement snapshot before the writer commits",
    );
    writer.child.stdin.end(
      `update learning.evidence set observed='Concurrent change'where id='${id(41)}';commit;\n`,
    );
    const written = await writer.done,
      observed = await reader.done;
    check(
      written.code === 0 &&
        observed.code === 0 &&
        observed.output.includes('"verified": true'),
      "concurrent commit cannot mix snapshots inside the read-only verifier",
    );
    assert.throws(() => verify(), /original evidence missing or changed/);
    check(
      true,
      "a fresh statement detects the newly committed original-value change",
    );
  } finally {
    if (!writer.child.stdin.writableEnded)
      writer.child.stdin.end("rollback;\n");
    await writer.done;
    if (reader) await reader.done;
    sql(
      `update learning.evidence set observed='Historical support'where id='${id(41)}'`,
    );
  }
  sql(
    `update learning.work_episodes set relevance_status='relevant',relevance_checked_at=now()where learner_id='${id(1)}'`,
  );
  check(
    verify().verified,
    "normal relevance state stays outside the immutable source projection",
  );
  sql(
    `insert into learning.artifacts(id,learner_id,episode_id,kind,title)values('${id(51)}','${id(1)}','${parent}','document','New dependency')`,
  );
  check(
    verify().verified && verify().reverse_checked === false,
    "valid history does not claim reverse safety for later dependencies",
  );
  assert.throws(() => sql(reverse), /Reverse blocked by dependent rows/);
  check(true, "native reverse retains the dynamic all-FK artifact refusal");
  sql(`delete from learning.artifacts where id='${id(51)}'`);
  const base = result(
    `select jsonb_build_object('t14_merged_at','2026-09-07T21:01:16Z','evidence_ids',(select jsonb_agg(id order by id)from learning.evidence where episode_id='${parent}'),'turn_ids',(select jsonb_agg(id order by id)from learning.work_episodes where session_episode_id='${parent}'),'moment_ids',(select jsonb_agg(id order by id)from learning.episode_moments where episode_id='${parent}'))`,
  );
  const request = {
    episode_id: parent,
    pass_id: "a2-native-proof",
    pass_at: "2026-09-08T00:00:00Z",
    quality: "digest",
    ontology_version: Number(
      sql("select max(version)from learning.ontology_versions"),
    ),
    provenance: { extractor: "closed-set-extractor", digest_backfill: base },
    observations: [],
  };
  const receipt = result(
    caller(
      `select learning.record_extraction_pass(${q(JSON.stringify(request))}::jsonb)`,
    ),
  );
  const withReceipt = snapshot();
  sql(suffix);
  check(
    snapshot() === withReceipt &&
      verify().later_dependencies.extraction_passes === 1,
    "later immutable digest receipt survives suffix replay and manifest verification",
  );
  check(
    JSON.stringify(
      result(
        caller(
          `select learning.record_extraction_pass(${q(JSON.stringify(request))}::jsonb)`,
        ),
      ),
    ) === JSON.stringify(receipt),
    "exact historical digest retry returns the saved receipt",
  );
  assert.throws(() => sql(reverse), /Reverse blocked by dependent rows/);
  check(
    snapshot() === withReceipt,
    "new receipt blocks reverse before any source or evidence change",
  );
  // Owner-authorized local fixture cleanup is the only receipt deletion.
  sql(
    `delete from learning.extraction_passes where learner_id='${id(1)}'and pass_id='a2-native-proof'`,
  );
  sql(reverse);
  check(
    sql(
      `select count(*)from learning.work_episodes where learner_id in('${id(1)}','${id(2)}')and grain='session'`,
    ) === "0",
    "guarded native reverse removes only synthetic sessions",
  );
  check(
    sql(`select count(*)from learning.evidence where learner_id='${id(1)}'`) ===
      "2",
    "guarded reverse preserves both original evidence IDs",
  );
  // Compare frozen fields; relevance changes are intentionally outside that contract.
  const restored = JSON.parse(snapshot()),
    before = JSON.parse(beforeRegroup);
  check(
    JSON.stringify(restored.evidence) === JSON.stringify(before.evidence),
    "reverse restores every evidence field and status exactly",
  );
  console.log(`${count} A2 native projection assertions passed`);
} finally {
  sql(
    `alter table learning.work_episodes alter column created_at set default now();alter table learning.evidence drop column if exists a2_future;alter table learning.work_episodes drop column if exists a2_future;begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');delete from itera.tenants where id='${id(70)}';commit;`,
  );
}
