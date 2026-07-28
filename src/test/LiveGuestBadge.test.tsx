import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveRoomList } from '@/components/live/LiveRoomList';
import { LivePodium } from '@/components/live/LivePodium';
import { rankByScore } from '@/utils/rankByScore';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import type { ClassAnswerer, ClassPresenceMember, ClassRanking } from '@/types/liveClass';

/**
 * The guest badge is LOAD-BEARING (plan 20260728-itera-guest-link-aula-sincrona,
 * ADR-9 + ADR-11). Guest names are self-declared with no uniqueness check, so a
 * guest may type the exact display name of a real student — ADR-11 accepts that
 * collision *because* the badge carries the distinction. Drop the badge from any
 * surface a guest appears on and that surface becomes silent impersonation.
 *
 * The fixtures below deliberately give the guest and a real learner the SAME
 * name so a regression that loses the badge fails here instead of in a demo.
 */

const roster: ClassPresenceMember[] = [
  { userId: 'p', name: 'Prof', avatarUrl: null, isInstructor: true },
  { userId: 'a', name: 'Ana Souza', avatarUrl: null, isInstructor: false },
  { userId: 'g1', name: 'Ana Souza', avatarUrl: null, isInstructor: false, isGuest: true },
];

const ranking: ClassRanking = {
  ranked: [
    { userId: 'g1', name: 'Ana Souza', avatarUrl: null, totalMs: 6000, answeredCount: 2, correctCount: 2, rank: 1, isGuest: true },
    { userId: 'a', name: 'Ana Souza', avatarUrl: null, totalMs: 9000, answeredCount: 2, correctCount: 2, rank: 2 },
  ],
  waiting: [{ userId: 'g2', name: 'Visitante', avatarUrl: null, isGuest: true }],
};

const answerers: ClassAnswerer[] = [
  { userId: 'g1', name: 'Ana Souza', avatarUrl: null, state: 'done' },
  { userId: 'a', name: 'Ana Souza', avatarUrl: null, state: 'done' },
  { userId: 'g2', name: 'Visitante', avatarUrl: null, state: 'pending' },
];

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe('guest badge — reception', () => {
  it('badges the guest chip and leaves real learners unbadged', () => {
    wrap(<LiveReception roster={roster} />);
    expect(screen.getAllByTestId('live-guest-badge')).toHaveLength(1);
  });

  it('badges from the DURABLE class_guests list even when presence does not say so', () => {
    const lying: ClassPresenceMember[] = [
      { userId: 'a', name: 'Ana Souza', avatarUrl: null, isInstructor: false },
      // presence payload omits isGuest — the client could simply not send it.
      { userId: 'g1', name: 'Ana Souza', avatarUrl: null, isInstructor: false },
    ];
    wrap(<LiveReception roster={lying} guestUserIds={['g1']} />);
    expect(screen.getAllByTestId('live-guest-badge')).toHaveLength(1);
  });

  it('renders no badge when nobody is a guest', () => {
    wrap(<LiveReception roster={roster.filter((m) => !m.isGuest)} />);
    expect(screen.queryAllByTestId('live-guest-badge')).toHaveLength(0);
  });
});

describe('guest badge — live room list', () => {
  const roomList = (r: ClassRanking, guestUserIds?: string[], showDetail = false) => (
    <LiveRoomList
      rows={buildLiveRoomRows({ ranking: r, answerers, roster, guestUserIds })}
      instructors={[]}
      showDetail={showDetail}
    />
  );

  it('badges the guest on the ranked row AND the waiting row, and counts them', () => {
    wrap(roomList(ranking));
    expect(screen.getAllByTestId('live-guest-badge')).toHaveLength(2);
    expect(screen.getByTestId('live-guest-count')).toHaveTextContent('2');
  });

  it('merges the durable guest list over the per-row flag (instructor view)', () => {
    const plain: ClassRanking = {
      ranked: ranking.ranked.map(({ isGuest: _drop, ...r }) => r),
      waiting: ranking.waiting.map(({ isGuest: _drop, ...w }) => w),
    };
    wrap(roomList(plain, ['g1', 'g2'], true));
    expect(screen.getAllByTestId('live-guest-badge')).toHaveLength(2);
  });

  it('shows no guest counter when the room has no guests', () => {
    const plain: ClassRanking = {
      ranked: ranking.ranked.map(({ isGuest: _drop, ...r }) => r),
      waiting: [],
    };
    wrap(roomList(plain));
    expect(screen.queryByTestId('live-guest-count')).toBeNull();
    expect(screen.queryAllByTestId('live-guest-badge')).toHaveLength(0);
  });
});

describe('guest badge — podium', () => {
  it('badges a guest who WON the podium (ADR-9 lets them out-rank real students)', () => {
    wrap(<LivePodium ranking={ranking} selfUserId="a" />);
    const first = screen
      .getAllByTestId('live-podium-place')
      .find((el) => el.getAttribute('data-rank') === '1');
    expect(first).toBeTruthy();
    expect(first!.querySelector('[data-testid="live-guest-badge"]')).toBeTruthy();
  });

  it('badges guests in the overflow rows below the top three', () => {
    const long: ClassRanking = {
      ranked: [
        ...ranking.ranked,
        { userId: 'x', name: 'Caio', avatarUrl: null, totalMs: 11000, answeredCount: 1, correctCount: 1, rank: 3 },
        { userId: 'g3', name: 'Duda', avatarUrl: null, totalMs: 12000, answeredCount: 1, correctCount: 1, rank: 4, isGuest: true },
      ],
      waiting: [],
    };
    wrap(<LivePodium ranking={long} />);
    const rows = screen.getAllByTestId('live-podium-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-testid="live-guest-badge"]')).toBeTruthy();
  });
});

describe('rankByScore', () => {
  it('carries isGuest all the way through ranking so the podium can badge it', () => {
    const result = rankByScore(roster, { act1: { g1: 4000, a: 8000 } }, { act1: { g1: true, a: true } });
    const guest = result.ranked.find((r) => r.userId === 'g1');
    const real = result.ranked.find((r) => r.userId === 'a');
    expect(guest?.isGuest).toBe(true);
    expect(real?.isGuest).toBeFalsy();
    // The guest legitimately wins on time — ADR-9 accepts that; the badge is
    // what keeps it honest.
    expect(result.ranked[0].userId).toBe('g1');
  });

  it('carries isGuest onto learners who have not answered yet (waiting list)', () => {
    const result = rankByScore(roster, {}, {});
    expect(result.waiting.find((w) => w.userId === 'g1')?.isGuest).toBe(true);
  });
});
