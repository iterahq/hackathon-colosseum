import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import type { ClassAnswerer } from '@/types/liveClass';

const answerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana', state: 'done' },
  { userId: 'b', name: 'Bruno', state: 'done' },
  { userId: 'c', name: 'Caio', state: 'wrong' },
  { userId: 'd', name: 'Duda', state: 'pending' },
];

function renderCard(over: Partial<React.ComponentProps<typeof LiveActivityStatsCard>> = {}) {
  return render(
    <I18nProvider>
      <LiveActivityStatsCard
        activityIndex={1}
        activityCount={27}
        kind="single_choice"
        answerers={answerers}
        {...over}
      />
    </I18nProvider>
  );
}

describe('LiveActivityStatsCard', () => {
  it('shows the activity position (N/M) and the humanised kind', () => {
    renderCard();
    expect(screen.getByTestId('live-stats-position').textContent).toBe('2/27');
    expect(screen.getByTestId('live-activity-stats').textContent).toContain('single choice');
  });

  it('summarises answered vs total and the correct/wrong/waiting split', () => {
    renderCard();
    // 2 correct + 1 wrong = 3 answered of 4 present.
    expect(screen.getByTestId('live-stats-answered').textContent).toContain('3/4');
    const card = screen.getByTestId('live-activity-stats').textContent ?? '';
    expect(card).toContain('2'); // correct
    expect(card).toContain('1'); // wrong
  });

  it('handles an empty room without dividing by zero', () => {
    renderCard({ answerers: [] });
    expect(screen.getByTestId('live-stats-answered').textContent).toContain('0/0');
  });
});
