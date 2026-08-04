import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Pausa para dúvidas. Ela é sinalização e mora no tópico de staff (0023) — um
 * aluno não pode congelar a sala dos outros. Os três fatos que importam: quem
 * ouve o broadcast entra em pausa, avançar retoma sozinho, e quem chega no meio
 * da pausa é reavisado pelo professor (senão vê exercício com a turma parada).
 */

const SESSION = 'session-1';
const ACTIVITY = 'act-1';
const CTRL = `class:${SESSION}:ctrl`;

type Handler = (msg: { payload: unknown }) => void;

let handlers: Record<string, Handler>;
let presenceHandlers: Record<string, (msg: { currentPresences: unknown[] }) => void>;
let sent: { topic: string; event: string; payload: Record<string, unknown> }[];

function makeChannel(topic: string) {
  const channel = {
    on(type: string, filter: unknown, cb?: Handler) {
      const event = (filter as { event?: string } | null)?.event;
      if (type === 'broadcast' && event && cb) handlers[event] = cb;
      if (type === 'presence' && event && cb)
        presenceHandlers[event] = cb as unknown as (msg: { currentPresences: unknown[] }) => void;
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

import { useClassSession } from '@/hooks/useClassSession';

const emit = (event: string, payload: unknown) => act(() => handlers[event]?.({ payload }));

beforeEach(() => {
  handlers = {};
  presenceHandlers = {};
  sent = [];
  localStorage.clear();
});

async function mountAs(userId: string, isInstructor: boolean) {
  const hook = renderHook(() =>
    useClassSession(SESSION, { userId, name: userId, avatarUrl: null, isInstructor })
  );
  await waitFor(() => expect(hook.result.current.currentActivityId).toBe(ACTIVITY));
  sent.length = 0;
  return hook;
}

describe('useClassSession — pausa para dúvidas', () => {
  it('o broadcast liga e desliga a pausa do aluno', async () => {
    const { result } = await mountAs('student-1', false);
    expect(result.current.onBreak).toBe(false);

    emit('break', { on: true });
    expect(result.current.onBreak).toBe(true);

    emit('break', { on: false });
    expect(result.current.onBreak).toBe(false);
  });

  it('avançar de atividade retoma a aula sozinho', async () => {
    const { result } = await mountAs('student-1', false);
    emit('break', { on: true });

    emit('advance', { current_activity_id: 'act-2' });
    expect(result.current.onBreak).toBe(false);
  });

  it('o professor envia a pausa no tópico de staff', async () => {
    const { result } = await mountAs('instructor-1', true);
    act(() => result.current.setBreak(true));

    expect(result.current.onBreak).toBe(true);
    expect(sent.find((s) => s.event === 'break')).toEqual({
      topic: CTRL,
      event: 'break',
      payload: { on: true },
    });
  });

  it('o professor reanuncia a pausa quando alguém entra', async () => {
    const { result } = await mountAs('instructor-1', true);
    act(() => result.current.setBreak(true));
    sent.length = 0;

    act(() => presenceHandlers.join?.({ currentPresences: [] }));
    expect(sent.filter((s) => s.event === 'break')).toHaveLength(1);
  });

  it('re-`track` de quem já está na sala não vira reanúncio', async () => {
    // O Phoenix redispara `join` a cada re-`track` (mão levantada, working_on) —
    // e é numa pausa que as mãos sobem. Sem o filtro de chave nova, cada mão
    // viraria um broadcast para a sala inteira.
    const { result } = await mountAs('instructor-1', true);
    act(() => result.current.setBreak(true));
    sent.length = 0;

    act(() => presenceHandlers.join?.({ currentPresences: [{ user_id: 'student-1' }] }));
    expect(sent.filter((s) => s.event === 'break')).toHaveLength(0);
  });

  it('o aluno não reanuncia nada ao ver alguém entrar', async () => {
    await mountAs('student-1', false);
    emit('break', { on: true });
    sent.length = 0;

    act(() => presenceHandlers.join?.({ currentPresences: [] }));
    expect(sent.filter((s) => s.event === 'break')).toHaveLength(0);
  });
});
