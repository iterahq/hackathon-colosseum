import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, type Locale } from '@/i18n';
import { SandboxScenarioActivity } from '@/components/branded/activity/SandboxScenarioActivity';
import type { Activity } from '@/types/content';

/**
 * THE SAME ACTIVITY, RENDERED IN BOTH LANGUAGES (plan
 * `20260807-itera-terminal-sandbox-refinamentos` §3).
 *
 * The plan is explicit that a test which only confirms a key exists in the
 * dictionary is empty verification. So nothing here reads the dictionary: every
 * assertion is about TEXT THAT REACHED THE DOM, and every one compares the two
 * locales against each other rather than against an expected constant — a
 * hard-coded expectation is just the dictionary again, spelled differently.
 *
 * `e2e/terminal-sandbox.spec.ts` §3 repeats this in a real browser over the
 * built bundle. Both exist because they fail for different reasons: this one is
 * fast and runs on every commit; the browser one proves it survives the build.
 */

/**
 * NO authored `ps1`, `welcome`, `cannedOutput` or `unknownCommand`. Everything
 * this spec renders is therefore chrome the PLAYER owns plus engine output the
 * PACKAGE owns — the two layers that can be localized today. The authored
 * strings are covered by their own test at the bottom, which documents exactly
 * what is still monolingual and why.
 */
const SPEC = {
  id: 'locale-terminal',
  sandboxKind: 'terminal',
  openness: 'fixed',
  title: { pt: 'Salvando', en: 'Saving' },
  inputMode: 'freeText',
  initialState: {
    engine: 'git',
    seed: {
      defaultBranch: 'main',
      seedFiles: { 'README.md': '# proj' },
      seedCommitMessage: 'primeiro commit',
    },
  },
  steps: [
    {
      id: 'criar-arquivo',
      prompt: { pt: 'Crie perfil.md.', en: 'Create perfil.md.' },
      hint: { pt: 'use touch', en: 'use touch' },
      unlock: { commandMatched: { cmd: 'touch perfil.md' } },
    },
    {
      id: 'salvar',
      prompt: { pt: 'Prepare o arquivo.', en: 'Stage the file.' },
      unlock: { commandMatched: { cmd: 'git add .' } },
    },
  ],
  success: { stepCompleted: { id: 'salvar' } },
  reveal: { recap: { pt: 'Boa!', en: 'Nice!' } },
} as const;

const OPTIONS_SPEC = {
  ...SPEC,
  id: 'locale-terminal-options',
  inputMode: 'options',
  steps: [
    { ...SPEC.steps[0], expose: { optionGranularity: 'command', commands: ['touch perfil.md'] } },
    { ...SPEC.steps[1], expose: { optionGranularity: 'token', tokens: ['git', 'add', '.'] } },
  ],
} as const;

function makeActivity(spec: unknown, id = 'a'): Activity {
  return { id, lessonId: 'l', ordinal: 0, kind: 'sandbox_scenario', spec: spec as Record<string, unknown>, rubric: null };
}

/** Mount at a locale. `I18nProvider` reads the persisted choice on first render. */
function mountAt(locale: Locale, spec: unknown = SPEC) {
  localStorage.setItem('itera.locale', locale);
  return render(
    <I18nProvider>
      <SandboxScenarioActivity activity={makeActivity(spec, `a-${locale}`)} onComplete={vi.fn()} />
    </I18nProvider>,
  );
}

/** Render at a locale, read something out of the DOM, unmount. */
function renderedAt<T>(locale: Locale, read: () => T, spec: unknown = SPEC): T {
  const { unmount } = mountAt(locale, spec);
  const value = read();
  unmount();
  return value;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Every visible surface of the chrome, in one shot. */
function chromeSnapshot(): Record<string, string> {
  return {
    step: screen.getByTestId('sandbox-instruction').textContent ?? '',
    prompt: (screen.getByTestId('terminal-input') as HTMLInputElement).placeholder,
    hint: screen.getByTestId('sandbox-hint-toggle').textContent ?? '',
    run: screen.getByTestId('terminal-run').getAttribute('aria-label') ?? '',
    restart: screen.getByTestId('terminal-restart').textContent ?? '',
    ps1: screen.getByTestId('terminal-transcript').textContent ?? '',
  };
}

describe('the terminal, rendered in pt and in en', () => {
  it('changes every piece of chrome', () => {
    const pt = renderedAt('pt', chromeSnapshot);
    const en = renderedAt('en', chromeSnapshot);

    for (const key of Object.keys(pt)) {
      expect(en[key], `"${key}" did not change between locales`).not.toBe(pt[key]);
      expect(en[key]).toBeTruthy();
    }
  });

  it('changes the step label, and it is the label — not just any text', () => {
    expect(renderedAt('pt', () => screen.getByTestId('sandbox-instruction').textContent)).toContain(
      'Passo 1/2',
    );
    expect(renderedAt('en', () => screen.getByTestId('sandbox-instruction').textContent)).toContain(
      'Step 1/2',
    );
  });

  /**
   * The PROMPT PREFIX, named in §3. An authored `ps1` still cannot be
   * localized (see the bottom of this file); what the player CAN do — and now
   * does — is own a bilingual default for a scenario that authors none.
   */
  it('changes the prompt prefix when the scenario leaves it to the player', () => {
    const ps1 = (locale: Locale) =>
      renderedAt(locale, () => {
        const input = screen.getByTestId('terminal-input');
        fireEvent.change(input, { target: { value: 'touch perfil.md' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        return screen.getByTestId('terminal-transcript').textContent ?? '';
      });
    expect(ps1('pt')).toContain('aluno@itera');
    expect(ps1('en')).toContain('student@itera');
  });

  it('changes the options-mode chrome too', () => {
    const read = () => ({
      draft: screen.getByTestId('terminal-draft').textContent ?? '',
      palette: screen.getByTestId('terminal-options').textContent ?? '',
    });
    const pt = renderedAt('pt', read, OPTIONS_SPEC);
    const en = renderedAt('en', read, OPTIONS_SPEC);
    expect(en.draft).not.toBe(pt.draft);
    expect(en.palette).not.toBe(pt.palette);
  });

  /**
   * ENGINE OUTPUT — one success line and one error line, as §3 asks. This is
   * the package's `ResponseTable` doing its job, and asserting it here is what
   * proves the player passes the active locale DOWN into the runtime instead of
   * quietly defaulting.
   */
  it('changes the sandbox own output — success and error alike', () => {
    const run = (locale: Locale, line: string) =>
      renderedAt(locale, () => {
        const input = screen.getByTestId('terminal-input');
        fireEvent.change(input, { target: { value: line } });
        fireEvent.keyDown(input, { key: 'Enter' });
        return screen.getByTestId('terminal-transcript').textContent ?? '';
      });

    // Success: `touch` prints the created file.
    expect(run('pt', 'touch perfil.md')).toContain('criado:');
    expect(run('en', 'touch perfil.md')).toContain('created:');

    // Error: committing with nothing staged.
    expect(run('pt', 'git commit -m "cedo"')).toContain('nada em stage');
    expect(run('en', 'git commit -m "too soon"')).toContain('nothing staged');
  });

  it('leaves no Portuguese in the English chrome', () => {
    const en = renderedAt('en', () => [
      screen.getByTestId('sandbox-instruction').textContent ?? '',
      (screen.getByTestId('terminal-input') as HTMLInputElement).placeholder,
      screen.getByTestId('sandbox-hint-toggle').textContent ?? '',
      screen.getByTestId('terminal-restart').textContent ?? '',
      screen.getByTestId('terminal-run').getAttribute('aria-label') ?? '',
    ]);
    // Words that only exist in the pt chrome. Scoped to the chrome on purpose:
    // AUTHORED content is the author's to translate, and the acknowledged-gap
    // test below says which parts of it they still cannot.
    for (const word of ['Passo', 'dica', 'Recomeçar', 'Rodar', 'digite', 'escolha']) {
      expect(en.join(' | '), `"${word}" leaked into the en chrome`).not.toContain(word);
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE ACKNOWLEDGED GAP — read this before "fixing" it here
 * ══════════════════════════════════════════════════════════════════════════
 * `initialState.ps1`, `windowTitle`, `welcome`, `cannedOutput[*].lines` and
 * `unknownCommand.lines` are `z.string()` in `@iterahq/activity-spec`, and the
 * spec is Zod-validated at the render boundary — so an author who writes
 * `{ pt, en }` there gets the invalid-spec card, not a translation. Whatever
 * language they typed is the language every learner sees.
 *
 * This test PINS that limitation instead of leaving it unstated. It is expected
 * to FAIL the day the package widens those fields to accept `I18n`, and that
 * failure is the reminder to delete it and localize the fixtures. The player
 * side is already tolerant: `TerminalSandboxShell` resolves `ps1` and
 * `windowTitle` through `t()`, which accepts `I18n | string`.
 */
describe('acknowledged gap: authored spec strings are NOT localizable', () => {
  const AUTHORED = {
    ...SPEC,
    id: 'authored-strings',
    initialState: { ...SPEC.initialState, ps1: 'aluno@itera:~/proj$', welcome: ['pronto.'] },
  } as const;

  it('renders the authored ps1 and welcome verbatim in BOTH locales', () => {
    const read = () => screen.getByTestId('terminal-transcript').textContent ?? '';
    expect(renderedAt('pt', read, AUTHORED)).toContain('pronto.');
    expect(renderedAt('en', read, AUTHORED)).toContain('pronto.');
  });
});
