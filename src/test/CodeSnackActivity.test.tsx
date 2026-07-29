import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';

// Monaco + the iframe/react-live preview are heavy for jsdom — stub both to a
// controllable textarea / passthrough so the test targets the snack's logic
// (debounced autosave + Done wiring + optional help link).
vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange?: (v: string) => void;
    readOnly?: boolean;
  }) => (
    <textarea
      data-testid="mock-editor"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

// The preview stub also plays the iframe's part in the grading protocol: it
// answers a `checksRequest` with whatever the test scripted, so the pane/hook
// lifecycle can be exercised without a real sandbox. (The REAL evaluation is
// covered against a real DOM in `codePreviewRuntime.test.tsx`.)
const preview = vi.hoisted(() => ({
  results: [] as { id: string; passed: boolean }[],
  requests: [] as { token: number; code: string }[],
  /** Simulates a preview that crashed / never booted: the request is dropped. */
  silent: false,
  /** Replays the last request's answer — a slow iframe reporting in too late. */
  answerLate: (() => {}) as () => void,
}));

vi.mock('@/components/branded/activity/code/CodeLivePreview', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    CodeLivePreview: ({
      code,
      checksRequest,
      onChecksResult,
    }: {
      code: string;
      checksRequest?: { token: number; code: string } | null;
      onChecksResult?: (r: { id: string; passed: boolean }[], token: number) => void;
    }) => {
      React.useEffect(() => {
        if (!checksRequest) return;
        preview.requests.push({ token: checksRequest.token, code: checksRequest.code });
        preview.answerLate = () => onChecksResult?.(preview.results, checksRequest.token);
        if (preview.silent) return;
        onChecksResult?.(preview.results, checksRequest.token);
      }, [checksRequest, onChecksResult]);
      return React.createElement('div', { 'data-testid': 'mock-preview' }, code);
    },
  };
});

// The persistence layer is stubbed here so these tests stay about the snack's
// lifecycle. `readCodeSnapshot` answers "nothing saved" by default, which is the
// first-open case; the restore behaviour itself is covered against REAL
// localStorage in `CodeSnackRestore.test.tsx`.
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

function renderSnack(
  spec: Record<string, unknown>,
  onComplete = vi.fn(),
  opts: { live?: boolean } = {},
) {
  render(
    <I18nProvider>
      <CodeSnackActivity
        activity={makeActivity(spec)}
        onComplete={onComplete}
        live={opts.live ?? false}
      />
    </I18nProvider>,
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
    expect(onComplete).toHaveBeenCalledWith(true);
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

  beforeEach(() => {
    vi.useFakeTimers();
    saveCodeSnapshot.mockClear();
    clearCodeSnapshot.mockClear();
    readCodeSnapshot.mockClear();
    preview.results = [];
    preview.requests = [];
    preview.silent = false;
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

  it('shows no feedback at all while editing — just editor + preview', () => {
    renderSnack(SPEC);
    expect(screen.getByTestId('code-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('code-checks-feedback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-check-item')).not.toBeInTheDocument();
    // …and the ungraded Done affordance is gone (submitting IS the action now).
    expect(screen.queryByTestId('activity-done')).not.toBeInTheDocument();
  });

  it('grades the code the learner submitted, not a stale render', () => {
    renderSnack(SPEC);
    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: 'novo codigo' } });
    });
    submit();
    expect(preview.requests).toHaveLength(1);
    expect(preview.requests[0].code).toBe('novo codigo');
  });

  it('reveals one line per check after submitting, with the hint only where it failed', () => {
    preview.results = [
      { id: 'verde', passed: false },
      { id: 'texto', passed: true },
    ];
    const onComplete = renderSnack(SPEC);
    submit();

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
    preview.results = [
      { id: 'verde', passed: false },
      { id: 'texto', passed: false },
    ];
    renderSnack(SPEC);
    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: 'minha tentativa' } });
    });
    submit();
    expect(screen.getByTestId('code-checks-feedback')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });

    expect(screen.queryByTestId('code-checks-feedback')).not.toBeInTheDocument();
    // NOT a reset: the work survives, and the starter is not restored.
    expect((screen.getByTestId('mock-editor') as HTMLTextAreaElement).value).toBe(
      'minha tentativa',
    );
    expect(screen.getByTestId('code-submit')).toBeEnabled();
  });

  it('a second submit re-runs the checks and can now pass', () => {
    preview.results = [
      { id: 'verde', passed: false },
      { id: 'texto', passed: true },
    ];
    const onComplete = renderSnack(SPEC);
    submit();
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });

    preview.results = [
      { id: 'verde', passed: true },
      { id: 'texto', passed: true },
    ];
    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: 'agora vai' } });
    });
    submit();

    expect(preview.requests).toHaveLength(2);
    expect(preview.requests[1].token).toBeGreaterThan(preview.requests[0].token);
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'true');
    // Success keeps the way back in: the editor is frozen from the submit
    // onwards, so this explicit click is the only door.
    expect(screen.getByTestId('code-checks-retry')).toBeEnabled();

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  // Call de líderes 2026-07-28: the learner submitted correct code, was marked
  // correct, then edited it into something broken — and the green badge stayed.
  it('freezes the editor once a verdict is on screen, and reopens it on click', () => {
    preview.results = [
      { id: 'verde', passed: true },
      { id: 'texto', passed: true },
    ];
    renderSnack(SPEC);
    expect(screen.getByTestId('mock-editor')).not.toHaveAttribute('readonly');

    submit();
    expect(screen.getByTestId('mock-editor')).toHaveAttribute('readonly');

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });
    expect(screen.getByTestId('mock-editor')).not.toHaveAttribute('readonly');
  });

  it('never reports a verdict that no longer describes the code on screen', () => {
    preview.results = [
      { id: 'verde', passed: true },
      { id: 'texto', passed: true },
    ];
    const onComplete = renderSnack(SPEC, vi.fn(), { live: true });
    submit();
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'true');

    // The source moves away from what was graded. The frozen editor is what
    // stops this in the UI; the guard under test covers any other path that
    // could move the code while a verdict is up.
    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: 'quebrei tudo' } });
    });

    // The verdict leaves with the code it described, and the editor reopens —
    // no green badge over unknown code, and no dead button either.
    expect(screen.queryByTestId('code-checks-feedback')).toBeNull();
    expect(screen.getByTestId('mock-editor')).not.toHaveAttribute('readonly');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores a verdict for a run the learner already walked away from', () => {
    preview.results = [
      { id: 'verde', passed: true },
      { id: 'texto', passed: true },
    ];
    preview.silent = true;
    renderSnack(SPEC);
    submit();

    // The learner gives up waiting and goes back to editing…
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-retry'));
    });

    // …and only THEN the iframe answers the run it was still chewing on.
    act(() => {
      preview.answerLate();
    });
    expect(screen.queryByTestId('code-checks-feedback')).toBeNull();
  });

  it('records the REAL result when the learner moves on after failing (live)', () => {
    preview.results = [
      { id: 'verde', passed: true },
      { id: 'texto', passed: false },
    ];
    // "Seguir mesmo assim" only exists in the live class — render it live.
    const onComplete = renderSnack(SPEC, vi.fn(), { live: true });
    submit();
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');

    // The advance is never blocked mid-class — but what gets recorded is false.
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('self-paced hides "seguir mesmo assim" on a failure — only retry moves forward', () => {
    // Skipping a failed PRACTICAL exercise makes no sense — it just defers the
    // same retry. Self-paced offers only "tentar de novo".
    preview.results = [
      { id: 'verde', passed: false },
      { id: 'texto', passed: false },
    ];
    renderSnack(SPEC);
    submit();
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');
    expect(screen.queryByTestId('code-checks-continue')).not.toBeInTheDocument();
    expect(screen.getByTestId('code-checks-retry')).toBeInTheDocument();
  });

  it('keeps the verdicts on screen after settling, with the actions spent (live)', () => {
    // In the live class the learner does NOT self-advance, so the activity
    // stays mounted after reporting — the feedback must not vanish.
    preview.results = [
      { id: 'verde', passed: false },
      { id: 'texto', passed: false },
    ];
    const onComplete = renderSnack(SPEC, vi.fn(), { live: true });
    submit();
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
    preview.results = [{ id: 'texto', passed: true }];
    const onComplete = renderSnack(SPEC, vi.fn(), { live: true });
    submit();

    const items = screen.getAllByTestId('code-check-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-check-id', 'verde');
    expect(items[0]).toHaveAttribute('data-passed', 'false');

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('falls back to "nothing passed" if the preview never answers', () => {
    // The preview crashed / never booted — the submit must not hang forever.
    preview.silent = true;
    renderSnack(SPEC);
    submit();
    expect(screen.queryByTestId('code-checks-feedback')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');
    expect(screen.getByTestId('code-checks-retry')).toBeInTheDocument();
  });
});

/**
 * "Recomeçar do código inicial" — the escape hatch for a learner who broke the
 * starter beyond repair. It is a DIFFERENT control from "Tentar de novo": that
 * one preserves the work, this one discards it (and therefore asks first).
 */
describe('CodeSnackActivity — recomeçar do código inicial', () => {
  const STARTER = 'const inicio = 1';

  beforeEach(() => {
    vi.useFakeTimers();
    saveCodeSnapshot.mockClear();
    clearCodeSnapshot.mockClear();
    readCodeSnapshot.mockClear();
    preview.results = [];
    preview.requests = [];
    preview.silent = false;
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function type(value: string) {
    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value } });
    });
  }
  const editor = () => screen.getByTestId('mock-editor') as HTMLTextAreaElement;

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
    preview.results = [{ id: 'a', passed: false }];
    renderSnack({ prompt: 'p', starter: STARTER, checks: CHECKS });
    type('tentativa quebrada');
    act(() => {
      fireEvent.click(screen.getByTestId('code-submit'));
    });
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
