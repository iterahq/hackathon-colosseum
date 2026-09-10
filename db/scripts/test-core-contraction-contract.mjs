#!/usr/bin/env node
// The round-6 contract names every retired and retained physical object.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const contract = JSON.parse(read("../census/learning-core-d-contract.json"));
const migration = read("../migrations/0099_learning_core_contraction.sql");
const key = (object) =>
  [object.schema, object.table, object.column].filter(Boolean).join(".");

const expectedRetired = [
  "learning.checkpoints",
  "learning.evidence.provenance",
  "learning.generation_config",
];
const expectedRetained = [
  "learning.capabilities.concept_id",
  "learning.work_episodes.ingest_batch_id",
];

assert.equal(contract.version, 1);
assert.deepEqual(
  contract.retiredPhysicalObjects.map(key).sort(),
  expectedRetired,
);
assert.deepEqual(
  contract.retainedPhysicalObjects.map(key).sort(),
  expectedRetained,
);

const dropColumns = [
  ...migration.matchAll(
    /alter\s+table\s+([a-z_][\w]*\.[a-z_][\w]*)\s+drop\s+column\s+(?:if\s+exists\s+)?([a-z_][\w]*)\s*;/gi,
  ),
].map((match) => `${match[1]}.${match[2]}`);
const dropTables = [
  ...migration.matchAll(
    /drop\s+table\s+(?:if\s+exists\s+)?([a-z_][\w]*\.[a-z_][\w]*)\s*;/gi,
  ),
].map((match) => match[1]);
const actualRetired = [...dropColumns, ...dropTables].sort();

assert.deepEqual(actualRetired, expectedRetired);
assert.ok(expectedRetained.every((object) => !actualRetired.includes(object)));
assert.doesNotMatch(
  migration,
  /(?:alter\s+table\s+learning\.evidence\s+drop\s+column|drop\s+table)[^;]*\bcascade\b/gi,
);

console.log(
  "PASS: 0099 drops the three manifest objects and retains both round-6 exceptions",
);
