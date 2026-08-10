import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { StageCursor, StagedAnswer } from '@/types/liveClass';
import {
  STAGE_CURSOR_MIRROR_SELECTOR,
  STAGE_CURSOR_SOURCE_SELECTOR,
} from '@/utils/stageCursorDom';
import { CODE_PANE_BOX, CODE_SPLIT_EDITOR, CODE_SPLIT_GRID } from '@/utils/codeStageGeometry';

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

  it('places in PIXELS of the emitter pane once the frame carries its size', () => {
    // The mirror is a different size from the emitter and Monaco's font is not,
    // so percent would land on a different LINE on the projector. Measured on the
    // 06/08 layout: y=0.5 was line 10 for the learner, line 14 on the palco.
    mount({ cursor: cursor({ x: 0.5, y: 0.25, paneW: 900, paneH: 480 }) });
    const el = screen.getByTestId('stage-cursor');
    expect(el.style.left).toBe('450px');
    expect(el.style.top).toBe('120px');
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

describe('the emitter and the mirror keep the same pane SHAPE', () => {
  /**
   * The panes are declared in different files, so this guard is what stops one of
   * them being restyled alone. Shape, not size: px placement already absorbs the
   * size gap, but it assumes the two boxes have the same ASPECT — restyle one
   * pane's height or grid span alone and normalized x/y start meaning different
   * things on each side, which reads as "the feature is a bit off" rather than as
   * a regression anyone can bisect.
   *
   * ⚠️ What this can and cannot catch. Both sides import the same constant, so the
   * guard detects DIVERGENCE (someone hardcodes one pane again) — it cannot tell
   * whether the shared value is the RIGHT one. It also compares the tokens as
   * whole strings, so it only holds while the geometry stays contiguous in one
   * module; split `CODE_PANE_BOX` across two constants and the assertion keeps
   * passing on the half it still knows about.
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
    for (const cls of CODE_PANE_BOX.split(' ')) {
      expect(sourcePane.className).toContain(cls);
      expect(mirrorPane.className).toContain(cls);
    }
  });

  /**
   * The WIDTH half of the same contract, and the one the old guard missed: the
   * pane box fixes the height, but each pane is a fifth-based grid child, so a
   * 60/40 split on one side against 50/50 on the other would skew normalized x
   * with both panes still passing the box assertion above.
   */
  it('both panes sit in a grid child of the same span', () => {
    const { container: mirror } = mount({ cursor: cursor() });
    const mirrorPane = mirror.querySelector(STAGE_CURSOR_MIRROR_SELECTOR) as HTMLElement;

    const { container: source } = render(
      <I18nProvider>
        <CodeSnackPane
          activity={{ id: 'act-1', kind: 'code', title: 'x', status: 'todo', spec: {} } as never}
          spec={{ prompt: 'p', starter: '' } as never}
          onComplete={() => {}}
        />
      </I18nProvider>
    );
    const sourcePane = source.querySelector(STAGE_CURSOR_SOURCE_SELECTOR) as HTMLElement;

    // `classList` holds raw tokens, so the arbitrary-variant colon needs no
    // escaping the way a CSS selector would.
    const gridOf = (pane: HTMLElement) => {
      let el: HTMLElement | null = pane;
      while (el && !el.classList.contains(CODE_SPLIT_EDITOR)) el = el.parentElement;
      expect(el).not.toBeNull();
      return el?.parentElement?.className ?? '';
    };

    expect(gridOf(sourcePane)).toContain(CODE_SPLIT_GRID);
    expect(gridOf(mirrorPane)).toContain(CODE_SPLIT_GRID);
  });
});
