import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * O desenho do professor no fio.
 *
 * A propriedade que este arquivo trava é a MESMA do ponteiro do professor, e
 * pelo mesmo motivo: a RLS autoriza o TÓPICO por participação na aula, nunca o
 * papel de quem envia. Um aluno consegue pôr bytes aqui; o que ele não consegue é
 * desenhar na tela da turma. Quem decide isso é o RECEPTOR, comparando com
 * `class_sessions.instructor_id` — a linha do banco, não a presença, que é
 * auto-declarada.
 *
 * A segunda propriedade é de custo: um lote é UMA mensagem, com todos os pontos
 * capturados no intervalo dentro. É isso que deixa a caneta caber no mesmo
 * orçamento do cursor sem virar polígono.
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
    Promise.resolve({ id: SESSION, currentActivityId: ACTIVITY, status: 'live', instructorId: PROF }),
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
  userId,
  strokeId: 's1',
  color: 'menta',
  points: [0.1, 0.1, 0.2, 0.2],
  fromW: 800,
  fromH: 400,
  seq: 1,
  ...over,
});

beforeEach(() => {
  handlers = {};
  sent = [];
  topics = [];
  localStorage.clear();
});

describe('anotação — quem pode desenhar', () => {
  const batch = {
    strokeId: 's1',
    color: 'menta' as const,
    points: [0.1, 0.2],
    fromW: 800,
    fromH: 400,
    seq: 1,
  };

  it('o professor manda o lote no tópico do cursor e já vê o próprio traço', async () => {
    const { result } = await mountAs(PROF, true);
    stageShow('student-2');
    await waitFor(() => expect(result.current.canAnnotate).toBe(true));
    act(() => result.current.sendAnnotation(batch));

    const out = sent.filter((s) => s.event === 'instructor-annotation');
    expect(out).toHaveLength(1);
    expect(out[0].topic).toBe(CURSOR);
    expect(out[0].payload).toMatchObject({ userId: PROF, strokeId: 's1', points: [0.1, 0.2] });
    // `broadcast.self` é false no tópico: sem a aplicação local ele desenharia
    // no vazio na própria tela.
    expect(result.current.annotations).toHaveLength(1);
  });

  it('é no-op no cliente de um aluno, mesmo que ele se declare instrutor', async () => {
    const { result } = await mountAs('student-9', true);
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    expect(result.current.canAnnotate).toBe(false);
    act(() => result.current.sendAnnotation(batch));
    act(() => result.current.clearAnnotations());
    expect(sent.filter((s) => s.event.startsWith('instructor-annotation'))).toHaveLength(0);
  });

  it('sem palco não há o que anotar', async () => {
    const { result } = await mountAs(PROF, true);
    expect(result.current.canAnnotate).toBe(false);
  });
});

describe('anotação — o que o receptor aceita', () => {
  it('desenha o traço de quem é o instrutor DA LINHA da sessão', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF));
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0]).toMatchObject({ id: 's1', color: 'menta', done: false });
  });

  it('derruba o traço forjado por um colega da sala', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom('student-3'));
    expect(result.current.annotations).toHaveLength(0);
  });

  it('derruba cor fora da paleta e seq que não é número', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF, { color: 'url(#x)' }));
    emit('instructor-annotation', frameFrom(PROF, { seq: 'muitos' }));
    emit('instructor-annotation', frameFrom(PROF, { points: 'nao-e-lista' }));
    expect(result.current.annotations).toHaveLength(0);
  });

  it('os lotes seguintes emendam no mesmo traço, não abrem outro', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF, { seq: 1 }));
    emit('instructor-annotation', frameFrom(PROF, { seq: 2, points: [0.9, 0.9], done: true }));
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].points).toEqual([0.1, 0.1, 0.2, 0.2, 0.9, 0.9]);
    expect(result.current.annotations[0].done).toBe(true);
  });

  it('limpar do professor apaga tudo; o de um colega não apaga nada', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF));
    emit('instructor-annotation-clear', { userId: 'student-3' });
    expect(result.current.annotations).toHaveLength(1);
    emit('instructor-annotation-clear', { userId: PROF });
    expect(result.current.annotations).toHaveLength(0);
  });

  it('a borracha do professor tira só os ids do lote', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF, { strokeId: 's1' }));
    emit('instructor-annotation', frameFrom(PROF, { strokeId: 's2' }));
    emit('instructor-annotation-clear', { userId: PROF, strokeIds: ['s1'] });
    expect(result.current.annotations.map((s) => s.id)).toEqual(['s2']);
  });

  it('a borracha de um colega não tira nada', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF));
    emit('instructor-annotation-clear', { userId: 'student-3', strokeIds: ['s1'] });
    expect(result.current.annotations).toHaveLength(1);
  });

  // A distinção que separa a borracha do "limpar": lista vazia é um lote que não
  // acertou nada, e varrer a tela nesse caso apagaria a explicação inteira.
  it('lista vazia de ids apaga NADA — só a ausência do campo varre tudo', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF));
    emit('instructor-annotation-clear', { userId: PROF, strokeIds: [] });
    expect(result.current.annotations).toHaveLength(1);
    emit('instructor-annotation-clear', { userId: PROF, strokeIds: [1, null, 's1'] });
    expect(result.current.annotations).toHaveLength(0);
  });

  it('o professor emite o lote da borracha e já vê o traço sumir', async () => {
    const { result } = await mountAs(PROF, true);
    stageShow('student-2');
    await waitFor(() => expect(result.current.canAnnotate).toBe(true));
    emit('instructor-annotation', frameFrom(PROF));
    act(() => result.current.eraseAnnotations(['s1']));
    expect(result.current.annotations).toHaveLength(0);
    const out = sent.filter((s) => s.event === 'instructor-annotation-clear');
    expect(out).toHaveLength(1);
    expect(out[0].payload).toMatchObject({ userId: PROF, strokeIds: ['s1'] });
  });

  it('trocar quem está no palco leva os traços junto', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('instructor-annotation', frameFrom(PROF));
    expect(result.current.annotations).toHaveLength(1);
    stageShow('student-5');
    await waitFor(() => expect(result.current.annotations).toHaveLength(0));
  });
});
