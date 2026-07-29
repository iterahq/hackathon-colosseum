import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const stage = vi.hoisted(() => ({ request: vi.fn(), clear: vi.fn(), staged: null as unknown }));

vi.mock('@/hooks/useClassSession', () => ({
  useClassSession: () => ({
    currentActivityId: 'act-1',
    status: 'live',
    roster: [
      { userId: 'inst-1', name: 'Prof', avatarUrl: null, isInstructor: true },
      { userId: 'a', name: 'Alba', avatarUrl: null, isInstructor: false },
    ],
    connected: true,
    reconnecting: false,
    answers: {},
    elapsed: {},
    timer: null,
    stoppedFor: null,
    stagedAnswer: stage.staged,
    stagePendingUserId: null,
    stageUnreachableUserId: null,
    broadcast: vi.fn(),
    broadcastTimer: vi.fn(),
    clearTimer: vi.fn(),
    requestStage: stage.request,
    clearStage: stage.clear,
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
// A sidebar real é pesada; o que importa aqui é a ligação que a página faz com
// ela — as linhas da sala e a ação de palco que cada linha recebe.
vi.mock('@/components/live/LiveSidebar', () => ({
  LiveSidebar: ({
    rows,
    onToggleStage,
  }: {
    rows: { userId: string; name: string }[];
    onToggleStage?: (userId: string) => void;
  }) => (
    <aside>
      {rows.map((r) => (
        <button key={r.userId} data-testid={`row-${r.userId}`} onClick={() => onToggleStage?.(r.userId)}>
          {r.name}
        </button>
      ))}
    </aside>
  ),
}));
vi.mock('@/components/live/InstructorControls', () => ({ InstructorControls: () => <div /> }));
vi.mock('@/components/live/LivePodium', () => ({ LivePodium: () => <div /> }));
vi.mock('@/components/live/LiveTimer', () => ({ LiveTimer: () => <div /> }));
vi.mock('@/components/live/LiveReception', () => ({ LiveReception: () => <div /> }));
vi.mock('@/components/live/LiveSoundDock', () => ({ LiveSoundDock: () => <div /> }));
vi.mock('@/components/live/LiveActivityStage', () => ({ LiveActivityStage: () => <div /> }));
vi.mock('@/components/live/LiveStage', () => ({ LiveStage: () => <div /> }));
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

describe('InstructorSessionPage — palco pela linha do aluno', () => {
  beforeEach(() => {
    stage.request.mockClear();
    stage.clear.mockClear();
    stage.staged = null;
  });

  it('não abre mais uma segunda lista da turma só pra escolher alguém', () => {
    renderPage();
    expect(screen.queryByTestId('live-stage-open')).toBeNull();
  });

  it('puxa pro palco a partir da linha do aluno na lista única', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('row-a'));
    expect(stage.request).toHaveBeenCalledWith('a');
    expect(stage.clear).not.toHaveBeenCalled();
  });

  it('a mesma linha tira do palco quem já está lá', () => {
    stage.staged = {
      activityId: 'act-1',
      kind: 'answer',
      content: 'x',
      status: 'submitted',
      author: { userId: 'a', name: 'Alba', avatarUrl: null },
    };
    renderPage();
    fireEvent.click(screen.getByTestId('row-a'));
    expect(stage.clear).toHaveBeenCalled();
    expect(stage.request).not.toHaveBeenCalled();
  });
});
