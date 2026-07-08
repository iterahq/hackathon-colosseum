import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveRankingCard } from '@/components/live/LiveRankingCard';
import type { ClassRanking } from '@/types/liveClass';

function renderCard(ranking: ClassRanking) {
  return render(
    <I18nProvider>
      <LiveRankingCard ranking={ranking} />
    </I18nProvider>
  );
}

describe('LiveRankingCard', () => {
  it('lists ranked learners with position, counts and cumulative time, plus the waiting ones', () => {
    renderCard({
      ranked: [
        { userId: 'a', name: 'Ana', totalMs: 7000, answeredCount: 2, correctCount: 2, rank: 1 },
        { userId: 'b', name: 'Bruno', totalMs: 9000, answeredCount: 2, correctCount: 1, rank: 2 },
      ],
      waiting: [{ userId: 'c', name: 'Caio' }],
    });

    const rows = screen.getAllByTestId('live-ranking-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ana');
    expect(rows[0].getAttribute('data-rank')).toBe('1');
    expect(screen.getByTestId('live-ranking-count').textContent).toBe('2');
    expect(screen.getAllByTestId('live-ranking-time')[0].textContent).toContain('0:07');
    expect(screen.getByTestId('live-ranking-waiting')).toHaveTextContent('Caio');
  });

  it('shows the empty state when nobody has answered', () => {
    renderCard({ ranked: [], waiting: [] });
    expect(screen.queryByTestId('live-ranking-list')).toBeNull();
    expect(screen.getByTestId('live-ranking-card')).toHaveTextContent('Ninguém respondeu ainda.');
  });
});
