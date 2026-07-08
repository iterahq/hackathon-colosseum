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

  it('ticks onWarn once per second across the final 5s (5,4,3,2,1)', () => {
    const onWarn = vi.fn();
    renderTimer(8_000, undefined, onWarn);
    expect(screen.getByTestId('live-timer').getAttribute('data-warning')).toBe('false');
    expect(onWarn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3_000); // 5s left → first tick
    });
    expect(screen.getByTestId('live-timer').getAttribute('data-warning')).toBe('true');
    expect(onWarn).toHaveBeenCalledTimes(1);
    // Each real second commits separately → one tick per second (4,3,2,1).
    for (let i = 0; i < 4; i++) {
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }
    expect(onWarn).toHaveBeenCalledTimes(5);
    act(() => {
      vi.advanceTimersByTime(2_000); // hits 0 → no extra tick
    });
    expect(onWarn).toHaveBeenCalledTimes(5);
  });
});
