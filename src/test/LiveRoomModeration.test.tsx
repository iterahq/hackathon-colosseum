import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveRoomList } from '@/components/live/LiveRoomList';
import { LiveRemovedScreen } from '@/components/live/LiveRemovedScreen';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import { rankByScore } from '@/utils/rankByScore';
import type { ClassAnswerer, ClassPresenceMember } from '@/types/liveClass';

/**
 * The professor's per-student menu: star (worth a podium point), unstar, lower
 * hand, stage and remove. The two that change durable state — star and remove —
 * are the ones this file guards hardest, because a misfire hits the wrong
 * student in front of the whole class.
 */

const roster: ClassPresenceMember[] = [
  { userId: 'p', name: 'Prof', avatarUrl: null, isInstructor: true },
  { userId: 'a', name: 'Ana', avatarUrl: null, isInstructor: false, handRaised: true },
  { userId: 'b', name: 'Bruno', avatarUrl: null, isInstructor: false },
];

const answerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana', avatarUrl: null, state: 'done', elapsedMs: 4000 },
  { userId: 'b', name: 'Bruno', avatarUrl: null, state: 'pending' },
];

function renderRoom(stars: Record<string, number> = {}) {
  const handlers = {
    onStar: vi.fn(),
    onLowerHand: vi.fn(),
    onRemove: vi.fn(),
    onToggleStage: vi.fn(),
  };
  const ranking = rankByScore(roster, { 'act-1': { a: 4000 } }, { 'act-1': { a: true } }, stars);
  render(
    <I18nProvider>
      <LiveRoomList
        rows={buildLiveRoomRows({ ranking, answerers, roster, currentActivityId: 'act-1' })}
        instructors={roster.filter((m) => m.isInstructor)}
        showDetail
        actionsFor={() => ({ ...handlers, onStage: false, pending: false, unreachable: false })}
      />
    </I18nProvider>
  );
  return handlers;
}

const openRow = (i: number) => fireEvent.click(screen.getAllByTestId('live-room-actions-open')[i]);

describe('per-student actions', () => {
  it('offers the five actions on one row', () => {
    renderRoom();
    openRow(0);
    expect(screen.getByTestId('live-room-star')).toBeTruthy();
    expect(screen.getByTestId('live-room-unstar')).toBeTruthy();
    expect(screen.getByTestId('live-room-lower-hand')).toBeTruthy();
    expect(screen.getByTestId('live-room-stage')).toBeTruthy();
    expect(screen.getByTestId('live-room-remove')).toBeTruthy();
  });

  it('fecha as ações no segundo clique do mesmo botão', () => {
    renderRoom();
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-actions-close'));
    expect(screen.queryByTestId('live-room-star')).toBeNull();
    expect(screen.getAllByTestId('live-room-actions-open').length).toBeGreaterThan(0);
  });

  it('gives and takes back a star on the learner of that row', () => {
    const { onStar } = renderRoom({ a: 1 });
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-star'));
    expect(onStar).toHaveBeenCalledWith('a', 1);
    fireEvent.click(screen.getByTestId('live-room-unstar'));
    expect(onStar).toHaveBeenCalledWith('a', -1);
  });

  it('cannot take back a star nobody has', () => {
    renderRoom();
    openRow(0);
    expect(screen.getByTestId('live-room-unstar')).toBeDisabled();
  });

  it('only lowers a hand that is up', () => {
    const { onLowerHand } = renderRoom();
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-lower-hand'));
    expect(onLowerHand).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByTestId('live-room-actions-close'));
    openRow(1);
    expect(screen.getByTestId('live-room-lower-hand')).toBeDisabled();
  });

  it('never removes on a single click — it confirms on the row first', () => {
    const { onRemove } = renderRoom();
    openRow(0);
    fireEvent.click(screen.getByTestId('live-room-remove'));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-room-remove-cancel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('live-room-remove-confirm'));
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('keeps the row order frozen while a menu is open, so nothing slides under the click', () => {
    const { rerender } = render(
      <I18nProvider>
        <LiveRoomList rows={[]} instructors={[]} showDetail />
      </I18nProvider>
    );
    const rowsFor = (stars: Record<string, number>) =>
      buildLiveRoomRows({
        ranking: rankByScore(roster, { 'act-1': { a: 4000 } }, { 'act-1': { a: true } }, stars),
        answerers,
        roster,
        currentActivityId: 'act-1',
      });
    const list = (stars: Record<string, number>) => (
      <I18nProvider>
        <LiveRoomList
          rows={rowsFor(stars)}
          instructors={roster.filter((m) => m.isInstructor)}
          showDetail
          actionsFor={() => ({
            onStar: vi.fn(),
            onLowerHand: vi.fn(),
            onRemove: vi.fn(),
            onToggleStage: vi.fn(),
            onStage: false,
            pending: false,
            unreachable: false,
          })}
        />
      </I18nProvider>
    );
    rerender(list({}));
    expect(screen.getAllByTestId('live-room-row')[0]).toHaveTextContent('Ana');
    openRow(0);
    // Bruno overtakes Ana mid-menu; the open row must stay where the finger is.
    rerender(list({ b: 5 }));
    expect(screen.getAllByTestId('live-room-row')[0]).toHaveTextContent('Ana');
  });

  it('thaws the order once the learner with the open menu is gone', () => {
    const later: ClassPresenceMember[] = [
      { userId: 'p', name: 'Prof', avatarUrl: null, isInstructor: true },
      { userId: 'b', name: 'Bruno', avatarUrl: null, isInstructor: false },
      { userId: 'c', name: 'Carla', avatarUrl: null, isInstructor: false },
    ];
    const list = (members: ClassPresenceMember[], stars: Record<string, number>) => (
      <I18nProvider>
        <LiveRoomList
          rows={buildLiveRoomRows({
            ranking: rankByScore(members, { 'act-1': { a: 4000 } }, { 'act-1': { a: true } }, stars),
            answerers,
            roster: members,
            currentActivityId: 'act-1',
          })}
          instructors={members.filter((m) => m.isInstructor)}
          showDetail
          actionsFor={() => ({
            onStar: vi.fn(),
            onLowerHand: vi.fn(),
            onRemove: vi.fn(),
            onToggleStage: vi.fn(),
            onStage: false,
            pending: false,
            unreachable: false,
          })}
        />
      </I18nProvider>
    );
    const { rerender } = render(list(roster, {}));
    openRow(0);
    // Ana is removed while her menu is open — nothing can close it, so the list
    // has to notice on its own or it stays frozen for the rest of the class.
    rerender(list(later, { c: 3 }));
    expect(screen.getAllByTestId('live-room-row')[0]).toHaveTextContent('Carla');
  });
});

describe('star points', () => {
  it('a star is worth a podium point', () => {
    const ranking = rankByScore(roster, { 'act-1': { a: 4000 } }, { 'act-1': { a: true } }, { b: 2 });
    expect(ranking.ranked.map((r) => r.userId)).toEqual(['b', 'a']);
    expect(ranking.ranked[0].stars).toBe(2);
    expect(ranking.ranked[0].correctCount).toBe(0);
  });

  it('ranks a starred learner who has not answered anything yet', () => {
    const ranking = rankByScore(roster, {}, {}, { b: 1 });
    expect(ranking.ranked.map((r) => r.userId)).toEqual(['b']);
    expect(ranking.waiting.map((w) => w.userId)).toEqual(['a']);
  });

  it('puts a star-only learner behind whoever earned the same points answering', () => {
    const ranking = rankByScore(roster, { 'act-1': { a: 4000 } }, { 'act-1': { a: true } }, { b: 1 });
    expect(ranking.ranked.map((r) => r.userId)).toEqual(['a', 'b']);
  });

  it('floors a negative balance at zero instead of ranking below nothing', () => {
    const ranking = rankByScore(roster, {}, {}, { b: -3 });
    expect(ranking.ranked).toHaveLength(0);
    expect(ranking.waiting.map((w) => w.userId)).toEqual(['a', 'b']);
  });
});

describe('removed screen', () => {
  it('tells the learner the class ended for them, with a way out', () => {
    const onLeave = vi.fn();
    render(
      <I18nProvider>
        <LiveRemovedScreen onLeave={onLeave} />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-removed')).toBeTruthy();
    fireEvent.click(screen.getByTestId('live-removed-leave'));
    expect(onLeave).toHaveBeenCalled();
  });
});
