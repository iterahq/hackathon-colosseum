import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Which TOPIC each live-class event is sent on. This is the whole security
 * property of migration 0023: `realtime.messages` RLS cannot see a broadcast
 * event name, only the topic — so every instructor-driven event has to leave on
 * `class:<id>:ctrl`, where RLS lets only class staff insert. Move one of them
 * back to the shared topic and any cohort member can forge it again.
 */

const SESSION = 'session-1';
const ACTIVITY = 'act-1';
const SHARED = `class:${SESSION}`;
const CTRL = `class:${SESSION}:ctrl`;

type Handler = (msg: { payload: unknown }) => void;

let handlers: Record<string, Handler>;
let sent: { topic: string; event: string; payload: Record<string, unknown> }[];
let listens: { topic: string; event: string }[];
let topics: string[];

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
    Promise.resolve({ id: SESSION, currentActivityId: ACTIVITY, status: 'live' }),
  mapSession: (row: unknown) => row,
}));

import { useClassSession } from '@/hooks/useClassSession';

const emit = (event: string, payload: unknown) => act(() => handlers[event]?.({ payload }));
const topicOf = (event: string) => sent.find((s) => s.event === event)?.topic;
const listenTopicOf = (event: string) => listens.find((l) => l.event === event)?.topic;

beforeEach(() => {
  handlers = {};
  sent = [];
  listens = [];
  topics = [];
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

describe('useClassSession — staff-write control topic', () => {
  it('joins both the shared and the control topic', async () => {
    await mountAs('instructor-1', true);
    expect(topics).toContain(SHARED);
    expect(topics).toContain(CTRL);
  });

  it('listens for the instructor-driven events on the control topic', async () => {
    await mountAs('student-1', false);
    const ctrlEvents = ['advance', 'timer', 'timer-stop'];
    const stageEvents = ['stage-request', 'stage-show', 'stage-clear'];
    for (const event of [...ctrlEvents, ...stageEvents]) expect(listenTopicOf(event)).toBe(CTRL);
    expect(listenTopicOf('answered')).toBe(SHARED);
    expect(listenTopicOf('stage-answer')).toBe(SHARED);
  });

  it('sends advance / timer / timer-stop on the control topic', async () => {
    const { result } = await mountAs('instructor-1', true);
    act(() => result.current.broadcast('act-2'));
    act(() => result.current.broadcastTimer(ACTIVITY, 30));
    act(() => result.current.clearTimer(ACTIVITY));
    expect(topicOf('advance')).toBe(CTRL);
    expect(topicOf('timer')).toBe(CTRL);
    expect(topicOf('timer-stop')).toBe(CTRL);
  });

  it('sends the stage pull, show and clear on the control topic', async () => {
    const { result } = await mountAs('instructor-1', true);
    act(() => result.current.requestStage('student-1'));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;
    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: 'student-1',
      nonce,
      kind: 'answer',
      content: 'correct',
      author: { userId: 'student-1', name: 'Alba', avatarUrl: null },
    });
    act(() => result.current.clearStage());
    expect(topicOf('stage-request')).toBe(CTRL);
    expect(topicOf('stage-show')).toBe(CTRL);
    expect(topicOf('stage-clear')).toBe(CTRL);
  });

  it('keeps the learner-sent events on the shared topic', async () => {
    const { result } = await mountAs('student-1', false);
    act(() => result.current.broadcastAnswer(ACTIVITY, true, 900));
    emit('stage-request', { activityId: ACTIVITY, targetUserId: 'student-1', nonce: 'n1' });
    expect(topicOf('answered')).toBe(SHARED);
    expect(topicOf('stage-answer')).toBe(SHARED);
  });
});

describe('useClassSession — a forged `answered` cannot sabotage a peer', () => {
  it('never downgrades a recorded hit to a miss', async () => {
    const { result } = await mountAs('student-1', false);

    emit('answered', { activity_id: ACTIVITY, user_id: 'student-2', correct: true });
    expect(result.current.answers[ACTIVITY]?.['student-2']).toBe(true);

    emit('answered', { activity_id: ACTIVITY, user_id: 'student-2', correct: false });
    expect(result.current.answers[ACTIVITY]?.['student-2']).toBe(true);
  });

  it('still lets a retry upgrade a miss to a hit', async () => {
    const { result } = await mountAs('student-1', false);

    emit('answered', { activity_id: ACTIVITY, user_id: 'student-2', correct: false });
    expect(result.current.answers[ACTIVITY]?.['student-2']).toBe(false);

    emit('answered', { activity_id: ACTIVITY, user_id: 'student-2', correct: true });
    expect(result.current.answers[ACTIVITY]?.['student-2']).toBe(true);
  });

  it('never rewrites a recorded time, and ignores the time of a miss', async () => {
    const { result } = await mountAs('student-1', false);

    emit('answered', { activity_id: ACTIVITY, user_id: 'student-2', correct: false, elapsed_ms: 5 });
    expect(result.current.elapsed[ACTIVITY]?.['student-2']).toBeUndefined();

    emit('answered', {
      activity_id: ACTIVITY,
      user_id: 'student-2',
      correct: true,
      elapsed_ms: 1200,
    });
    emit('answered', {
      activity_id: ACTIVITY,
      user_id: 'student-2',
      correct: true,
      elapsed_ms: 999999,
    });
    expect(result.current.elapsed[ACTIVITY]?.['student-2']).toBe(1200);
  });

  it('keeps two learners independent', async () => {
    const { result } = await mountAs('student-1', false);

    emit('answered', { activity_id: ACTIVITY, user_id: 'student-2', correct: true, elapsed_ms: 10 });
    emit('answered', { activity_id: ACTIVITY, user_id: 'student-3', correct: false });
    expect(result.current.answers[ACTIVITY]).toEqual({ 'student-2': true, 'student-3': false });
    expect(result.current.elapsed[ACTIVITY]).toEqual({ 'student-2': 10 });
  });
});
