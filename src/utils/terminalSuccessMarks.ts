import type { TerminalModel } from '@iterahq/activity-spec/runtime';

/**
 * WHICH transcript lines carry the success mark (plan
 * `20260807-itera-terminal-sandbox-refinamentos` §2).
 *
 * Until now the terminal signalled only FAILURE: a wrong command printed in red
 * and a right one printed in the ordinary colour, so "I did it" had to be
 * inferred from the absence of red. That is a weak signal — it never confirms
 * the learner did the right thing *in the expected order*, which is the whole
 * question a stepped scenario asks.
 *
 * ── WHAT EARNS A MARK ───────────────────────────────────────────────────────
 * `unlocked.length > 0`, i.e. the command COMPLETED A STEP — not `ok`. A
 * command can succeed at the shell and advance nothing (`git log` in a scenario
 * about branching): it deserves its output, not a tick. Tying the mark to
 * `unlocked` is what makes it mean "that was the move", which is what §2 asks
 * for. The judgement itself is still the package's — this file only decides
 * where to draw the tick.
 *
 * ── WHY IT IS DERIVED AND NOT REMEMBERED ────────────────────────────────────
 * Nothing here is stored: the marks are a pure function of the model, so
 * restart, re-render and reveal cannot desynchronise them from what the
 * transcript actually shows. That matters because of one asymmetry in the
 * runtime that a stored set would get wrong:
 *
 *   **`resetSandbox` truncates `lines` but KEEPS `commands`.** After a restart
 *   the transcript is back to the welcome banner while `model.commands` still
 *   holds every command ever run (it is the judge's trajectory rail — Q5 → C
 *   keeps the misses). So the k-th `cmd` line in the transcript is NOT
 *   `commands[k]`; it is `commands[commands.length - cmdLines + k]`. Aligning
 *   from the END is the only alignment that survives a reset, and it is why
 *   this is a function over both arrays rather than a counter.
 */
export function terminalSuccessMarks(model: TerminalModel): ReadonlySet<number> {
  const cmdLineIdx: number[] = [];
  model.lines.forEach((line, i) => {
    if (line.kind === 'cmd') cmdLineIdx.push(i);
  });

  const marks = new Set<number>();
  // The transcript shows the TAIL of `commands` (see the reset note above).
  const offset = model.commands.length - cmdLineIdx.length;
  if (offset < 0) return marks; // defensive: never invent an alignment

  cmdLineIdx.forEach((start, k) => {
    const ran = model.commands[offset + k];
    if (!ran || ran.unlocked.length === 0) return;
    // The mark goes at the END of the command's output block — the last thing
    // the learner reads about that command. A block with no output at all is
    // just the echo, and then the echo carries it.
    const nextStart = cmdLineIdx[k + 1] ?? model.lines.length;
    marks.add(Math.max(start, nextStart - 1));
  });

  return marks;
}
