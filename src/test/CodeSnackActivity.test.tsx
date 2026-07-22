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

vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: ({ code }: { code: string }) => <div data-testid="mock-preview">{code}</div>,
}));

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
});
