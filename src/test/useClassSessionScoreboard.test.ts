import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Pódio de quem chega atrasado (defeito B1: *"eu como aluno vi somente eu no
 * pódio e o professor viu eu e o tainan"*). O placar de cada cliente é só o que
 * ele OUVIU, então quem acaba de conectar PEDE e o professor responde com o que
 * está no banco. Ver `src/utils/liveScoreboard.ts`.
 */

const SESSION = 'session-1';
const ACTIVITY = 'act-1';
const SHARED = `class:${SESSION}`;
const CTRL = `class:${SESSION}:ctrl`;

type Handler = (msg: { payload: unknown }) => void;

/** Chaveado por `topico|evento`: é o que prova em que canal cada lado escuta. */
let handlers: Record<string, Handler>;
let presenceHandlers: Record<string, (msg: { currentPresences: unknown[] }) => void>;
let sent: { topic: string; event: string; payload: Record<string, unknown> }[];
let durableRows: { activityId: string; userId: string; correct: boolean; elapsedMs?: number }[];
let readFails: boolean;
let reads: number;
/** Quando ligado, o tópico de staff só sobe quando o teste chamar `joinCtrl`. */
let deferCtrl: boolean;
let joinCtrl: (() => void) | null;

function makeChannel(topic: string) {
  const channel = {
    on(type: string, filter: unknown, cb?: Handler) {
      const event = (filter as { event?: string } | null)?.event;
      if (type === 'broadcast' && event && cb) handlers[`${topic}|${event}`] = cb;
      if (type === 'presence' && event && cb)
        presenceHandlers[event] = cb as unknown as (msg: { currentPresences: unknown[] }) => void;
      return channel;
    },
    subscribe(cb?: (s: string) => void) {
      if (deferCtrl && topic === CTRL) {
        joinCtrl = () => act(() => cb?.('SUBSCRIBED'));
        return channel;
      }
      cb?.('SUBSCRIBED');
      return channel;
    },
    send(msg: { event: string; payload: Record<string, unknown> }) {
      sent.push({ topic, event: msg.event, payload: msg.payload });
      return Promise.resolve('ok');
    },
    track: () => Promise.resolve('ok'),
    presenceState: () => ({}),
  };
  return channel;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    channel: (topic: string) => makeChannel(topic),
    removeChannel: () => Promise.resolve(),
    realtime: { setAuth: () => Promise.resolve() },
  }),
}));

vi.mock('@/services/liveClass.service', () => ({
  getClassSession: () => Promise.resolve({ id: SESSION, currentActivityId: ACTIVITY, status: 'live' }),
  mapSession: (row: unknown) => row,
}));

vi.mock('@/services/classScoreboard.service', () => ({
  getSessionScoreboard: () => {
    reads += 1;
    return readFails ? Promise.reject(new Error('rede')) : Promise.resolve(durableRows);
  },
}));

import { useClassSession } from '@/hooks/useClassSession';
import { SCOREBOARD_MAX_ENTRIES } from '@/utils/liveScoreboard';

const emit = (topic: string, event: string, payload: unknown) =>
  act(() => handlers[`${topic}|${event}`]?.({ payload }));

beforeEach(() => {
  handlers = {};
  presenceHandlers = {};
  sent = [];
  durableRows = [];
  readFails = false;
  reads = 0;
  deferCtrl = false;
  joinCtrl = null;
  localStorage.clear();
});

async function mountAs(userId: string, isInstructor: boolean) {
  const hook = renderHook(() =>
    useClassSession(SESSION, { userId, name: userId, avatarUrl: null, isInstructor })
  );
  await waitFor(() => expect(hook.result.current.currentActivityId).toBe(ACTIVITY));
  return hook;
}

const replies = () => sent.filter((s) => s.event === 'scoreboard');
const requests = () => sent.filter((s) => s.event === 'scoreboard-request');

describe('useClassSession — placar por pedido e resposta', () => {
  it('o aluno pede o placar quando conecta, no tópico compartilhado', async () => {
    await mountAs('student-1', false);
    expect(requests()).toHaveLength(1);
    expect(requests()[0].topic).toBe(SHARED);
  });

  it('não pede antes de estar ouvindo o tópico de staff', async () => {
    // A RESPOSTA vem no tópico de staff. Pedir com o compartilhado de pé e o de
    // staff ainda subindo seria pedir e perder — sem retry, o aluno ficaria com o
    // pódio de uma pessoa exatamente como no defeito relatado.
    deferCtrl = true;
    await mountAs('student-1', false);
    expect(requests()).toHaveLength(0);

    joinCtrl?.();
    expect(requests()).toHaveLength(1);
  });

  it('o professor não pede — ele lê o banco', async () => {
    const { result } = await mountAs('instructor-1', true);
    expect(requests()).toHaveLength(0);
    await waitFor(() => expect(reads).toBeGreaterThan(0));
    expect(result.current.answers).toEqual({});
  });

  it('o pedido escuta no compartilhado e a resposta só no de staff', async () => {
    // Trocar os canais é o furo que este desenho evita: `scoreboard` fala pelos
    // OUTROS, então no compartilhado um aluno reescreveria o pódio da turma.
    await mountAs('instructor-1', true);
    expect(handlers[`${SHARED}|scoreboard-request`]).toBeTypeOf('function');
    expect(handlers[`${CTRL}|scoreboard`]).toBeTypeOf('function');
    expect(handlers[`${SHARED}|scoreboard`]).toBeUndefined();
    expect(handlers[`${CTRL}|scoreboard-request`]).toBeUndefined();
  });

  it('o aluno nunca lê o banco — a RLS devolveria só a linha dele', async () => {
    durableRows = [{ activityId: ACTIVITY, userId: 'student-1', correct: true }];
    const { result } = await mountAs('student-1', false);
    await new Promise((r) => setTimeout(r, 0));
    expect(reads).toBe(0);
    expect(result.current.answers).toEqual({});
  });

  it('o professor responde do banco, no tópico de staff', async () => {
    durableRows = [
      { activityId: ACTIVITY, userId: 'tainan', correct: true, elapsedMs: 2500 },
      { activityId: ACTIVITY, userId: 'josi', correct: false },
    ];
    await mountAs('instructor-1', true);
    sent.length = 0;

    emit(SHARED, 'scoreboard-request', {});
    await waitFor(() => expect(replies()).toHaveLength(1), { timeout: 3000 });
    expect(replies()[0].topic).toBe(CTRL);
    expect(replies()[0].payload.entries).toEqual(durableRows);
  });

  it('a resposta NÃO repassa o que o professor ouviu — só o que está no banco', async () => {
    // `answered` é auto-atestado no tópico compartilhado: um aluno pode forjar um
    // acerto no nome de outro. A resposta do professor não pode carimbar isso com a
    // autoridade do tópico de staff e espalhar pra quem estava offline.
    durableRows = [{ activityId: ACTIVITY, userId: 'josi', correct: false }];
    await mountAs('instructor-1', true);
    emit(SHARED, 'answered', { activity_id: ACTIVITY, user_id: 'tainan', correct: true, elapsed_ms: 1 });
    sent.length = 0;

    emit(SHARED, 'scoreboard-request', {});
    await waitFor(() => expect(replies()).toHaveLength(1), { timeout: 3000 });
    expect(replies()[0].payload.entries).toEqual(durableRows);
  });

  it('a turma reconectando junto vira UMA resposta, não uma por aluno', async () => {
    // Depois de uma queda de rede a turma toda pede ao mesmo tempo. Sem o
    // coalesce seriam N leituras e N broadcasts pra entregar o mesmo placar.
    durableRows = [{ activityId: ACTIVITY, userId: 'tainan', correct: true }];
    await mountAs('instructor-1', true);
    sent.length = 0;
    reads = 0;

    emit(SHARED, 'scoreboard-request', {});
    emit(SHARED, 'scoreboard-request', {});
    emit(SHARED, 'scoreboard-request', {});
    await waitFor(() => expect(replies()).toHaveLength(1), { timeout: 3000 });
    expect(reads).toBe(1);
  });

  it('depois de responder, o piso segura o pedido seguinte', async () => {
    // O pedido é uma mensagem que qualquer participante pode repetir à vontade,
    // e a resposta divide o tópico com `advance` / `timer` / `stage-show`.
    durableRows = [{ activityId: ACTIVITY, userId: 'tainan', correct: true }];
    await mountAs('instructor-1', true);
    await waitFor(() => expect(replies()).toHaveLength(1), { timeout: 3000 });
    sent.length = 0;

    emit(SHARED, 'scoreboard-request', {});
    await new Promise((r) => setTimeout(r, 700));
    expect(replies()).toHaveLength(0);
  });

  it('corta no teto em vez de arriscar a resposta ser recusada inteira', async () => {
    durableRows = Array.from({ length: SCOREBOARD_MAX_ENTRIES + 10 }, (_, i) => ({
      activityId: `act-${i}`,
      userId: 'tainan',
      correct: true,
    }));
    await mountAs('instructor-1', true);

    await waitFor(() => expect(replies()).toHaveLength(1), { timeout: 3000 });
    expect(replies()[0].payload.entries).toHaveLength(SCOREBOARD_MAX_ENTRIES);
  });

  it('leitura que falha é silêncio, não placar vazio', async () => {
    readFails = true;
    await mountAs('instructor-1', true);
    sent.length = 0;

    emit(SHARED, 'scoreboard-request', {});
    await new Promise((r) => setTimeout(r, 700));
    expect(replies()).toHaveLength(0);
  });

  it('turma que não respondeu nada não gasta broadcast', async () => {
    await mountAs('instructor-1', true);
    sent.length = 0;

    emit(SHARED, 'scoreboard-request', {});
    await new Promise((r) => setTimeout(r, 700));
    expect(replies()).toHaveLength(0);
  });

  it('o aluno não responde pedido de colega — ele não fala pelos outros', async () => {
    await mountAs('student-1', false);
    sent.length = 0;

    emit(SHARED, 'scoreboard-request', {});
    await new Promise((r) => setTimeout(r, 700));
    expect(replies()).toHaveLength(0);
    expect(reads).toBe(0);
  });

  it('o aluno absorve o placar da turma que chegou na resposta', async () => {
    const { result } = await mountAs('student-1', false);
    expect(result.current.answers).toEqual({});

    emit(CTRL, 'scoreboard', {
      entries: [
        { activityId: ACTIVITY, userId: 'student-1', correct: true, elapsedMs: 4000 },
        { activityId: ACTIVITY, userId: 'tainan', correct: true, elapsedMs: 2500 },
        { activityId: ACTIVITY, userId: 'josi', correct: false },
      ],
    });

    expect(result.current.answers[ACTIVITY]).toEqual({
      'student-1': true,
      tainan: true,
      josi: false,
    });
    expect(result.current.elapsed[ACTIVITY]).toEqual({ 'student-1': 4000, tainan: 2500 });
  });

  it('a resposta não rebaixa um acerto que este cliente já viu', async () => {
    // `recordAnswer` é monótono de propósito: uma resposta só pode ACRESCENTAR o
    // que faltava, nunca reescrever o que o aluno viu ao vivo.
    const { result } = await mountAs('student-1', false);
    emit(SHARED, 'answered', { activity_id: ACTIVITY, user_id: 'tainan', correct: true, elapsed_ms: 2500 });

    emit(CTRL, 'scoreboard', {
      entries: [{ activityId: ACTIVITY, userId: 'tainan', correct: false, elapsedMs: 9000 }],
    });

    expect(result.current.answers[ACTIVITY]).toEqual({ tainan: true });
    expect(result.current.elapsed[ACTIVITY]).toEqual({ tainan: 2500 });
  });

  it('resposta repetida não muda a identidade do placar', async () => {
    const { result } = await mountAs('student-1', false);
    const entries = [
      { activityId: ACTIVITY, userId: 'tainan', correct: true, elapsedMs: 2500 },
      { activityId: ACTIVITY, userId: 'josi', correct: false },
    ];
    emit(CTRL, 'scoreboard', { entries });
    const first = result.current.answers;

    emit(CTRL, 'scoreboard', { entries });
    expect(result.current.answers).toBe(first);
  });

  it('resposta malformada não derruba o placar já conhecido', async () => {
    const { result } = await mountAs('student-1', false);
    emit(SHARED, 'answered', { activity_id: ACTIVITY, user_id: 'tainan', correct: true, elapsed_ms: 2500 });

    emit(CTRL, 'scoreboard', { entries: 'nada disso' });

    expect(result.current.answers[ACTIVITY]).toEqual({ tainan: true });
  });

  it('o professor que recarrega hidrata o próprio pódio do banco', async () => {
    // Ninguém que já estava na sala pede de novo, então sem esta leitura o
    // professor voltaria sendo quem responde pela turma sem TER o placar.
    durableRows = [
      { activityId: ACTIVITY, userId: 'tainan', correct: true, elapsedMs: 2500 },
      { activityId: ACTIVITY, userId: 'josi', correct: false },
    ];
    const { result } = await mountAs('instructor-1', true);

    await waitFor(() => expect(result.current.answers[ACTIVITY]).toBeDefined());
    expect(result.current.answers[ACTIVITY]).toEqual({ tainan: true, josi: false });
    expect(result.current.elapsed[ACTIVITY]).toEqual({ tainan: 2500 });
  });

  it('o professor entrega o placar uma vez sem ninguém pedir', async () => {
    // O pedido do aluno é UMA mensagem, sem retry: quem pediu antes deste
    // professor existir na sala — ele abre a aula depois dos alunos, recarrega,
    // ou ainda resolvia a identidade quando o pedido passou — ficaria com o
    // pódio de uma pessoa pelo resto da aula.
    durableRows = [{ activityId: ACTIVITY, userId: 'tainan', correct: true, elapsedMs: 2500 }];
    await mountAs('instructor-1', true);

    await waitFor(() => expect(replies()).toHaveLength(1), { timeout: 3000 });
    expect(replies()[0].topic).toBe(CTRL);
    expect(replies()[0].payload.entries).toEqual(durableRows);
  });
});
