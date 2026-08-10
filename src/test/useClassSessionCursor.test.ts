import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * The cursor stream's transport rules, as a test.
 *
 * Three properties, each of which the class notices immediately when it breaks:
 *
 *  1. **Its own topic.** `class:<id>:cursor`, never the shared topic and never
 *     `:ctrl`. Sharing with `stage-update` would force one cadence on two
 *     signals that need opposite ones (600 ms debounced autosave vs. every
 *     pointer sample); sharing with `:ctrl` would let a cursor flood crowd out
 *     `advance` / `timer`, the events a class genuinely cannot lose.
 *  2. **One emitter.** Only the client whose work is on stage ever sends
 *     (ADR-2) — the property the whole cost model rests on.
 *  3. **Receiver-side identity gate.** RLS authorizes the TOPIC by session
 *     participation, not the sender's role, so a classmate CAN put bytes on the
 *     topic. What stops them moving the cursor the class is watching is the
 *     receiver dropping any frame whose `userId` is not the current staged
 *     author (plan R5 — inherited from `stage-show`, not new).
 */

const SESSION = 'session-1';
const ACTIVITY = 'act-1';
const SHARED = `class:${SESSION}`;
const CTRL = `class:${SESSION}:ctrl`;
const CURSOR = `class:${SESSION}:cursor`;

type Handler = (msg: { payload: unknown }) => void;

let handlers: Record<string, Handler>;
let sent: { topic: string; event: string; payload: Record<string, unknown> }[];
let listens: { topic: string; event: string }[];
let topics: string[];
let removed: string[];

function makeChannel(topic: string) {
  const channel = {
    on(type: string, filter: unknown, cb?: Handler) {
      if (type === 'broadcast' && filter && typeof filter === 'object') {
        const event = (filter as { event?: string }).event;
        if (event && cb) {
          handlers[event] = cb;
          listens.push({ topic, event });
        }
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
    removeChannel: (ch: { topic?: string }) => {
      if (ch?.topic) removed.push(ch.topic);
      return Promise.resolve();
    },
    realtime: { setAuth: () => Promise.resolve() },
  }),
}));

vi.mock('@/services/liveClass.service', () => ({
  getClassSession: () =>
    Promise.resolve({ id: SESSION, currentActivityId: ACTIVITY, status: 'live' }),
  mapSession: (row: unknown) => row,
}));

vi.mock('@/services/classModeration.service', () => ({
  amIRemovedFrom: () => Promise.resolve(false),
  removeFromClass: () => Promise.resolve(),
}));

import { useClassSession } from '@/hooks/useClassSession';

const emit = (event: string, payload: unknown) => act(() => handlers[event]?.({ payload }));

const author = (userId: string) => ({ userId, name: userId, avatarUrl: null });

const stageShow = (userId: string) =>
  emit('stage-show', {
    activityId: ACTIVITY,
    kind: 'code',
    content: 'const a = 1;',
    status: 'in_progress',
    author: author(userId),
  });

beforeEach(() => {
  handlers = {};
  sent = [];
  listens = [];
  topics = [];
  removed = [];
  localStorage.clear();
});

async function mountAs(userId: string, isInstructor = false) {
  const hook = renderHook(() =>
    useClassSession(SESSION, { userId, name: userId, avatarUrl: null, isInstructor })
  );
  await waitFor(() => expect(hook.result.current.currentActivityId).toBe(ACTIVITY));
  return hook;
}

describe('cursor topic — lifecycle', () => {
  it('does NOT join the cursor topic while nothing is on stage', async () => {
    await mountAs('student-1');
    expect(topics).toContain(SHARED);
    expect(topics).toContain(CTRL);
    // Nobody is watching a mirror, so nobody pays the fan-out for one.
    expect(topics).not.toContain(CURSOR);
  });

  it('joins the cursor topic when work goes on stage, and leaves when it is cleared', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    expect(result.current.stageCursor).toBeNull();

    emit('stage-clear', {});
    await waitFor(() => expect(removed).toContain(CURSOR));
  });

  it('listens for stage-cursor ONLY on the cursor topic', async () => {
    await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    const where = listens.filter((l) => l.event === 'stage-cursor').map((l) => l.topic);
    expect(where).toEqual([CURSOR]);
  });
});

describe('cursor topic — one emitter', () => {
  const frame = { x: 0.5, y: 0.25, paneW: 800, paneH: 400, visible: true, caret: { line: 3, column: 4 } };

  it('sends on the cursor topic when MY work is on stage', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-1');
    await waitFor(() => expect(result.current.isStageCursorSource).toBe(true));
    act(() => result.current.sendStageCursor(frame));

    const out = sent.filter((s) => s.event === 'stage-cursor');
    expect(out).toHaveLength(1);
    expect(out[0].topic).toBe(CURSOR);
    expect(out[0].payload).toMatchObject({
      activityId: ACTIVITY,
      userId: 'student-1',
      x: 0.5,
      y: 0.25,
      visible: true,
      caret: { line: 3, column: 4 },
    });
  });

  it('is a no-op for everyone who is not on stage', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    expect(result.current.isStageCursorSource).toBe(false);
    act(() => result.current.sendStageCursor(frame));
    expect(sent.filter((s) => s.event === 'stage-cursor')).toHaveLength(0);
  });

  it('is a no-op for the instructor watching someone else', async () => {
    const { result } = await mountAs('instructor-1', true);
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    act(() => result.current.sendStageCursor(frame));
    expect(sent.filter((s) => s.event === 'stage-cursor')).toHaveLength(0);
  });
});

describe('cursor topic — receiver gate', () => {
  const cursorFrom = (userId: string, over: Record<string, unknown> = {}) => ({
    activityId: ACTIVITY,
    userId,
    x: 0.4,
    y: 0.6,
    visible: true,
    caret: null,
    t: Date.now(),
    ...over,
  });

  it('renders the frame from the person actually on stage', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('stage-cursor', cursorFrom('student-2'));
    expect(result.current.stageCursor).toMatchObject({ userId: 'student-2', x: 0.4, y: 0.6 });
  });

  it('drops a forged frame naming someone who is NOT on stage', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('stage-cursor', cursorFrom('student-3'));
    expect(result.current.stageCursor).toBeNull();
  });

  it('drops a frame for a stale activity', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('stage-cursor', cursorFrom('student-2', { activityId: 'act-old' }));
    expect(result.current.stageCursor).toBeNull();
  });

  it('drops an out-of-order frame instead of yanking the cursor backwards', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('stage-cursor', cursorFrom('student-2', { t: 2000, x: 0.9 }));
    emit('stage-cursor', cursorFrom('student-2', { t: 1000, x: 0.1 }));
    expect(result.current.stageCursor?.x).toBe(0.9);
  });

  it('clamps coordinates into 0..1', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('stage-cursor', cursorFrom('student-2', { x: 4, y: -2 }));
    expect(result.current.stageCursor).toMatchObject({ x: 1, y: 0 });
  });

  it('honours the retraction so the class stops seeing the pointer', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('stage-cursor', cursorFrom('student-2'));
    emit('stage-cursor', cursorFrom('student-2', { visible: false, t: Date.now() + 10 }));
    expect(result.current.stageCursor?.visible).toBe(false);
  });

  it('forgets the previous person when the stage is handed over directly', async () => {
    const { result } = await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    emit('stage-cursor', cursorFrom('student-2'));
    expect(result.current.stageCursor).not.toBeNull();
    // No stage-clear in between: the professor pulls someone else straight away.
    stageShow('student-3');
    await waitFor(() => expect(result.current.stageCursor).toBeNull());
  });
});

describe('cursor topic — the existing stage protocol is untouched', () => {
  it('still sends stage-update on the SHARED topic, not the cursor one', async () => {
    await mountAs('student-1');
    stageShow('student-2');
    await waitFor(() => expect(topics).toContain(CURSOR));
    expect(listens.find((l) => l.event === 'stage-update')?.topic).toBe(SHARED);
    expect(listens.find((l) => l.event === 'stage-show')?.topic).toBe(CTRL);
  });
});
