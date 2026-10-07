import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { stageCursorPlan } from '@/utils/stageCursorRate';
import { rememberStorageScope } from '@/utils/storageScope';
import type { Activity, ActivityKind } from '@/types/content';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';

/**
 * O VEREDITO AUTORADO CHEGA NO ALUNO DA AULA AO VIVO — não só o verde/vermelho.
 *
 * REGRESSÃO QUE ESTE ARQUIVO EXISTE PARA PEGAR: uma atividade entrega o `correct`
 * booleano E um `detail` com `message`/`explanation` (o recap do sandbox, o porquê
 * do judge). O `LessonPlayer` levava os três pro footer; o `LiveSessionPage` lia o
 * `detail` inteiro — usava o `response` dele para o palco — e descartava os dois
 * campos de texto. Resultado: o MESMO exercício se explicava no estudo assíncrono
 * e virava só "Não foi dessa vez" na aula ao vivo, que é exatamente o momento em
 * que a turma está olhando junto e o aluno precisa da frase.
 *
 * O teste monta a página REAL e dirige o footer pelo caminho real (a atividade
 * chama `onComplete`), porque o bug não estava em nenhum helper — estava na
 * fiação de uma página com a outra.
 */

const LESSON_ID = 'lesson-1';
const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';
const NEXT_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = 'sess-1';
const RECAP = 'O container precisa de `flex` antes de `gap` valer.';
/**
 * A `explanation` passa pelo `parseInline` (a `message` não), então aqui a crase
 * vira `<code>` e o texto plano perde os acentos graves.
 */
const RECAP_TEXT = 'O container precisa de flex antes de gap valer.';

function activity(id: string, kind: ActivityKind): Activity {
  return { id, lessonId: LESSON_ID, ordinal: 0, kind, spec: {}, rubric: null };
}

const useLessonContent = vi.fn();
const useClassSession = vi.fn();

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

/**
 * A atividade é um stub porque o que está sob teste é a FIAÇÃO, não o sandbox:
 * o stub entrega o mesmo par `(correct, detail)` que o `SandboxScenarioShell`
 * entrega hoje (`onComplete(verdict, { explanation: recap })`).
 */
const settleWith = { detail: undefined as ActivityCompleteDetail | undefined };

vi.mock('@/components/live/LiveActivityStage', () => ({
  LiveActivityStage: ({
    activity,
    onComplete,
    priorAnswer,
  }: {
    activity: Activity;
    onComplete?: (correct: boolean, detail?: ActivityCompleteDetail) => void;
    priorAnswer?: ActivityCompleteDetail;
  }) => (
    <button
      type="button"
      data-testid="stub-settle"
      data-status={activity.status ?? ''}
      data-prior={JSON.stringify(priorAnswer?.actions?.map((a) => a.payload) ?? null)}
      onClick={() => onComplete?.(false, settleWith.detail)}
    >
      settle
    </button>
  ),
}));

import LiveSessionPage from '@/pages/LiveSessionPage';

function mockLive(currentActivityId = ACTIVITY_ID, kind: ActivityKind = 'chat_sandbox') {
  useLessonContent.mockReturnValue({
    data: {
      id: LESSON_ID,
      title: { pt: 'Componentes' },
      activities: [activity(ACTIVITY_ID, kind), activity(NEXT_ID, kind)],
    },
    isPending: false,
  });
  useClassSession.mockReturnValue({
    session: {
      id: SESSION_ID,
      lessonId: LESSON_ID,
      instructorId: 'instructor-9',
      status: 'live',
    },
    currentActivityId,
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
}

function tree() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      {/* Rota de verdade: o `sessionId` sai do path, e é ele que escopa o
          localStorage que segura a resposta entre um refresh e outro. */}
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

function mount() {
  return render(tree());
}

beforeEach(() => {
  localStorage.clear();
  // Toda chave `itera.` é escopada pelo aluno (máquina de laboratório é
  // compartilhada) — sem o escopo, `storeAnswer` não escreve nada e o caso do
  // refresh passaria por engano, testando um localStorage vazio.
  rememberStorageScope('user-1');
  vi.clearAllMocks();
  settleWith.detail = { explanation: RECAP };
  mockLive();
});

describe('feedback footer da aula ao vivo', () => {
  it('carrega a explicação que a atividade entregou, não só o vermelho', async () => {
    mount();
    await userEvent.click(await screen.findByTestId('stub-settle'));

    const footer = await screen.findByTestId('feedback-footer');
    expect(footer).toHaveAttribute('data-correct', 'false');
    expect(screen.getByTestId('feedback-footer-explanation')).toHaveTextContent(RECAP_TEXT);
  });

  it('a explicação sobrevive ao refresh, junto da resposta', async () => {
    const first = mount();
    await userEvent.click(await screen.findByTestId('stub-settle'));
    await screen.findByTestId('feedback-footer-explanation');
    first.unmount();

    mount();
    await waitFor(() =>
      expect(screen.getByTestId('feedback-footer-explanation')).toHaveTextContent(RECAP_TEXT)
    );
  });

  it('sem explicação autorada o footer fica só com o veredito — nada de texto de enchimento', async () => {
    // O caso da família MCQ: ela explica DENTRO do próprio corpo (AnswerExplanation)
    // e não manda nada pra cá, então o footer não pode inventar uma frase. Este
    // caso passa TAMBÉM com o bug presente — não é o guarda da regressão, é o
    // contrapeso dela: sem ele, "levar o texto" viraria "sempre ter texto".
    settleWith.detail = undefined;
    mount();
    await userEvent.click(await screen.findByTestId('stub-settle'));

    await screen.findByTestId('feedback-footer');
    expect(screen.queryByTestId('feedback-footer-explanation')).toBeNull();
  });

  it('o `message` também sobe — a atividade pode trocar a manchete do footer', async () => {
    settleWith.detail = { message: 'Faltou o `flex`', explanation: RECAP };
    mount();
    await userEvent.click(await screen.findByTestId('stub-settle'));

    expect(await screen.findByTestId('feedback-footer-title')).toHaveTextContent('Faltou o `flex`');
  });

  it('a explicação não vaza pro próximo exercício quando o professor avança', async () => {
    const view = mount();
    await userEvent.click(await screen.findByTestId('stub-settle'));
    await screen.findByTestId('feedback-footer-explanation');

    // O professor força o avanço: o mesmo componente, outra atividade corrente.
    mockLive(NEXT_ID);
    view.rerender(tree());

    await waitFor(() => expect(screen.queryByTestId('feedback-footer')).toBeNull());
  });
});

describe('o que o aluno marcou sobrevive ao refresh', () => {
  const PICKED: ActivityCompleteDetail = {
    actions: [
      { type: 'option_selected', at: 1000, payload: { option_id: 'b' } },
      { type: 'answer_submitted', at: 2000, payload: { option_ids: ['b'] } },
    ],
  };

  it('a escolha volta para a atividade, que reabre corrigida', async () => {
    mockLive(ACTIVITY_ID, 'single_choice');
    settleWith.detail = PICKED;
    const first = mount();
    await userEvent.click(await screen.findByTestId('stub-settle'));
    await screen.findByTestId('feedback-footer');
    first.unmount();

    mount();
    const stage = await screen.findByTestId('stub-settle');
    // Só o envio viaja: é o que a atividade lê pra redesenhar a resposta.
    await waitFor(() => expect(stage).toHaveAttribute('data-prior', '[{"option_ids":["b"]}]'));
    // Um ERRO também reabre como respondido — antes voltava em branco ao lado do próprio veredito.
    expect(stage).toHaveAttribute('data-status', 'done');
  });

  it('um kind que não redesenha a resposta fica como estava', async () => {
    settleWith.detail = PICKED;
    const first = mount();
    await userEvent.click(await screen.findByTestId('stub-settle'));
    await screen.findByTestId('feedback-footer');
    first.unmount();

    mount();
    const stage = await screen.findByTestId('stub-settle');
    await screen.findByTestId('feedback-footer');
    expect(stage).toHaveAttribute('data-prior', 'null');
    expect(stage).not.toHaveAttribute('data-status', 'done');
  });
});
