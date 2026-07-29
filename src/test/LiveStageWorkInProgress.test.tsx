import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { ClassPresenceMember, StagedAnswer } from '@/types/liveClass';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';

/**
 * The professor pulls work in progress (ADR-4 revised), so BOTH surfaces have to
 * be honest about it: the stage must label a draft as a draft (the class can't
 * read a classmate's half-written attempt as a final answer), and the room list
 * must show everyone present with their state instead of hiding whoever hasn't
 * finished. Plus the peer-to-peer limitation surfacing as a message, not a
 * forever-spinner.
 */

// Monaco + the sandboxed preview iframe are irrelevant here and heavy in jsdom.
vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({ value }: { value: string }) => <pre data-testid="stage-code">{value}</pre>,
}));
vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: () => <div data-testid="stage-preview" />,
}));

const { LiveStage } = await import('@/components/live/LiveStage');
const { LiveRoomList } = await import('@/components/live/LiveRoomList');

const author = { userId: 'a', name: 'Alba', avatarUrl: null };

function renderStage(staged: StagedAnswer) {
  return render(
    <I18nProvider>
      <LiveStage staged={staged} />
    </I18nProvider>
  );
}

describe('LiveStage — work-in-progress labelling', () => {
  it('badges a draft as "em andamento" next to the author name', () => {
    renderStage({
      activityId: 'act-1',
      kind: 'code',
      content: 'const cor = "azul";',
      status: 'in_progress',
      author,
    });
    expect(screen.getByTestId('live-stage-status').textContent).toContain('Em andamento');
    expect(screen.getByTestId('live-stage-identity').textContent).toContain('Alba');
    expect(screen.getByTestId('stage-code').textContent).toBe('const cor = "azul";');
  });

  it('shows NO badge for a finished answer (nothing to disambiguate)', () => {
    renderStage({
      activityId: 'act-1',
      kind: 'answer',
      content: 'correct',
      status: 'submitted',
      author,
    });
    expect(screen.queryByTestId('live-stage-status')).toBeNull();
    expect(screen.getByTestId('live-stage-summary')).toBeTruthy();
  });

  it('renders an explicit empty state instead of a bogus "answered incorrectly"', () => {
    renderStage({
      activityId: 'act-1',
      kind: 'empty',
      content: '',
      status: 'not_started',
      author,
    });
    expect(screen.getByTestId('live-stage-empty').textContent).toContain('ainda não começou');
    expect(screen.queryByTestId('live-stage-summary')).toBeNull();
    expect(screen.getByTestId('live-stage-status').textContent).toContain('Ainda não começou');
  });
});

const roster: ClassPresenceMember[] = [
  { userId: 'prof', name: 'Prof', avatarUrl: null, isInstructor: true },
  { userId: 'a', name: 'Alba', avatarUrl: null, isInstructor: false },
  { userId: 'b', name: 'Bento', avatarUrl: null, isInstructor: false, workingOn: 'act-1' },
  { userId: 'c', name: 'Cauê', avatarUrl: null, isInstructor: false },
];

const ranking = {
  ranked: [{ userId: 'a', name: 'Alba', avatarUrl: null, totalMs: 4000, answeredCount: 1, correctCount: 1, rank: 1 }],
  waiting: [
    { userId: 'b', name: 'Bento', avatarUrl: null },
    { userId: 'c', name: 'Cauê', avatarUrl: null },
  ],
};
const answerers = [
  { userId: 'a', name: 'Alba', avatarUrl: null, state: 'done' as const },
  { userId: 'b', name: 'Bento', avatarUrl: null, state: 'pending' as const },
  { userId: 'c', name: 'Cauê', avatarUrl: null, state: 'pending' as const },
];

describe('buildLiveRoomRows', () => {
  it('keeps podium order first and the not-yet-ranked after it', () => {
    const rows = buildLiveRoomRows({ ranking, answerers, roster, currentActivityId: 'act-1' });
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b', 'c']);
  });

  it('separates answered / working / untouched from the signals available', () => {
    const rows = buildLiveRoomRows({ ranking, answerers, roster, currentActivityId: 'act-1' });
    expect(rows.find((r) => r.userId === 'a')!.state).toBe('done');
    expect(rows.find((r) => r.userId === 'b')!.working).toBe(true);
    expect(rows.find((r) => r.userId === 'c')!.working).toBe(false);
  });

  it('does not carry work from a PREVIOUS activity into the current one', () => {
    const rows = buildLiveRoomRows({ ranking, answerers, roster, currentActivityId: 'act-2' });
    expect(rows.every((r) => !r.working)).toBe(true);
  });
});

describe('room row — pull to stage', () => {
  function renderRoom(over: Partial<{ pending: string; unreachable: string }> = {}) {
    const onToggleStage = vi.fn();
    render(
      <I18nProvider>
        <LiveRoomList
          rows={buildLiveRoomRows({ ranking, answerers, roster, currentActivityId: 'act-1' })}
          instructors={roster.filter((m) => m.isInstructor)}
          showDetail
          actionsFor={(row) => ({
            onToggleStage,
            onStage: false,
            pending: over.pending === row.userId,
            unreachable: over.unreachable === row.userId,
          })}
        />
      </I18nProvider>
    );
    return { onToggleStage };
  }

  const openRow = (i: number) => fireEvent.click(screen.getAllByTestId('live-room-actions-open')[i]);

  it('offers the action on EVERY present learner, not just the ones who finished', () => {
    renderRoom();
    expect(screen.getAllByTestId('live-room-actions-open')).toHaveLength(3);
    expect(screen.getByTestId('live-room-working')).toBeInTheDocument();
  });

  it('pulls a learner who is still in progress', () => {
    const { onToggleStage } = renderRoom();
    openRow(1);
    fireEvent.click(screen.getByTestId('live-room-stage'));
    expect(onToggleStage).toHaveBeenCalledWith('b');
  });

  it('shows a spinner for the pull in flight and blocks a double pull', () => {
    const { onToggleStage } = renderRoom({ pending: 'b' });
    openRow(1);
    expect(screen.getByTestId('live-room-stage-pending')).toBeTruthy();
    fireEvent.click(screen.getByTestId('live-room-stage'));
    expect(onToggleStage).not.toHaveBeenCalled();
  });

  it('explains an unreachable learner instead of spinning forever', () => {
    renderRoom({ unreachable: 'c' });
    expect(screen.queryByTestId('live-room-stage-pending')).toBeNull();
    expect(screen.getByTestId('live-room-unreachable').textContent).toContain('Sem resposta');
  });
});
