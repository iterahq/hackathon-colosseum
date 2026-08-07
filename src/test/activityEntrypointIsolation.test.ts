import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * ADR-5 as a blocking test rather than a promise in a doc.
 *
 * `@iterahq/activities` must not put the `code` kind — the transpiler, the
 * preview runtime, or any editor — in the bundle a consumer pays for when it
 * only renders `concept` and `single_choice`. Everything about that claim is
 * about the BUILT package resolved through the `exports` map, so the assertion
 * runs over `packages/activities/dist`, which `pretest` has just rebuilt.
 *
 * The walk itself lives in `scripts/assert-entrypoint-isolation.mjs` and is
 * spawned rather than imported, for one reason: the SAME script runs inside
 * `external-consumer/check.sh` against the unpacked tarball, in a project with
 * no TypeScript, no Vite and no vitest. One implementation, two subjects (the
 * workspace build here, the installed artifact there) — two copies of a guard
 * is how one of them rots.
 *
 * ⚠️ If this goes red, do not add an exception. The failure means an import
 * path now reaches the code tree from the base barrel, and the fix is to break
 * that path — the whole point of the separate entrypoint is that "nobody
 * happened to import it" was never the property being claimed.
 */
describe('@iterahq/activities entrypoint isolation (ADR-5)', () => {
  it('keeps the `code` kind unreachable from the base entrypoint', () => {
    const script = resolve(__dirname, '../../scripts/assert-entrypoint-isolation.mjs');
    const pkg = resolve(__dirname, '../../packages/activities');
    let output = '';
    expect(() => {
      output = execFileSync('node', [script, pkg], { encoding: 'utf8' });
    }).not.toThrow();
    expect(output).toContain('ENTRYPOINT ISOLATION OK');
  });
});
