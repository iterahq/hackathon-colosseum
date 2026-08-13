#!/usr/bin/env node
/**
 * verify-activity-kinds.mjs — the prose about `itera.activity_kind` must agree
 * with the enum.
 *
 * Usage: node scripts/verify-activity-kinds.mjs
 * Exit 0 = agree. Exit 1 = drift, with every disagreement named.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * On 2026-08-13 the enum held **14** values. `CLAUDE.md`, `repo-contract.yaml`
 * and `db/README.md` said 12, 12 and 4. The count had been wrong since
 * `0057_chat_and_terminal_sandbox_kinds.sql` landed, and nothing noticed,
 * because every one of those numbers lived in prose. A number in prose is a
 * number that drifts on the next `ALTER TYPE`. This check turns those claims
 * into assertions.
 *
 * ── THE AUTHORITY ──────────────────────────────────────────────────────────
 *
 * `db/migrations/*.sql`, read in filename order:
 *   `create type itera.activity_kind as enum (...)`  → the base values
 *   `ALTER TYPE itera.activity_kind ADD VALUE ...`   → appended, in file order
 *
 * That reproduces `enumsortorder`, so the derived list is not merely the right
 * SET — it is the right SEQUENCE. It is cross-checked against
 * `db/census/expected-schema.txt`, which the `db-apply` / `db-drift` pipeline
 * refreshes from the live database. Two independent derivations of the same
 * fact; if they ever disagree, one of them is stale and this check says so
 * instead of picking a winner.
 *
 * The script reads NOTHING from `node_modules`, on purpose: it must run in the
 * `docs-drift` CI job, which does no `npm install`.
 *
 * ── WHAT IS CHECKED, AND WHAT IS HONESTLY NOT ──────────────────────────────
 *
 *  1. migrations ⇄ `db/census/expected-schema.txt`  — same list, same order.
 *  2. `repo-contract.yaml` `activity_kinds:`        — same SET (order is free;
 *     that file groups by family, not by `enumsortorder`).
 *  3. Every `<!-- activity-kinds:begin -->` … `<!-- activity-kinds:end -->`
 *     block in the doc files: the kind names inside must be exactly the derived
 *     set, and every `N kinds` written inside must equal the derived count.
 *  4. Each doc file must still CONTAIN such a block — so deleting the markers
 *     to silence the checker fails instead of passing.
 *
 * **NOT checked: unmarked prose.** A sentence elsewhere in `CLAUDE.md` that
 * says "9 kinds" may be a historical note or a count of a SUBSET (there are
 * real examples of both), and a blanket `\d+ kinds` rule would fail them all.
 * So the canonical claims carry markers and the rest does not. That boundary is
 * stated here rather than implied, because a checker that silently covers less
 * than it appears to is worse than no checker.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'db/migrations';
const CENSUS = 'db/census/expected-schema.txt';
const CONTRACT = 'repo-contract.yaml';
const MARKED_DOCS = ['CLAUDE.md', 'db/README.md'];

const ENUM = 'itera.activity_kind';

const findings = [];
const fail = (msg) => findings.push(msg);

/* ── 1. Derive the enum from the migrations ──────────────────────────────── */

function deriveFromMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const kinds = [];
  const add = (value, where) => {
    if (kinds.includes(value)) return; // ADD VALUE IF NOT EXISTS is idempotent
    kinds.push(value);
    void where;
  };

  let created = false;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');

    // Postgres cannot drop or rename an enum value in a way this derivation
    // would survive. If one ever appears, the derivation is unsound and must
    // not quietly return the wrong list.
    const mutation = sql.match(
      new RegExp(`alter\\s+type\\s+${ENUM}\\s+(drop|rename)\\s+value`, 'i')
    );
    if (mutation) fail(`UNSUPPORTED: ${f} uses \`${mutation[0]}\` — this derivation cannot model it`);

    const create = sql.match(
      new RegExp(`create\\s+type\\s+${ENUM}\\s+as\\s+enum\\s*\\(([^)]*)\\)`, 'i')
    );
    if (create) {
      if (created) fail(`DUPLICATE: ${f} creates ${ENUM} again`);
      created = true;
      for (const m of create[1].matchAll(/'([^']+)'/g)) add(m[1], f);
    }

    const alter = new RegExp(
      `alter\\s+type\\s+${ENUM}\\s+add\\s+value\\s+(?:if\\s+not\\s+exists\\s+)?'([^']+)'`,
      'gi'
    );
    for (const m of sql.matchAll(alter)) add(m[1], f);
  }

  if (!created) fail(`FATAL: no \`create type ${ENUM}\` found under ${MIGRATIONS_DIR}/`);
  return kinds;
}

const derived = deriveFromMigrations();
const derivedSet = new Set(derived);

/* ── 2. Cross-check against the census ───────────────────────────────────── */

function censusKinds() {
  const line = readFileSync(CENSUS, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`type  ${ENUM} e [`));
  if (!line) {
    fail(`FATAL: ${CENSUS} has no \`type  ${ENUM} e [...]\` line`);
    return null;
  }
  return line.slice(line.indexOf('[') + 1, line.lastIndexOf(']')).split(',').map((s) => s.trim());
}

const census = censusKinds();
if (census && census.join(',') !== derived.join(',')) {
  fail(
    `DRIFT: ${CENSUS} disagrees with ${MIGRATIONS_DIR}/\n` +
      `        migrations: ${derived.join(', ')}\n` +
      `        census:     ${census.join(', ')}`
  );
}

/* ── 3. repo-contract.yaml `activity_kinds:` ─────────────────────────────── */

function contractKinds() {
  const lines = readFileSync(CONTRACT, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === 'activity_kinds:');
  if (start < 0) {
    fail(`FATAL: ${CONTRACT} has no top-level \`activity_kinds:\` key`);
    return null;
  }
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*#/.test(l) || l.trim() === '') continue;
    const item = l.match(/^\s*-\s*([a-z_]+)\s*$/);
    if (!item) break; // first non-comment, non-item line ends the block
    out.push(item[1]);
  }
  return out;
}

const contract = contractKinds();
if (contract) {
  const missing = derived.filter((k) => !contract.includes(k));
  const extra = contract.filter((k) => !derivedSet.has(k));
  if (missing.length) fail(`DRIFT: ${CONTRACT} \`activity_kinds:\` is MISSING ${missing.join(', ')}`);
  if (extra.length) fail(`DRIFT: ${CONTRACT} \`activity_kinds:\` has UNKNOWN ${extra.join(', ')}`);
  if (contract.length !== new Set(contract).size) fail(`DRIFT: ${CONTRACT} \`activity_kinds:\` repeats a value`);
}

/* ── 4. Marked prose blocks ──────────────────────────────────────────────── */

const BEGIN = 'activity-kinds:begin';
const END = 'activity-kinds:end';

for (const doc of MARKED_DOCS) {
  const text = readFileSync(doc, 'utf8');
  const blocks = [...text.matchAll(new RegExp(`${BEGIN}([\\s\\S]*?)${END}`, 'g'))];

  if (blocks.length === 0) {
    fail(
      `MISSING BLOCK: ${doc} has no <!-- ${BEGIN} --> … <!-- ${END} --> block. ` +
        `The block is how the kind list in this file stays checked; do not remove it.`
    );
    continue;
  }

  for (const [i, block] of blocks.entries()) {
    const body = block[1];
    const label = blocks.length > 1 ? `${doc} (block ${i + 1})` : doc;

    // Kind names: any backticked token, plus bare tokens on `·`-separated
    // lines, restricted to things that LOOK like a kind (lowercase + `_`).
    const named = new Set();
    for (const m of body.matchAll(/`([a-z][a-z_]*)`/g)) named.add(m[1]);
    for (const m of body.matchAll(/(?:^|[·|,\s])([a-z][a-z_]{3,})(?=[·|,\s]|$)/gm)) {
      if (derivedSet.has(m[1])) named.add(m[1]);
    }

    // Only judge tokens that are plausibly kind names: everything in the
    // derived set, plus anything that is not a known kind but sits in a block
    // whose job is to list them. The second half is what catches a typo or a
    // kind that was invented in prose and never migrated.
    const missing = derived.filter((k) => !named.has(k));
    const extra = [...named].filter((k) => !derivedSet.has(k));
    if (missing.length) fail(`DRIFT: ${label} block does NOT list ${missing.join(', ')}`);
    if (extra.length) fail(`DRIFT: ${label} block lists unknown kind(s) ${extra.join(', ')}`);

    // Counts written inside the block.
    const counts = [...body.matchAll(/(\d+)\s*\**\s*kinds/gi)].map((m) => Number(m[1]));
    if (counts.length === 0) {
      fail(`DRIFT: ${label} block states no "N kinds" count — the count is the thing that drifts`);
    }
    for (const n of counts) {
      if (n !== derived.length) {
        fail(`DRIFT: ${label} block says "${n} kinds"; the enum has ${derived.length}`);
      }
    }
  }
}

/* ── Report ──────────────────────────────────────────────────────────────── */

console.log(`itera.activity_kind — ${derived.length} values derived from ${MIGRATIONS_DIR}/:`);
console.log(`  ${derived.join(', ')}`);
console.log('');

if (findings.length) {
  console.error(`=== FAILED — ${findings.length} finding(s) ===`);
  for (const f of findings) console.error(`  ${f}`);
  console.error('');
  console.error('Fix the doc, or add the migration. The enum is the authority; the prose is not.');
  process.exit(1);
}

console.log('=== OK — every checked list and count agrees with the enum ===');
