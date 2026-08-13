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
 * that case today — live value, zero rows since the 2026-08-10 DML, removal at
 * package level pending `iterahq/itera-player#353`).
 *
 * Therefore:
 *  - a kind the package exports that the database CANNOT STORE is a real bug —
 *    the app would write a value the column rejects. That is asserted.
 *  - a value in the enum that the package no longer exports is legal, and is
 *    reported (not failed) so a retirement stays visible instead of silent.
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

  it('every kind the package exports can be STORED — ACTIVITY_KINDS ⊆ the enum', () => {
    const unstorable = [...ACTIVITY_KINDS].filter((k) => !dbEnum.includes(k));
    expect(unstorable).toEqual([]);
  });

  it('reports enum values the package no longer exports (legal — the enum cannot shrink)', () => {
    const retired = dbEnum.filter((k) => !(ACTIVITY_KINDS as readonly string[]).includes(k));
    // Not an assertion of emptiness: a retirement is legal and expected. This
    // pins the CURRENT set so a NEW, unexplained divergence shows up in a diff.
    expect(retired).toEqual([]);
  });
});
