import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import {
  columnMaxWidthClass,
  LIVE_COLUMN_OVERRIDES,
  WIDE_COLUMN_KINDS,
} from '@/utils/activityColumnWidth';
import type { Activity, ActivityKind } from '@/types/content';

/**
 * LIVE-CLASS column width follows the ACTIVITY KIND — the SAME rule the solo
 * player uses.
 *
 * REGRESSION THIS FILE EXISTS FOR: the widening shipped only inside
 * `LessonPlayer` (the async study path), while the SYNCHRONOUS class — the
 * surface an entire cohort stares at — kept its own hard-coded ternary and left
 * a `code` snack squeezed at `max-w-2xl` (each Monaco pane ~280px, starter line
 * wrapping 4x). A test on the pure helper alone would NOT have caught it: the
 * helper was already correct, it just was not wired into these pages. So the
 * cases below RENDER the real live pages and read the real DOM class list.
 */

/* ── Pure rule ───────────────────────────────────────────────────────────── */

describe('columnMaxWidthClass — the shared rule', () => {
  it('widens `code` to max-w-7xl', () => {
    expect(columnMaxWidthClass('code')).toBe('max-w-7xl');
  });

  it('keeps the prose measure for every non-wide kind', () => {
    const narrow: ActivityKind[] = [
      'diagram',
      'document',
      'quiz',
      'concept',
      'single_choice',
      'multi_choice',
      'match',
      'order',
      'video',
      'sandbox_scenario',
    ];
    for (const kind of narrow) expect(columnMaxWidthClass(kind)).toBe('max-w-2xl');
  });

  it('falls back to the prose measure when there is no activity on screen', () => {
    expect(columnMaxWidthClass(undefined)).toBe('max-w-2xl');
    expect(columnMaxWidthClass(undefined, LIVE_COLUMN_OVERRIDES)).toBe('max-w-2xl');
  });

  it('applies a surface override only to the kind it names', () => {
    expect(columnMaxWidthClass('sandbox_scenario', LIVE_COLUMN_OVERRIDES)).toBe('max-w-4xl');
    expect(columnMaxWidthClass('quiz', LIVE_COLUMN_OVERRIDES)).toBe('max-w-2xl');
  });

  it('does NOT let a surface override re-narrow `code` — the exact regression guarded here', () => {
    expect(columnMaxWidthClass('code', { code: 'max-w-2xl' })).toBe('max-w-7xl');
    expect(WIDE_COLUMN_KINDS.has('code')).toBe(true);
  });
});

/* ── Shared mocks for both live surfaces ─────────────────────────────────── */

const LESSON_ID = 'lesson-1';
const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';

function activity(kind: ActivityKind): Activity {
  return { id: ACTIVITY_ID, lessonId: LESSON_ID, ordinal: 0, kind, spec: {}, rubric: null };
}

const useLessonContent = vi.fn();
const useClassSession = vi.fn();
const useMySessions = vi.fn();
const useClassSessionById = vi.fn();

vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  usePrograms: () => ({ data: [], isPending: false }),
  useProgram: () => ({ data: null, isPending: false }),
}));
vi.mock('@/hooks/useClassSession', () => ({ useClassSession: () => useClassSession() }));
vi.mock('@/hooks/useLiveClass', () => ({
  useMySessions: () => useMySessions(),
  useClassSessionById: () => useClassSessionById(),
  useClassCompleters: () => ({ data: [] }),
  useLiveClassEnabled: () => ({ data: true, isPending: false }),
  useEnabledTenantIds: () => ({ data: ['tenant-1'] }),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({
  useIteraIdentity: () => ({ userId: 'user-1', name: 'Aluna', avatarUrl: null }),
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({ data: [{ tenantId: 'tenant-1', role: 'instructor' }] }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { displayName: 'Aluna Real', email: 'a@b.c' }, isLoading: false }),
}));
vi.mock('@/hooks/useLiveSound', () => ({
  useLiveSound: () => ({
    onAdvance: vi.fn(),
    onAnswer: vi.fn(),
    onWarn: vi.fn(),
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

// The stage is stubbed: this file asserts the COLUMN, not the activity body.
vi.mock('@/components/live/LiveActivityStage', () => ({
  LiveActivityStage: () => <div data-testid="stub-stage" />,
}));

// Import AFTER the mocks are registered.
import LiveSessionPage from '@/pages/LiveSessionPage';
// The instructor activity column moved to the routed session view (plan
// 20260723-itera-live-routed-session-and-index) — the index no longer renders
// the live session inline.
import InstructorSessionPage from '@/pages/live/InstructorSessionPage';
import { stageCursorPlan } from '@/utils/stageCursorRate';

function mockLive(kind: ActivityKind) {
  useLessonContent.mockReturnValue({
    data: { id: LESSON_ID, title: { pt: 'Componentes' }, activities: [activity(kind)] },
    isPending: false,
  });
  useClassSession.mockReturnValue({
    session: { id: 'sess-1', lessonId: LESSON_ID, instructorId: 'instructor-9', status: 'live' },
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
    // The cursor mirror is part of the hook's contract (plan
    // 20260728-…): a mock that omits `stageCursorPlan` makes the page
    // crash on `.intervalMs`, which is the mock lying, not the page.
    stageCursor: null,
    stageCursorPlan: stageCursorPlan(1),
    isStageCursorSource: false,
    sendStageCursor: vi.fn(),
    stagePendingUserId: null,
    stageUnreachableUserId: null,
    broadcastAnswer: vi.fn(),
    setHandRaised: vi.fn(),
    setWorkingOn: vi.fn(),
    broadcast: vi.fn(),
    broadcastTimer: vi.fn(),
    clearTimer: vi.fn(),
    requestStage: vi.fn(),
    clearStage: vi.fn(),
    refetch: vi.fn(),
  });
  useMySessions.mockReturnValue({
    data: [{ id: 'sess-1', lessonId: LESSON_ID, instructorId: 'user-1', status: 'live' }],
    isPending: false,
    refetch: vi.fn(),
  });
  // The routed instructor session view loads the session by id (RLS-scoped).
  useClassSessionById.mockReturnValue({
    data: {
      id: 'sess-1',
      tenantId: 'tenant-1',
      lessonId: LESSON_ID,
      instructorId: 'user-1',
      status: 'live',
      startedAt: '2026-07-23T14:00:00.000Z',
      createdAt: '2026-07-23T14:00:00.000Z',
    },
    isPending: false,
  });
}

function wrap(node: React.ReactNode) {
  // The instructor surface reaches for the query client (cache invalidation on
  // advance); a throwaway one keeps the render honest without any network.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <I18nProvider>{node}</I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderLearner() {
  wrap(<LiveSessionPage />);
  return screen.getByTestId('live-main');
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
  return screen.getByTestId('instructor-main');
}

beforeEach(() => {
  useLessonContent.mockReset();
  useClassSession.mockReset();
  useMySessions.mockReset();
  useClassSessionById.mockReset();
});

/* ── Learner surface — where tomorrow's cohort actually sits ─────────────── */

describe('LiveSessionPage — focused column width by activity kind', () => {
  it('widens the column for a code activity IN THE LIVE CLASS', () => {
    mockLive('code');
    const main = renderLearner();
    expect(main.className).toContain('max-w-7xl');
    expect(main.className).not.toContain('max-w-2xl');
  });

  it('keeps sandbox_scenario at its live-only max-w-4xl', () => {
    mockLive('sandbox_scenario');
    const main = renderLearner();
    expect(main.className).toContain('max-w-4xl');
    expect(main.className).not.toContain('max-w-7xl');
  });

  it('keeps every other kind at the prose measure', () => {
    mockLive('quiz');
    const main = renderLearner();
    expect(main.className).toContain('max-w-2xl');
    expect(main.className).not.toContain('max-w-7xl');
  });

  it('stays responsive — the column is width-capped, never fixed-width', () => {
    mockLive('code');
    const main = renderLearner();
    // `w-full` + `max-w-*` = shrink-to-viewport below the cap. A `w-[1280px]`
    // rule would overflow small screens horizontally.
    expect(main.className).toContain('w-full');
    expect(main.className).toContain('mx-auto');
    expect(main.className).not.toMatch(/\bw-\[/);
    expect(main.getAttribute('style')).toBeNull();
  });
});

/* ── Instructor surface — the professor projects the same snack ──────────── */

describe('InstructorSessionPage — focused column width by activity kind', () => {
  it('widens the column for a code activity', () => {
    mockLive('code');
    const main = renderInstructor();
    expect(main.className).toContain('max-w-7xl');
    expect(main.className).not.toContain('max-w-2xl');
  });

  it('keeps sandbox_scenario at max-w-4xl with its own vertical rhythm', () => {
    mockLive('sandbox_scenario');
    const main = renderInstructor();
    expect(main.className).toContain('max-w-4xl');
    expect(main.className).toContain('py-6');
    expect(main.className).not.toContain('my-auto');
  });

  it('keeps every other kind at the prose measure and its original rhythm', () => {
    mockLive('quiz');
    const main = renderInstructor();
    expect(main.className).toContain('max-w-2xl');
    expect(main.className).toContain('my-auto');
    expect(main.className).toContain('py-10');
  });

  it('stays responsive — the column is width-capped, never fixed-width', () => {
    mockLive('code');
    const main = renderInstructor();
    expect(main.className).toContain('w-full');
    expect(main.className).toContain('mx-auto');
    expect(main.className).not.toMatch(/\bw-\[/);
    expect(main.getAttribute('style')).toBeNull();
  });
});
