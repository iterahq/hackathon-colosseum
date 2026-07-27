import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import InstructorSessionPage from '@/pages/live/InstructorSessionPage';

const session = {
  id: 'sess-1',
  tenantId: 'T1',
  lessonId: 'lesson-1',
  instructorId: 'inst-1',
  currentActivityId: 'act-1',
  status: 'live',
  scope: 'global',
  podiumEvery: null,
  scheduledAt: null,
  startedAt: '2026-07-23T14:00:00.000Z',
  endedAt: null,
  createdAt: '2026-07-23T14:00:00.000Z',
};

vi.mock('@/hooks/useLiveClass', () => ({
  useClassSessionById: () => ({ data: session, isPending: false }),
  useClassCompleters: () => ({ data: [] }),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({
  useIteraIdentity: () => ({ userId: 'inst-1', name: 'Prof', avatarUrl: null, loading: false }),
}));
vi.mock('@/hooks', () => ({
  useLessonContent: () => ({
    data: {
      title: { pt: 'Lição X' },
      activities: [{ id: 'act-1', kind: 'concept', title: { pt: 'A' }, content: {} }],
    },
    isPending: false,
  }),
}));
vi.mock('@/hooks/useClassSession', () => ({
  useClassSession: () => ({
    currentActivityId: 'act-1',
    status: 'live',
    roster: [],
    connected: true,
    reconnecting: false,
    answers: {},
    elapsed: {},
    timer: null,
    stoppedFor: null,
    stagedAnswer: null,
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
vi.mock('@/components/live/LiveSessionChrome', () => ({ LiveSessionChrome: () => <div /> }));
// A sidebar real é pesada; o que importa aqui é que os `controls` do professor
// (onde o picker agora mora) sejam renderizados dentro dela.
vi.mock('@/components/live/LiveSidebar', () => ({
  LiveSidebar: ({ controls }: { controls?: React.ReactNode }) => <aside>{controls}</aside>,
}));
vi.mock('@/components/live/InstructorControls', () => ({ InstructorControls: () => <div /> }));
vi.mock('@/components/live/LivePodium', () => ({ LivePodium: () => <div /> }));
vi.mock('@/components/live/LiveTimer', () => ({ LiveTimer: () => <div /> }));
vi.mock('@/components/live/LiveReception', () => ({ LiveReception: () => <div /> }));
vi.mock('@/components/live/LiveSoundDock', () => ({ LiveSoundDock: () => <div /> }));
vi.mock('@/components/live/LiveActivityStage', () => ({ LiveActivityStage: () => <div /> }));
vi.mock('@/components/live/LiveStage', () => ({ LiveStage: () => <div /> }));
vi.mock('@/components/live/LiveStagePicker', () => ({
  LiveStagePicker: () => <div data-testid="live-stage-picker" />,
}));
vi.mock('@/components/live/LiveReconnectBanner', () => ({ LiveReconnectBanner: () => <div /> }));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/live/instructor/sess-1']}>
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <Routes>
            <Route path="/live/instructor" element={<div />} />
            <Route path="/live/instructor/:sessionId" element={<InstructorSessionPage />} />
          </Routes>
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('InstructorSessionPage — picker de palco na própria sidebar', () => {
  it('abre e fecha a lista no mesmo botão, sem modal', () => {
    renderPage();
    const toggle = screen.getByTestId('live-stage-open');

    expect(screen.queryByTestId('live-stage-picker')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByTestId('live-stage-picker')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('live-stage-picker')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
