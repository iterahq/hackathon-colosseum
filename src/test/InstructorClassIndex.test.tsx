import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import InstructorClassPage from '@/pages/live/InstructorClassPage';

/**
 * The open-classes INDEX (route /live/instructor) — plan
 * 20260723-itera-live-routed-session-and-index.
 *
 * Verifies: with 0 open sessions the start form shows and no live section; with
 * ≥1 live session the card renders; "Abrir" routes to the session route;
 * "Encerrar" calls endClassSession; a pending session shows under "Agendadas";
 * and a redirect notice (liveNotice) renders the dismissible banner.
 */

// --- mocks -----------------------------------------------------------------
const useMySessionsMock = vi.fn();
const refetchMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/components/branded', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({ data: [{ tenantId: 'T1', role: 'instructor' }] }),
}));
vi.mock('@/services/membership.service', () => ({
  instructorTenantId: () => 'T1',
}));
vi.mock('@/hooks/useIteraIdentity', () => ({
  useIteraIdentity: () => ({ userId: 'inst-1', name: 'Prof', avatarUrl: null, loading: false }),
}));
vi.mock('@/hooks', () => ({
  useTenantLessons: () => ({ data: [], isPending: false }),
  useLessonContent: () => ({ data: { title: { pt: 'Lição X', en: 'Lesson X' }, activities: [] }, isFetching: false }),
}));
vi.mock('@/hooks/useLiveClass', () => ({
  useLiveClassEnabled: () => ({ data: true, isPending: false }),
  useEnabledTenantIds: () => ({ data: ['T1'] }),
  useMySessions: (...a: unknown[]) => useMySessionsMock(...a),
}));

const endClassSessionMock = vi.fn().mockResolvedValue({});
const startScheduledClassMock = vi.fn().mockResolvedValue({ id: 'sched-live' });
vi.mock('@/services/liveClass.service', () => ({
  startClassSession: vi.fn(),
  scheduleClassSession: vi.fn(),
  startScheduledClass: (...a: unknown[]) => startScheduledClassMock(...a),
  endClassSession: (...a: unknown[]) => endClassSessionMock(...a),
}));

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

type Entry = string | { pathname: string; state?: unknown };
function renderIndex(entries: Entry[] = ['/live/instructor']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <Routes>
            <Route path="/live/instructor" element={<InstructorClassPage />} />
            <Route
              path="/live/instructor/:sessionId"
              element={<div data-testid="session-route">SESSION VIEW</div>}
            />
          </Routes>
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('InstructorClassPage — open-classes index', () => {
  beforeEach(() => {
    useMySessionsMock.mockReset();
    endClassSessionMock.mockClear();
    startScheduledClassMock.mockClear();
    refetchMock.mockClear();
  });

  it('shows the start form and NO "live now" section when there are 0 open sessions', () => {
    useMySessionsMock.mockReturnValue({ data: [], isPending: false, refetch: refetchMock });
    renderIndex();
    expect(screen.getByTestId('instructor-start')).toBeInTheDocument();
    expect(screen.queryByTestId('instructor-live-now')).not.toBeInTheDocument();
    expect(screen.queryByTestId('instructor-scheduled')).not.toBeInTheDocument();
  });

  it('renders a live card for an open (live) session AND still shows the start form', () => {
    useMySessionsMock.mockReturnValue({ data: [makeSession()], isPending: false, refetch: refetchMock });
    renderIndex();
    expect(screen.getByTestId('instructor-live-now')).toBeInTheDocument();
    expect(screen.getByTestId('instructor-live-card')).toBeInTheDocument();
    expect(screen.getByTestId('instructor-live-card-title').textContent).toContain('Lição X');
    expect(screen.getByTestId('instructor-start')).toBeInTheDocument();
  });

  it('"Abrir" navigates to /live/instructor/:sessionId', () => {
    useMySessionsMock.mockReturnValue({ data: [makeSession()], isPending: false, refetch: refetchMock });
    renderIndex();
    fireEvent.click(screen.getByTestId('instructor-live-card-open'));
    expect(screen.getByTestId('session-route')).toBeInTheDocument();
  });

  it('"Encerrar" calls endClassSession with the session id', async () => {
    useMySessionsMock.mockReturnValue({ data: [makeSession()], isPending: false, refetch: refetchMock });
    renderIndex();
    fireEvent.click(screen.getByTestId('instructor-live-card-end'));
    await waitFor(() => expect(endClassSessionMock).toHaveBeenCalledWith('sess-1'));
  });

  it('lists a pending (scheduled) session under "Agendadas"', () => {
    useMySessionsMock.mockReturnValue({
      data: [makeSession({ id: 'sched-1', status: 'pending', startedAt: null, scheduledAt: '2026-07-24T18:00:00.000Z' })],
      isPending: false,
      refetch: refetchMock,
    });
    renderIndex();
    expect(screen.getByTestId('instructor-scheduled')).toBeInTheDocument();
    expect(screen.getByTestId('instructor-scheduled-card')).toBeInTheDocument();
    // A pending session is NOT a "live now" card.
    expect(screen.queryByTestId('instructor-live-now')).not.toBeInTheDocument();
  });

  it('shows the "already ended" notice when redirected here with liveNotice=ended', () => {
    useMySessionsMock.mockReturnValue({ data: [], isPending: false, refetch: refetchMock });
    renderIndex([{ pathname: '/live/instructor', state: { liveNotice: 'ended' } }]);
    const notice = screen.getByTestId('instructor-notice');
    expect(notice).toBeInTheDocument();
    expect(notice.getAttribute('data-notice')).toBe('ended');
    // Dismissible.
    fireEvent.click(screen.getByTestId('instructor-notice-dismiss'));
    expect(screen.queryByTestId('instructor-notice')).not.toBeInTheDocument();
  });
});
