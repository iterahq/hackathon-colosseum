import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import type { Activity, ActivityKind } from '@/types/content';
import type { StagedAnswer } from '@/types/liveClass';

/**
 * Two defects reported from a real class (Tainan, 2026-08-11), both around
 * "projetar minha tela":
 *
 *  1. GRAVE — the professor could no longer touch the exercise. The freeze was
 *     `revealCurrent` (clock stopped or expired) turning their OWN stage `inert`
 *     on a `code` activity, which has NOTHING to reveal (`hasRevealableAnswer`
 *     excludes it, which is why it has no Reveal button either). So the freeze
 *     bought nothing and never lifted — `stoppedFor`/`expiredFor` only clear on
 *     an activity change or a fresh future-deadline timer.
 *  2. The class saw "Nada para projetar desta atividade ainda." The learner
 *     surface was the only one not passing `activity` to `LiveStage`, so an
 *     `empty` pull (every kind `gatherStageContent` has no signal for) had
 *     nothing to fall back to.
 */

const LESSON_ID = 'lesson-1';
const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';
const ME = 'user-1';

function activity(kind: ActivityKind, spec: Record<string, unknown> = {}): Activity {
  return { id: ACTIVITY_ID, lessonId: LESSON_ID, ordinal: 0, kind, spec, rubric: null };
}

// BYOC is a LAYER, not a kind — it usually rides a `concept`, which answers
// `hasRevealableAnswer` with false. It gets its gabarito on screen anyway, so it
// has to keep the freeze the kind alone would not give it.
const BYOC_SPEC = {
  byoc: {
    seed: { prompt: 'Conte um hobby seu.' },
    harness: { interaction: 'pick_best', generation_prompt: 'Monte sobre {seed}' },
  },
};

const useLessonContent = vi.fn();
const useClassSession = vi.fn();
const useClassSessionById = vi.fn();

vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  usePrograms: () => ({ data: [], isPending: false }),
  useProgram: () => ({ data: null, isPending: false }),
}));
vi.mock('@/hooks/useClassSession', () => ({ useClassSession: () => useClassSession() }));
vi.mock('@/hooks/useLiveClass', () => ({
  useMySessions: () => ({ data: [], isPending: false, refetch: vi.fn() }),
  useClassSessionById: () => useClassSessionById(),
  useClassCompleters: () => ({ data: [] }),
  useLiveClassEnabled: () => ({ data: true, isPending: false }),
  useEnabledTenantIds: () => ({ data: ['tenant-1'] }),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({
  useIteraIdentity: () => ({ userId: ME, name: 'Prof', avatarUrl: null }),
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({ data: [{ tenantId: 'tenant-1', role: 'instructor' }] }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { displayName: 'Prof', email: 'a@b.c' }, isLoading: false }),
}));
vi.mock('@/hooks/useLiveSound', () => ({
  useLiveSound: () => ({
    onAdvance: vi.fn(),
    onAnswer: vi.fn(),
    onWarn: vi.fn(),
    onTimeUp: vi.fn(),
    onSubmit: vi.fn(),
    muted: false,
    toggle: vi.fn(),
  }),
}));
vi.mock('@/services/membership.service', () => ({
  isInstructor: () => false,
  instructorTenantId: () => 'tenant-1',
}));
vi.mock('@/services/classReport.service', () => ({
  recordClassAttendance: vi.fn(),
  recordClassAnswer: vi.fn(),
}));
vi.mock('@/services/progress.service', () => ({ persistActivityProgress: vi.fn() }));
// A BYOC harness only resolves on a deploy that has the itera-api configured;
// unset, `isByocActivity` is false everywhere and the BYOC cases below would
// pass while testing nothing.
vi.mock('@/api/iteraApi', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  iteraApiConfigured: () => true,
}));
vi.mock('@/services/guestLink.service', () => ({
  ensureSessionGuestCode: vi.fn(async () => ({ code: null })),
  getSessionGuestCode: vi.fn(async () => ({ available: false })),
  listSessionGuestUserIds: vi.fn(async () => []),
}));

// The two stages are stubbed: this file asserts the PROPS the pages wire into
// them, which is exactly where both defects lived.
const stageProps: { readOnly?: boolean }[] = [];
vi.mock('@/components/live/LiveActivityStage', () => ({
  LiveActivityStage: (p: { readOnly?: boolean }) => {
    stageProps.push(p);
    return <div data-testid="stub-activity-stage" />;
  },
}));
const liveStageProps: { activity?: Activity | null }[] = [];
vi.mock('@/components/live/LiveStage', () => ({
  LiveStage: (p: { activity?: Activity | null }) => {
    liveStageProps.push(p);
    return <div data-testid="stub-live-stage" />;
  },
}));

// Import AFTER the mocks are registered.
import LiveSessionPage from '@/pages/LiveSessionPage';
import InstructorSessionPage from '@/pages/live/InstructorSessionPage';
import { stageCursorPlan } from '@/utils/stageCursorRate';

function stagedBy(userId: string): StagedAnswer {
  return {
    activityId: ACTIVITY_ID,
    kind: 'empty',
    content: '',
    status: 'not_started',
    author: { userId, name: userId === ME ? 'Prof' : 'Aluna', avatarUrl: null },
  };
}

function mockLive(
  kind: ActivityKind,
  over: {
    stoppedFor?: string | null;
    stagedAnswer?: StagedAnswer | null;
    spec?: Record<string, unknown>;
  } = {}
) {
  const { spec, ...session } = over;
  useLessonContent.mockReturnValue({
    data: { id: LESSON_ID, title: { pt: 'Componentes' }, activities: [activity(kind, spec)] },
    isPending: false,
  });
  useClassSession.mockReturnValue({
    session: { id: 'sess-1', lessonId: LESSON_ID, instructorId: ME, status: 'live' },
    currentActivityId: ACTIVITY_ID,
    status: 'live',
    roster: [],
    connected: true,
    reconnecting: false,
    loading: false,
    timer: null,
    stoppedFor: null,
    answers: {},
    elapsed: {},
    stagedAnswer: null,
    stageCursor: null,
    stageCursorPlan: stageCursorPlan(1),
    isStageCursorSource: false,
    sendStageCursor: vi.fn(),
    isInstructorCursorSource: false,
    sendInstructorCursor: vi.fn(),
    instructorCursor: null,
    instructorClick: null,
    stagePendingUserId: null,
    stageUnreachableUserId: null,
    lowerHand: vi.fn(),
    removeLearner: vi.fn(),
    setBreak: vi.fn(),
    broadcastAnswer: vi.fn(),
    setHandRaised: vi.fn(),
    setWorkingOn: vi.fn(),
    broadcast: vi.fn(),
    broadcastTimer: vi.fn(),
    clearTimer: vi.fn(),
    requestStage: vi.fn(),
    clearStage: vi.fn(),
    refetch: vi.fn(),
    ...session,
  });
  useClassSessionById.mockReturnValue({
    data: {
      id: 'sess-1',
      tenantId: 'tenant-1',
      lessonId: LESSON_ID,
      instructorId: ME,
      status: 'live',
      startedAt: '2026-08-11T14:00:00.000Z',
      createdAt: '2026-08-11T14:00:00.000Z',
    },
    isPending: false,
  });
}

function renderInstructor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/live/instructor/sess-1']}>
        <I18nProvider>
          <Routes>
            <Route path="/live/instructor" element={<div data-testid="index-route" />} />
            <Route path="/live/instructor/:sessionId" element={<InstructorSessionPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  expect(screen.getByTestId('stub-activity-stage')).toBeInTheDocument();
  return stageProps[stageProps.length - 1];
}

function renderLearner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <I18nProvider>
          <LiveSessionPage />
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return liveStageProps[liveStageProps.length - 1];
}

beforeEach(() => {
  stageProps.length = 0;
  liveStageProps.length = 0;
  useLessonContent.mockReset();
  useClassSession.mockReset();
  useClassSessionById.mockReset();
});

describe("InstructorSessionPage — the professor's own stage stays usable", () => {
  it('does NOT freeze a code exercise when the clock stops — there is no answer to protect', () => {
    mockLive('code', { stoppedFor: ACTIVITY_ID });
    expect(renderInstructor().readOnly).toBe(false);
  });

  it('does NOT freeze while the professor is the one being projected', () => {
    mockLive('single_choice', { stoppedFor: ACTIVITY_ID, stagedAnswer: stagedBy(ME) });
    expect(renderInstructor().readOnly).toBe(false);
  });

  it('still freezes a revealed multiple choice — the shown solution must not be fiddled', () => {
    mockLive('single_choice', { stoppedFor: ACTIVITY_ID });
    expect(renderInstructor().readOnly).toBe(true);
  });

  it('keeps chat_sandbox interactive, as it always was', () => {
    mockLive('chat_sandbox', { stoppedFor: ACTIVITY_ID });
    expect(renderInstructor().readOnly).toBe(false);
  });

  it('leaves the stage interactive while the clock is still running', () => {
    mockLive('single_choice');
    expect(renderInstructor().readOnly).toBe(false);
  });

  it('still freezes a revealed BYOC round, whose kind alone says there is nothing to reveal', () => {
    mockLive('concept', { stoppedFor: ACTIVITY_ID, spec: BYOC_SPEC });
    expect(renderInstructor().readOnly).toBe(true);
  });

  it('stays interactive after the professor stops projecting themselves', () => {
    mockLive('code', { stoppedFor: ACTIVITY_ID, stagedAnswer: stagedBy(ME) });
    renderInstructor();
    cleanup();
    // O professor volta a ser só o professor: sem a tela dele projetada, o
    // `code` continua sem gabarito a proteger, e o palco não pode congelar.
    mockLive('code', { stoppedFor: ACTIVITY_ID, stagedAnswer: null });
    expect(renderInstructor().readOnly).toBe(false);
  });
});

describe('LiveSessionPage — the class mirrors the activity instead of an empty state', () => {
  it('hands the current activity to the stage so an `empty` pull has a fallback', () => {
    mockLive('single_choice', { stagedAnswer: stagedBy('learner-2') });
    expect(renderLearner().activity).toMatchObject({ id: ACTIVITY_ID, kind: 'single_choice' });
  });
});
