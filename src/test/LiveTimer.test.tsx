import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveTimer } from '@/components/live/LiveTimer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

function renderTimer(deadlineMs: number, onExpire?: () => void, onWarn?: () => void) {
  return render(
    <I18nProvider>
      <LiveTimer deadline={deadlineMs} onExpire={onExpire} onWarn={onWarn} />
    </I18nProvider>
  );
}

describe('LiveTimer', () => {
  it('counts down from the shared deadline in mm:ss', () => {
    renderTimer(65_000);
    expect(screen.getByTestId('live-timer').textContent).toContain('1:05');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('live-timer').textContent).toContain('1:00');
  });

  it('reaches the done state and fires onExpire exactly once', () => {
    const onExpire = vi.fn();
    renderTimer(2_000, onExpire);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('live-timer').getAttribute('data-done')).toBe('true');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('enters the warning state and fires onWarn once in the final 5s', () => {
    const onWarn = vi.fn();
    renderTimer(8_000, undefined, onWarn);
    expect(screen.getByTestId('live-timer').getAttribute('data-warning')).toBe('false');
    expect(onWarn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4_000); // 4s left → within the final 5s
    });
    expect(screen.getByTestId('live-timer').getAttribute('data-warning')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(2_000); // still counting inside the window
    });
    expect(onWarn).toHaveBeenCalledTimes(1);
  });
});
