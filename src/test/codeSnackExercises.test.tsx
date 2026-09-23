import { afterEach, describe, expect, it } from 'vitest';
import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { personalizeSpec } from '@/utils/personalization';
import { CODE_SNACK_EXERCISES, type CodeExerciseFixture } from './fixtures/codeSnackExercises';
import { gradeSource, renderSnack, resetCodeSnackSandbox } from './support/codeSnackHarness';

/**
 * O elenco VAZIO de propósito: `personalizeSpec` cai no fallback de cada campo,
 * que é o aluno que pulou o formulário. É a única variante em que o exercício
 * PRECISA fechar — quem preencheu só troca o nome dentro da mesma estrutura.
 *
 * Sem esta passagem os fixtures com token julgariam a si mesmos: um check
 * `contains: "{{amigo.nome}}"` casa com o token literal que o starter não
 * preenchido ainda imprime, e o starter passaria por não ter sido resolvido.
 */
const EXERCISES: CodeExerciseFixture[] = CODE_SNACK_EXERCISES.map((e) => personalizeSpec(e, {}));

/**
 * The authored exercises, driven through the REAL pipeline the learner hits:
 * schema parse → sucrase transpile (`imports` transform) → evaluate with the
 * iframe's `require`/`alert` shims → render with React 18 → run the checks
 * against the resulting DOM.
 *
 * Two properties are asserted per exercise, and they are the ones that actually
 * matter pedagogically:
 *   • the STARTER must FAIL — otherwise there is no exercise, just a screen;
 *   • the SOLUTION must PASS EVERY check — otherwise the class hits a trap that
 *     cannot be solved.
 *
 * This is also what proves the `import { useState } from "react"` starters work
 * at all: without the `require` shim they die with "require is not defined".
 */

afterEach(resetCodeSnackSandbox);

describe.each(EXERCISES)('exercício $slug', (exercise) => {
  const checks = exercise.spec.checks ?? [];

  it('has a spec the shared schema accepts, checks included', () => {
    const parsed = safeParseActivitySpec('code', exercise.spec);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // The schema is `strip` — this is what catches a field the schema forgot.
    expect(parsed.data.checks).toEqual(exercise.spec.checks);
    expect(checks.length).toBeGreaterThan(0);
  });

  it('every check has a learner-readable label and a hint', () => {
    for (const c of checks) {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.hint, `check ${c.id} sem hint`).toBeTruthy();
    }
    expect(new Set(checks.map((c) => c.id)).size).toBe(checks.length);
  });

  it('the starter already renders something (never a blank screen)', async () => {
    const { preview, mount } = await renderSnack(exercise.spec.starter as string);
    expect(mount.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(preview.querySelectorAll('*').length).toBeGreaterThan(2);
  });

  it('the STARTER fails at least one check (otherwise it is not an exercise)', async () => {
    const results = await gradeSource(exercise.spec.starter as string, checks);
    expect(results).toHaveLength(checks.length);
    expect(results.some((r) => !r.passed)).toBe(true);
  });

  it('the expected SOLUTION passes every check', async () => {
    const results = await gradeSource(exercise.solution, checks);
    const failed = results.filter((r) => !r.passed).map((r) => r.id);
    expect(failed, `checks que não passaram: ${failed.join(', ')}`).toEqual([]);
  });
});
