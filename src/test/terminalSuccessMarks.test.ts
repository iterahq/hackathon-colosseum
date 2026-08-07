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
// coverage of the reset alignment invariant (`lines` truncates, `commands` does
// not), which is subtle enough that `TerminalSandboxActivity.test.tsx` says in
// as many words that it relies on this file for it.
//
// So the import is relative and loud. If it ever needs to be `@iterahq/activities`,
// that is a decision about the API, and it should look like one.
import { terminalSuccessMarks } from '../../packages/activities/src/internal/terminalSuccessMarks';

/**
 * The success mark, at the layer where it is decided (plan
 * `20260807-itera-terminal-sandbox-refinamentos` §2).
 *
 * These run against the REAL runtime and the REAL conformance fixture, not a
 * hand-made model: the whole difficulty of this function is an asymmetry in how
 * `resetSandbox` treats `lines` vs `commands`, and a hand-made model is exactly
 * where that asymmetry would be assumed away.
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
   * THE REGRESSION THIS FUNCTION EXISTS FOR. `resetSandbox` clears `lines` and
   * KEEPS `commands`, so any alignment counted from the START of the arrays
   * puts the ticks on the wrong lines forever after a restart.
   */
  it('stays aligned after a restart, which truncates lines but not commands', () => {
    let m = initialTerminalModel(t1);
    m = runCommand(t1, m, 'git checkout -b feat/perfil', 'pt');
    m = runCommand(t1, m, 'git log', 'pt');
    expect(m.commands).toHaveLength(2);

    m = resetSandbox(t1, m);
    expect(m.commands).toHaveLength(2); // kept — the judge's trajectory rail
    expect(m.lines.filter((l) => l.kind === 'cmd')).toHaveLength(0); // transcript cleared
    expect(terminalSuccessMarks(m).size).toBe(0);

    // A naive `commands[k]` alignment would now read `commands[0]` (which DID
    // unlock) for a command that did not, and tick it.
    m = runCommand(t1, m, 'git log', 'pt');
    expect(markedText(m)).toEqual([]);

    // Re-running an ALREADY EARNED step marks nothing either, and that is the
    // runtime's semantics rather than a gap here: progression is monotonic
    // (Q4 → A), so `criar-branch` cannot be unlocked twice. The learner is on
    // step 2 after a restart, and it is step 2 that gets the tick.
    m = runCommand(t1, m, 'git checkout -b feat/perfil', 'pt');
    expect(m.commands.at(-1)!.unlocked).toEqual([]);
    expect(markedText(m)).toEqual([]);

    m = runCommand(t1, m, 'git status', 'pt');
    expect(markedText(m)).toHaveLength(1);
  });
});
