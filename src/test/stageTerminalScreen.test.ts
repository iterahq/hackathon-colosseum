import { describe, expect, it } from 'vitest';
import {
  STAGE_TERMINAL_MAX_LINES,
  clampStageTerminal,
  parseStageTerminal,
} from '@/utils/stageTerminalScreen';
import type { StageTerminalScreen } from '@/types/liveClass';

/**
 * The wire half of the terminal mirror. Pure, so it is tested pure.
 *
 * The assertion that earns its keep is the ✓ REBASE. Everything else here is
 * ordinary clamping; a success mark whose index was not moved with the window
 * lands on a DIFFERENT line after the cut, and a ✓ on the wrong line is worse
 * than no ✓ at all — it tells the room that a command which completed nothing
 * completed a step.
 */

function screen(over: Partial<StageTerminalScreen> = {}): StageTerminalScreen {
  return {
    lines: [
      { kind: 'cmd', text: 'git status' },
      { kind: 'out', text: 'nothing to commit' },
    ],
    ps1: 'aluno@itera:~$',
    windowTitle: 'bash — sandbox',
    successLines: [1],
    stepIdx: 0,
    stepCount: 3,
    stepPrompt: 'Veja o estado do repositório.',
    won: false,
    commandCount: 1,
    ...over,
  };
}

describe('clampStageTerminal', () => {
  it('passes a short session through unchanged', () => {
    const s = screen();
    expect(clampStageTerminal(s)).toEqual(s);
  });

  it('keeps the END of a long transcript — the last commands are what the room reads', () => {
    const lines = Array.from({ length: STAGE_TERMINAL_MAX_LINES + 20 }, (_, i) => ({
      kind: 'out' as const,
      text: `line ${i}`,
    }));
    const out = clampStageTerminal(screen({ lines, successLines: [] }));
    expect(out.lines).toHaveLength(STAGE_TERMINAL_MAX_LINES);
    expect(out.lines[out.lines.length - 1]!.text).toBe(`line ${lines.length - 1}`);
    expect(out.lines[0]!.text).toBe('line 20');
  });

  it('REBASES the success marks onto the cut window', () => {
    const lines = Array.from({ length: STAGE_TERMINAL_MAX_LINES + 20 }, (_, i) => ({
      kind: 'out' as const,
      text: `line ${i}`,
    }));
    // Two marks: one inside the surviving window, one that fell off the front.
    const markedInside = lines.length - 5;
    const out = clampStageTerminal(screen({ lines, successLines: [3, markedInside] }));
    expect(out.successLines).toEqual([markedInside - 20]);
    // The mark now points at the line it pointed at before the cut.
    expect(out.lines[out.successLines[0]!]!.text).toBe(`line ${markedInside}`);
  });

  it('caps a single runaway line instead of dropping it', () => {
    const out = clampStageTerminal(
      screen({ lines: [{ kind: 'out', text: 'x'.repeat(5000) }], successLines: [] }),
    );
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]!.text.length).toBeLessThan(500);
    expect(out.lines[0]!.text.endsWith('…')).toBe(true);
  });
});

describe('parseStageTerminal — the reading edge', () => {
  it('round-trips a clamped screen', () => {
    const s = clampStageTerminal(screen());
    expect(parseStageTerminal(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('refuses anything that is not a transcript', () => {
    expect(parseStageTerminal(undefined)).toBeUndefined();
    expect(parseStageTerminal('git status')).toBeUndefined();
    expect(parseStageTerminal({})).toBeUndefined();
    expect(parseStageTerminal({ lines: 'nope' })).toBeUndefined();
  });

  it('drops malformed lines rather than rendering them', () => {
    const out = parseStageTerminal({
      lines: [{ kind: 'cmd', text: 'ls' }, { kind: 'cmd' }, null, 42, { text: 'bare' }],
      ps1: '$',
      successLines: [],
    });
    expect(out!.lines).toEqual([
      { kind: 'cmd', text: 'ls' },
      // An unknown/absent kind reads as output — the neutral colour, never `cmd`,
      // which would draw a prompt in front of a line nobody typed.
      { kind: 'out', text: 'bare' },
    ]);
  });

  it('does not trust a sender to respect the caps', () => {
    const out = parseStageTerminal({
      lines: Array.from({ length: 400 }, (_, i) => ({ kind: 'out', text: `l${i}` })),
      ps1: '$',
      successLines: [399],
      stepIdx: 2,
      stepCount: 3,
      won: true,
      commandCount: 9,
    });
    expect(out!.lines).toHaveLength(STAGE_TERMINAL_MAX_LINES);
    expect(out!.won).toBe(true);
    expect(out!.commandCount).toBe(9);
    // The mark survived the second clamp, still pointing at the last line.
    expect(out!.successLines).toEqual([STAGE_TERMINAL_MAX_LINES - 1]);
  });
});
