import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * O caminho INVERSO do cursor: o professor apontando no palco (K1).
 *
 * O cursor do palco corre do aluno pra turma; este corre do professor pra turma,
 * inclusive pro aluno que está no palco — que é o ponto todo ("aí o prof ajuda
 * dentro da tela do proprio user"). Mesmo tópico, evento próprio.
 *
 * A propriedade que este arquivo existe pra travar é a do RECEPTOR, e ela é
 * diferente da do `stage-cursor`. Lá o filtro é "quem está no palco"; aqui o
 * emissor é justamente quem NÃO está, então o receptor estreita pela LINHA do
 * banco (`class_sessions.instructor_id`) — e **não** pela presença, porque
 * presença é auto-declarada: `isInstructor` no `track()` é forjável por qualquer
 * aluno da sala. A RLS autoriza o TÓPICO por participação, nunca o papel de quem
 * envia, então um colega consegue colocar bytes ali. O que ele não consegue é
 * desenhar um ponteiro de professor na tela da turma.
 */

const SESSION = 'session-1';
const ACTIVITY = 'act-1';
const CURSOR = `class:${SESSION}:cursor`;
const PROF = 'instructor-1';

type Handler = (msg: { payload: unknown }) => void;

let handlers: Record<string, Handler>;
let sent: { topic: string; event: string; payload: Record<string, unknown> }[];
let topics: string[];

function makeChannel(topic: string) {
  const channel = {
    on(type: string, filter: unknown, cb?: Handler) {
      if (type === 'broadcast' && filter && typeof filter === 'object') {
        const event = (filter as { event?: string }).event;
        if (event && cb) handlers[event] = cb;
      }
      return channel;
    },
    subscribe(cb?: (s: string) => void) {
      cb?.('SUBSCRIBED');
      return channel;
    },
    send(msg: { event: string; payload: Record<string, unknown> }) {
      sent.push({ topic, event: msg.event, payload: msg.payload });
      return Promise.resolve('ok');
    },
    track: () => Promise.resolve('ok'),
    presenceState: () => ({}),
    topic,
  };
  return channel;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    channel: (topic: string) => {
      topics.push(topic);
      return makeChannel(topic);
    },
    removeChannel: () => Promise.resolve(),
    realtime: { setAuth: () => Promise.resolve() },
  }),
}));

vi.mock('@/services/liveClass.service', () => ({
  getClassSession: () =>
    Promise.resolve({
      id: SESSION,
      currentActivityId: ACTIVITY,
      status: 'live',
      instructorId: PROF,
    }),
  mapSession: (row: unknown) => row,
}));

vi.mock('@/services/classModeration.service', () => ({
  amIRemovedFrom: () => Promise.resolve(false),
  removeFromClass: () => Promise.resolve(),
}));

import { useClassSession } from '@/hooks/useClassSession';

const emit = (event: string, payload: unknown) => act(() => handlers[event]?.({ payload }));

const stageShow = (userId: string) =>
  emit('stage-show', {
    activityId: ACTIVITY,
    kind: 'code',
    content: 'const a = 1;',
    status: 'in_progress',
    author: { userId, name: userId, avatarUrl: null },
  });

async function mountAs(userId: string, isInstructor = false) {
  const hook = renderHook(() =>
    useClassSession(SESSION, { userId, name: userId, avatarUrl: null, isInstructor })
  );
  await waitFor(() => expect(hook.result.current.currentActivityId).toBe(ACTIVITY));
  return hook;
}

const frameFrom = (userId: string, over: Record<string, unknown> = {}) => ({
  activityId: ACTIVITY,
  userId,
  x: 0.4,
  y: 0.6,
  visible: true,
  t: 1000,
  ...over,
});

beforeEach(() => {
  handlers = {};
  sent = [];
  topics = [];
  localStorage.clear();
});

describe('cursor do professor — quem emite', () => {
  const frame = { x: 0.5, y: 0.25, paneW: 800, paneH: 400, visible: true, caret: null };

  it('o professor emite sobre o trabalho de OUTRA pessoa', async () => {
    const { result } = await mountAs(PROF, true);
    stageShow('student-2');
    await waitFor(() => expect(result.current.isInstructorCursorSource).toBe(true));
    act(() => result.current.sendInstructorCursor({ ...frame, click: true }));

    const out = sent.filter((s) => s.event === 'instructor-cursor');
    expect(out).toHaveLength(1);
    expect(out[0].topic).toBe(CURSOR);
    expect(out[0].payload).toMatchObject({ userId: PROF, x: 0.5, y: 0.25, click: true });
  });

  it('não emite sobre o PRÓPRIO trabalho — ali ele já é o cursor do palco', async () => {
    const { result } = await mountAs(PROF, true);
    stageShow(PROF);
    await waitFor(() => expect(result.current.isStageCursorSource).toBe(true));
    expect(result.current.isInstructorCursorSource).toBe(false);
    act(() => result.current.sendInstructorCursor(frame));
    expect(sent.filter((s) => s.event === 'instructor-cursor')).toHaveLength(0);
  });

  it('é no-op no cliente de um aluno, mesmo que ele se declare instrutor', async () => {
    const { result } = await mountAs('student-9', true);
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    expect(result.current.isInstructorCursorSource).toBe(false);
    act(() => result.current.sendInstructorCursor(frame));
    expect(sent.filter((s) => s.event === 'instructor-cursor')).toHaveLength(0);
  });
});

describe('cursor do professor — o que o receptor aceita', () => {
  it('desenha o frame de quem é o instrutor DA LINHA da sessão', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-cursor', frameFrom(PROF));
    expect(result.current.instructorCursor).toMatchObject({ userId: PROF, x: 0.4, y: 0.6 });
    // Sem caret: o professor está sobre um painel read-only, o caret desenhado é
    // o de quem está digitando de verdade.
    expect(result.current.instructorCursor?.caret).toBeNull();
  });

  it('derruba o frame forjado por um colega da sala', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-cursor', frameFrom('student-3'));
    expect(result.current.instructorCursor).toBeNull();
  });

  it('derruba frame de atividade velha e frame fora de ordem', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-cursor', frameFrom(PROF, { activityId: 'act-old' }));
    expect(result.current.instructorCursor).toBeNull();

    emit('instructor-cursor', frameFrom(PROF, { t: 2000, x: 0.9 }));
    emit('instructor-cursor', frameFrom(PROF, { t: 1500, x: 0.1 }));
    expect(result.current.instructorCursor?.x).toBe(0.9);
  });

  it('o clique é EVENTO: dois no mesmo ponto são dois pulsos distintos', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-cursor', frameFrom(PROF, { t: 1000, click: true }));
    const first = result.current.instructorClick;
    expect(first).toMatchObject({ x: 0.4, y: 0.6, t: 1000 });

    emit('instructor-cursor', frameFrom(PROF, { t: 1200, click: true }));
    // Mesma posição, `t` diferente — é o que faz o segundo pulso reanimar.
    expect(result.current.instructorClick).not.toBe(first);
    expect(result.current.instructorClick?.t).toBe(1200);
  });

  it('um frame de movimento não inventa clique', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-cursor', frameFrom(PROF));
    expect(result.current.instructorClick).toBeNull();
  });

  it('trocar quem está no palco apaga o ponteiro do professor junto', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-cursor', frameFrom(PROF, { click: true }));
    expect(result.current.instructorCursor).not.toBeNull();

    stageShow('student-5');
    await waitFor(() => expect(result.current.instructorCursor).toBeNull());
    expect(result.current.instructorClick).toBeNull();
  });
});
