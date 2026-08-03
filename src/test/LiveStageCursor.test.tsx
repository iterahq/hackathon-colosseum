import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { StageCursor, StagedAnswer } from '@/types/liveClass';
import {
  STAGE_CURSOR_MIRROR_SELECTOR,
  STAGE_CURSOR_SOURCE_SELECTOR,
} from '@/utils/stageCursorDom';

const caretApplied: ({ line: number; column: number } | null)[] = [];

vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({
    value,
    remoteCaret,
  }: {
    value: string;
    remoteCaret?: { line: number; column: number } | null;
  }) => {
    caretApplied.push(remoteCaret ?? null);
    return <pre data-testid="stage-code">{value}</pre>;
  },
}));
vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: () => <div data-testid="stage-preview" />,
}));

const { LiveStage } = await import('@/components/live/LiveStage');
const { CodeSnackPane } = await import('@/components/branded/activity/code/CodeSnackPane');

const staged: StagedAnswer = {
  activityId: 'act-1',
  kind: 'code',
  content: 'const cor = "azul";',
  status: 'in_progress',
  author: { userId: 'u-alba', name: 'Alba', avatarUrl: null },
};

const cursor = (over: Partial<StageCursor> = {}): StageCursor => ({
  activityId: 'act-1',
  userId: 'u-alba',
  x: 0.4,
  y: 0.6,
  visible: true,
  caret: null,
  t: 1,
  ...over,
});

const mount = (props: Partial<Parameters<typeof LiveStage>[0]> = {}) =>
  render(
    <I18nProvider>
      <LiveStage staged={staged} {...props} />
    </I18nProvider>
  );

describe('LiveStage — the mirrored cursor', () => {
  it('draws nothing when there is no cursor yet', () => {
    mount();
    expect(screen.queryByTestId('stage-cursor')).toBeNull();
  });

  it('draws the pointer at the normalized position, inside the mirror pane', () => {
    const { container } = mount({ cursor: cursor({ x: 0.25, y: 0.5 }) });
    const el = screen.getByTestId('stage-cursor');
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('50%');
    // Positioned against the mirror pane — NOT the page — or the whole
    // normalization is meaningless on a different screen size.
    const pane = container.querySelector(STAGE_CURSOR_MIRROR_SELECTOR);
    expect(pane).not.toBeNull();
    expect(pane!.contains(el)).toBe(true);
    expect(pane!.className).toContain('relative');
  });

  it('names whose pointer it is', () => {
    mount({ cursor: cursor() });
    expect(screen.getByTestId('stage-cursor-label').textContent).toBe('Alba');
  });

  it('is visibly LARGER than a system pointer (a ~12×19px arrow)', () => {
    mount({ cursor: cursor() });
    const el = screen.getByTestId('stage-cursor');
    // Plan V5 asks for ≥ 1.4× the baseline; this is ~2.3×.
    expect(parseInt(el.style.width, 10)).toBeGreaterThanOrEqual(Math.ceil(12 * 1.4));
  });

  it('DISAPPEARS the moment the pointer leaves the exercise — the privacy assertion', () => {
    const { rerender } = mount({ cursor: cursor() });
    expect(screen.queryByTestId('stage-cursor')).not.toBeNull();
    rerender(
      <I18nProvider>
        <LiveStage staged={staged} cursor={cursor({ visible: false })} />
      </I18nProvider>
    );
    expect(screen.queryByTestId('stage-cursor')).toBeNull();
  });

  it('never eats a click on the mirror', () => {
    mount({ cursor: cursor() });
    expect(screen.getByTestId('stage-cursor').className).toContain('pointer-events-none');
  });

  it('forwards the caret to the read-only editor', () => {
    caretApplied.length = 0;
    mount({ cursor: cursor({ caret: { line: 12, column: 3 } }) });
    expect(caretApplied.at(-1)).toEqual({ line: 12, column: 3 });
  });

  it('says so out loud when the room is too big to mirror a cursor', () => {
    mount({ cursorOff: true });
    expect(screen.getByTestId('live-stage-cursor-off').textContent).toContain(
      'Espelho de cursor desligado'
    );
  });

  it('stays quiet about the cursor when the mirror is on', () => {
    mount({ cursor: cursor() });
    expect(screen.queryByTestId('live-stage-cursor-off')).toBeNull();
  });
});

describe('the emitter and the mirror describe the SAME pane', () => {
  /**
   * Normalized 0..1 coordinates are only honest between containers of equal
   * shape (plan ADR-4). The two panes are declared in different files, so this
   * guard is what stops one of them being restyled alone — the failure that
   * would follow is a cursor landing consistently a few pixels off, which reads
   * as "the feature is a bit broken" rather than as a regression anyone can
   * bisect.
   */
  it('both panes carry their marker and the same geometry classes', () => {
    const { container: mirror } = mount({ cursor: cursor() });
    const mirrorPane = mirror.querySelector(STAGE_CURSOR_MIRROR_SELECTOR) as HTMLElement;

    const { container: source } = render(
      <I18nProvider>
        <CodeSnackPane
          activity={
            {
              id: 'act-1',
              kind: 'code',
              title: 'x',
              status: 'todo',
              spec: {},
            } as never
          }
          spec={{ prompt: 'p', starter: '' } as never}
          onComplete={() => {}}
        />
      </I18nProvider>
    );
    const sourcePane = source.querySelector(STAGE_CURSOR_SOURCE_SELECTOR) as HTMLElement;

    expect(mirrorPane).not.toBeNull();
    expect(sourcePane).not.toBeNull();
    for (const cls of ['h-[360px]', 'overflow-hidden', 'rounded-2xl']) {
      expect(sourcePane.className).toContain(cls);
      expect(mirrorPane.className).toContain(cls);
    }
  });
});
