#!/usr/bin/env node
// Origin: agent. Real populated0097→0098 transition on the isolated prefix only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST))
  throw Error("Local fixture required");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const sql = (s) =>
  execFileSync(
    "psql",
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
    { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const last = (s) => sql(s).split("\n").at(-1);
const id = (n) => `00980000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
const caller = (s) =>
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id(101)}',true);${s};rollback;`;
const migration = read(
  "../migrations/0098_learning_source_ingest_preservation.sql",
);
const reverse = read("./reverse-learning-session-regroup-source.sql");
let count = 0;
const check = (v, label) => {
  assert.ok(v, label);
  count++;
  console.log("PASS " + label);
};
const refuse = (s, re, label) => {
  assert.throws(() => sql(s), re);
  check(true, label);
};
const rows = () =>
  JSON.parse(
    last(
      `select jsonb_agg(to_jsonb(e) order by id)from learning.work_episodes e where learner_id='${id(1)}'`,
    ),
  );
const verify = () =>
  JSON.parse(last(caller("select learning.verify_a2_manifest()")));
try {
  check(
    last(
      "select count(*)from pg_attribute where attrelid='learning.work_episodes'::regclass and attname='source_ingest_batch_id'and not attisdropped",
    ) === "0",
    "test starts on actual0097 prefix",
  );
  sql(`insert into itera.users(id,email)values('${id(1)}','source-ingest@example.invalid');insert into itera.identities(user_id,provider,provider_subject)values('${id(1)}','password','${id(101)}');insert into learning.learners(id)values('${id(1)}');insert into learning.work_contexts(id,learner_id,project_root,project_ref,machine,machine_class)values('${id(10)}','${id(1)}','/source-fixture','/source-fixture','fixture','human');
 insert into learning.work_episodes(id,learner_id,source,machine,machine_class,work_context_id,grain,session_ref,started_at,ended_at,created_at,ingest_batch_id,payload)values
 ('${id(20)}','${id(1)}','test','fixture','human','${id(10)}','turn','a','2026-09-01T10:00Z','2026-09-01T10:01Z','2026-09-07T18:00Z','${id(90)}','{}'),
 ('${id(21)}','${id(1)}','test','fixture','human','${id(10)}','turn','b','2026-09-01T10:02Z','2026-09-01T10:03Z','2026-09-07T18:00Z',null,'{}');`);
  // This unrelated owner's nullable row reproduces the full transition corpus.
  sql(
    `insert into itera.users(id,email)values('${id(2)}','source-ingest-other@example.invalid');insert into learning.learners(id)values('${id(2)}');insert into learning.work_episodes(id,learner_id,source,grain)values('${id(30)}','${id(2)}','test','session');`,
  );
  sql(read("../migrations/0088_learning_session_regroup.sql"));
  const before = rows();
  const hashes = last(
    `select jsonb_agg(learning.a2_frozen_row(to_jsonb(e),grain)order by id)from learning.work_episodes e where learner_id='${id(1)}'`,
  );
  sql(migration);
  const after = rows();
  assert.deepEqual(
    after.map(({ source_ingest_batch_id, ...r }) => r),
    before,
  );
  check(
    after.every((r) => r.source_ingest_batch_id === r.ingest_batch_id),
    "every prior field and exact nullable UUID preserved",
  );
  check(
    last(
      `select jsonb_agg(learning.a2_legacy_episode_row(e,grain)order by id)from learning.work_episodes e where learner_id='${id(1)}'`,
    ) === hashes,
    "all original fingerprint projections and old hashes are identical",
  );
  check(
    verify().turns === 2 && verify().sessions === 1,
    "real immutable0088 manifests verify after expansion",
  );
  sql(migration);
  assert.deepEqual(rows(), after);
  check(true, "migration replay changes no row");
  const allEpisodeRows = () =>
    last(
      "select coalesce(jsonb_agg(to_jsonb(e)order by id),'[]'::jsonb)::text from learning.work_episodes e",
    );
  const beforeDrift = allEpisodeRows();
  for (const [mutation, label] of [
    [
      "alter table learning.work_episodes drop constraint work_episodes_source_ingest_equal;alter table learning.work_episodes alter column source_ingest_batch_id type text using source_ingest_batch_id::text;",
      "wrong source type",
    ],
    [
      // Only this rolled-back local transaction stages a valid NOT NULL catalog.
      // Preserve every row; deletion would also affect historical dependencies.
      `update learning.work_episodes set source_ingest_batch_id=id,ingest_batch_id=id where source_ingest_batch_id is null;alter table learning.work_episodes alter column source_ingest_batch_id set not null;`,
      "wrong source nullability",
    ],
    [
      `alter table learning.work_episodes alter column source_ingest_batch_id set default '${id(90)}'::uuid;`,
      "source default",
    ],
  ]) {
    refuse(
      "begin;" +
        mutation +
        migration.replace(/^begin;$/m, "").replace(/commit;\s*$/, "rollback;"),
      /Existing source ingest column must be nullable UUID/,
      label + " refuses before any repair",
    );
    assert.deepEqual(rows(), after);
    check(
      allEpisodeRows() === beforeDrift,
      label + " rolls back every owner row exactly",
    );
  }
  const baseInsert = `insert into learning.work_episodes(learner_id,source,machine,grain`;
  for (const [columns, values, label] of [
    ["", "", "both omitted"],
    [
      ",ingest_batch_id,source_ingest_batch_id",
      ",null,null",
      "explicit NULL pair",
    ],
    [
      ",ingest_batch_id,source_ingest_batch_id",
      `,'${id(91)}','${id(91)}'`,
      "equal non-null adapter",
    ],
  ]) {
    check(
      last(
        caller(
          `${baseInsert}${columns})values('${id(1)}','test','fixture','session'${values})returning ingest_batch_id is not distinct from source_ingest_batch_id`,
        ),
      ) === "t",
      label + " passes",
    );
  }
  for (const [columns, values, label] of [
    [",ingest_batch_id", `,'${id(91)}'`, "legacy only"],
    [",source_ingest_batch_id", `,'${id(91)}'`, "native only"],
    [
      ",ingest_batch_id,source_ingest_batch_id",
      `,'${id(91)}','${id(92)}'`,
      "disagreement",
    ],
  ])
    refuse(
      caller(
        `${baseInsert}${columns})values('${id(1)}','test','fixture','session'${values})`,
      ),
      /23514.*|work_episodes_source_ingest_equal/,
      label + " write refuses",
    );
  refuse(
    `begin;update learning.work_episodes set source_ingest_batch_id=null where id='${id(20)}';rollback;`,
    /work_episodes_source_ingest_equal/,
    "one-sided update refuses",
  );
  refuse(
    `begin;update learning.work_episodes set source_ingest_batch_id='${id(91)}',ingest_batch_id='${id(91)}'where id='${id(20)}';select learning.verify_a2_manifest();rollback;`,
    /A2 original turn missing or changed/,
    "equal changed source still refuses old hash",
  );
  refuse(
    `select learning.a2_frozen_row(to_jsonb(e)-'ingest_batch_id','turn')from learning.work_episodes e where id='${id(20)}'`,
    /every original field/,
    "missing original key never becomes null",
  );
  refuse(
    `select learning.a2_legacy_episode_row(jsonb_populate_record(null::learning.work_episodes,to_jsonb(e)||'{"source_ingest_batch_id":null}'),'turn')from learning.work_episodes e where id='${id(20)}'`,
    /differs from physical/,
    "forged composite disagreement refuses",
  );
  const metadata = () =>
    JSON.parse(last(caller("select learning.export_work_episode_columns()")));
  const descriptors = metadata();
  const expectedDescriptors = [
    ["agent_summary", "text", true],
    ["agent_version", "text", true],
    ["created_at", "timestamptz", false],
    ["ended_at", "timestamptz", true],
    ["grain", "text", false],
    ["id", "uuid", false],
    ["ingest_batch_id", "uuid", true],
    ["learner_id", "uuid", false],
    ["machine", "text", true],
    ["machine_class", "text", false],
    ["payload", "jsonb", false],
    ["project_ref", "text", true],
    ["relevance_checked_at", "timestamptz", true],
    ["relevance_status", "text", true],
    ["schema_version", "int2", false],
    ["session_episode_id", "uuid", true],
    ["session_ref", "text", true],
    ["session_refs", "_text", true],
    ["source", "text", false],
    ["source_ingest_batch_id", "uuid", true],
    ["started_at", "timestamptz", true],
    ["user_prompt", "text", true],
    ["work_context_id", "uuid", true],
  ].map(([name, udt_name, nullable]) => ({
    name,
    udt_schema: "pg_catalog",
    udt_name,
    nullable,
  }));
  assert.deepEqual(descriptors, expectedDescriptors);
  check(
    true,
    "all23 column names, types and nullability match the frozen contract",
  );

  check(
    descriptors.length === 23 &&
      descriptors.every((x, i) => !i || descriptors[i - 1].name < x.name),
    "RPC returns all23 sorted descriptors",
  );
  for (const name of ["ingest_batch_id", "source_ingest_batch_id"])
    assert.deepEqual(
      descriptors.find((x) => x.name === name),
      { name, udt_schema: "pg_catalog", udt_name: "uuid", nullable: true },
    );
  check(true, "both source descriptors have exact UUID type and nullability");
  check(
    last(
      caller(
        `select itera.current_itera_user_id()='${id(1)}'::uuid and auth.uid()<>'${id(1)}'::uuid`,
      ),
    ) === "t",
    "resolved identity differs from auth subject",
  );
  for (const role of ["anon", "service_role"])
    refuse(
      `begin;set local role ${role};select learning.export_work_episode_columns();rollback;`,
      /42501/,
      "RPC denies " + role,
    );
  refuse(
    "begin;set local role authenticated;select learning.export_work_episode_columns();rollback;",
    /42501/,
    "RPC denies missing identity",
  );
  refuse(
    `begin;select set_config('request.jwt.claim.sub','${id(101)}',true);select set_config('request.jwt.claim.role','authenticated',true);select learning.export_work_episode_columns();rollback;`,
    /42501/,
    "JWT role cannot impersonate database role",
  );
  refuse(
    `begin;revoke select on learning.work_episodes from authenticated;set local role authenticated;select set_config('request.jwt.claim.sub','${id(101)}',true);select learning.export_work_episode_columns();rollback;`,
    /42501/,
    "RPC requires SELECT grant",
  );
  const empty = JSON.parse(
    last(
      `begin;delete from learning.work_episodes where learner_id='${id(1)}';set local role authenticated;select set_config('request.jwt.claim.sub','${id(101)}',true);select learning.export_work_episode_columns();rollback;`,
    ),
  );
  assert.deepEqual(empty, descriptors);
  check(true, "empty episode collection still has complete catalog");
  const altered = JSON.parse(
    last(
      `begin;alter table learning.work_episodes add column unknown_source_column integer not null default 0;set local role authenticated;select set_config('request.jwt.claim.sub','${id(101)}',true);select learning.export_work_episode_columns();rollback;`,
    ),
  );
  assert.deepEqual(
    altered.find((x) => x.name === "unknown_source_column"),
    {
      name: "unknown_source_column",
      udt_schema: "pg_catalog",
      udt_name: "int4",
      nullable: false,
    },
  );
  check(true, "unknown typed column is exposed truthfully for caller refusal");
  // The actual current0089 writer is executed, not simulated by a direct INSERT.
  const episode = {
    v: 2,
    id: "source-ingest-writer",
    source: "claude-code",
    machine: "fixture",
    cwd: "/source-fixture",
    project_root: "/source-fixture",
    started_at: "2026-09-08T01:00:00Z",
    ended_at: "2026-09-08T01:01:00Z",
    complete: true,
    prompt: {
      v: 1,
      source: "claude-code",
      event: "user-prompt",
      ts: "2026-09-08T01:00:00Z",
      machine: "fixture",
      raw: { prompt: "Fixture" },
    },
    turn_end: null,
    moments: [
      {
        kind: "turn",
        at: "2026-09-08T01:00:00Z",
        session_ref: "current",
        payload: { prompt: "Fixture" },
      },
    ],
  };
  check(
    last(
      caller(
        `select learning.ingest_episode_v2(${q(JSON.stringify(episode))}::jsonb,'0.4.1','human');select bool_and(ingest_batch_id is null and source_ingest_batch_id is null)from learning.work_episodes where payload->>'id'='source-ingest-writer'`,
      ),
    ) === "t",
    "actual current v2 writer succeeds with NULL pair",
  );
  const parent = after.find((x) => x.grain === "session").id;
  sql(
    `insert into learning.artifacts(id,learner_id,episode_id,kind,title)values('${id(50)}','${id(1)}','${parent}','document','Fixture dependency')`,
  );
  refuse(
    reverse,
    /Reverse blocked by dependent rows/,
    "all-FK reverse refusal remains before source changes",
  );
  assert.deepEqual(rows(), after);
  sql(`delete from learning.artifacts where id='${id(50)}'`);
  // Exercise the future catalog stage only inside a rolled-back local transaction.
  const future = `alter table learning.work_episodes drop constraint work_episodes_source_ingest_equal;alter table learning.work_episodes drop column ingest_batch_id;`;
  check(
    last(
      `begin;${future}select learning.verify_a2_manifest()->>'verified';rollback;`,
    ) === "true",
    "typed original source preserves hashes after a simulated future physical drop",
  );
  sql(
    reverse
      .replace("begin;", `begin;${future}`)
      .replace(/commit;\s*$/, "rollback;"),
  );
  assert.deepEqual(rows(), after);
  check(
    true,
    "future-stage reverse executes and rolls back with exact original rows",
  );
  const post = JSON.parse(
    last(
      `begin;${future}set local role authenticated;select set_config('request.jwt.claim.sub','${id(101)}',true);select learning.export_work_episode_columns();rollback;`,
    ),
  );
  assert.deepEqual(
    post,
    descriptors.filter((x) => x.name !== "ingest_batch_id"),
  );
  check(true, "post-stage RPC returns exact22 descriptors");
  sql(reverse);
  check(
    last(
      `select count(*)from learning.work_episodes where learner_id='${id(1)}'and grain='turn'and session_episode_id is null`,
    ) === "2",
    "reviewed reverse preserves both original turn IDs",
  );
  check(
    last(
      `select source_ingest_batch_id='${id(90)}'::uuid and ingest_batch_id='${id(90)}'::uuid from learning.work_episodes where id='${id(20)}'`,
    ) === "t",
    "reverse retains exact original non-null source",
  );
  console.log(JSON.stringify({ passed: true, assertions: count }));
} finally {
  sql(
    `begin;lock table learning.evidence in share row exclusive mode;delete from itera.users where id in('${id(1)}','${id(2)}');commit;`,
  );
}
