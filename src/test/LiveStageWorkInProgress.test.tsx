import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { ClassPresenceMember, StagedAnswer } from '@/types/liveClass';
import { buildStagePickerLearners } from '@/utils/stagePickerLearners';

/**
 * The professor pulls work in progress (ADR-4 revised), so BOTH surfaces have to
 * be honest about it: the stage must label a draft as a draft (the class can't
 * read a classmate's half-written attempt as a final answer), and the picker must
 * list everyone present with their state instead of hiding whoever hasn't
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
const { LiveStagePicker } = await import('@/components/live/LiveStagePicker');

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

describe('buildStagePickerLearners', () => {
  it('keeps every present learner and drops only the instructor', () => {
    const rows = buildStagePickerLearners(roster, 'act-1', { a: true });
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b', 'c']);
  });

  it('tags submitted / in progress / not started from the signals available', () => {
    const rows = buildStagePickerLearners(roster, 'act-1', { a: true });
    expect(rows.find((r) => r.userId === 'a')!.state).toBe('submitted');
    expect(rows.find((r) => r.userId === 'b')!.state).toBe('in_progress');
    expect(rows.find((r) => r.userId === 'c')!.state).toBe('not_started');
  });

  it('does not carry work from a PREVIOUS activity into the current one', () => {
    const rows = buildStagePickerLearners(roster, 'act-2', undefined);
    expect(rows.every((r) => r.state === 'not_started')).toBe(true);
  });
});

describe('LiveStagePicker', () => {
  const learners = buildStagePickerLearners(roster, 'act-1', { a: true });

  function renderPicker(props: Partial<React.ComponentProps<typeof LiveStagePicker>> = {}) {
    const onPull = vi.fn();
    render(
      <I18nProvider>
        <LiveStagePicker
          learners={learners}
          staged={false}
          onPull={onPull}
          onClear={() => {}}
          {...props}
        />
      </I18nProvider>
    );
    return { onPull };
  }

  it('lists EVERY present learner, not just the ones who finished', () => {
    renderPicker();
    const rows = screen.getAllByTestId('live-stage-pull');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual([
      'submitted',
      'in_progress',
      'not_started',
    ]);
  });

  it('pulls a learner who is still in progress', () => {
    const { onPull } = renderPicker();
    fireEvent.click(screen.getAllByTestId('live-stage-pull')[1]);
    expect(onPull).toHaveBeenCalledWith('b');
  });

  it('shows a spinner for the pull in flight and blocks a double pull', () => {
    const { onPull } = renderPicker({ pendingUserId: 'b' });
    expect(screen.getByTestId('live-stage-pull-pending')).toBeTruthy();
    fireEvent.click(screen.getAllByTestId('live-stage-pull')[1]);
    expect(onPull).not.toHaveBeenCalled();
  });

  it('explains an unreachable learner instead of spinning forever', () => {
    renderPicker({ unreachableUserId: 'c' });
    expect(screen.queryByTestId('live-stage-pull-pending')).toBeNull();
    expect(screen.getByTestId('live-stage-pull-unreachable').textContent).toContain('Sem resposta');
  });
});
