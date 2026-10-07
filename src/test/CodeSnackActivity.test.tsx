import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Activity } from '@/types/content';
import {
  CodeActivityHost,
  codeEditorEl,
  previewIframe,
  typeCode,
} from './support/codeActivityHost';

/**
 * The persistence layer is stubbed so these tests stay about the snack's
 * lifecycle. `readCodeSnapshot` answers "nothing saved" by default, which is the
 * first-open case; the restore behaviour itself is covered against REAL
 * localStorage in `CodeSnackRestore.test.tsx`.
 *
 * ⚠️ It is still `@/services/codeSnapshot.service` that is mocked, even though
 * the hook doing the saving now lives inside `@iterahq/activities/code`. That is
 * the storage PORT working as designed: the package writes through
 * `ActivityStoragePort`, `ITERA_ACTIVITY_STORAGE` (in `IteraActivityHost`) is
 * the adapter that turns those calls into `codeSnapshot.service` calls, and the
 * adapter is app code — so mocking the service still observes exactly the write
 * that reaches disk. Assertions like `toHaveBeenCalledWith('t-code', …)` are
 * therefore also a live check that the key survived the extraction.
 */
const saveCodeSnapshot = vi.fn();
const clearCodeSnapshot = vi.fn();
const readCodeSnapshot = vi.fn((_id: string) => null as { code: string } | null);
vi.mock('@/services/codeSnapshot.service', () => ({
  saveCodeSnapshot: (...args: unknown[]) => saveCodeSnapshot(...args),
  clearCodeSnapshot: (...args: unknown[]) => clearCodeSnapshot(...args),
  readCodeSnapshot: (id: string) => readCodeSnapshot(id),
}));

import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';

function makeActivity(spec: Record<string, unknown>): Activity {
  return { id: 't-code', lessonId: 'l', ordinal: 0, kind: 'code', spec, rubric: null };
}

function renderSnack(spec: Record<string, unknown>, onComplete = vi.fn()) {
  render(
    <CodeActivityHost>
      <CodeSnackActivity activity={makeActivity(spec)} onComplete={onComplete} />
    </CodeActivityHost>,
  );
  return onComplete;
}

describe('CodeSnackActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveCodeSnapshot.mockClear();
    clearCodeSnapshot.mockClear();
    readCodeSnapshot.mockClear();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('seeds the editor from spec.starter', () => {
    renderSnack({ prompt: 'Build it', starter: 'export default () => null' });
    expect((screen.getByTestId('mock-editor') as HTMLTextAreaElement).value).toBe(
      'export default () => null',
    );
  });

  it('autosaves a debounced snapshot after typing', () => {
    renderSnack({ prompt: 'Build it', starter: '' });
    saveCodeSnapshot.mockClear();

    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: 'const a = 1' } });
    });
    // Before the debounce window elapses, no save.
    expect(saveCodeSnapshot).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveCodeSnapshot).toHaveBeenCalledWith('t-code', 'const a = 1');
  });

  it('saves the keystrokes still inside the debounce when the page goes away', () => {
    renderSnack({ prompt: 'Build it', starter: '' });
    saveCodeSnapshot.mockClear();
    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: 'const a = 1' } });
    });
    // A reload 100 ms after the last key: the timer would die with the page.
    act(() => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveCodeSnapshot).toHaveBeenCalledWith('t-code', 'const a = 1');
    // …and the timer, had the page lived, does not write it a second time.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveCodeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('saves the pending keystrokes when the tab drops to the background, and only then', () => {
    renderSnack({ prompt: 'Build it', starter: '' });
    saveCodeSnapshot.mockClear();
    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: 'const a = 1' } });
    });
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(saveCodeSnapshot).not.toHaveBeenCalled();
    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(saveCodeSnapshot).toHaveBeenCalledWith('t-code', 'const a = 1');
    visibility.mockRestore();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveCodeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('writes nothing on page hide for a learner who only opened the exercise', () => {
    renderSnack({ prompt: 'Build it', starter: 'export default () => null' });
    saveCodeSnapshot.mockClear();
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveCodeSnapshot).not.toHaveBeenCalled();
  });

  it('renders an invalid card when the spec fails validation', () => {
    renderSnack({ starter: 'no prompt' });
    expect(screen.getByTestId('code-invalid')).toBeInTheDocument();
  });

  it('shows the optional help link', () => {
    renderSnack({ prompt: 'p', help: { label: 'React docs', url: 'https://react.dev' } });
    const link = screen.getByTestId('code-help-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://react.dev');
    expect(link.textContent).toContain('React docs');
  });

  it('completes with true when Done is clicked (no grading)', () => {
    const onComplete = renderSnack({ prompt: 'p' });
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ response: expect.any(String) }));
  });

  it('shows Done — never a submit — when the spec ships no checks', () => {
    renderSnack({ prompt: 'p' });
    expect(screen.getByTestId('activity-done')).toBeInTheDocument();
    expect(screen.queryByTestId('code-submit')).not.toBeInTheDocument();
  });
});
/**
 * The graded lifecycle: `editing → submitted → editing` (Tentar de novo) and
 * `→ settled`. The screen while editing must stay editor + preview ONLY — no
 * permanent checklist (Tainan, 2026-07-23).
 *
 * ⚠️ Since Fase C step 5 these run against the REAL `CodeLivePreview` and its
 * real message protocol, with `previewIframe()` standing in for the sandboxed
 * document jsdom refuses to execute. The old version mocked the whole component
 * away, which meant the parent-side of the protocol — the ready gate, the token
 * echo, the "answer arrived for a run nobody is waiting for" drop — was never
 * exercised by anything but the mock's own imitation of it.
 *
 * One consequence, and it is load-bearing: every source these tests type must
 * actually TRANSPILE. `CodeLivePreview` answers a submit itself, immediately and
 * all-failed, when sucrase cannot parse the submitted code — so a placeholder
 * string like `'novo codigo'` would short-circuit the protocol under test.
 */
describe('CodeSnackActivity — deterministic checks', () => {
  const CHECKS = [
    {
      id: 'verde',
      label: 'o botão está verde',
      hint: 'Troque a classe de cor para bg-emerald-500.',
      selector: 'button',
      assert: { type: 'class', contains: 'bg-emerald-500' },
    },
    {
      id: 'texto',
      label: 'o botão diz "Enviar"',
      selector: 'button',
      assert: { type: 'text', equals: 'Enviar' },
    },
  ];
  const SPEC = { prompt: 'Deixe o botão verde', starter: 'const a = 1', checks: CHECKS };

  /** The sandbox stand-in for the current render. */
  let sandbox: ReturnType<typeof previewIframe>;

  /** Render the snack and boot its preview, i.e. one normal page load. */
  function open(spec: Record<string, unknown> = SPEC, onComplete = vi.fn()) {
    const cb = renderSnack(spec, onComplete);
    sandbox = previewIframe();
    sandbox.boot();
    return cb;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    saveCodeSnapshot.mockClear();
    clearCodeSnapshot.mockClear();
    readCodeSnapshot.mockClear();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function submit() {
    act(() => {
      fireEvent.click(screen.getByTestId('code-submit'));
    });
  }

  /** Submit, then let the sandbox come back with these verdicts. */
  function submitAndAnswer(results: { id: string; passed: boolean }[]) {
    submit();
    sandbox.answer(results);
  }

  it('shows no feedback at all while editing — just editor + preview', () => {
    open();
    expect(screen.getByTestId('code-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('code-checks-feedback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-check-item')).not.toBeInTheDocument();
    // …and the ungraded Done affordance is gone (submitting IS the action now).
    expect(screen.queryByTestId('activity-done')).not.toBeInTheDocument();
  });

  it('grades the code the learner submitted, not a stale render', () => {
    open();
    typeCode('const novo = 1;');
    submit();
    expect(sandbox.runs).toHaveLength(1);
    // TRANSPILED, not raw — the sandbox has no compiler, so what crosses the
    // isolation boundary is sucrase's output. What matters is WHOSE source it
    // is: the one on screen at submit time, not the last one rendered.
    expect(sandbox.runs[0].code).toContain('const novo = 1;');
    // The check list rides along with the source, so the sandbox never has to
    // remember which submit it is answering.
    expect(sandbox.runs[0].checks.map((c) => c.id)).toEqual(['verde', 'texto']);
  });

  it('reveals one line per check after submitting, with the hint only where it failed', () => {
    const onComplete = open();
    submitAndAnswer([
      { id: 'verde', passed: false },
      { id: 'texto', passed: true },
    ]);

    const items = screen.getAllByTestId('code-check-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-passed', 'false');
    expect(items[1]).toHaveAttribute('data-passed', 'true');
    expect(screen.getByText('o botão está verde')).toBeInTheDocument();
    // Exactly one hint: the failing check's.
    const hints = screen.getAllByTestId('code-check-hint');
    expect(hints).toHaveLength(1);
    expect(hints[0].textContent).toContain('bg-emerald-500');
    // Nothing is reported upward yet — the learner still owns the decision.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('"Tentar de novo" hides the feedback and KEEPS the learner code', () => {
    open();
    typeCode('const tentativa = "minha";');
    submitAndAnswer([
      { id: 'verde', passed: false },
      { id: 'texto', passed: false },
    ]);
    expect(screen.getByTestId('code-checks-feedback')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });

    expect(screen.queryByTestId('code-checks-feedback')).not.toBeInTheDocument();
    // NOT a reset: the work survives, and the starter is not restored.
    expect(codeEditorEl().value).toBe('const tentativa = "minha";');
    expect(screen.getByTestId('code-submit')).toBeEnabled();
  });

  it('a second submit re-runs the checks and can now pass', () => {
    const onComplete = open();
    submitAndAnswer([
      { id: 'verde', passed: false },
      { id: 'texto', passed: true },
    ]);
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });

    typeCode('const agora = "vai";');
    submitAndAnswer([
      { id: 'verde', passed: true },
      { id: 'texto', passed: true },
    ]);

    expect(sandbox.runs).toHaveLength(2);
    expect(sandbox.runs[1].token).toBeGreaterThan(sandbox.runs[0].token);
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'true');
    expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ response: expect.any(String) }));
  });

  /**
   * Tainan, 17/08/2026: *"tirar esse segundo botão continuar, o primeiro botão
   * enviar é o suficiente"*. No acerto não há escolha nenhuma para o botão
   * carregar — quem passou vai seguir — então a tentativa é reportada na hora e
   * a tela fica só com o veredito.
   */
  it('reports a PASS on the submit itself — no second button, and only once', () => {
    const onComplete = open();
    submitAndAnswer([
      { id: 'verde', passed: true },
      { id: 'texto', passed: true },
    ]);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ response: expect.any(String) }));
    expect(screen.queryByTestId('code-checks-continue')).toBeNull();
    const feedback = screen.getByTestId('code-checks-feedback');
    expect(feedback).toHaveAttribute('data-all-passed', 'true');
    expect(feedback).toHaveAttribute('data-settled', 'true');
  });

  // Call de líderes 2026-07-28: the learner submitted correct code, was marked
  // correct, then edited it into something broken — and the green badge stayed.
  it('freezes the editor once a verdict is on screen, and reopens it on click', () => {
    open();
    expect(codeEditorEl()).not.toHaveAttribute('readonly');

    submitAndAnswer([
      { id: 'verde', passed: true },
      { id: 'texto', passed: false },
    ]);
    expect(codeEditorEl()).toHaveAttribute('readonly');

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });
    expect(codeEditorEl()).not.toHaveAttribute('readonly');
  });

  it('never reports a verdict that no longer describes the code on screen', () => {
    const onComplete = open();
    // A PARTIAL verdict on purpose: a full pass now settles on the submit
    // itself, so the only verdict that can still be on screen while the source
    // moves is one the learner has not passed.
    submitAndAnswer([
      { id: 'verde', passed: true },
      { id: 'texto', passed: false },
    ]);
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');

    // The source moves away from what was graded. The frozen editor is what
    // stops this in the UI; the guard under test covers any other path that
    // could move the code while a verdict is up.
    typeCode('const quebrei = "tudo";');

    // The verdict leaves with the code it described, and the editor reopens —
    // no green badge over unknown code, and no dead button either.
    expect(screen.queryByTestId('code-checks-feedback')).toBeNull();
    expect(codeEditorEl()).not.toHaveAttribute('readonly');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores a verdict for a run the learner already walked away from', () => {
    open();
    submit();

    // The learner gives up waiting and goes back to editing…
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });

    // …and only THEN the sandbox answers the run it was still chewing on.
    sandbox.answer([
      { id: 'verde', passed: true },
      { id: 'texto', passed: true },
    ]);
    expect(screen.queryByTestId('code-checks-feedback')).toBeNull();
  });

  it('records the REAL result when the learner moves on after failing', () => {
    const onComplete = open();
    submitAndAnswer([
      { id: 'verde', passed: true },
      { id: 'texto', passed: false },
    ]);
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');

    // The advance is never blocked — but what gets recorded is false.
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ response: expect.any(String) }));
  });

  it('offers "seguir mesmo assim" when every check fails — a stuck learner is not trapped', () => {
    const onComplete = open();
    submitAndAnswer([
      { id: 'verde', passed: false },
      { id: 'texto', passed: false },
    ]);
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');
    expect(screen.getByTestId('code-checks-retry')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ response: expect.any(String) }));
  });

  it('keeps the verdicts on screen after settling, with the actions spent', () => {
    // In the live class the learner does NOT self-advance, so the activity
    // stays mounted after reporting — the feedback must not vanish.
    const onComplete = open();
    submitAndAnswer([
      { id: 'verde', passed: false },
      { id: 'texto', passed: false },
    ]);
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });

    const feedback = screen.getByTestId('code-checks-feedback');
    expect(feedback).toBeInTheDocument();
    expect(feedback).toHaveAttribute('data-settled', 'true');
    expect(screen.getByTestId('code-checks-continue')).toBeDisabled();
    expect(screen.getByTestId('code-checks-retry')).toBeDisabled();

    // …and a second click cannot double-report.
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('a check the preview never reported back counts as not passed', () => {
    const onComplete = open();
    submitAndAnswer([{ id: 'texto', passed: true }]);

    const items = screen.getAllByTestId('code-check-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-check-id', 'verde');
    expect(items[0]).toHaveAttribute('data-passed', 'false');

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ response: expect.any(String) }));
  });

  it('falls back to "nothing passed" if the preview never answers', () => {
    // The sandbox crashed / never booted — the submit must not hang forever.
    open();
    submit();
    expect(screen.queryByTestId('code-checks-feedback')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');
    expect(screen.getByTestId('code-checks-retry')).toBeInTheDocument();
  });

  it('answers a submit ITSELF when the source does not even transpile', () => {
    // New in step 5, and only assertable now that the real component is in the
    // tree: source that sucrase cannot parse never reaches the sandbox — there
    // is nothing to render — so the parent replies "nothing passed" straight
    // away and the learner already has the syntax error on screen. It is also
    // the check that proves the transpiler travelled INTO the package rather
    // than being left behind in the app.
    open();
    typeCode('export default function( { return <div/> }');
    submit();

    expect(sandbox.runs).toHaveLength(0);
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');
    expect(screen.getByTestId('code-preview-error')).toBeInTheDocument();
  });
});

describe('CodeSnackActivity — recomeçar do código inicial', () => {
  const STARTER = 'const inicio = 1';

  beforeEach(() => {
    vi.useFakeTimers();
    saveCodeSnapshot.mockClear();
    clearCodeSnapshot.mockClear();
    readCodeSnapshot.mockClear();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const type = typeCode;
  const editor = codeEditorEl;

  it('asks before discarding — one tap alone changes nothing', () => {
    renderSnack({ prompt: 'p', starter: STARTER });
    type('meu trabalho');

    act(() => {
      fireEvent.click(screen.getByTestId('code-reset'));
    });

    expect(screen.getByTestId('code-reset-prompt')).toBeInTheDocument();
    expect(editor().value).toBe('meu trabalho');
    expect(clearCodeSnapshot).not.toHaveBeenCalled();
  });

  it('cancelling keeps the work exactly where it was', () => {
    renderSnack({ prompt: 'p', starter: STARTER });
    type('meu trabalho');

    act(() => {
      fireEvent.click(screen.getByTestId('code-reset'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-reset-cancel'));
    });

    expect(screen.queryByTestId('code-reset-prompt')).not.toBeInTheDocument();
    expect(editor().value).toBe('meu trabalho');
    expect(clearCodeSnapshot).not.toHaveBeenCalled();
  });

  it('confirming brings the starter back AND drops the saved snapshot', () => {
    renderSnack({ prompt: 'p', starter: STARTER });
    type('destruí tudo');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveCodeSnapshot).toHaveBeenCalledWith('t-code', 'destruí tudo');
    saveCodeSnapshot.mockClear();

    act(() => {
      fireEvent.click(screen.getByTestId('code-reset'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-reset-confirm'));
    });

    expect(editor().value).toBe(STARTER);
    expect(clearCodeSnapshot).toHaveBeenCalledWith('t-code');
    // …and the autosave must NOT write the starter straight back, which would
    // leave a snapshot behind for something the learner just discarded.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveCodeSnapshot).not.toHaveBeenCalled();
  });

  it('the learner can keep working right after recomeçar', () => {
    renderSnack({ prompt: 'p', starter: STARTER });
    type('lixo');
    act(() => {
      fireEvent.click(screen.getByTestId('code-reset'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-reset-confirm'));
    });

    type('segunda tentativa');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveCodeSnapshot).toHaveBeenCalledWith('t-code', 'segunda tentativa');
  });

  it('walks the feedback screen back to editing with the starter', () => {
    const CHECKS = [{ id: 'a', label: 'checa', selector: 'button', assert: { type: 'text', equals: 'x' } }];
    renderSnack({ prompt: 'p', starter: STARTER, checks: CHECKS });
    const sandbox = previewIframe();
    sandbox.boot();
    type('const tentativa = 1;');
    act(() => {
      fireEvent.click(screen.getByTestId('code-submit'));
    });
    sandbox.answer([{ id: 'a', passed: false }]);
    expect(screen.getByTestId('code-checks-feedback')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('code-reset'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-reset-confirm'));
    });

    expect(screen.queryByTestId('code-checks-feedback')).not.toBeInTheDocument();
    expect(editor().value).toBe(STARTER);
    expect(screen.getByTestId('code-submit')).toBeEnabled();
  });

  it('is offered on the ungraded snack too', () => {
    renderSnack({ prompt: 'p', starter: STARTER });
    expect(screen.getByTestId('activity-done')).toBeInTheDocument();
    expect(screen.getByTestId('code-reset')).toBeEnabled();
  });
});
