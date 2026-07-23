import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';

// Monaco + the iframe/react-live preview are heavy for jsdom — stub both to a
// controllable textarea / passthrough so the test targets the snack's logic
// (debounced autosave + Done wiring + optional help link).
vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      data-testid="mock-editor"
      value={value}
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
      onChecksResult?: (r: { id: string; passed: boolean }[]) => void;
    }) => {
      React.useEffect(() => {
        if (!checksRequest) return;
        preview.requests.push({ token: checksRequest.token, code: checksRequest.code });
        if (preview.silent) return;
        onChecksResult?.(preview.results);
      }, [checksRequest, onChecksResult]);
      return React.createElement('div', { 'data-testid': 'mock-preview' }, code);
    },
  };
});

const saveCodeSnapshot = vi.fn();
vi.mock('@/services/codeSnapshot.service', () => ({
  saveCodeSnapshot: (...args: unknown[]) => saveCodeSnapshot(...args),
}));

import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';

function makeActivity(spec: Record<string, unknown>): Activity {
  return { id: 't-code', lessonId: 'l', ordinal: 0, kind: 'code', spec, rubric: null };
}

function renderSnack(spec: Record<string, unknown>, onComplete = vi.fn()) {
  render(
    <I18nProvider>
      <CodeSnackActivity activity={makeActivity(spec)} onComplete={onComplete} />
    </I18nProvider>,
  );
  return onComplete;
}

describe('CodeSnackActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveCodeSnapshot.mockClear();
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
    // Success has no retry — there is nothing left to fix.
    expect(screen.queryByTestId('code-checks-retry')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('records the REAL result when the learner moves on after failing', () => {
    preview.results = [
      { id: 'verde', passed: true },
      { id: 'texto', passed: false },
    ];
    const onComplete = renderSnack(SPEC);
    submit();
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');

    // The advance is never blocked mid-class — but what gets recorded is false.
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('keeps the verdicts on screen after settling, with the actions spent', () => {
    // In the live class the learner does NOT self-advance, so the activity
    // stays mounted after reporting — the feedback must not vanish.
    preview.results = [
      { id: 'verde', passed: false },
      { id: 'texto', passed: false },
    ];
    const onComplete = renderSnack(SPEC);
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
    const onComplete = renderSnack(SPEC);
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
