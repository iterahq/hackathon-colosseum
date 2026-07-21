import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveRankedRosterCard } from '@/components/live/LiveRankedRosterCard';
import type { ClassAnswerer, ClassPresenceMember, ClassRanking } from '@/types/liveClass';

const ranking: ClassRanking = {
  ranked: [
    { userId: 'a', name: 'Ana', totalMs: 7000, answeredCount: 2, correctCount: 2, rank: 1 },
    { userId: 'b', name: 'Bruno', totalMs: 9000, answeredCount: 2, correctCount: 1, rank: 2 },
  ],
  waiting: [{ userId: 'c', name: 'Caio', avatarUrl: null }],
};
const answerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana', state: 'done' },
  { userId: 'b', name: 'Bruno', state: 'wrong' },
  { userId: 'c', name: 'Caio', state: 'pending' },
];
const instructors: ClassPresenceMember[] = [{ userId: 'p', name: 'Prof', isInstructor: true }];

function renderCard(showDetail: boolean) {
  return render(
    <I18nProvider>
      <LiveRankedRosterCard
        ranking={ranking}
        answerers={answerers}
        instructors={instructors}
        selfUserId="b"
        showDetail={showDetail}
      />
    </I18nProvider>
  );
}

describe('LiveRankedRosterCard', () => {
  it('keeps learners in podium order with waiting ones after, plus the instructor on top', () => {
    renderCard(false);
    const rows = screen.getAllByTestId('live-ranked-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ana');
    expect(rows[0].getAttribute('data-rank')).toBe('1');
    expect(screen.getByTestId('live-ranked-waiting-row')).toHaveTextContent('Caio');
    expect(screen.getByTestId('live-ranked-instructors')).toHaveTextContent('Prof');
    expect(screen.getByTestId('live-roster-count').textContent).toBe('4');
  });

  it('hides correctness and times from learners — answered rows are just "answered"', () => {
    renderCard(false);
    const rows = screen.getAllByTestId('live-ranked-row');
    expect(rows[1].getAttribute('data-state')).toBe('answered');
    expect(screen.queryAllByTestId('live-ranked-time')).toHaveLength(0);
    expect(rows[1]).not.toHaveTextContent('1/2');
    expect(rows[1]).toHaveTextContent('você');
  });

  it('exposes correctness in data-state only on the instructor view', () => {
    renderCard(true);
    const rows = screen.getAllByTestId('live-ranked-row');
    expect(rows[1].getAttribute('data-state')).toBe('wrong');
  });

  it('shows score and cumulative time to the instructor', () => {
    renderCard(true);
    const rows = screen.getAllByTestId('live-ranked-row');
    expect(rows[0]).toHaveTextContent('2/2');
    expect(screen.getAllByTestId('live-ranked-time')[0].textContent).toContain('0:07');
  });

  it('shows the empty state when nobody is in the room', () => {
    render(
      <I18nProvider>
        <LiveRankedRosterCard
          ranking={{ ranked: [], waiting: [] }}
          answerers={[]}
          instructors={[]}
        />
      </I18nProvider>
    );
    expect(screen.queryByTestId('live-ranked-list')).toBeNull();
    expect(screen.getByTestId('live-ranked-roster-card')).toBeInTheDocument();
  });
});
