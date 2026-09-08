#!/usr/bin/env node
// Origin: agent. Run only after the isolated generated prefix, before the bridge.
import { execFileSync, spawn } from "node:child_process";
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
const id = (n) => `00940000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const auth = (s, n = 1) =>
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',true);${s};commit;`;
const bridge = readFileSync(
  new URL(
    "../migrations/0094_learning_evidence_metadata_bridge.sql",
    import.meta.url,
  ),
  "utf8",
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
const fixed = {
  claim_id: id(11),
  learner_id: id(1),
  episode_id: id(21),
  observed: "Fixture observation",
  actor: "learner",
  direction: "supports",
  strength: "medium",
  confidence: 0.8,
};
const literal = (v) =>
  v === null
    ? "null"
    : typeof v === "object"
      ? q(JSON.stringify(v)) + "::jsonb"
      : typeof v === "number"
        ? String(v)
        : q(v);
const insert = (n, values) => {
  const all = { id: id(n), ...fixed, ...values };
  return `insert into learning.evidence(${Object.keys(all).join(",")})values(${Object.values(all).map(literal).join(",")})`;
};
const native = (metadata) => {
  const fields = Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [
      k === "episode_id"
        ? "source_episode_ref"
        : k === "activity_response_id"
          ? "source_activity_response_ref"
          : k,
      v,
    ]),
  );
  return { fields, keys: Object.keys(metadata).sort() };
};
const nativeInsert = (n, metadata, extra = {}) => {
  const { fields, keys } = native(metadata);
  return insert(n, { ...fields, ...extra })
    .replace(/\)values\(/, ",source_metadata_keys)values(")
    .replace(/\)$/, `,array[${keys.map(q).join(",")}]::text[])`);
};
const snapshot = () =>
  sql(
    `select coalesce(jsonb_agg(to_jsonb(e)order by id),'[]')from learning.evidence e where learner_id='${id(1)}'`,
  );
const row = (n) =>
  JSON.parse(
    sql(`select to_jsonb(e) from learning.evidence e where id='${id(n)}'`),
  );
sql(`begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');commit;
insert into itera.users(id,email)values('${id(1)}','bridge-a@example.invalid'),('${id(2)}','bridge-b@example.invalid');
insert into itera.identities(user_id,provider,provider_subject)values('${id(1)}','password','${id(1)}'),('${id(2)}','password','${id(2)}');
insert into learning.learners(id)values('${id(1)}'),('${id(2)}');
insert into learning.learning_objectives(id,learner_id,title)values('${id(12)}','${id(1)}','Fixture');
insert into learning.claims(id,learner_id,objective_id,title)values('${id(11)}','${id(1)}','${id(12)}','Fixture');
insert into learning.work_episodes(id,learner_id,source,grain)values('${id(21)}','${id(1)}','fixture','session');`);
check(
  sql(
    "select count(*) from pg_attribute where attrelid='learning.evidence'::regclass and attgenerated<>''",
  ) === "25",
  "fixture starts at the exact generated prefix",
);
check(
  sql(
    "select count(*) from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where a.attrelid='learning.evidence'::regclass and a.attname='provenance'",
  ) === "0",
  "real provenance column has no default",
);
fail(
  () => sql(auth(insert(29, {}))),
  /null value.*provenance/,
  "legacy neither-representation input was already refused",
);
const allKeys = [
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
const allNull = Object.fromEntries(allKeys.map((k) => [k, null]));
const full = Object.fromEntries(allKeys.map((k) => [k, "Exact-" + k]));
Object.assign(full, {
  ontology_version: 5,
  digest_dropped_chars: 0,
  digest_backfill: {
    t14_merged_at: "2026-09-07T21:01:16Z",
    evidence_ids: ["b", "a"],
  },
  pass_at: "2026-09-07T21:01:16.000+00:00",
});
const shapes = [
  {
    extractor: "activity",
    surface: null,
    assessment_method: "",
    activity_response_id: "Exact-Original",
  },
  {
    extractor: "transcript",
    pass_id: "older",
    pass_at: "2026-09-07T21:01:16.000+00:00",
    ontology_version: 5,
    quality: "transcript",
    capability_id: null,
    episode_id: "Exact-Source",
  },
  {
    extractor: "digest",
    quality: "digest",
    digest_dropped_chars: 0,
    digest_backfill: {
      t14_merged_at: "2026-09-07T21:01:16Z",
      evidence_ids: ["b", "a"],
      nested: { x: null },
    },
  },
  {
    extractor: "repass",
    source_residue_id: id(99).toUpperCase(),
    source_pass_id: "original",
    provider: null,
  },
  allNull,
  full,
];
for (let i = 0; i < shapes.length; i++)
  sql(auth(insert(31 + i, { provenance: shapes[i] })));
sql(auth(insert(39, { provenance: { unknown_future: "retained" } })));
const beforeFailure = snapshot();
fail(
  () => sql(bridge),
  /not lossless/,
  "unknown existing key refuses the complete conversion",
);
check(
  snapshot() === beforeFailure,
  "failed conversion preserves all existing fields",
);
sql(auth(`delete from learning.evidence where id='${id(39)}'`));
const before = snapshot();
sql(bridge);
check(
  snapshot() === before,
  "conversion preserves every populated row field and ID",
);
check(
  sql(
    "select count(*) from pg_attribute where attrelid='learning.evidence'::regclass and attgenerated<>''",
  ) === "0",
  "all25 metadata fields become stored native columns",
);
fail(
  () => sql(auth(insert(29, {}))),
  /Legacy metadata must be an object/,
  "neither-representation input remains refused after bridge",
);
check(
  sql(
    `select digest_backfill is not null and digest_backfill='null'::jsonb from learning.evidence where id='${id(35)}'`,
  ) === "t",
  "conversion preserves stored JSON null separately from SQL NULL",
);
for (let i = 0; i < shapes.length; i++) {
  sql(auth(nativeInsert(41 + i, shapes[i])));
  const old = row(31 + i),
    current = row(41 + i);
  delete old.id;
  delete current.id;
  delete old.created_at;
  delete current.created_at;
  delete old.status;
  delete current.status;
  check(
    JSON.stringify(old) === JSON.stringify(current),
    "native and legacy shape " + i + " are exact",
  );
}
sql(
  auth(
    nativeInsert(
      51,
      { extractor: "dual", surface: null },
      { provenance: { extractor: "dual", surface: null } },
    ),
  ),
);
check(
  row(51).provenance.surface === null,
  "matching dual inputs preserve explicit null",
);
let stable = snapshot();
fail(
  () =>
    sql(
      auth(
        nativeInsert(
          52,
          { extractor: "native" },
          { provenance: { extractor: "legacy" } },
        ),
      ),
    ),
  /Conflicting/,
  "conflicting dual insert fails",
);
check(snapshot() === stable, "dual refusal changes no rows or statuses");
fail(
  () =>
    sql(
      auth(
        insert(53, {
          provenance: { extractor: "legacy" },
          extractor: "native",
        }),
      ),
    ),
  /key-presence/,
  "unmarked native input fails",
);
fail(
  () => sql(auth(insert(54, { provenance: { extractor: 4 } }))),
  /not lossless/,
  "incompatible legacy type fails without coercion",
);
fail(
  () => sql(auth(insert(55, { provenance: { future_key: "retained" } }))),
  /not lossless/,
  "new unknown legacy keys fail explicitly",
);
for (const keys of [
  "array['extractor','extractor']",
  "array['surface','extractor']",
  "array['extractor',null]",
  "array['future_key']",
]) {
  fail(
    () =>
      sql(
        auth(
          insert(56, { extractor: "fixture" })
            .replace(")values(", ",source_metadata_keys)values(")
            .replace(/\)$/, "," + keys + ")"),
        ),
      ),
    /sorted, unique and known|absent from key/,
    "invalid key marker fails: " + keys,
  );
}
fail(
  () =>
    sql(
      auth(nativeInsert(57, { extractor: "fixture" }, { surface: "hidden" })),
    ),
  /absent from key/,
  "unlisted native field cannot disappear",
);
fail(
  () =>
    sql(
      auth(
        `update learning.evidence set extractor='forged' where id='${id(31)}'`,
      ),
    ),
  /permission denied/,
  "authenticated metadata update remains forbidden",
);
check(
  sql(
    auth(
      `select count(*)from learning.evidence where learner_id='${id(1)}'`,
      2,
    ),
  )
    .split("\n")
    .at(-1) === "0",
  "foreign caller sees no rows",
);
fail(
  () => sql(auth(nativeInsert(58, { extractor: "native" }), 2)),
  /row-level security|own evidence/,
  "foreign native insert remains forbidden",
);
stable = snapshot();
sql(
  auth(
    `update learning.evidence set status=case when status='active' then 'superseded' else 'active' end where learner_id='${id(1)}'`,
  ),
);
check(
  snapshot() === stable,
  "direct status-only changes preserve exact metadata and restore parity",
);
const prior = row(31);
sql(
  `begin;lock table learning.evidence in share row exclusive mode;update learning.evidence set provenance='{"extractor":"updated","surface":null}' where id='${id(31)}';commit;`,
);
check(
  row(31).extractor === "updated" && row(31).surface === null,
  "controlled legacy update derives native fields",
);
sql(
  `begin;lock table learning.evidence in share row exclusive mode;update learning.evidence set extractor='native-update' where id='${id(31)}';commit;`,
);
check(
  row(31).provenance.extractor === "native-update",
  "controlled native update rebuilds JSON",
);
stable = snapshot();
fail(
  () =>
    sql(
      `begin;lock table learning.evidence in share row exclusive mode;update learning.evidence set extractor='one',provenance='{"extractor":"two"}' where id='${id(31)}';commit;`,
    ),
  /Conflicting/,
  "conflicting dual update fails",
);
check(snapshot() === stable, "failed dual update changes nothing");
sql(bridge);
check(snapshot() === stable, "bridge replay preserves all values");

// JSONB numeric equality alone would lose lexical numeric spelling.
const numericDual = nativeInsert(
  61,
  { extractor: "numeric-dual", ontology_version: 1 },
  { provenance: { extractor: "numeric-dual", ontology_version: 1 } },
).replace('"ontology_version":1}', '"ontology_version":1.0}');
fail(
  () => sql(auth(numericDual)),
  /Conflicting/,
  "numerically equal but lexically different dual JSON is refused",
);
sql(
  auth(
    nativeInsert(62, { extractor: "nested", digest_backfill: { number: 1 } }),
  ),
);
sql(
  `begin;lock table learning.evidence in share row exclusive mode;update learning.evidence set digest_backfill='{"number":1.0}'::jsonb where id='${id(62)}';commit;`,
);
check(
  sql(
    `select (provenance->'digest_backfill')::text from learning.evidence where id='${id(62)}'`,
  ) === '{"number": 1.0}',
  "native nested numeric spelling updates the JSON exactly",
);
sql(
  `begin;lock table learning.evidence in share row exclusive mode;update learning.evidence set provenance=jsonb_set(provenance,'{digest_backfill}','{"number":1.00}'::jsonb) where id='${id(62)}';commit;`,
);
check(
  sql(
    `select digest_backfill::text from learning.evidence where id='${id(62)}'`,
  ) === '{"number": 1.00}',
  "legacy nested numeric spelling updates native fields exactly",
);
// A native writer starts while a legacy writer holds the existing learner lock.
const first = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
let firstOut = "",
  firstErr = "";
first.stdout.on("data", (b) => (firstOut += b));
first.stderr.on("data", (b) => (firstErr += b));
const firstDone = new Promise((resolve, reject) =>
  first.on("exit", (c) => (c === 0 ? resolve() : reject(Error(firstErr)))),
);
first.stdin.write(
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true);${insert(71, { provenance: { extractor: "legacy", pass_id: "concurrent-new", pass_at: "zzzz" } })};select 'bridge_writer_ready';\n`,
);
for (let n = 0; !firstOut.includes("bridge_writer_ready"); n++) {
  if (n > 100) throw Error(firstErr || "Writer timeout");
  await new Promise((r) => setTimeout(r, 20));
}
const second = spawn(
  "psql",
  [
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    auth(
      nativeInsert(72, {
        extractor: "native",
        pass_id: "concurrent-old",
        pass_at: "zzza",
      }),
    ),
  ],
  { env: { ...process.env, PGAPPNAME: "metadata-bridge-native" } },
);
let secondErr = "";
second.stderr.on("data", (b) => (secondErr += b));
const secondDone = new Promise((resolve, reject) =>
  second.on("exit", (c) => (c === 0 ? resolve() : reject(Error(secondErr)))),
);
try {
  let waiting = false;
  for (let n = 0; n < 100; n++) {
    waiting =
      sql(
        "select exists(select 1 from pg_stat_activity where application_name='metadata-bridge-native' and wait_event='advisory')",
      ) === "t";
    if (waiting) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  check(waiting, "native writer waits on the existing legacy learner lock");
  check(
    sql(
      `select count(*)from learning.evidence where id in('${id(71)}','${id(72)}')`,
    ) === "0",
    "neither uncommitted representation leaks",
  );
} finally {
  first.stdin.end("commit;\n");
}
await Promise.all([firstDone, secondDone]);
check(
  row(71).status === "active" && row(72).status === "superseded",
  "native refresh sees the committed legacy pass",
);
sql(
  auth(
    nativeInsert(73, {
      extractor: "native",
      pass_id: "concurrent-new",
      pass_at: "zzzz",
    }),
  ),
);
check(
  row(71).status === "active" && row(73).status === "active",
  "old and new writer rows in one newest pass stay active",
);
sql(auth(`delete from learning.evidence where id in('${id(71)}','${id(73)}')`));
check(
  row(72).status === "active",
  "delete selected pass reactivates the native prior pass",
);
const holder = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]);
let held = "";
holder.stdout.on("data", (b) => (held += b));
const holderDone = new Promise((resolve, reject) =>
  holder.on("exit", (c) =>
    c === 0 ? resolve() : reject(Error("Local lock holder failed")),
  ),
);
holder.stdin.write(
  "begin;lock table learning.evidence in share mode;select 'bridge_lock_ready';\n",
);
for (let n = 0; !held.includes("bridge_lock_ready"); n++) {
  if (n > 100) throw Error("Lock timeout");
  await new Promise((r) => setTimeout(r, 20));
}
stable = snapshot();
try {
  fail(
    () => sql(bridge),
    /could not obtain lock/,
    "concurrent table access refuses conversion immediately",
  );
} finally {
  holder.stdin.end("rollback;\n");
  await holderDone;
}
check(snapshot() === stable, "table lock refusal changes no metadata");
console.log(count + " bridge assertions passed");
