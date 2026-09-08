#!/usr/bin/env node
// Origin: agent. Real reversible catalog mutations, on a local fixture only.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST))
  throw Error("Local fixture required");
const sql = (s) =>
  execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: s,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const census = readFileSync(new URL("./census.sql", import.meta.url), "utf8");
const scan = () =>
  sql(census).split("\n").filter(Boolean).sort().join("\n") + "\n";
const scratch = mkdtempSync(join(tmpdir(), "itera-learning-census-"));
const expected = join(scratch, "baseline.txt");
const parity = new URL("./schema-parity.sh", import.meta.url).pathname;
let count = 0;
const check = (ok, label) => {
  assert.ok(ok, label);
  console.log("PASS " + label);
  count++;
};
const baseline = scan();
writeFileSync(expected, baseline);
const verdict = () =>
  spawnSync("bash", [parity, "check", "--expected", expected], {
    encoding: "utf8",
  });
const functionDefinition = sql(
  "select pg_get_functiondef('learning.native_evidence_metadata(learning.evidence)'::regprocedure)",
);
try {
  check(
    baseline.includes("#cens version=3\n"),
    "new census version is explicit",
  );
  for (const schema of ["itera", "billing", "learning"])
    check(
      baseline.includes(`rel   ${schema}.`),
      `${schema} coverage remains present`,
    );
  check(
    baseline.includes(
      "gcol  learning.evidence.status authenticated UPDATE grantable=f",
    ),
    "status-only column grant is visible",
  );
  check(
    verdict().status === 0,
    "unchanged canonical census passes the actual parity checker",
  );
  const cases = [
    [
      "native column",
      "alter table learning.evidence add column census_fixture_native text",
      "alter table learning.evidence drop column census_fixture_native",
      "col   learning.evidence.census_fixture_native",
    ],
    [
      "native default",
      "alter table learning.evidence alter column pass_id set default 'census-fixture'",
      "alter table learning.evidence alter column pass_id drop default",
      "col   learning.evidence.pass_id",
    ],
    [
      "function body",
      "create or replace function learning.native_evidence_metadata(value learning.evidence) returns jsonb language sql immutable strict parallel safe security invoker set search_path=pg_catalog,learning as $$ select '{}'::jsonb $$",
      functionDefinition,
      "fn    learning.native_evidence_metadata",
    ],
    [
      "function security",
      "alter function learning.native_evidence_metadata(learning.evidence) security definer",
      "alter function learning.native_evidence_metadata(learning.evidence) security invoker",
      "fn    learning.native_evidence_metadata",
    ],
    [
      "disabled bridge trigger",
      "alter table learning.evidence disable trigger evidence_metadata_bridge",
      "alter table learning.evidence enable trigger evidence_metadata_bridge",
      "evidence_metadata_bridge",
    ],
    [
      "unauthorized metadata-column grant",
      "grant update(pass_id) on learning.evidence to authenticated",
      "revoke update(pass_id) on learning.evidence from authenticated",
      "gcol  learning.evidence.pass_id authenticated UPDATE",
    ],
  ];
  for (const [name, change, restore, needle] of cases) {
    try {
      sql(change);
      const result = verdict();
      check(
        result.status === 3 && (result.stdout + result.stderr).includes(needle),
        `real ${name} drift makes the canonical parity checker fail`,
      );
    } finally {
      sql(restore);
    }
    check(
      scan() === baseline,
      `${name} restoration returns every catalog fact to baseline`,
    );
  }
  check(
    verdict().status === 0,
    "all restored mutations pass the actual parity checker",
  );
  console.log(`${count} learning census assertions passed`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
