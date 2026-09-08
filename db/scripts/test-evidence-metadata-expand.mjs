#!/usr/bin/env node
// Origin: agent. Destructive fixtures are restricted to an explicit local database.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST))
  throw Error("Local database required");
const migration = readFileSync(
  new URL(
    "../migrations/0093_learning_evidence_metadata_expand.sql",
    import.meta.url,
  ),
  "utf8",
);
const sql = (s) =>
  execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: s,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const id = (n) => `00930000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const auth = (s, n = 1) =>
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',true);${s};commit;`;
const columns = [
  "pass_id",
  "pass_at",
  "ontology_version",
  "quality",
  "observation_id",
  "capability_id",
  "provider",
  "source_residue_id",
  "source_pass_id",
  "digest_dropped_chars",
  "digest_backfill",
  "source_episode_ref",
  "source_activity_response_ref",
  "source_metadata_keys",
];
const keys = [
  "extractor",
  "prompt_version",
  "model",
  "model_version",
  "relevance_extractor",
  "relevance_model",
  "activity_id",
  "activity_kind",
  "source",
  "surface",
  "assessment_method",
  "pass_id",
  "pass_at",
  "ontology_version",
  "quality",
  "observation_id",
  "capability_id",
  "provider",
  "source_residue_id",
  "source_pass_id",
  "digest_dropped_chars",
  "digest_backfill",
  "episode_id",
  "activity_response_id",
];
let count = 0;
const check = (value, label) => {
  assert.ok(value, label);
  count++;
  console.log("PASS: " + label);
};
const fails = (fn, regex, label) => {
  assert.throws(fn, regex);
  check(true, label);
};
async function heldTable(fn) {
  const process = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
  let output = "";
  process.stdout.on("data", (value) => (output += value));
  process.stderr.on("data", (value) => (output += value));
  const done = new Promise((resolve, reject) =>
    process.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(output)),
    ),
  );
  process.stdin.write(
    "begin;lock table learning.evidence in share mode;select 'metadata_lock_ready';\n",
  );
  try {
    for (let n = 0; !output.includes("metadata_lock_ready"); n++) {
      if (n > 100) throw Error("Local lock barrier timed out");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await fn();
  } finally {
    process.stdin.end("rollback;\n");
    await done;
  }
}
const clean = () =>
  sql(
    `begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');commit;`,
  );
const insert = (n, metadata) =>
  sql(
    auth(
      `insert into learning.evidence(id,claim_id,learner_id,episode_id,observed,actor,direction,strength,confidence,provenance)values('${id(n)}','${id(11)}','${id(1)}','${id(21)}','Preserved fixture observation','learner','supports','medium',0.8,${q(JSON.stringify(metadata))}::jsonb)`,
    ),
  );
const baseline = () =>
  sql(
    `select coalesce(jsonb_agg(to_jsonb(e)-array[${columns.map(q)}] order by id),'[]') from learning.evidence e where learner_id='${id(1)}'`,
  );
try {
  clean();
  // CI arrives after the full series. Recreate a populated pre-EXPAND schema locally.
  sql(
    `drop function if exists learning.assert_evidence_metadata_lossless(learning.evidence);drop function if exists learning.native_evidence_metadata(learning.evidence);alter table learning.evidence ${columns.map((c) => `drop column if exists ${c}`).join(",")};`,
  );
  sql(`insert into itera.users(id,email)values('${id(1)}','metadata-a@example.invalid'),('${id(2)}','metadata-b@example.invalid');
 insert into itera.identities(user_id,provider,provider_subject)values('${id(1)}','password','${id(1)}'),('${id(2)}','password','${id(2)}');
 insert into learning.learners(id)values('${id(1)}'),('${id(2)}');
 insert into learning.learning_objectives(id,learner_id,title)values('${id(12)}','${id(1)}','Fixture');
 insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(12)}','Fixture');
 insert into learning.work_episodes(id,learner_id,source,grain)values('${id(21)}','${id(1)}','fixture','session');`);
  insert(31, { extractor: "legacy-minimal" });
  insert(32, Object.fromEntries(keys.map((k) => [k, null])));
  const full = Object.fromEntries(keys.map((k) => [k, `exact-${k}`]));
  Object.assign(full, {
    ontology_version: 5,
    digest_dropped_chars: 0,
    pass_at: "2026-09-07T21:01:16.000+00:00",
    episode_id: id(99).toUpperCase(),
    activity_response_id: "Legacy-Spelling",
    digest_backfill: {
      t14_merged_at: "2026-09-07T21:01:16Z",
      baseline_evidence: [id(80)],
      source_turn_ids: [id(99)],
      source_moment_ids: [],
      nested: { absent: null },
    },
  });
  insert(33, full);
  insert(34, {
    extractor: "activity",
    activity_id: "Activity-MixedCase",
    activity_kind: "code",
    activity_response_id: "response-original",
    assessment_method: "checks",
    source: "activity",
    surface: "player",
  });
  insert(35, {
    extractor: "closed-extraction",
    pass_id: "newest",
    pass_at: "2026-09-09T00:00:00Z",
    quality: "transcript",
    ontology_version: 5,
    observation_id: "observation-A",
    capability_id: null,
    provider: "fixture",
  });
  insert(36, {
    extractor: "residue-repass",
    pass_id: "newest",
    pass_at: "2026-09-09T00:00:00Z",
    quality: "digest",
    ontology_version: 5,
    source_residue_id: "source-residue-exact",
    source_pass_id: "source-pass-exact",
  });
  insert(37, { unknown_future_key: { preserve: true } });
  const beforeFailure = baseline();
  fails(
    () => sql(migration),
    /not lossless/,
    "unknown existing key refuses the whole migration",
  );
  check(
    sql(
      "select count(*)from information_schema.columns where table_schema='learning' and table_name='evidence' and column_name='source_metadata_keys'",
    ) === "0",
    "failed preflight rolls back every added column",
  );
  check(
    baseline() === beforeFailure,
    "failed preflight preserves every original row field",
  );
  sql(auth(`delete from learning.evidence where id='${id(37)}'`));
  const before = baseline();
  sql(migration);
  check(
    baseline() === before,
    "populated expansion preserves exact original IDs and full row content",
  );
  check(
    sql(
      `select count(*)from learning.evidence e where learner_id='${id(1)}' and learning.native_evidence_metadata(e)::text=provenance::text`,
    ) === "6",
    "all activity, transcript, digest and re-pass shapes reconstruct exactly",
  );
  check(
    sql(
      `select cardinality(source_metadata_keys)from learning.evidence where id='${id(31)}'`,
    ) === "1",
    "minimal metadata retains only its original key",
  );
  check(
    sql(
      `select cardinality(source_metadata_keys)from learning.evidence where id='${id(32)}'`,
    ) === String(keys.length),
    "explicit null retains every original key",
  );
  check(
    sql(
      `select source_episode_ref from learning.evidence where id='${id(33)}'`,
    ) === full.episode_id,
    "original source spelling survives separately from the actual episode relationship",
  );
  check(
    sql(`select pass_at from learning.evidence where id='${id(33)}'`) ===
      full.pass_at,
    "pass timestamp keeps exact lexical spelling",
  );
  check(
    sql(
      `select digest_backfill::text=(provenance->'digest_backfill')::text from learning.evidence where id='${id(33)}'`,
    ) === "t",
    "structured baseline preserves nested null and ordered IDs",
  );
  await heldTable(() =>
    fails(
      () => sql(migration),
      /could not obtain lock/,
      "concurrent evidence access refuses migration immediately",
    ),
  );
  check(baseline() === before, "lock refusal changes no original fields");
  sql(
    "alter table learning.evidence add column metadata_future_fixture text default 'unchanged'",
  );
  const after = baseline();
  sql(migration);
  check(
    baseline() === after,
    "populated replay tolerates an unrelated additive column without changing fields",
  );
  sql("alter table learning.evidence drop column metadata_future_fixture");
  check(
    sql(
      auth(
        `select count(*)from learning.evidence e where learning.native_evidence_metadata(e)::text=e.provenance::text`,
      ),
    )
      .split("\n")
      .at(-1) === "6",
    "authenticated caller can read and reconstruct owned metadata",
  );
  check(
    sql(auth(`select count(*)from learning.evidence`, 2)).split("\n").at(-1) ===
      "0",
    "another caller cannot read fixture evidence",
  );
  fails(
    () =>
      sql(
        auth(
          `update learning.evidence set pass_id='forged' where id='${id(35)}'`,
        ),
      ),
    /permission denied|generated/,
    "native generated fields cannot be overwritten",
  );
  fails(
    () =>
      sql(
        `begin;set local role service_role;select learning.evidence_metadata_keys('{}');rollback;`,
      ),
    /permission denied/,
    "service role receives no new helper execution",
  );
  check(
    sql(
      `select count(*)from learning.evidence where learner_id='${id(1)}' and status='active'`,
    ) === "2",
    "multiple newest-pass observations remain active",
  );
  for (const [n, metadata] of [
    [41, { future_key: "retained" }],
    [42, { ontology_version: 1.5 }],
    [43, { ontology_version: "5" }],
    [44, { provider: { raw: true } }],
    [45, { digest_dropped_chars: 2147483648 }],
  ]) {
    insert(n, metadata);
    fails(
      () =>
        sql(
          `select learning.assert_evidence_metadata_lossless(e)from learning.evidence e where id='${id(n)}'`,
        ),
      /not lossless/,
      `strict audit rejects incompatible shape ${n} without dropping original JSON`,
    );
    check(
      sql(
        `select provenance::text from learning.evidence where id='${id(n)}'`,
      ) === sql(`select ${q(JSON.stringify(metadata))}::jsonb::text`),
      `legacy writer shape ${n} remains intact`,
    );
    sql(auth(`delete from learning.evidence where id='${id(n)}'`));
  }
  console.log(`${count} native metadata expansion assertions passed`);
} finally {
  sql(
    "alter table learning.evidence drop column if exists metadata_future_fixture",
  );
  clean();
  sql(migration);
}
