import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { stageCursorPlan } from '@/utils/stageCursorRate';
import { rememberStorageScope } from '@/utils/storageScope';
import type { Activity, ActivityKind } from '@/types/content';

/**
 * QUEM FECHOU A RODADA MUDA O QUE O ALUNO LÊ.
 *
 * O professor parar o cronômetro e o professor revelar a resposta chegam no
 * aluno pelo MESMO canal que uma expiração de verdade (`TIMER_STOP_EVENT`), e o
 * rodapé dizia sempre "Tempo esgotado", em vermelho. Na aula de 10/08 a turma
 * leu isso como erro do app e reportou que "não conseguia mais enviar" — numa
 * rodada em que relógio nenhum tinha corrido.
 *
 * O lock em si é intencional (Tainan 2026-07-23, ver `learnerActivityGate`); o
 * que estava errado era a frase. Estes casos travam os dois lados: o professor
 * encerrando não pode dizer "esgotado", e a expiração de verdade não pode
 * perder o vermelho — inclusive quando o professor chega DEPOIS dela.
 */

const LESSON_ID = 'lesson-1';
const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID = 'sess-1';

function activity(id: string, kind: ActivityKind): Activity {
  return { id, lessonId: LESSON_ID, ordinal: 0, kind, spec: {}, rubric: null };
}

const useLessonContent = vi.fn();
const useClassSession = vi.fn();
// Identidade estável entre remontagens do mock: a página zera o `timeUpFor`
// quando a atividade corrente muda, e uma função nova a cada render faria o
// efeito re-rodar e engolir o lock que o timer acabou de armar.
const setHandRaised = vi.fn();

vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  usePrograms: () => ({ data: [], isPending: false }),
  useProgram: () => ({ data: null, isPending: false }),
}));
vi.mock('@/hooks/useClassSession', () => ({ useClassSession: () => useClassSession() }));
vi.mock('@/hooks/useLiveClass', () => ({
  useMySessions: () => ({ data: [], isPending: false, refetch: vi.fn() }),
  useClassSessionById: () => ({ data: null, isPending: false }),
  useClassCompleters: () => ({ data: [] }),
  useLiveClassEnabled: () => ({ data: true, isPending: false }),
  useEnabledTenantIds: () => ({ data: ['tenant-1'] }),
}));
vi.mock('@/hooks/useIteraIdentity', () => ({
  useIteraIdentity: () => ({ userId: 'user-1', name: 'Aluna', avatarUrl: null }),
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({ data: [{ tenantId: 'tenant-1', role: 'learner' }] }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { displayName: 'Aluna Real', email: 'a@b.c' }, isLoading: false }),
}));
vi.mock('@/hooks/useLiveSound', () => ({
  useLiveSound: () => ({
    onAdvance: vi.fn(),
    onAnswer: vi.fn(),
    onWarn: vi.fn(),
    onTimeUp: vi.fn(),
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
vi.mock('@/components/live/LiveActivityStage', () => ({
  LiveActivityStage: ({ footer }: { footer?: React.ReactNode }) => <div>{footer}</div>,
}));

import LiveSessionPage from '@/pages/LiveSessionPage';

function mockLive({
  timer = null,
  stoppedFor = null,
}: {
  timer?: { activityId: string; deadline: number } | null;
  stoppedFor?: string | null;
} = {}) {
  useLessonContent.mockReturnValue({
    data: {
      id: LESSON_ID,
      title: { pt: 'Componentes' },
      activities: [activity(ACTIVITY_ID, 'single_choice')],
    },
    isPending: false,
  });
  useClassSession.mockReturnValue({
    session: { id: SESSION_ID, lessonId: LESSON_ID, instructorId: 'instructor-9', status: 'live' },
    currentActivityId: ACTIVITY_ID,
    status: 'live',
    roster: [],
    connected: true,
    reconnecting: false,
    loading: false,
    timer,
    stoppedFor,
    answers: {},
    elapsed: {},
    stagedAnswer: null,
    stageCursor: null,
    stageCursorPlan: stageCursorPlan(1),
    isStageCursorSource: false,
    sendStageCursor: vi.fn(),
    stagePendingUserId: null,
    stageUnreachableUserId: null,
    broadcastAnswer: vi.fn(),
    setHandRaised,
    setWorkingOn: vi.fn(),
    broadcast: vi.fn(),
    broadcastTimer: vi.fn(),
    clearTimer: vi.fn(),
    requestStage: vi.fn(),
    clearStage: vi.fn(),
    refetch: vi.fn(),
  });
}

function tree() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/live/${SESSION_ID}`]}>
        <I18nProvider>
          <Routes>
            <Route path="/live/:sessionId" element={<LiveSessionPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const expiredTimer = () => ({ activityId: ACTIVITY_ID, deadline: Date.now() - 1000 });

/**
 * O cronômetro chega DEPOIS da atividade, como na aula: é um broadcast, não um
 * dado do primeiro render. Montar os dois juntos esconderia o caso — o efeito
 * que zera o `timeUpFor` na troca de atividade roda depois do filho e engoliria
 * o disparo do timer.
 */
async function mountWithExpiredTimer() {
  mockLive();
  const view = render(tree());
  await screen.findByTestId('live-main');
  mockLive({ timer: expiredTimer() });
  view.rerender(tree());
  return view;
}

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope('user-1');
  vi.clearAllMocks();
});

describe('aviso de rodada encerrada no aluno', () => {
  it('o professor encerrando não diz "tempo esgotado" nem pinta de vermelho', async () => {
    mockLive({ stoppedFor: ACTIVITY_ID });
    render(tree());

    const hint = await screen.findByTestId('live-locked-hint');
    expect(hint.textContent).toContain('professor encerrou esta rodada');
    expect(hint.className).not.toContain('text-destructive');
  });

  it('o cronômetro estourando sozinho mantém o aviso de tempo esgotado', async () => {
    const view = await mountWithExpiredTimer();

    const hint = await screen.findByTestId('live-locked-hint');
    expect(hint.textContent).toContain('Tempo esgotado');
    expect(hint.className).toContain('text-destructive');
    view.unmount();
  });

  it('o professor parando DEPOIS do estouro não reescreve a história da rodada', async () => {
    const view = await mountWithExpiredTimer();
    await screen.findByTestId('live-locked-hint');

    // O `clearTimer` do professor chega no rastro do próprio timeout — é o
    // caminho normal, não um caso de borda.
    mockLive({ timer: expiredTimer(), stoppedFor: ACTIVITY_ID });
    view.rerender(tree());

    await waitFor(() =>
      expect(screen.getByTestId('live-locked-hint').textContent).toContain('Tempo esgotado')
    );
  });
});
