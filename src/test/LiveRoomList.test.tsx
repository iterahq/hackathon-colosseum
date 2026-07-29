import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveRoomList } from '@/components/live/LiveRoomList';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import type { ClassAnswerer, ClassPresenceMember, ClassRanking } from '@/types/liveClass';

const ranking: ClassRanking = {
  ranked: [
    { userId: 'a', name: 'Ana', avatarUrl: null, totalMs: 7000, answeredCount: 2, correctCount: 2, rank: 1 },
    { userId: 'b', name: 'Bruno', avatarUrl: null, totalMs: 9000, answeredCount: 2, correctCount: 1, rank: 2 },
  ],
  waiting: [{ userId: 'c', name: 'Caio', avatarUrl: null }],
};
const answerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana', avatarUrl: null, state: 'done', elapsedMs: 7000 },
  { userId: 'b', name: 'Bruno', avatarUrl: null, state: 'wrong', elapsedMs: 9000 },
  { userId: 'c', name: 'Caio', avatarUrl: null, state: 'pending' },
];
const roster: ClassPresenceMember[] = [
  { userId: 'p', name: 'Prof', avatarUrl: null, isInstructor: true },
  { userId: 'a', name: 'Ana', avatarUrl: null, isInstructor: false },
  { userId: 'b', name: 'Bruno', avatarUrl: null, isInstructor: false },
  { userId: 'c', name: 'Caio', avatarUrl: null, isInstructor: false },
];
const instructors = roster.filter((m) => m.isInstructor);

function renderList(
  showDetail: boolean,
  over: Partial<Parameters<typeof buildLiveRoomRows>[0]> = {}
) {
  return render(
    <I18nProvider>
      <LiveRoomList
        rows={buildLiveRoomRows({ ranking, answerers, roster, selfUserId: 'b', ...over })}
        instructors={instructors}
        showDetail={showDetail}
      />
    </I18nProvider>
  );
}

describe('LiveRoomList', () => {
  it('is ONE list: podium order first, waiting learners after, instructor apart', () => {
    renderList(false);
    const rows = screen.getAllByTestId('live-room-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Ana');
    expect(rows[0].getAttribute('data-rank')).toBe('1');
    expect(rows[2]).toHaveTextContent('Caio');
    expect(rows[2].getAttribute('data-rank')).toBe('');
    expect(screen.getByTestId('live-room-instructors')).toHaveTextContent('Prof');
    expect(screen.getByTestId('live-roster-count').textContent).toBe('3');
  });

  it('hides correctness and times from learners — a wrong answer reads as "answered"', () => {
    renderList(false);
    const rows = screen.getAllByTestId('live-room-row');
    expect(rows[1].getAttribute('data-state')).toBe('answered');
    expect(rows[1]).not.toHaveTextContent('1/2');
    expect(rows[1]).toHaveTextContent('você');
  });

  it('exposes correctness, score and time only on the instructor view', () => {
    renderList(true);
    const rows = screen.getAllByTestId('live-room-row');
    expect(rows[1].getAttribute('data-state')).toBe('wrong');
    expect(rows[0]).toHaveTextContent('2/2');
    expect(screen.getAllByTestId('live-room-time')[0].textContent).toContain('0:07');
  });

  it('answers the "quantos já responderam" question in one line', () => {
    renderList(true);
    expect(screen.getByTestId('live-room-pulse')).toHaveTextContent('2/3');
  });

  it('badges raised hands on their rows and counts them in the header', () => {
    renderList(false, {
      roster: roster.map((m) => (m.userId === 'a' ? m : { ...m, handRaised: true })),
    });
    expect(screen.getAllByTestId('live-hand-badge')).toHaveLength(2);
    expect(screen.getByTestId('live-hand-count')).toHaveTextContent('2');
  });

  it('renders no hand badges when nobody raised one', () => {
    renderList(false);
    expect(screen.queryAllByTestId('live-hand-badge')).toHaveLength(0);
    expect(screen.queryByTestId('live-hand-count')).toBeNull();
  });

  it('blinks a disconnected badge on learners who dropped the call', () => {
    renderList(false, { disconnectedUserIds: ['b', 'c'] });
    const badges = screen.getAllByTestId('live-disconnected-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0].className).toContain('animate-pulse');
  });

  it('shows a pencil for a learner with unsubmitted local work (instructor only)', () => {
    renderList(true, {
      currentActivityId: 'act1',
      roster: roster.map((m) => (m.userId === 'c' ? { ...m, workingOn: 'act1' } : m)),
    });
    expect(screen.getByTestId('live-room-working')).toBeInTheDocument();
  });

  it('shows the empty state when nobody is in the room', () => {
    render(
      <I18nProvider>
        <LiveRoomList
          rows={buildLiveRoomRows({ ranking: { ranked: [], waiting: [] }, answerers: [], roster: [] })}
          instructors={[]}
        />
      </I18nProvider>
    );
    expect(screen.queryAllByTestId('live-room-row')).toHaveLength(0);
    expect(screen.getByTestId('live-room-rows')).toBeInTheDocument();
  });
});
