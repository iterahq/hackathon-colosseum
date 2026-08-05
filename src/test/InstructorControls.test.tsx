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
  canReveal: true,
  timerSeconds: 0,
  onBegin: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onStartTimer: vi.fn(),
  onStopTimer: vi.fn(),
  onAdjustTime: vi.fn(),
  onSetTime: vi.fn(),
  onReveal: vi.fn(),
  // Added by #250 ("professor coloca a própria tela no palco"), which made both
  // props REQUIRED on `InstructorControlsProps` but did not update this fixture —
  // so `npm run typecheck` (a build gate here) has been red on `main` since that
  // merge, and every branch cut from it inherits the failure. Fixed here so this
  // PR can be verified at all; see the PR body.
  selfStaged: false,
  onToggleSelfStage: vi.fn(),
  onBreak: false,
  onToggleBreak: vi.fn(),
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

  it('reveal is hidden in reception and shown once running', () => {
    const { rerender } = controls({ inReception: true });
    expect(screen.queryByTestId('instructor-reveal')).toBeNull();
    rerender(
      <I18nProvider>
        <InstructorControls {...base} inReception={false} />
      </I18nProvider>
    );
    expect(screen.getByTestId('instructor-reveal')).toBeTruthy();
  });

  it('reveal is hidden for content activities (nothing to reveal)', () => {
    controls({ canReveal: false });
    expect(screen.queryByTestId('instructor-reveal')).toBeNull();
    expect(screen.getByTestId('instructor-next')).toBeTruthy();
  });

  // The `code` shape: answerable (5-min countdown) but nothing to reveal. Hiding
  // Reveal must NOT cost the professor control of the clock — the timer's own
  // stop button is a separate, honestly-labelled control.
  it('code: no reveal button, yet the professor can still stop the clock', () => {
    const onStopTimer = vi.fn();
    controls({ canReveal: false, timerSeconds: 300, timerRunning: true, onStopTimer });
    expect(screen.queryByTestId('instructor-reveal')).toBeNull();
    fireEvent.click(screen.getByTestId('live-timer-stop'));
    expect(onStopTimer).toHaveBeenCalledOnce();
  });

  it('code: can also start the clock with no reveal button present', () => {
    const onStartTimer = vi.fn();
    controls({ canReveal: false, timerSeconds: 300, timerRunning: false, onStartTimer });
    expect(screen.queryByTestId('instructor-reveal')).toBeNull();
    fireEvent.click(screen.getByTestId('live-timer-start'));
    expect(onStartTimer).toHaveBeenCalledWith(300);
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

  it('keeps the break behind the overflow menu instead of the sidebar', () => {
    controls({});
    expect(screen.queryByTestId('instructor-break')).toBeNull();
    fireEvent.click(screen.getByTestId('instructor-more'));
    expect(screen.getByTestId('instructor-break')).toBeTruthy();
  });

  it('tints the overflow trigger while the class is paused', () => {
    controls({ onBreak: true });
    expect(screen.getByTestId('instructor-more').getAttribute('data-active')).toBe('true');
  });

  it('the break toggle fires and reads as pressed while the class is paused', () => {
    const onToggleBreak = vi.fn();
    const { rerender } = controls({ onToggleBreak });
    fireEvent.click(screen.getByTestId('instructor-more'));
    fireEvent.click(screen.getByTestId('instructor-break'));
    expect(onToggleBreak).toHaveBeenCalledOnce();
    expect(screen.getByTestId('instructor-break').getAttribute('aria-pressed')).toBe('false');
    rerender(
      <I18nProvider>
        <InstructorControls {...base} onToggleBreak={onToggleBreak} onBreak />
      </I18nProvider>
    );
    expect(screen.getByTestId('instructor-break').getAttribute('aria-pressed')).toBe('true');
  });

  it('hides the timer controls when the activity has no timer (0s)', () => {
    controls({ timerSeconds: 0 });
    expect(screen.queryByTestId('live-timer-controls')).toBeNull();
  });

  it('labels the start button with mm:ss and does not break past a minute', () => {
    // Locale-agnostic: PT 'Iniciar tempo ({time})' / EN 'Start timer ({time})'.
    const { rerender } = controls({ timerSeconds: 60 });
    expect(screen.getByTestId('live-timer-start').textContent).toContain('1:00');
    rerender(
      <I18nProvider>
        <InstructorControls {...base} timerSeconds={300} />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-timer-start').textContent).toContain('5:00');
  });

  it('starts the timer with the activity duration it was given (5 min for code)', () => {
    const onStartTimer = vi.fn();
    controls({ timerSeconds: 300, onStartTimer });
    fireEvent.click(screen.getByTestId('live-timer-start'));
    expect(onStartTimer).toHaveBeenCalledWith(300);
  });

  // ── Time popover (professor ajusta o tempo) ─────────────────────────────
  it('shows the time trigger only when the activity has a timer', () => {
    const { rerender } = controls({ timerSeconds: 0 });
    expect(screen.queryByTestId('instructor-add-time')).toBeNull();
    rerender(
      <I18nProvider>
        <InstructorControls {...base} timerSeconds={60} />
      </I18nProvider>
    );
    expect(screen.getByTestId('instructor-add-time')).toBeTruthy();
  });

  it('the time trigger is icon-only but has an accessible label', () => {
    controls({ timerSeconds: 60 });
    const btn = screen.getByTestId('instructor-add-time');
    // No visible text — labelled for a11y via aria-label + title.
    expect(btn.textContent).toBe('');
    expect(btn.getAttribute('aria-label')).toBeTruthy();
    expect(btn.getAttribute('title')).toBeTruthy();
  });

  it('a quick chip nudges by that exact SIGNED delta', () => {
    const onAdjustTime = vi.fn();
    controls({ timerSeconds: 60, onAdjustTime });
    fireEvent.click(screen.getByTestId('instructor-add-time')); // open popover
    fireEvent.click(screen.getByTestId('instructor-time-quick-plus-30'));
    expect(onAdjustTime).toHaveBeenCalledWith(30);
    fireEvent.click(screen.getByTestId('instructor-time-quick-minus-60'));
    expect(onAdjustTime).toHaveBeenCalledWith(-60);
  });

  it('the popover can take time AWAY — the whole point of the professor asking', () => {
    controls({ timerSeconds: 60 });
    fireEvent.click(screen.getByTestId('instructor-add-time'));
    expect(screen.getByTestId('instructor-time-quick-minus-30')).toBeTruthy();
  });

  it('a free value SETS that absolute duration and clears the field', () => {
    const onSetTime = vi.fn();
    controls({ timerSeconds: 60, onSetTime });
    fireEvent.click(screen.getByTestId('instructor-add-time'));
    const input = screen.getByTestId('instructor-add-time-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '30' } }); // "quero 30 segundos"
    fireEvent.click(screen.getByTestId('instructor-add-time-submit'));
    expect(onSetTime).toHaveBeenCalledWith(30);
    expect(input.value).toBe('');
  });

  it('the free-value set is disabled for empty / out-of-range input', () => {
    controls({ timerSeconds: 60 });
    fireEvent.click(screen.getByTestId('instructor-add-time'));
    expect(screen.getByTestId('instructor-add-time-submit')).toBeDisabled();
    const input = screen.getByTestId('instructor-add-time-input');
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByTestId('instructor-add-time-submit')).toBeDisabled();
    fireEvent.change(input, { target: { value: '10' } });
    expect(screen.getByTestId('instructor-add-time-submit')).not.toBeDisabled();
  });

  it('has no reset button — resets were removed from the live flow', () => {
    controls({ revealed: true });
    expect(screen.queryByTestId('instructor-reset')).toBeNull();
  });

  it('has no mid-class podium button — the podium only shows at the end of class', () => {
    controls();
    expect(screen.queryByTestId('instructor-show-podium')).toBeNull();
  });
});
