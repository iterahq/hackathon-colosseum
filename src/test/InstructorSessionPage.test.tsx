import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import InstructorSessionPage from '@/pages/live/InstructorSessionPage';
import { stageCursorPlan } from '@/utils/stageCursorRate';

/**
 * The routed instructor session view (route /live/instructor/:sessionId) — plan
 * 20260723-itera-live-routed-session-and-index.
 *
 * Verifies the GUARD (Open Question #3): while loading → a spinner; a not-found /
 * RLS-blocked session → redirect to the index; a session ALREADY ended on load →
 * redirect to the index; and a valid live session → the control surface mounts
 * (by :sessionId). The heavy live children are stubbed to keep the tree shallow.
 */

// --- mocks -----------------------------------------------------------------
const useClassSessionByIdMock = vi.fn();
vi.mock('@/hooks/useLiveClass', () => ({
  useClassSessionById: (...a: unknown[]) => useClassSessionByIdMock(...a),
  useClassCompleters: () => ({ data: [] }),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({
  useIteraIdentity: () => ({ userId: 'inst-1', name: 'Prof', avatarUrl: null, loading: false }),
}));
vi.mock('@/hooks', () => ({
  useLessonContent: () => ({ data: { title: { pt: 'Lição X' }, activities: [] }, isPending: false }),
}));
vi.mock('@/hooks/useClassSession', () => ({
  useClassSession: () => ({
    currentActivityId: null,
    status: 'live',
    roster: [],
    connected: true,
    reconnecting: false,
    answers: {},
    elapsed: {},
    timer: null,
    stoppedFor: null,
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
    broadcast: vi.fn(),
    broadcastTimer: vi.fn(),
    clearTimer: vi.fn(),
    requestStage: vi.fn(),
    clearStage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useLiveSound', () => ({
  useLiveSound: () => ({ onTimeUp: vi.fn(), onWarn: vi.fn(), onAdvance: vi.fn(), onAnswer: vi.fn(), onSubmit: vi.fn() }),
}));
vi.mock('@/services/liveClass.service', () => ({
  advanceClassSession: vi.fn(),
  endClassSession: vi.fn(),
}));
vi.mock('@/components/live/LiveSessionChrome', () => ({ LiveSessionChrome: () => <div data-testid="chrome" /> }));
vi.mock('@/components/live/LiveSidebar', () => ({ LiveSidebar: () => <div data-testid="sidebar" /> }));
vi.mock('@/components/live/InstructorControls', () => ({ InstructorControls: () => <div /> }));
vi.mock('@/components/live/LivePodium', () => ({ LivePodium: () => <div /> }));
vi.mock('@/components/live/LiveTimer', () => ({ LiveTimer: () => <div /> }));
vi.mock('@/components/live/LiveReception', () => ({ LiveReception: () => <div data-testid="reception" /> }));
vi.mock('@/components/live/LiveSoundDock', () => ({ LiveSoundDock: () => <div /> }));
vi.mock('@/components/live/LiveActivityStage', () => ({ LiveActivityStage: () => <div /> }));
vi.mock('@/components/live/LiveStage', () => ({ LiveStage: () => <div /> }));
vi.mock('@/components/live/LiveStagePicker', () => ({ LiveStagePicker: () => <div /> }));
vi.mock('@/components/live/LiveReconnectBanner', () => ({ LiveReconnectBanner: () => <div /> }));

function makeSession(over: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    tenantId: 'T1',
    lessonId: 'lesson-1',
    instructorId: 'inst-1',
    currentActivityId: null,
    status: 'live',
    scope: 'global',
    podiumEvery: null,
    scheduledAt: null,
    startedAt: '2026-07-23T14:00:00.000Z',
    endedAt: null,
    createdAt: '2026-07-23T14:00:00.000Z',
    ...over,
  };
}

function renderSession(sessionId = 'sess-1') {
  return render(
    <MemoryRouter initialEntries={[`/live/instructor/${sessionId}`]}>
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <Routes>
            <Route path="/live/instructor" element={<div data-testid="index-route">INDEX</div>} />
            <Route path="/live/instructor/:sessionId" element={<InstructorSessionPage />} />
          </Routes>
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('InstructorSessionPage — routed session view + guard', () => {
  beforeEach(() => {
    useClassSessionByIdMock.mockReset();
  });

  it('shows a loading state while the session query is pending', () => {
    useClassSessionByIdMock.mockReturnValue({ data: undefined, isPending: true });
    renderSession();
    expect(screen.getByTestId('instructor-session-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('index-route')).not.toBeInTheDocument();
  });

  it('redirects to the index when the session is not found / not visible', () => {
    useClassSessionByIdMock.mockReturnValue({ data: null, isPending: false });
    renderSession();
    expect(screen.getByTestId('index-route')).toBeInTheDocument();
    expect(screen.queryByTestId('instructor-control')).not.toBeInTheDocument();
  });

  it('redirects to the index when the session is ALREADY ended on load', () => {
    useClassSessionByIdMock.mockReturnValue({ data: makeSession({ status: 'ended' }), isPending: false });
    renderSession();
    expect(screen.getByTestId('index-route')).toBeInTheDocument();
    expect(screen.queryByTestId('instructor-control')).not.toBeInTheDocument();
  });

  it('mounts the instructor control surface for a valid live session (by :sessionId)', () => {
    useClassSessionByIdMock.mockReturnValue({ data: makeSession(), isPending: false });
    renderSession();
    expect(screen.getByTestId('instructor-control')).toBeInTheDocument();
    expect(screen.queryByTestId('index-route')).not.toBeInTheDocument();
    // The session id from the route was used to load the session.
    expect(useClassSessionByIdMock).toHaveBeenCalledWith('sess-1');
  });
});
