import { describe, expect, it } from 'vitest';
import {
  initialTerminalModel,
  resetSandbox,
  runCommand,
  type TerminalScenario,
} from '@iterahq/activity-spec/runtime';
import scenarios from '@/test/fixtures/terminal-scenarios.json';
// ⚠️ A DELIBERATE DEEP IMPORT INTO THE PACKAGE SOURCE, not through the barrel.
//
// `terminalSuccessMarks` moved into `@iterahq/activities` with the terminal
// sandbox (Fase C step 4) and stayed INTERNAL: it is how the transcript decides
// where to draw a tick, not a promise to consumers, and putting it in the
// public barrel to satisfy a test would grow the API for the test's
// convenience. The alternative — deleting these cases — would drop the only
// coverage of the reset invariant, which is subtle enough that
// `TerminalSandboxActivity.test.tsx` says in as many words that it relies on
// this file for it.
//
// So the import is relative and loud. If it ever needs to be `@iterahq/activities`,
// that is a decision about the API, and it should look like one.
import { terminalSuccessMarks } from '../../packages/activities/src/internal/terminalSuccessMarks';

/**
 * The success mark, at the layer where it is decided (plan
 * `20260807-itera-terminal-sandbox-refinamentos` §2).
 *
 * These run against the REAL runtime and the REAL conformance fixture, not a
 * hand-made model: the whole difficulty of this function is how `resetSandbox`
 * relates `lines` to `commands`, and a hand-made model is exactly where that
 * relation would be assumed away.
 */
const t1 = (scenarios as unknown as Record<string, unknown>).t1 as TerminalScenario;

/** The text of the marked lines — what the learner actually sees ticked. */
function markedText(model: ReturnType<typeof initialTerminalModel>): string[] {
  const marks = terminalSuccessMarks(model);
  return model.lines.filter((_, i) => marks.has(i)).map((l) => l.text);
}

describe('terminalSuccessMarks', () => {
  it('marks nothing before anything has been run', () => {
    expect(terminalSuccessMarks(initialTerminalModel(t1)).size).toBe(0);
  });

  it('marks the output of a command that COMPLETED A STEP', () => {
    const m = runCommand(t1, initialTerminalModel(t1), 'git checkout -b feat/perfil', 'pt');
    expect(markedText(m)).toEqual(["Mudou para o novo ramo 'feat/perfil'"]);
  });

  it('marks NOTHING for a command that errored', () => {
    const m = runCommand(t1, initialTerminalModel(t1), 'git commit -m "cedo demais"', 'pt');
    // The error line is there…
    expect(m.lines.some((l) => l.kind === 'err')).toBe(true);
    // …and it is not ticked. Both halves matter: an assertion that only checked
    // the happy path would pass for a component that ticks every line.
    expect(markedText(m)).toEqual([]);
  });

  it('marks NOTHING for a command that succeeded but unlocked no step', () => {
    // `git log` runs fine in this scenario and advances nothing. `ok` would tick
    // it; `unlocked` does not — that distinction IS the feature.
    const m = runCommand(t1, initialTerminalModel(t1), 'git log', 'pt');
    expect(m.commands.at(-1)!.unlocked).toEqual([]);
    expect(markedText(m)).toEqual([]);
  });

  it('marks each unlocking command, and only those', () => {
    let m = initialTerminalModel(t1);
    m = runCommand(t1, m, 'git checkout -b feat/perfil', 'pt'); // unlocks
    m = runCommand(t1, m, 'git log', 'pt'); // does not
    m = runCommand(t1, m, 'git status', 'pt'); // unlocks
    expect(markedText(m)).toHaveLength(2);
    expect(markedText(m)[0]).toContain('feat/perfil');
  });

  /**
   * THE REGRESSION THIS FUNCTION EXISTS FOR — e a semântica de "recomeçar"
   * MUDOU no `@iterahq/activity-spec` 1.0.0. Até o 0.15.0 o reset limpava
   * `lines` e MANTINHA `commands` + `completedSteps`, então o aluno voltava a um
   * mundo zerado ainda marcado como estando no passo 2, e qualquer alinhamento
   * contado do INÍCIO dos arrays punha o tick na linha errada para sempre.
   * Agora ele volta ao modelo inicial inteiro (só `resets` sobrevive, como
   * contador), e é isso que este caso trava: transcrição, comandos e progresso
   * voltam juntos.
   */
  it('recomeçar volta ao primeiro passo — comandos, transcrição e progresso zeram juntos', () => {
    let m = initialTerminalModel(t1);
    m = runCommand(t1, m, 'git checkout -b feat/perfil', 'pt');
    m = runCommand(t1, m, 'git log', 'pt');
    expect(m.commands).toHaveLength(2);
    expect(markedText(m)).toHaveLength(1);

    m = resetSandbox(t1, m);
    expect(m.commands).toHaveLength(0);
    expect(m.lines.filter((l) => l.kind === 'cmd')).toHaveLength(0);
    expect(m.completedSteps.size).toBe(0);
    expect(m.resets).toBe(1);
    expect(terminalSuccessMarks(m).size).toBe(0);

    // O comando que não conquista nada segue sem tick depois do reset.
    m = runCommand(t1, m, 'git log', 'pt');
    expect(markedText(m)).toEqual([]);

    // E o PRIMEIRO passo volta a ser conquistável — antes do 1.0.0 ele seguia
    // marcado como feito e este mesmo comando não tickava nada.
    m = runCommand(t1, m, 'git checkout -b feat/perfil', 'pt');
    expect(m.commands.at(-1)!.unlocked).toHaveLength(1);
    expect(markedText(m)).toEqual(["Mudou para o novo ramo 'feat/perfil'"]);
  });
});
