#!/usr/bin/env node
// Origin: agent. Runs on the isolated0094 prefix, then applies0095 over real receipts.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST))
  throw Error("Local fixture required");
const sql = (s) =>
  execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: s,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const id = (n) => `00950000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const auth = (s, n = 1) =>
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',true);${s};commit;`;
const json = (s) =>
  JSON.parse(
    sql(s)
      .split("\n")
      .find((x) => x.startsWith("{")),
  );
let count = 0;
const check = (v, label) => {
  assert.ok(v, label);
  console.log("PASS " + label);
  count++;
};
const fail = (fn, re, label) => {
  assert.throws(fn, re);
  check(true, label);
};
const migration = readFileSync(
  new URL(
    "../migrations/0095_learning_native_evidence_consumers.sql",
    import.meta.url,
  ),
  "utf8",
);
const names = [
  "record_extraction_pass",
  "write_residue_repass",
  "validate_extraction_receipt",
  "assert_digest_backfill_eligible",
  "refresh_evidence_status_for_learner",
];
const acls = () =>
  sql(
    `select jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('acl',proacl,'definer',prosecdef,'config',proconfig))from pg_proc where pronamespace='learning'::regnamespace and proname=any(array[${names.map(q)}])`,
  );
const snapshot = () =>
  sql(
    `select jsonb_build_object('evidence',(select jsonb_agg(to_jsonb(e)order by id)from learning.evidence e where learner_id='${id(1)}'),'extraction',(select jsonb_agg(to_jsonb(e)order by pass_id)from learning.extraction_passes e where learner_id='${id(1)}'),'repass',(select jsonb_agg(to_jsonb(e)order by pass_id)from learning.residue_repasses e where learner_id='${id(1)}'),'residue',(select jsonb_agg(to_jsonb(e)order by id)from learning.residue e where learner_id='${id(1)}'))`,
  );
const evidence = {
  claim_id: id(11),
  observed: "A local fixture observation.",
  actor: "learner",
  direction: "supports",
  strength: "medium",
  confidence: 0.8,
  capability_id: null,
};
let version;
const extraction = (ep, pass) => ({
  episode_id: id(ep),
  pass_id: pass,
  pass_at: "2026-09-08T00:00:00.000+00:00",
  ontology_version: version,
  quality: "transcript",
  provenance: { extractor: "fixture", provider: null, model: "fixture" },
  observations: [
    {
      observation_id: "one",
      moment_id: null,
      evidence: [evidence, { ...evidence, direction: "neutral" }],
      residue: null,
    },
  ],
});
const record = (r) =>
  json(
    auth(
      `select learning.record_extraction_pass(${q(JSON.stringify(r))}::jsonb)`,
    ),
  );
const repass = (ep, pass) => ({
  episode_id: id(ep),
  pass_id: pass,
  pass_at: "2026-09-08T00:00:00Z",
  context: json(auth(`select learning.residue_repass_context('${id(ep)}')`)),
  provenance: { extractor: "fixture", provider: null },
  observations: [
    {
      source_id: id(ep + 100),
      evidence: [evidence, { ...evidence, direction: "neutral" }],
    },
  ],
});
const recordRepass = (r) =>
  json(
    auth(
      `select learning.record_residue_repass(${q(JSON.stringify(r))}::jsonb)`,
    ),
  );
try {
  check(
    sql(
      "select position('misconception_id,provenance)' in prosrc)>0 from pg_proc where oid='learning.record_extraction_pass(jsonb)'::regprocedure",
    ) === "t",
    "fixture begins with the actual legacy RPC writer",
  );
  sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');
 insert into itera.users(id,email)values('${id(1)}','native-sql-a@example.invalid'),('${id(2)}','native-sql-b@example.invalid');
 insert into itera.identities(user_id,provider,provider_subject)select id,'password',id::text from itera.users where id in('${id(1)}','${id(2)}');
 insert into learning.learners(id)values('${id(1)}'),('${id(2)}');
 insert into learning.learning_objectives(id,learner_id,title)values('${id(12)}','${id(1)}','Fixture');
 insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(12)}','Fixture');commit;`);
  version = Number(
    sql("select max(version)+1 from learning.ontology_versions"),
  );
  sql(
    `insert into learning.ontology_versions(version,created_by,note,reason)values(${version},'${id(1)}','0095 fixture','test')`,
  );
  for (const ep of [21, 22, 23, 24])
    sql(
      `insert into learning.work_episodes(id,learner_id,source,grain)values('${id(ep)}','${id(1)}','fixture','session')`,
    );
  for (const ep of [22, 24])
    sql(
      `insert into learning.residue(id,learner_id,episode_id,candidate,pass_id,pass_at,ontology_version,quality)values('${id(ep + 100)}','${id(1)}','${id(ep)}','Fixture preserved residue','old','2026-09-07T00:00:00Z',${version - 1},'digest')`,
    );
  const old = extraction(21, "before"),
    oldResult = record(old),
    oldRepass = repass(22, "rr:before-repass"),
    oldRepassResult = recordRepass(oldRepass);
  const before = snapshot(),
    grants = acls();
  sql(migration);
  check(
    snapshot() === before,
    "populated migration preserves every evidence, residue and receipt field",
  );
  check(
    acls() === grants,
    "five existing function grants, invoker security and settings are unchanged",
  );
  check(
    JSON.stringify(record(old)) === JSON.stringify(oldResult),
    "legacy extraction request replays exactly after native conversion",
  );
  check(
    JSON.stringify(recordRepass(oldRepass)) === JSON.stringify(oldRepassResult),
    "legacy re-pass request replays exactly after native conversion",
  );
  check(
    snapshot() === before,
    "exact replay writes no rows and changes no receipt",
  );
  const newResult = record(extraction(23, "after")),
    newRepassResult = recordRepass(repass(24, "rr:after-repass"));
  check(
    newResult.evidence_inserted === 2 &&
      newRepassResult.evidence_inserted === 2,
    "both native RPC writers retain several observations in one pass",
  );
  check(
    sql(
      `select count(*)from learning.evidence e where learner_id='${id(1)}' and provenance::text is distinct from learning.native_evidence_metadata(e)::text`,
    ) === "0",
    "all legacy and native writer metadata reconstructs exactly",
  );
  check(
    sql(
      `select count(*)from learning.evidence where learner_id='${id(1)}' and source_episode_ref=episode_id::text and provider is null and 'provider'=any(source_metadata_keys) and status='active'`,
    ) === "8",
    "native source refs, explicit provider null and same-pass active status survive",
  );
  check(
    sql(
      `select count(*)from learning.evidence where episode_id='${id(24)}' and quality='digest' and moment_id is null and source_residue_id='${id(124)}'`,
    ) === "2",
    "re-pass retains digest NULL moment and source residue identity",
  );
  const cases = [
    "{}",
    '{"provider":null,"pass_at":"2026-09-08T00:00:00.000+00:00"}',
    '{"digest_backfill":{"n":1.00},"ontology_version":2,"episode_id":"UPPER-and-text","activity_response_id":null}',
    '{"digest_backfill":null}',
  ];
  cases.push(
    '{"extractor": "fixture-extractor", "prompt_version": "fixture-prompt_version", "model": "fixture-model", "model_version": "fixture-model_version", "relevance_extractor": "fixture-relevance_extractor", "relevance_model": "fixture-relevance_model", "activity_id": "fixture-activity_id", "activity_kind": "fixture-activity_kind", "source": "fixture-source", "surface": "fixture-surface", "assessment_method": "fixture-assessment_method", "pass_id": "fixture-pass_id", "pass_at": "fixture-pass_at", "quality": "fixture-quality", "observation_id": "fixture-observation_id", "capability_id": "fixture-capability_id", "provider": "fixture-provider", "source_residue_id": "fixture-source_residue_id", "source_pass_id": "fixture-source_pass_id", "episode_id": "fixture-episode_id", "activity_response_id": "fixture-activity_response_id", "ontology_version": 1, "digest_dropped_chars": 4, "digest_backfill": {"source_ids": ["retained"]}}',
  );
  for (const value of cases)
    check(
      sql(
        auth(
          `select learning.native_evidence_metadata(learning.evidence_metadata_from_json(${q(value)}::jsonb))::text=(${q(value)}::jsonb)::text`,
        ),
      )
        .split("\n")
        .at(-1) === "t",
      `constructor preserves exact shape ${cases.indexOf(value) + 1}`,
    );
  for (const value of [
    "null",
    "[]",
    '{"unknown":true}',
    '{"model":42}',
    '{"ontology_version":"2"}',
    '{"ontology_version":2.0}',
  ])
    fail(
      () =>
        sql(
          auth(
            `select learning.evidence_metadata_from_json(${q(value)}::jsonb)`,
          ),
        ),
      /metadata|integer/i,
      "incompatible metadata refuses without coercion",
    );
  fail(
    () =>
      sql(
        "set role service_role;select learning.evidence_metadata_from_json('{}')",
      ),
    /permission denied/,
    "service role cannot call the new constructor",
  );
  fail(
    () =>
      sql("set role anon;select learning.evidence_metadata_from_json('{}')"),
    /permission denied/,
    "anonymous caller cannot call the new constructor",
  );
  fail(
    () =>
      sql(
        auth(
          `select learning.record_extraction_pass(${q(JSON.stringify(extraction(23, "foreign")))}::jsonb)`,
          2,
        ),
      ),
    /not owned/,
    "native RPC continues to refuse foreign learner writes",
  );
  const statusBefore = snapshot();
  sql(
    auth(
      `update learning.evidence set status='superseded' where learner_id='${id(1)}'`,
    ),
  );
  check(
    snapshot() === statusBefore,
    "status-only caller writes restore parity without metadata changes",
  );
  const again = snapshot();
  sql(migration);
  check(
    snapshot() === again && acls() === grants,
    "populated second apply is exact and preserves existing grants",
  );
  const physical = JSON.parse(
    sql(
      `select jsonb_agg(proname order by proname)from pg_proc where pronamespace='learning'::regnamespace and prosrc ~* '(e|value|new|old)[.]provenance'`,
    ),
  );
  check(
    JSON.stringify(physical) ===
      JSON.stringify([
        "assert_evidence_metadata_lossless",
        "bridge_evidence_metadata",
      ]),
    "only the intentional bridge and lossless audit retain physical JSON references",
  );
  for (const name of ["record_extraction_pass", "write_residue_repass"])
    check(
      sql(
        `select position('misconception_id,provenance)' in prosrc)=0 and position('metadata_row.source_metadata_keys' in prosrc)>0 from pg_proc where pronamespace='learning'::regnamespace and proname=${q(name)}`,
      ) === "t",
      `${name} inserts native columns without physical provenance`,
    );
  console.log(`${count} native SQL consumer assertions passed`);
} finally {
  sql(
    `begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');commit;`,
  );
  if (version)
    sql(
      `delete from learning.ontology_versions where version=${version} and note='0095 fixture'`,
    );
}
