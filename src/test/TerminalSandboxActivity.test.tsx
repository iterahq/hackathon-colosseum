import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { TerminalSandboxActivity } from '@/components/branded/activity/TerminalSandboxActivity';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import type { Activity } from '@/types/content';
import { FAMILY_EMITTED, isActionOfFamily } from '@/utils/activityFamilies';
import type { RecordedAction } from '@/utils/learningTrace';

/**
 * The terminal sandbox, driven the way a learner drives it.
 *
 * The point of this file is NOT that the component renders. It is that the
 * VERDICT is the scenario's own criterion and the TRACE says what happened —
 * which is what a screenshot cannot show. Every assertion here is about the
 * value handed up through `onComplete(correct, { actions })`.
 */

/** Two ordered commands, so the ordering logic is exercised, not just presence. */
const TERMINAL_SPEC = {
  id: 'test-terminal',
  sandboxKind: 'terminal',
  openness: 'fixed',
  title: { pt: 'Salvando', en: 'Saving' },
  inputMode: 'freeText',
  initialState: {
    engine: 'git',
    ps1: 'aluno@itera:~/proj$',
    welcome: ['pronto.'],
    seed: {
      defaultBranch: 'main',
      seedFiles: { 'README.md': '# proj' },
      seedCommitMessage: 'primeiro commit',
    },
    unknownCommand: { lines: ['comando não suportado neste sandbox'], isError: true },
  },
  steps: [
    {
      id: 'criar-arquivo',
      prompt: { pt: 'Crie perfil.md.', en: 'Create perfil.md.' },
      unlock: { commandMatched: { cmd: 'touch perfil.md' } },
    },
    {
      id: 'salvar',
      prompt: { pt: 'Prepare e commite, nessa ordem.', en: 'Stage then commit.' },
      unlock: {
        commandSequence: {
          ordered: true,
          cmds: [
            { cmd: 'git add .', accept: ['git add -A'] },
            { cmd: 'git commit -m', argPattern: { '-m': '^.{3,}$' } },
          ],
        },
      },
    },
  ],
  success: { stepCompleted: { id: 'salvar' } },
  reveal: {
    recap: { pt: 'Boa! 🎉', en: 'Nice! 🎉' },
    masterLine: ['touch perfil.md', 'git add .', 'git commit -m "cria perfil"'],
  },
} as const;

/** The SAME judging, with the options surface. */
const OPTIONS_SPEC = {
  ...TERMINAL_SPEC,
  id: 'test-terminal-options',
  inputMode: 'options',
  steps: [
    {
      ...TERMINAL_SPEC.steps[0],
      expose: {
        optionGranularity: 'command',
        commands: ['touch perfil.md', 'touch README.md', 'rm perfil.md'],
      },
    },
    {
      ...TERMINAL_SPEC.steps[1],
      expose: {
        optionGranularity: 'token',
        tokens: ['git', 'add', 'commit', '.', '-m', '"cria perfil"', 'status'],
      },
    },
  ],
} as const;

function makeActivity(spec: unknown, id = 'a-terminal'): Activity {
  return {
    id,
    lessonId: 'l',
    ordinal: 0,
    kind: 'terminal_sandbox',
    spec: spec as Record<string, unknown>,
    rubric: null,
  };
}

function captor() {
  const calls: Array<{ correct: boolean; detail: ActivityCompleteDetail }> = [];
  const fn = vi.fn((correct: boolean, detail?: ActivityCompleteDetail) => {
    calls.push({ correct, detail: detail ?? {} });
  });
  return {
    fn,
    calls,
    actions: () => (calls[0]?.detail.actions ?? []) as readonly RecordedAction[],
  };
}

function mount(spec: unknown, onComplete: ReturnType<typeof captor>['fn'], id?: string) {
  return render(
    <I18nProvider>
      <TerminalSandboxActivity activity={makeActivity(spec, id)} onComplete={onComplete} />
    </I18nProvider>,
  );
}

function type(line: string) {
  const input = screen.getByTestId('terminal-input');
  fireEvent.change(input, { target: { value: line } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function transcript() {
  return screen.getByTestId('terminal-transcript').textContent ?? '';
}

describe('dispatch — sandboxKind picks the sandbox, inputMode picks the surface', () => {
  it('a terminal spec renders the terminal, not the chat', () => {
    mount(TERMINAL_SPEC, captor().fn);
    expect(screen.getByTestId('terminal-transcript')).toBeTruthy();
    expect(screen.queryByTestId('sandbox-input-preview')).toBeNull();
  });

  it('freeText gives a typable prompt; options does not', () => {
    const { unmount } = mount(TERMINAL_SPEC, captor().fn);
    expect(screen.getByTestId('terminal-input')).toBeTruthy();
    unmount();
    mount(OPTIONS_SPEC, captor().fn, 'a-options');
    expect(screen.queryByTestId('terminal-input')).toBeNull();
    expect(screen.getByTestId('terminal-draft')).toBeTruthy();
    expect(screen.getByTestId('terminal-options')).toBeTruthy();
  });
});

describe('a correct run — the verdict is the scenario s own criterion', () => {
  it('settles TRUE only after the ordered sequence completes', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);

    type('touch perfil.md');
    expect(cap.fn).not.toHaveBeenCalled();
    type('git add .');
    expect(cap.fn).not.toHaveBeenCalled();
    type('git commit -m "cria perfil"');

    expect(cap.fn).toHaveBeenCalledTimes(1);
    expect(cap.calls[0]!.correct).toBe(true);
    expect(cap.calls[0]!.detail.explanation).toContain('Boa!');
    expect(screen.getByTestId('sandbox-reveal')).toBeTruthy();
  });

  it('echoes what was typed and prints the engine output', () => {
    mount(TERMINAL_SPEC, captor().fn);
    type('touch perfil.md');
    expect(transcript()).toContain('touch perfil.md');
    expect(transcript()).toContain('criado: perfil.md');
  });

  it('advances the step counter as steps unlock', () => {
    mount(TERMINAL_SPEC, captor().fn);
    const instruction = () => screen.getByTestId('sandbox-instruction').textContent ?? '';
    expect(instruction()).toContain('1/2');
    type('touch perfil.md');
    expect(instruction()).toContain('2/2');
  });

  it('draws the progress track and flashes the step that was just cleared', () => {
    mount(TERMINAL_SPEC, captor().fn);
    const states = () =>
      Array.from(screen.getByTestId('sandbox-step-track').children).map((el) =>
        el.getAttribute('data-step-state'),
      );
    expect(states()).toEqual(['current', 'todo']);
    expect(screen.queryByTestId('sandbox-step-cleared')).toBeNull();

    type('touch perfil.md');

    expect(states()).toEqual(['done', 'current']);
    expect(screen.getByTestId('sandbox-step-cleared').textContent).toContain('1/2');
  });
});

/**
 * §2 of `20260807-itera-terminal-sandbox-refinamentos`. Where the mark goes is
 * unit-tested in `terminalSuccessMarks.test.ts`; what is asserted here is that
 * the component actually RENDERS it, on the right line and on no other.
 */
describe('the success mark — the acerto gets its own signal', () => {
  it('marks the output of the command that completed the step', () => {
    mount(TERMINAL_SPEC, captor().fn);
    type('touch perfil.md');

    const marks = screen.getAllByTestId('terminal-success-mark');
    expect(marks).toHaveLength(1);
    // On the OUTPUT line ("criado: perfil.md"), not on the echo and not loose
    // in the transcript.
    expect(marks[0]!.parentElement?.textContent).toContain('criado: perfil.md');
    expect(marks[0]!.parentElement?.getAttribute('data-line-kind')).toBe('out');
  });

  it('does NOT mark a command that failed', () => {
    mount(TERMINAL_SPEC, captor().fn);
    type('git commit -m "cedo demais"');
    expect(transcript()).toContain('nada em stage para commitar');
    expect(screen.queryAllByTestId('terminal-success-mark')).toHaveLength(0);
  });

  it('does NOT mark a command that ran fine but unlocked nothing', () => {
    mount(TERMINAL_SPEC, captor().fn);
    type('git log');
    expect(screen.queryAllByTestId('terminal-success-mark')).toHaveLength(0);
  });

  it('carries an accessible name — a bare ✓ reads as nothing', () => {
    mount(TERMINAL_SPEC, captor().fn);
    type('touch perfil.md');
    expect(screen.getByTestId('terminal-success-mark').getAttribute('aria-label')).toBeTruthy();
  });
});

describe('a WRONG run — "sempre tem certo e errado"', () => {
  it('runs the command, prints the error, and does NOT unlock', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);

    type('git commit -m "cedo demais"');

    expect(transcript()).toContain('nada em stage para commitar');
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('1/2');
    expect(cap.fn).not.toHaveBeenCalled();
  });

  it('a command nothing knows prints the authored unknown-command line', () => {
    mount(TERMINAL_SPEC, captor().fn);
    type('sudo rm -rf /');
    expect(transcript()).toContain('comando não suportado neste sandbox');
  });

  it('the RIGHT commands in the WRONG order do not unlock the ordered step', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);

    type('touch perfil.md');
    type('git commit -m "antes do add"');
    type('git add .');

    // Both commands ran, in the wrong order. The step stays locked — this is
    // the case a single-command scenario can never produce.
    expect(cap.fn).not.toHaveBeenCalled();
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('2/2');

    // …and recovering in the right order still passes. Practice, not an exam.
    type('git commit -m "cria perfil"');
    expect(cap.calls[0]!.correct).toBe(true);
  });
});

describe('the options surface judges identically', () => {
  it('one tap sends a whole command; tokens assemble a line', () => {
    const cap = captor();
    mount(OPTIONS_SPEC, cap.fn, 'a-options');

    // Step 1 — recognition. Distractors are present, and the wrong one runs.
    const palette = () => screen.getByTestId('terminal-options');
    expect(within(palette()).getAllByTestId('terminal-option-command')).toHaveLength(3);
    fireEvent.click(within(palette()).getByText('touch README.md'));
    expect(transcript()).toContain("'README.md' já existe");
    expect(cap.fn).not.toHaveBeenCalled();

    fireEvent.click(within(palette()).getByText('touch perfil.md'));
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('2/2');

    // Step 2 — production. Tokens append; Run sends.
    const tap = (token: string) =>
      fireEvent.click(within(screen.getByTestId('terminal-options')).getByText(token));
    tap('git');
    tap('add');
    tap('.');
    // The composed line lives in `data-draft`: on the token surface the visible
    // form is CHIPS, so `textContent` is the concatenation and not the line.
    expect(screen.getByTestId('terminal-draft').getAttribute('data-draft')).toBe('git add .');
    fireEvent.click(screen.getByTestId('terminal-run'));

    tap('git');
    tap('commit');
    tap('-m');
    tap('"cria perfil"');
    fireEvent.click(screen.getByTestId('terminal-run'));

    expect(cap.calls[0]!.correct).toBe(true);
  });

  /**
   * §5 REVERSED THIS. The palette used to be reusable — a token could be tapped
   * twice — on the reasoning that typing lets you repeat a word. Tainan asked
   * for a TRANSFER between two trays instead ("dois lados do mesmo conjunto"),
   * so a chip is in exactly one tray and the sum is invariant. A step that
   * genuinely needs `git` twice authors it twice; chips carry an index, so the
   * two entries are two independent chips.
   */
  it('a chip moves OUT of the palette when it moves INTO the prompt', () => {
    mount(OPTIONS_SPEC, captor().fn, 'a-options-2');
    fireEvent.click(screen.getByText('touch perfil.md'));

    const paletteChips = () => screen.getAllByTestId('terminal-option-token');
    const pills = () => screen.queryAllByTestId('terminal-pill');
    const total = paletteChips().length;

    fireEvent.click(within(screen.getByTestId('terminal-options')).getByText('git'));
    expect(paletteChips()).toHaveLength(total - 1);
    expect(pills()).toHaveLength(1);
    // …and it is gone from below, so it cannot be tapped again.
    expect(within(screen.getByTestId('terminal-options')).queryByText('git')).toBeNull();
  });
});

/**
 * §4 of `20260807-itera-terminal-sandbox-refinamentos`: what SENDS a turn is
 * different on each surface, and the affordance has to match.
 *
 *   free text          → type it, then Enter / Run
 *   whole-command chip → ONE TAP SENDS, and there is no Run button at all
 *   token chips        → build the line, then Run
 */
describe('submission differs by input mode', () => {
  const mode = () => screen.getByTestId('terminal-prompt-bar').getAttribute('data-submit-mode');
  const cmdLines = () => screen.getByTestId('terminal-transcript').querySelectorAll('[data-line-kind="cmd"]').length;

  it('free text: Enter sends, and the Run button is there', () => {
    mount(TERMINAL_SPEC, captor().fn);
    expect(mode()).toBe('enter');
    expect(screen.getByTestId('terminal-run')).toBeTruthy();
    expect(cmdLines()).toBe(0);
    type('touch perfil.md');
    expect(cmdLines()).toBe(1);
  });

  it('whole-command options: ONE TAP sends, and there is NO Run button', () => {
    mount(OPTIONS_SPEC, captor().fn, 'a-submit-tap');
    expect(mode()).toBe('tap');
    // The affordance is absent, not merely disabled: a control that never does
    // anything still promises a second step the learner then waits for.
    expect(screen.queryByTestId('terminal-run')).toBeNull();

    fireEvent.click(screen.getByText('touch perfil.md'));
    // ONE click, ONE command. No second action was needed or possible.
    expect(cmdLines()).toBe(1);
    expect(transcript()).toContain('touch perfil.md');
  });

  it('token options: tapping chips does NOT send; Run sends exactly once', () => {
    mount(OPTIONS_SPEC, captor().fn, 'a-submit-assemble');

    // Clear step 1 (tap surface) to reach the token step.
    fireEvent.click(screen.getByText('touch perfil.md'));
    expect(mode()).toBe('assemble');
    expect(screen.getByTestId('terminal-run')).toBeTruthy();

    const before = cmdLines();
    const tap = (token: string) =>
      fireEvent.click(within(screen.getByTestId('terminal-options')).getByText(token));
    tap('git');
    tap('add');
    tap('.');
    // Three taps, zero commands run. The line is only being COMPOSED.
    expect(cmdLines()).toBe(before);

    fireEvent.click(screen.getByTestId('terminal-run'));
    // Exactly one more — not one per chip, and not zero.
    expect(cmdLines()).toBe(before + 1);
    expect(transcript()).toContain('git add .');
  });

  it('the surface changes WITH the step — the ramp is per-step, not per-activity', () => {
    mount(OPTIONS_SPEC, captor().fn, 'a-submit-ramp');
    expect(mode()).toBe('tap');
    fireEvent.click(screen.getByText('touch perfil.md'));
    expect(mode()).toBe('assemble');
  });
});

/**
 * §5 — "montar comando" is a TRAY OF CHIPS with movement in BOTH directions,
 * not a text input. The palette and the prompt are two sides of one set, and
 * the interaction is transfer.
 *
 * The invariant every test here leans on: **palette + prompt = the authored
 * list, always.** It is what makes "the chip moved" checkable rather than
 * "something appeared somewhere".
 */
describe('chips move in both directions', () => {
  /** Reach the token step — step 1 of OPTIONS_SPEC is the whole-command one. */
  function atTokenStep(id: string) {
    mount(OPTIONS_SPEC, captor().fn, id);
    fireEvent.click(screen.getByText('touch perfil.md'));
  }

  const palette = () => screen.queryAllByTestId('terminal-option-token');
  const pills = () => screen.queryAllByTestId('terminal-pill');
  const line = () => screen.getByTestId('terminal-draft').getAttribute('data-draft');
  const tapPalette = (token: string) =>
    fireEvent.click(within(screen.getByTestId('terminal-options')).getByText(token));

  const AUTHORED = OPTIONS_SPEC.steps[1]!.expose!.tokens!.length;

  it('keeps the two sides summing to the authored list, move after move', () => {
    atTokenStep('a-chips-sum');
    expect(palette()).toHaveLength(AUTHORED);
    expect(pills()).toHaveLength(0);

    tapPalette('git');
    expect(palette().length + pills().length).toBe(AUTHORED);
    tapPalette('add');
    expect(palette().length + pills().length).toBe(AUTHORED);

    fireEvent.click(pills()[0]!);
    expect(palette().length + pills().length).toBe(AUTHORED);
    expect(pills()).toHaveLength(1);
  });

  it('clicking a pill sends it back DOWN to the palette', () => {
    atTokenStep('a-chips-back');
    tapPalette('git');
    expect(within(screen.getByTestId('terminal-options')).queryByText('git')).toBeNull();

    fireEvent.click(pills()[0]!);
    // Back in the tray, and out of the prompt.
    expect(within(screen.getByTestId('terminal-options')).getByText('git')).toBeTruthy();
    expect(pills()).toHaveLength(0);
    expect(line()).toBe('');
  });

  it('the composed line is the chips, in the order they were moved', () => {
    atTokenStep('a-chips-order');
    tapPalette('git');
    tapPalette('add');
    tapPalette('.');
    expect(line()).toBe('git add .');

    // Remove the middle one: the line closes up, it does not leave a hole.
    fireEvent.click(pills()[1]!);
    expect(line()).toBe('git .');
  });

  it('renders the composed line as pills, not as text', () => {
    atTokenStep('a-chips-pills');
    tapPalette('git');
    // Each chip is its own control — that is what makes the return trip
    // clickable at all — and it says what clicking it does.
    expect(pills()).toHaveLength(1);
    expect(pills()[0]!.getAttribute('aria-label')).toContain('git');
    expect(pills()[0]!.tagName).toBe('BUTTON');
  });

  it('empties the palette completely, and says so instead of vanishing', () => {
    atTokenStep('a-chips-empty');
    for (const token of OPTIONS_SPEC.steps[1]!.expose!.tokens!) tapPalette(token);
    expect(palette()).toHaveLength(0);
    expect(pills()).toHaveLength(AUTHORED);
    expect(screen.getByTestId('terminal-options-empty')).toBeTruthy();
  });

  it('Limpar sends every chip back at once', () => {
    atTokenStep('a-chips-clear');
    tapPalette('git');
    tapPalette('add');
    fireEvent.click(screen.getByTestId('terminal-clear'));
    expect(pills()).toHaveLength(0);
    expect(palette()).toHaveLength(AUTHORED);
  });

  it('running the line returns every chip to the palette', () => {
    atTokenStep('a-chips-run');
    tapPalette('git');
    tapPalette('add');
    tapPalette('.');
    fireEvent.click(screen.getByTestId('terminal-run'));
    expect(transcript()).toContain('git add .');
    expect(pills()).toHaveLength(0);
    expect(palette()).toHaveLength(AUTHORED);
  });
});

describe('restart — question Q4 → A', () => {
  it('recomeçar volta pro primeiro passo, não só o mundo', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);

    type('touch perfil.md');
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('2/2');

    fireEvent.click(screen.getByTestId('terminal-restart'));
    expect(transcript()).not.toContain('criado: perfil.md');
    // Até o 0.15.0 o progresso era monotônico e o aluno voltava para um mundo
    // zerado ainda no passo 2 — a instrução pedia algo que o mundo já não
    // sustentava. Desde o 1.0.0 o reset devolve os DOIS ao começo.
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('1/2');
    // E a trilha inteira é refeita para vencer de novo.
    type('touch perfil.md');
    type('git add .');
    type('git commit -m "depois do reset"');
    expect(cap.fn).toHaveBeenCalledTimes(1);
  });
});

describe('the trace — what the screenshot cannot show', () => {
  it('records every command in order, NORMALIZED, with its match verdict', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);

    type('  touch    perfil.md  ');
    type('git log');
    type('git add -A');
    type("git commit -m 'cria perfil'");

    const actions = cap.actions();
    expect(actions.map((a) => a.type)).toEqual([
      'command_run',
      'command_run',
      'command_run',
      'command_run',
    ]);

    const payloads = actions.map((a) => a.payload as Record<string, unknown>);
    // Whitespace collapsed; quotes canonicalized. This is the ONLY form that
    // leaves the browser (question Q3 → B).
    expect(payloads.map((p) => p.command)).toEqual([
      'touch perfil.md',
      'git log',
      'git add -A',
      'git commit -m "cria perfil"',
    ]);
    expect(payloads.map((p) => p.matched)).toEqual([true, false, false, true]);
    expect(payloads.map((p) => p.step_id)).toEqual([
      'criar-arquivo',
      'salvar',
      'salvar',
      'salvar',
    ]);
    expect(payloads.every((p) => p.source === 'typed')).toBe(true);
    // The unmatched attempts ARE the Q5 → C signal, and they survive.
    expect(payloads.filter((p) => p.matched === false)).toHaveLength(2);
  });

  it('never carries the RAW line — only the normalized one', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);
    type('touch    perfil.md');
    type('git add .');
    type('git commit -m "cria perfil"');
    const json = JSON.stringify(cap.actions());
    expect(json).toContain('touch perfil.md');
    expect(json).not.toContain('touch    perfil.md');
  });

  it('distinguishes WHICH input surface produced each command', () => {
    const cap = captor();
    mount(OPTIONS_SPEC, cap.fn, 'a-options-3');
    fireEvent.click(screen.getByText('touch perfil.md'));
    const tap = (token: string) =>
      fireEvent.click(within(screen.getByTestId('terminal-options')).getByText(token));
    tap('git');
    tap('add');
    tap('.');
    fireEvent.click(screen.getByTestId('terminal-run'));
    tap('git');
    tap('commit');
    tap('-m');
    tap('"cria perfil"');
    fireEvent.click(screen.getByTestId('terminal-run'));

    const payloads = cap.actions().map((a) => a.payload as Record<string, unknown>);
    expect(payloads.map((p) => p.source)).toEqual(['option', 'tokens', 'tokens']);
  });

  it('records a restart', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);
    type('touch perfil.md');
    fireEvent.click(screen.getByTestId('terminal-restart'));
    type('git add .');
    type('git commit -m "cria perfil"');
    const types = cap.actions().map((a) => a.type);
    expect(types).toContain('sandbox_reset');
    expect(types.indexOf('sandbox_reset')).toBe(1);
  });

  it('obeys the family contract the ledger declares', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);
    type('touch perfil.md');
    type('git add .');
    type('git commit -m "cria perfil"');

    const actions = cap.actions();
    expect(actions.length).toBeGreaterThan(0);
    const declared = FAMILY_EMITTED.scenario as readonly string[];
    for (const a of actions) {
      expect(isActionOfFamily('scenario', a.type)).toBe(true);
      expect(declared).toContain(a.type);
      // Wall clock, not an offset — `buildAttemptTrace` rebases later.
      expect(a.at).toBeGreaterThan(1_000_000_000_000);
    }
    const times = actions.map((a) => a.at);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });

  it('drains ONCE — a re-settle must not hand the same actions up twice', () => {
    const cap = captor();
    const { rerender } = render(
      <I18nProvider>
        <TerminalSandboxActivity activity={makeActivity(TERMINAL_SPEC)} onComplete={cap.fn} />
      </I18nProvider>,
    );
    type('touch perfil.md');
    type('git add .');
    type('git commit -m "cria perfil"');
    rerender(
      <I18nProvider>
        <TerminalSandboxActivity activity={makeActivity(TERMINAL_SPEC)} onComplete={cap.fn} />
      </I18nProvider>,
    );
    expect(cap.fn).toHaveBeenCalledTimes(1);
    expect(cap.actions().length).toBe(3);
  });
});

describe('the engineless terminal — ADR-4 is real, not aspirational', () => {
  const GENERIC_SPEC = {
    id: 'test-generic',
    sandboxKind: 'terminal',
    openness: 'fixed',
    title: { pt: 'Instalando', en: 'Installing' },
    inputMode: 'freeText',
    initialState: {
      engine: 'none',
      ps1: 'aluno@itera:~/app$',
      cannedOutput: { ls: { lines: ['package.json  src'] }, 'npm install': { lines: ['added 128 packages'] } },
      unknownCommand: { lines: ['comando não suportado neste sandbox'], isError: true },
    },
    steps: [
      { id: 'listar', prompt: { pt: 'Liste.', en: 'List.' }, unlock: { commandMatched: { cmd: 'ls' } } },
      {
        id: 'instalar',
        prompt: { pt: 'Instale.', en: 'Install.' },
        unlock: { commandMatched: { cmd: 'npm install', accept: ['npm i'] } },
      },
    ],
    success: { stepCompleted: { id: 'instalar' } },
    reveal: { recap: { pt: 'Feito.', en: 'Done.' }, masterLine: ['ls', 'npm install'] },
  } as const;

  it('teaches a non-version-control terminal with authored output only', () => {
    const cap = captor();
    mount(GENERIC_SPEC, cap.fn, 'a-generic');
    type('ls');
    expect(transcript()).toContain('package.json  src');
    type('npm i');
    expect(cap.calls[0]!.correct).toBe(true);
  });
});

/**
 * THE BOTTOM RAIL — the half of the 2026-08-10 layout that jsdom CAN adjudicate.
 *
 * Tainan's ask has two halves: a floor under the window, and the prompt pinned
 * to the bottom of it. The floor is geometry and only a browser can measure it
 * (`e2e/terminal-sandbox.spec.ts` §1). The pinning is STRUCTURE: it works only
 * while the transcript is the first child of the window body and the prompt bar
 * is the LAST. Reorder them, or slip anything between the prompt bar and the
 * end of the column, and the rail moves — in a browser that shows up as a
 * layout bug, here it shows up as a failing assertion in milliseconds.
 *
 * These are deliberately assertions about the TREE, not about class names. A
 * test that read `className` would pass for a component that carries the right
 * utilities in the wrong order, which is precisely the failure being guarded.
 */
describe('the terminal window is a column with the prompt as its last child', () => {
  const body = () => screen.getByTestId('sandbox-window-body');

  for (const [surface, spec, id] of [
    ['freeText', TERMINAL_SPEC, 'a-rail-free'],
    ['options', OPTIONS_SPEC, 'a-rail-options'],
  ] as const) {
    it(`${surface}: transcript first, prompt bar last, nothing after it`, () => {
      mount(spec, captor().fn, id);

      const children = Array.from(body().children);
      expect(children.length).toBe(2);
      expect(children[0]).toBe(screen.getByTestId('terminal-transcript'));
      expect(children[children.length - 1]).toBe(screen.getByTestId('terminal-prompt-bar'));
    });

    it(`${surface}: the option palette is OUTSIDE the window, not in the scroll area`, () => {
      mount(spec, captor().fn, `${id}-palette`);

      const controls = screen.getByTestId('terminal-controls');
      expect(body().contains(controls)).toBe(false);
      expect(screen.getByTestId('sandbox-window').contains(controls)).toBe(false);
    });
  }
});

/**
 * ── THE PROMPT PREFIX SHORTENS ON A PHONE, AND ONLY VISUALLY ────────────────
 *
 * Tainan, TG 2026-08-10, with a phone screenshot: *"no mobile não aparece o
 * input completo, talvez no mobile mostrar só $ para aparecer o restante do
 * input"*. `aluno@itera:~/proj$` is `shrink-0`, so on a 375px screen it took
 * the width from the learner's own line — his screenshot showed two characters
 * of it.
 *
 * WHICH form is painted is a media query, and jsdom has no layout, so THAT is
 * measured in `e2e/terminal-sandbox.spec.ts` §6 at 375px. What this file owns
 * is the half that needs no pixels and is the actual risk: that shortening the
 * DISPLAY never reaches the DATA. The authored `ps1` must still be on the
 * element, verbatim, at every width — a future refactor that "simplifies" this
 * by storing the sigil is the regression these assertions exist to catch.
 */
describe('the composer prefix has a short form, and the authored one survives it', () => {
  for (const [surface, spec, id] of [
    ['freeText', TERMINAL_SPEC, 'a-ps1-free'],
    ['options', OPTIONS_SPEC, 'a-ps1-options'],
  ] as const) {
    it(`${surface}: renders both the sigil and the authored prefix`, () => {
      mount(spec, captor().fn, id);

      // The authored value, untouched, on the element the composer owns.
      expect(screen.getByTestId('terminal-ps1').getAttribute('data-ps1')).toBe(
        'aluno@itera:~/proj$',
      );
      expect(screen.getByTestId('terminal-ps1-full').textContent).toBe('aluno@itera:~/proj$');
      // …and the one-glyph stand-in, read off the authored prompt's own sigil.
      expect(screen.getByTestId('terminal-ps1-short').textContent).toBe('$');
    });

    it(`${surface}: the short form is the one that hides above sm, and vice versa`, () => {
      mount(spec, captor().fn, `${id}-bp`);

      // Class names, deliberately: the breakpoint IS a class here, and there is
      // no other observable for it in an environment without layout. The
      // browser-side assertion that the phone actually sees `$` is §6 of the
      // e2e suite.
      expect(screen.getByTestId('terminal-ps1-short').className).toContain('sm:hidden');
      const full = screen.getByTestId('terminal-ps1-full').className;
      expect(full).toContain('hidden');
      expect(full).toContain('sm:inline');
    });
  }

  it('the transcript keeps echoing the FULL prefix — that is where the context lives', () => {
    mount(TERMINAL_SPEC, captor().fn, 'a-ps1-transcript');
    type('touch perfil.md');
    expect(transcript()).toContain('aluno@itera:~/proj$');
  });
});
