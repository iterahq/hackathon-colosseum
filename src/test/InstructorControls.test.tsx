import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { InstructorControls } from '@/components/live/InstructorControls';

const base = {
  inReception: false,
  answeredCount: 0,
  presentCount: 0,
  busy: false,
  canPrev: false,
  canNext: true,
  timerRunning: false,
  revealed: false,
  timerSeconds: 0,
  onBegin: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onStartTimer: vi.fn(),
  onStopTimer: vi.fn(),
  onReveal: vi.fn(),
  onReset: vi.fn(),
};

function controls(over: Partial<typeof base> = {}) {
  return render(
    <I18nProvider>
      <InstructorControls {...base} {...over} />
    </I18nProvider>
  );
}

describe('InstructorControls', () => {
  it('reception shows only begin (no pointer/timer controls)', () => {
    controls({ inReception: true });
    expect(screen.getByTestId('instructor-begin-btn')).toBeTruthy();
    expect(screen.queryByTestId('instructor-next')).toBeNull();
    expect(screen.queryByTestId('instructor-prev')).toBeNull();
  });

  it('running shows prev/next and disables prev at the first activity', () => {
    controls({ canPrev: false });
    expect(screen.getByTestId('instructor-next')).toBeTruthy();
    expect(screen.getByTestId('instructor-prev')).toBeDisabled();
  });

  it('flags Next as ready + shows the ✓ chip when everyone present has answered', () => {
    controls({ presentCount: 3, answeredCount: 3 });
    expect(screen.getByTestId('instructor-answered-count').textContent).toContain('3/3');
    expect(screen.getByTestId('instructor-next').getAttribute('data-ready')).toBe('true');
  });

  it('is not ready while learners are still pending', () => {
    controls({ presentCount: 3, answeredCount: 1 });
    expect(screen.getByTestId('instructor-next').getAttribute('data-ready')).toBe('false');
    expect(screen.getByTestId('instructor-answered-count').textContent).toContain('1/3');
  });

  it('hides the answered chip when no learners are present yet', () => {
    controls({ presentCount: 0, answeredCount: 0 });
    expect(screen.queryByTestId('instructor-answered-count')).toBeNull();
  });

  it('reveal + reset are hidden in reception and shown once running', () => {
    const { rerender } = controls({ inReception: true });
    expect(screen.queryByTestId('instructor-reveal')).toBeNull();
    expect(screen.queryByTestId('instructor-reset')).toBeNull();
    rerender(
      <I18nProvider>
        <InstructorControls {...base} inReception={false} />
      </I18nProvider>
    );
    expect(screen.getByTestId('instructor-reveal')).toBeTruthy();
    expect(screen.getByTestId('instructor-reset')).toBeTruthy();
  });

  it('reveal fires onReveal and disables once the answer is revealed', () => {
    const onReveal = vi.fn();
    const { rerender } = controls({ onReveal });
    fireEvent.click(screen.getByTestId('instructor-reveal'));
    expect(onReveal).toHaveBeenCalledOnce();
    rerender(
      <I18nProvider>
        <InstructorControls {...base} onReveal={onReveal} revealed />
      </I18nProvider>
    );
    expect(screen.getByTestId('instructor-reveal')).toBeDisabled();
  });

  it('reset fires onReset even after the answer is revealed (redo the round)', () => {
    const onReset = vi.fn();
    controls({ onReset, revealed: true });
    const resetBtn = screen.getByTestId('instructor-reset');
    expect(resetBtn).not.toBeDisabled();
    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
