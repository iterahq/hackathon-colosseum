import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ACTIVITY_KINDS } from '@iterahq/activity-spec';

/**
 * The TypeScript kind union and the DATABASE enum, cross-checked.
 *
 * `CLAUDE.md` used to claim these disagreed ("enum do banco 12 × union TS 11 ×
 * switch 11"). All three numbers were wrong, and nobody could tell, because the
 * claim lived only in prose. This file replaces the claim with an assertion.
 *
 * ── The relationship is a SUBSET, not an equality, and that is deliberate ──
 *
 * Postgres has no `ALTER TYPE … DROP VALUE`. So the enum can only GROW: a kind
 * the product retires stays in the type forever (`sandbox_scenario` is exactly
 * that case today — live value, zero rows since the 2026-08-10 DML, dropped at
 * package level by `activity-spec` 1.0.0 / `iterahq/itera-player#353`).
 *
 * Therefore:
 *  - a kind the package exports that the database CANNOT STORE is a real bug —
 *    the app would write a value the column rejects — UNLESS nothing ever
 *    writes it. See the carve-out below. That is asserted.
 *  - a value in the enum that the package no longer exports is legal, and is
 *    reported (not failed) so a retirement stays visible instead of silent.
 *
 * ── THE CARVE-OUT: a kind that is NEVER STORED (2026-08-28) ────────────────
 *
 * `question` is exported by `@iterahq/activity-spec` and is deliberately absent
 * from the enum. It is not an oversight and it must not be "fixed" by adding
 * the label.
 *
 * The subset rule above rests on an unstated premise: *every kind the package
 * exports is a kind this app WRITES to `itera.activities`.* That was true of
 * all 13, so the premise never had to be named. `question` (ADR-6 of plan
 * `20260828-itera-learning-engine-v1`) is the first kind where it is false —
 * the plans-app asks the question and the DFL `plans` schema stores the answer,
 * so no `itera.activities` row ever carries the value. An enum label would be a
 * promise no writer keeps, and `ALTER TYPE … ADD VALUE` is irreversible.
 *
 * So the assertion becomes: **every exported kind is either storable, or on the
 * short list below.** That keeps the original guard at full strength for the
 * next kind — a new kind that IS written and IS missing a migration still turns
 * this red — while recording the one deliberate exception as data instead of as
 * a comment somebody can quietly widen.
 *
 * The prose side of the same fact — the counts and lists in `CLAUDE.md`,
 * `repo-contract.yaml` and `db/README.md` — is checked by
 * `scripts/verify-activity-kinds.mjs` in the `docs-drift` CI job.
 */

const MIGRATIONS_DIR = 'db/migrations';
const ENUM = 'itera.activity_kind';

/** Same derivation as `scripts/verify-activity-kinds.mjs`, kept tiny on purpose. */
function enumFromMigrations(): string[] {
  const kinds: string[] = [];
  for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    const create = sql.match(
      new RegExp(`create\\s+type\\s+${ENUM}\\s+as\\s+enum\\s*\\(([^)]*)\\)`, 'i')
    );
    if (create) for (const m of create[1].matchAll(/'([^']+)'/g)) kinds.push(m[1]);
    const alter = new RegExp(
      `alter\\s+type\\s+${ENUM}\\s+add\\s+value\\s+(?:if\\s+not\\s+exists\\s+)?'([^']+)'`,
      'gi'
    );
    for (const m of sql.matchAll(alter)) if (!kinds.includes(m[1])) kinds.push(m[1]);
  }
  return kinds;
}

describe('itera.activity_kind ⇄ ACTIVITY_KINDS', () => {
  const dbEnum = enumFromMigrations();

  it('the migrations really define the enum (guards the derivation itself)', () => {
    // If this ever reads 0, every assertion below would pass vacuously.
    expect(dbEnum.length).toBeGreaterThan(0);
    expect(dbEnum[0]).toBe('diagram');
  });

  it('the migration-derived enum matches db/census/expected-schema.txt', () => {
    const line = readFileSync('db/census/expected-schema.txt', 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`type  ${ENUM} e [`));
    expect(line).toBeDefined();
    const census = line!
      .slice(line!.indexOf('[') + 1, line!.lastIndexOf(']'))
      .split(',')
      .map((s) => s.trim());
    // Same values AND same order — the census is dumped in `enumsortorder`.
    expect(census).toEqual(dbEnum);
  });

  /**
   * The kinds this app NEVER writes to `itera.activities`, and which therefore
   * need no enum label. Exactly one, and adding a second is a decision.
   *
   * ⚠️ Membership is not "we have not got round to the migration yet". It is
   * "no writer exists, by design". If anything ever writes a `question` row,
   * this list is wrong before the migration is missing.
   */
  const NEVER_STORED: readonly string[] = ['question'];

  it('every kind the package exports can be STORED, or is on the never-stored list', () => {
    const unstorable = [...ACTIVITY_KINDS].filter(
      (k) => !dbEnum.includes(k) && !NEVER_STORED.includes(k),
    );
    expect(unstorable).toEqual([]);
  });

  /**
   * The carve-out has to stay honest in BOTH directions, the same way
   * `production-conformance.test.ts` keeps its known-bad list honest.
   *
   * An entry that IS in the enum is a stale exemption: either somebody migrated
   * the kind (so it is storable and the exemption is a lie) or the list outlived
   * its reason. Either way the line comes out.
   */
  it('every never-stored kind is really absent from the enum — no stale exemption', () => {
    expect(NEVER_STORED.filter((k) => dbEnum.includes(k))).toEqual([]);
    // …and is really a kind, not a typo that exempts nothing.
    expect(NEVER_STORED.filter((k) => !(ACTIVITY_KINDS as readonly string[]).includes(k))).toEqual(
      [],
    );
  });

  it('reports enum values the package no longer exports (legal — the enum cannot shrink)', () => {
    const retired = dbEnum.filter((k) => !(ACTIVITY_KINDS as readonly string[]).includes(k));
    // Not an assertion of emptiness: a retirement is legal and expected. This
    // pins the CURRENT set so a NEW, unexplained divergence shows up in a diff.
    expect(retired).toEqual(['sandbox_scenario']);
  });
});
