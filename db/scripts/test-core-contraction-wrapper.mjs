#!/usr/bin/env node
// Origin: agent. The declared prefix/suffix refuses unaccounted files before SQL.
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const temp = mkdtempSync(join(tmpdir(), "itera-core-accounting-"));
try {
  const root = join(temp, "tree"),
    bin = join(temp, "bin"),
    trace = join(temp, "sql-ran");
  mkdirSync(join(root, "db/scripts"), { recursive: true });
  mkdirSync(join(root, "db/migrations"));
  mkdirSync(bin);
  const script = join(root, "db/scripts/test-core-contraction.sh");
  copyFileSync(new URL("./test-core-contraction.sh", import.meta.url), script);
  writeFileSync(
    join(bin, "psql"),
    `#!/bin/sh\necho called > '${trace}'\nexit 99\n`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PGHOST: "127.0.0.1",
    CORE_PREFIX_ROOT: join(temp, "prefix"),
    PATH: bin + ":" + process.env.PATH,
  };
  let result = spawnSync("bash", [script, "prefix"], { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /suffix is missing/);
  assert.equal(existsSync(trace), false);
  writeFileSync(
    join(root, "db/migrations/0099_learning_core_contraction.sql"),
    "-- declared suffix\n",
  );
  result = spawnSync("bash", [script, "prefix"], { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /0100_learning_capability_graph_endpoints/);
  assert.equal(existsSync(trace), false);
  writeFileSync(
    join(root, "db/migrations/0100_learning_capability_graph_endpoints.sql"),
    "-- declared graph suffix\n",
  );
  result = spawnSync("bash", [script, "prefix"], { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /0101_mcp_tool_calls/);
  assert.equal(existsSync(trace), false);
  writeFileSync(
    join(root, "db/migrations/0101_mcp_tool_calls.sql"),
    "-- declared usage-log suffix\n",
  );
  result = spawnSync("bash", [script, "prefix"], { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /0102_catalog_program_outline/);
  assert.equal(existsSync(trace), false);
  writeFileSync(
    join(root, "db/migrations/0102_catalog_program_outline.sql"),
    "-- declared catalog outline suffix\n",
  );
  result = spawnSync("bash", [script, "prefix"], { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /0104_activity_kind_behaviour_kinds/);
  assert.equal(existsSync(trace), false);
  writeFileSync(
    join(root, "db/migrations/0104_activity_kind_behaviour_kinds.sql"),
    "-- declared activity-kind labels suffix\n",
  );
  result = spawnSync("bash", [script, "prefix"], { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /0107_activity_kind_scene_kinds/);
  assert.equal(existsSync(trace), false);
  writeFileSync(
    join(root, "db/migrations/0107_activity_kind_scene_kinds.sql"),
    "-- declared scene kinds suffix\n",
  );
  writeFileSync(
    join(root, "db/migrations/0105_unaccounted.sql"),
    "-- future migration must not disappear\n",
  );
  for (const mode of ["prefix", "parity", "restore", "suffix"]) {
    result = spawnSync("bash", [script, mode], { env, encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unaccounted migration/);
    assert.equal(existsSync(trace), false);
    assert.equal(existsSync(env.CORE_PREFIX_ROOT), false);
  }
  result = spawnSync("bash", [script, "suffix"], {
    env: { ...env, PGHOST: "production.invalid" },
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Local fixture required/);
  assert.equal(existsSync(trace), false);
  console.log(
    "PASS: missing suffix, every unaccounted-file phase and nonlocal target refuse before SQL",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
