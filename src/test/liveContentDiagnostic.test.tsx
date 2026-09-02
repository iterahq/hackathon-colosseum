import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { stageCursorPlan } from '@/utils/stageCursorRate';
import type { Activity } from '@/types/content';

/**
 * O SKELETON ETERNO — a regressão que custou uma aula.
 *
 * Em 2026-08-31 parte da turma ficou nos blocos cinza e não saiu de lá: sair da
 * aula e voltar não mudava nada, e reiniciar a lição só destravou alguns. A
 * causa da categoria inteira é o `isPending` do TanStack v5, que é TRUE também
 * para query DESLIGADA — e `useLessonContent` desliga quando a sessão chega sem
 * `lessonId`. Sem busca em voo, não existe nada que possa terminar; o skeleton
 * não estava lento, estava PARADO.
 *
 * O que este arquivo tranca não é o `isLoading` no lugar do `isPending`: é a
 * propriedade que faltava. Toda espera que não anda mais tem que virar uma tela
 * que DIZ o motivo, com a linha técnica para colar no chat da aula e um caminho
 * de volta — porque o aluno não tem como destravar nada de dentro da sala.
 */

const LESSON_ID = 'lesson-1';
const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';

const ACTIVITY: Activity = {
  id: ACTIVITY_ID,
  lessonId: LESSON_ID,
  ordinal: 0,
  kind: 'concept',
  spec: {},
  rubric: null,
};

const useLessonContent = vi.fn();
const useClassSession = vi.fn();
const refetch = vi.fn();

vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string, code?: string) => useLessonContent(id, code),
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
vi.mock('@/components/live/LiveActivityStage', () => ({
  LiveActivityStage: () => <div data-testid="stub-stage" />,
}));

import LiveSessionPage from '@/pages/LiveSessionPage';

/** O estado de query que a página lê, com os defaults de uma leitura feliz. */
function lessonQuery(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    refetch,
    ...over,
  };
}

function mountLive({
  lessonId = LESSON_ID,
  query,
}: {
  lessonId?: string | null;
  query: Record<string, unknown>;
}) {
  useLessonContent.mockReturnValue(lessonQuery(query));
  useClassSession.mockReturnValue({
    session: { id: 'sess-1', lessonId, instructorId: 'instructor-9', status: 'live' },
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
}

const fault = () => screen.getByTestId('live-unavailable').getAttribute('data-fault');
const detail = () => screen.getByTestId('live-fault-detail').textContent ?? '';

beforeEach(() => {
  useLessonContent.mockReset();
  useClassSession.mockReset();
  refetch.mockReset();
});

describe('a espera que não anda vira explicação', () => {
  it('sessão sem lição NÃO fica em skeleton — a query nem chegou a sair', () => {
    // Esta é a linha da regressão: query desligada tem `isPending` true para
    // sempre. Ler isso como "carregando" é o skeleton eterno.
    mountLive({ lessonId: null, query: { status: 'pending', fetchStatus: 'idle' } });

    expect(screen.queryByTestId('live-activity-skeleton')).toBeNull();
    expect(fault()).toBe('no-lesson');
  });

  it('leitura que falhou nomeia o erro na linha técnica', () => {
    mountLive({
      query: {
        isError: true,
        error: new Error('permission denied for table lessons'),
        status: 'error',
        fetchStatus: 'idle',
      },
    });

    expect(fault()).toBe('load-failed');
    expect(detail()).toContain('permission denied for table lessons');
    expect(detail()).toContain(ACTIVITY_ID);
  });

  it('lição legível e vazia é diferente de lição ilegível', () => {
    mountLive({ query: { data: { id: LESSON_ID, title: { pt: 'x' }, activities: [] } } });
    expect(fault()).toBe('empty-lesson');
  });

  it('ponteiro apontando fora desta lição acusa o ponteiro, não a rede', () => {
    mountLive({
      query: {
        data: {
          id: LESSON_ID,
          title: { pt: 'x' },
          activities: [{ ...ACTIVITY, id: 'outra-atividade' }],
        },
      },
    });
    expect(fault()).toBe('activity-missing');
  });

  it('a linha técnica não muda com o idioma — é o que o aluno cola no chat', () => {
    mountLive({ query: { data: { id: LESSON_ID, title: { pt: 'x' }, activities: [] } } });
    expect(detail()).toContain('session');
    expect(detail()).toContain('pointer');
    expect(detail()).toContain('activities');
  });

  it('tentar de novo relê o conteúdo sem recarregar a página', () => {
    mountLive({ query: { data: { id: LESSON_ID, title: { pt: 'x' }, activities: [] } } });
    fireEvent.click(screen.getByTestId('live-fault-retry'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('busca de verdade em voo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('mostra skeleton enquanto a leitura ainda pode terminar', () => {
    mountLive({ query: { isLoading: true, status: 'pending', fetchStatus: 'fetching' } });

    expect(screen.getByTestId('live-activity-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('live-unavailable')).toBeNull();
  });

  it('estourado o orçamento, o skeleton vira diagnóstico', () => {
    // A causa nem sempre é conhecida — foi assim na aula. O orçamento fecha a
    // categoria inteira em vez de tapar um buraco por vez.
    mountLive({ query: { isLoading: true, status: 'pending', fetchStatus: 'fetching' } });
    act(() => void vi.advanceTimersByTime(12_500));

    expect(screen.queryByTestId('live-activity-skeleton')).toBeNull();
    expect(fault()).toBe('stalled');
  });
});

describe('o diagrama largo cabe na coluna', () => {
  it('a coluna do aluno encolhe abaixo do conteúdo (`min-w-0`)', () => {
    // Sem isto, um `MermaidLite` de 1176px estica o `<main>` inteiro em vez de
    // deixar o trilho de rolagem dele aparecer: o desenho sai cortado e não há
    // como chegar no resto.
    mountLive({
      query: { data: { id: LESSON_ID, title: { pt: 'x' }, activities: [ACTIVITY] } },
    });
    const main = screen.getByTestId('live-main').closest('main');
    expect(main?.className).toContain('min-w-0');
  });
});
