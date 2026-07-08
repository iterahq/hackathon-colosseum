import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { InstructorControlBar } from '@/components/live/InstructorControlBar';

const base = {
  inReception: false,
  activityIndex: 0,
  activityCount: 5,
  answeredCount: 0,
  presentCount: 0,
  busy: false,
  canPrev: false,
  canNext: true,
  timerRunning: false,
  onBegin: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onStartTimer: vi.fn(),
  onStopTimer: vi.fn(),
};

function bar(over: Partial<typeof base> = {}) {
  return render(
    <I18nProvider>
      <InstructorControlBar {...base} {...over} />
    </I18nProvider>
  );
}

describe('InstructorControlBar', () => {
  it('reception shows only begin (no pointer/timer controls; share + end live in the sidebar)', () => {
    bar({ inReception: true });
    expect(screen.getByTestId('instructor-begin-btn')).toBeTruthy();
    expect(screen.queryByTestId('instructor-next')).toBeNull();
    expect(screen.queryByTestId('instructor-prev')).toBeNull();
    expect(screen.queryByTestId('instructor-copy-link')).toBeNull();
    expect(screen.queryByTestId('instructor-end')).toBeNull();
  });

  it('running shows prev/next + N/M and disables prev at the first activity', () => {
    bar({ activityIndex: 2, activityCount: 5, canPrev: false });
    expect(screen.getByTestId('instructor-next')).toBeTruthy();
    expect(screen.getByTestId('instructor-prev')).toBeDisabled();
    expect(screen.getByTestId('instructor-control-bar').textContent).toContain('3/5');
  });

  it('flags Next as ready + shows the ✓ chip when everyone present has answered', () => {
    bar({ presentCount: 3, answeredCount: 3 });
    expect(screen.getByTestId('instructor-answered-count').textContent).toContain('3/3');
    expect(screen.getByTestId('instructor-next').getAttribute('data-ready')).toBe('true');
  });

  it('is not ready while learners are still pending', () => {
    bar({ presentCount: 3, answeredCount: 1 });
    expect(screen.getByTestId('instructor-next').getAttribute('data-ready')).toBe('false');
    expect(screen.getByTestId('instructor-answered-count').textContent).toContain('1/3');
  });

  it('hides the answered chip when no learners are present yet', () => {
    bar({ presentCount: 0, answeredCount: 0 });
    expect(screen.queryByTestId('instructor-answered-count')).toBeNull();
  });
});
