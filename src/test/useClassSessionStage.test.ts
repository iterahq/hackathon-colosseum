import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * "Pull to stage" (ADR-3/4) unit coverage over the useClassSession peer-to-peer
 * broadcast layer. A tiny controllable fake RealtimeChannel captures the `.on()`
 * handlers + `.send()` payloads so we can drive stage-request/answer/show/clear
 * and assert the gate: only a matching (nonce+target) stage-answer produces a
 * stage-show, stagedAnswer is only ever set from stage-show, and clearStage resets.
 */

const SESSION = 'session-1';
const ACTIVITY = 'act-1';
const INSTRUCTOR = 'instructor-1';
const STUDENT = 'student-1';

type Handler = (msg: { payload: unknown }) => void;

let handlers: Record<string, Handler>;
let sent: { event: string; payload: Record<string, unknown> }[];

function makeChannel() {
  const channel = {
    on(type: string, filter: unknown, cb?: Handler) {
      // Broadcast handlers: on('broadcast', { event }, cb). Presence/pg: cb is 2nd arg.
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
      sent.push({ event: msg.event, payload: msg.payload });
      return Promise.resolve('ok');
    },
    track() {
      return Promise.resolve('ok');
    },
    presenceState() {
      return {};
    },
  };
  return channel;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    channel: () => makeChannel(),
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
    }),
  mapSession: (row: unknown) => row,
}));

import { useClassSession } from '@/hooks/useClassSession';

function emit(event: string, payload: unknown) {
  act(() => handlers[event]?.({ payload }));
}

beforeEach(() => {
  handlers = {};
  sent = [];
  localStorage.clear();
});

async function mountAs(identity: { userId: string; isInstructor: boolean }) {
  const hook = renderHook(() =>
    useClassSession(SESSION, {
      userId: identity.userId,
      name: identity.userId,
      avatarUrl: null,
      isInstructor: identity.isInstructor,
    })
  );
  await waitFor(() => expect(hook.result.current.currentActivityId).toBe(ACTIVITY));
  sent.length = 0; // drop connect-time sends (track etc.)
  return hook;
}

describe('useClassSession — pull to stage', () => {
  it('requestStage broadcasts stage-request with an armed nonce + target', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const req = sent.find((s) => s.event === 'stage-request');
    expect(req).toBeTruthy();
    expect(req!.payload).toMatchObject({ activityId: ACTIVITY, targetUserId: STUDENT });
    expect(typeof req!.payload.nonce).toBe('string');
  });

  it('a matching stage-answer triggers the instructor to emit stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    const show = sent.find((s) => s.event === 'stage-show');
    expect(show).toBeTruthy();
    expect(show!.payload).toMatchObject({ activityId: ACTIVITY, kind: 'answer', content: 'correct' });
  });

  it('ignores a stage-answer with a mismatched nonce', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce: 'stale-nonce',
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')).toBeUndefined();
  });

  it('ignores a stage-answer from a different user than the target', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: 'someone-else',
      nonce,
      kind: 'answer',
      content: 'correct',
      author: { userId: 'someone-else', name: 'Mal', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')).toBeUndefined();
  });

  it('sets stagedAnswer ONLY from stage-show, never directly from stage-answer', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    // A raw stage-answer must NOT stage anything on a client.
    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce: 'n',
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).toBeNull();

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).toMatchObject({
      activityId: ACTIVITY,
      author: { userId: STUDENT, name: 'Alba' },
    });
  });

  it('ignores a stage-show for a non-current activity', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });
    emit('stage-show', {
      activityId: 'other-activity',
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).toBeNull();
  });

  it('clearStage resets stagedAnswer and broadcasts stage-clear', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).not.toBeNull();

    act(() => result.current.clearStage());
    expect(result.current.stagedAnswer).toBeNull();
    expect(sent.find((s) => s.event === 'stage-clear')).toBeTruthy();
  });

  it('the targeted student replies to stage-request with its own stored answer', async () => {
    localStorage.setItem(
      `itera.live.answers:${SESSION}`,
      JSON.stringify({ [ACTIVITY]: { correct: true, elapsedMs: 1200 } })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const answer = sent.find((s) => s.event === 'stage-answer');
    expect(answer).toBeTruthy();
    expect(answer!.payload).toMatchObject({
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce: 'n1',
      kind: 'answer',
      content: 'correct',
    });
  });

  it('a student with no answer does not reply to stage-request', async () => {
    await mountAs({ userId: STUDENT, isInstructor: false });
    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });
    expect(sent.find((s) => s.event === 'stage-answer')).toBeUndefined();
  });
});
