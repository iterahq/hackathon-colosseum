#!/usr/bin/env node
// Origin: agent. Real identity/grant boundary on the local full migration series.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST))
  throw Error("Local fixture required");
const sql = (s) =>
  execFileSync(
    "psql",
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
    { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const uid = "00960000-0000-4000-8000-000000000001",
  subject = "00960000-0000-4000-8000-000000000101";
const fixture = `insert into itera.users(id,email) values('${uid}','export-columns@example.invalid');insert into itera.identities(user_id,provider,provider_subject)values('${uid}','password','${subject}');insert into learning.learners(id)values('${uid}');`;
const caller = `set local role authenticated;select set_config('request.jwt.claim.sub','${subject}',true);`;
const wrap = (s, setup = "") =>
  `begin;${fixture}${setup}${caller}${s};rollback;`;
const columns = [
  "activity_id",
  "activity_kind",
  "activity_response_id",
  "actor",
  "artifact_id",
  "assessment_method",
  "capability_id",
  "claim_id",
  "confidence",
  "created_at",
  "digest_backfill",
  "digest_dropped_chars",
  "direction",
  "episode_id",
  "extractor",
  "id",
  "learner_id",
  "misconception_id",
  "model",
  "model_version",
  "moment_id",
  "observation_id",
  "observed",
  "ontology_version",
  "pass_at",
  "pass_id",
  "prompt_version",
  "provenance",
  "provider",
  "quality",
  "relevance_extractor",
  "relevance_model",
  "source",
  "source_activity_response_ref",
  "source_episode_ref",
  "source_metadata_keys",
  "source_pass_id",
  "source_residue_id",
  "status",
  "strength",
  "surface",
  "turn_episode_id",
];
let checks = 0;
const check = (v, label) => {
  assert.ok(v, label);
  checks++;
  console.log("PASS " + label);
};
const last = (s) => sql(s).split("\n").at(-1);
const denied = (s, label) => {
  assert.throws(() => sql(s), /42501/);
  check(true, label);
};
check(
  last(
    wrap(
      `select itera.current_itera_user_id()='${uid}'::uuid and itera.current_itera_user_id()<>auth.uid()`,
    ),
  ) === "t",
  "Canonical identity differs from auth subject",
);
check(
  last(wrap("select count(*) from learning.evidence")) === "0",
  "Empty caller evidence still reaches metadata boundary",
);
assert.deepEqual(
  JSON.parse(last(wrap("select to_jsonb(learning.export_evidence_columns())"))),
  columns,
);
check(true, "Exact42 physical columns with empty evidence");
for (const role of ["anon", "service_role"])
  denied(
    `begin;${fixture}set local role ${role};select set_config('request.jwt.claim.sub','${subject}',true);select learning.export_evidence_columns();rollback;`,
    role + " cannot execute",
  );
denied(
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','00960000-0000-4000-8000-000000000999',true);select learning.export_evidence_columns();rollback;`,
  "Unlinked auth subject is refused",
);
denied(
  `begin;${fixture}select set_config('request.jwt.claim.sub','${subject}',true);select set_config('request.jwt.claim.role','authenticated',true);select learning.export_evidence_columns();rollback;`,
  "JWT role claim cannot impersonate actual authenticated role",
);
denied(
  wrap(
    "select learning.export_evidence_columns()",
    "revoke select on learning.evidence from authenticated;",
  ),
  "Missing table SELECT is refused",
);
assert.deepEqual(
  JSON.parse(
    last(
      wrap(
        "select to_jsonb(learning.export_evidence_columns())",
        "alter table learning.evidence drop column provenance;",
      ),
    ),
  ),
  columns.filter((c) => c !== "provenance"),
);
check(true, "Exact41 column transition without JSON");
const unknown = JSON.parse(
  last(
    wrap(
      "select to_jsonb(learning.export_evidence_columns())",
      "alter table learning.evidence add column unrecognized_export_column text;",
    ),
  ),
);
assert.deepEqual(unknown, [...columns, "unrecognized_export_column"].sort());
check(true, "RPC exposes unknown column truthfully for client refusal");
check(
  last(
    "select not p.prosecdef and p.pronargs=0 and p.provolatile='s' and p.proconfig=array['search_path=\"\"'] from pg_proc p where p.oid='learning.export_evidence_columns()'::regprocedure",
  ) === "t",
  "Argument-free stable INVOKER with empty search_path",
);
for (const role of ["anon", "service_role"])
  check(
    last(
      `select not has_function_privilege('${role}','learning.export_evidence_columns()','EXECUTE')`,
    ) === "t",
    role + " has no execute grant",
  );
check(
  last(`select count(*) from itera.users where id='${uid}'`) === "0",
  "No fixture row remains",
);
check(
  last(
    "select count(*) from pg_attribute where attrelid='learning.evidence'::regclass and attname='unrecognized_export_column' and not attisdropped",
  ) === "0",
  "Column test rolled back",
);
console.log(JSON.stringify({ assertions: checks, passed: true }));
