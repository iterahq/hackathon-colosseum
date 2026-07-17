import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LivePodium } from '@/components/live/LivePodium';
import type { ClassRanking } from '@/types/liveClass';

function renderPodium(ranking: ClassRanking) {
  return render(
    <I18nProvider>
      <LivePodium ranking={ranking} />
    </I18nProvider>
  );
}

const entry = (userId: string, name: string, correctCount: number, rank: number) => ({
  userId,
  name,
  avatarUrl: null,
  totalMs: 1000 * rank,
  answeredCount: 3,
  correctCount,
  rank,
});

describe('LivePodium', () => {
  it('shows the top three on the podium and the rest in a list', () => {
    renderPodium({
      ranked: [
        entry('a', 'Ana', 3, 1),
        entry('b', 'Bruno', 2, 2),
        entry('c', 'Caio', 2, 3),
        entry('d', 'Duda', 1, 4),
      ],
      waiting: [],
    });

    const places = screen.getAllByTestId('live-podium-place');
    expect(places).toHaveLength(3);
    // Visual left→right order is 2nd, 1st, 3rd.
    expect(places.map((p) => p.getAttribute('data-rank'))).toEqual(['2', '1', '3']);
    expect(places[1]).toHaveTextContent('Ana');
    expect(places[1]).toHaveTextContent('3 acertos');

    const rest = screen.getAllByTestId('live-podium-row');
    expect(rest).toHaveLength(1);
    expect(rest[0]).toHaveTextContent('Duda');
  });

  it('shows each place cumulative answer time (mm:ss)', () => {
    renderPodium({
      ranked: [
        entry('a', 'Ana', 3, 1), // 1000ms → 0:01
        entry('b', 'Bruno', 2, 2), // 2000ms → 0:02
        entry('c', 'Caio', 2, 3), // 3000ms → 0:03
        entry('d', 'Duda', 1, 4), // 4000ms → 0:04
      ],
      waiting: [],
    });
    const times = screen.getAllByTestId('live-podium-time').map((n) => n.textContent);
    expect(times).toContain('0:01');
    expect(screen.getByTestId('live-podium-row')).toHaveTextContent('0:04');
  });

  it('shows the empty state when nobody answered', () => {
    renderPodium({ ranked: [], waiting: [] });
    expect(screen.getByTestId('live-podium-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('live-podium-place')).toBeNull();
  });
});
