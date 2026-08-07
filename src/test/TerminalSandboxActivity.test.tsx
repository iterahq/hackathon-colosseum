import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { SandboxScenarioActivity } from '@/components/branded/activity/SandboxScenarioActivity';
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
    kind: 'sandbox_scenario',
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
      <SandboxScenarioActivity activity={makeActivity(spec, id)} onComplete={onComplete} />
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
    expect(screen.getByTestId('terminal-draft').textContent).toBe('git add .');
    fireEvent.click(screen.getByTestId('terminal-run'));

    tap('git');
    tap('commit');
    tap('-m');
    tap('"cria perfil"');
    fireEvent.click(screen.getByTestId('terminal-run'));

    expect(cap.calls[0]!.correct).toBe(true);
  });

  it('a token palette is not consumed — the same token can be tapped twice', () => {
    mount(OPTIONS_SPEC, captor().fn, 'a-options-2');
    fireEvent.click(screen.getByText('touch perfil.md'));
    const tap = (token: string) =>
      fireEvent.click(within(screen.getByTestId('terminal-options')).getByText(token));
    tap('git');
    tap('git');
    expect(screen.getByTestId('terminal-draft').textContent).toBe('git git');
  });
});

describe('restart — question Q4 → A', () => {
  it('clears the world and the transcript but keeps what was already earned', () => {
    const cap = captor();
    mount(TERMINAL_SPEC, cap.fn);

    type('touch perfil.md');
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('2/2');

    fireEvent.click(screen.getByTestId('terminal-restart'));
    expect(transcript()).not.toContain('criado: perfil.md');
    // Progression is monotonic — the step stays earned…
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('2/2');
    // …but the WORLD really is fresh, so the file is gone and committing the
    // staged-nothing fails again.
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
        <SandboxScenarioActivity activity={makeActivity(TERMINAL_SPEC)} onComplete={cap.fn} />
      </I18nProvider>,
    );
    type('touch perfil.md');
    type('git add .');
    type('git commit -m "cria perfil"');
    rerender(
      <I18nProvider>
        <SandboxScenarioActivity activity={makeActivity(TERMINAL_SPEC)} onComplete={cap.fn} />
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
