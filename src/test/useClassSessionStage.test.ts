import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * "Pull to stage" (ADR-3/4) unit coverage over the useClassSession peer-to-peer
 * broadcast layer. A tiny controllable fake RealtimeChannel captures the `.on()`
 * handlers + `.send()` payloads so we can drive stage-request/answer/show/clear
 * and assert the gate: only a matching (nonce+target) stage-answer produces a
 * stage-show, stagedAnswer is only ever set from stage-show, and clearStage resets.
 *
 * ADR-4 revised (2026-07-23): the professor also pulls WORK IN PROGRESS, so the
 * reply now always happens — carrying an explicit `status` (submitted /
 * in_progress / not_started). The security gate is UNCHANGED and re-asserted here.
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
import { rememberStorageScope } from '@/utils/storageScope';

function emit(event: string, payload: unknown) {
  act(() => handlers[event]?.({ payload }));
}

beforeEach(() => {
  handlers = {};
  sent = [];
  localStorage.clear();
  rememberStorageScope(STUDENT);
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
      `itera.live.answers:${STUDENT}:${SESSION}`,
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
      status: 'submitted',
    });
  });

  it('ignores a stage-request aimed at ANOTHER learner (never answers for a peer)', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "azul";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: 'someone-else', nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')).toBeUndefined();
  });
});

describe('useClassSession — pulling work in progress (ADR-4 revised)', () => {
  it('replies with the DRAFT code snapshot when the learner has not submitted yet', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const saudacao = "oi";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const answer = sent.find((s) => s.event === 'stage-answer');
    expect(answer!.payload).toMatchObject({
      kind: 'code',
      content: 'const saudacao = "oi";',
      status: 'in_progress',
    });
  });

  it('marks the same snapshot as submitted once the learner has answered', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const saudacao = "oi";', savedAt: new Date().toISOString() })
    );
    localStorage.setItem(
      `itera.live.answers:${STUDENT}:${SESSION}`,
      JSON.stringify({ [ACTIVITY]: { correct: true, elapsedMs: 900 } })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')!.payload).toMatchObject({
      kind: 'code',
      status: 'submitted',
    });
  });

  it('a learner who has not started replies with an explicit empty state', async () => {
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const answer = sent.find((s) => s.event === 'stage-answer');
    expect(answer).toBeTruthy();
    expect(answer!.payload).toMatchObject({ kind: 'empty', content: '', status: 'not_started' });
  });

  it('carries the in_progress status through the instructor gate into stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'code',
      content: 'const cor = "verde";',
      status: 'in_progress',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')!.payload).toMatchObject({
      status: 'in_progress',
    });
  });

  it('defaults a status-less stage-show to submitted (client on the previous build)', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(result.current.stagedAnswer).toMatchObject({ status: 'submitted' });
  });
});

describe('useClassSession — live stage streaming (B3)', () => {
  it('the staged learner re-broadcasts stage-update on autosave', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "azul";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    // A real pull: the instructor requests ME, I answer, then my work goes on
    // stage → I become the live source.
    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'code',
      content: 'const cor = "azul";',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "verde";', savedAt: new Date().toISOString() })
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent('itera:code-snapshot-saved', { detail: { activityId: ACTIVITY } })
      );
    });

    const update = sent.find((s) => s.event === 'stage-update');
    expect(update).toBeTruthy();
    expect(update!.payload).toMatchObject({
      activityId: ACTIVITY,
      userId: STUDENT,
      kind: 'code',
      content: 'const cor = "verde";',
    });
  });

  it('a NON-staged learner does not stream on autosave', async () => {
    await mountAs({ userId: STUDENT, isInstructor: false });

    // Someone ELSE is on stage.
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'code',
      content: 'x',
      author: { userId: 'other', name: 'Bob', avatarUrl: null },
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('itera:code-snapshot-saved', { detail: { activityId: ACTIVITY } })
      );
    });

    expect(sent.find((s) => s.event === 'stage-update')).toBeUndefined();
  });

  it('a forged stage-show naming me does NOT make me a live source without a real pull', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "azul";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    // No stage-request ever arrived — a peer forged a stage-show authored as me.
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'code',
      content: 'const cor = "azul";',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('itera:code-snapshot-saved', { detail: { activityId: ACTIVITY } })
      );
    });

    expect(sent.find((s) => s.event === 'stage-update')).toBeUndefined();
  });

  it('the instructor forwards a matching stage-update as a fresh stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    // First pull resolves → arms the live subscription.
    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'code',
      content: 'v1',
      status: 'in_progress',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    sent.length = 0;

    emit('stage-update', {
      activityId: ACTIVITY,
      userId: STUDENT,
      kind: 'code',
      content: 'v2',
      status: 'in_progress',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    const show = sent.find((s) => s.event === 'stage-show');
    expect(show!.payload).toMatchObject({ activityId: ACTIVITY, content: 'v2' });
  });

  it('the instructor ignores a stage-update from a non-staged user', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;
    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'code',
      content: 'v1',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    sent.length = 0;

    emit('stage-update', {
      activityId: ACTIVITY,
      userId: 'someone-else',
      kind: 'code',
      content: 'evil',
      author: { userId: 'someone-else', name: 'Mal', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')).toBeUndefined();
  });
});

describe('useClassSession — restarting the timer lifts the stop lock', () => {
  it('a fresh timer event clears stoppedFor for that activity', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('timer-stop', { activity_id: ACTIVITY });
    expect(result.current.stoppedFor).toBe(ACTIVITY);

    emit('timer', { activity_id: ACTIVITY, deadline: Date.now() + 30_000 });
    expect(result.current.stoppedFor).toBeNull();
    expect(result.current.timer).toMatchObject({ activityId: ACTIVITY });
  });

  it('broadcastTimer clears stoppedFor for the professor mirror too', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });

    emit('timer-stop', { activity_id: ACTIVITY });
    expect(result.current.stoppedFor).toBe(ACTIVITY);

    act(() => result.current.broadcastTimer(ACTIVITY, 30));
    expect(result.current.stoppedFor).toBeNull();
  });
});

describe('useClassSession — an unreachable learner fails loudly', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves the pull to stageUnreachableUserId when nobody replies', async () => {
    const hook = renderHook(() =>
      useClassSession(SESSION, {
        userId: INSTRUCTOR,
        name: INSTRUCTOR,
        avatarUrl: null,
        isInstructor: true,
      })
    );
    // The initial durable read is a resolved promise — flush it under fake timers.
    await act(async () => {
      await Promise.resolve();
    });
    const { result } = hook;

    act(() => result.current.requestStage(STUDENT));
    expect(result.current.stagePendingUserId).toBe(STUDENT);
    expect(result.current.stageUnreachableUserId).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(result.current.stagePendingUserId).toBeNull();
    expect(result.current.stageUnreachableUserId).toBe(STUDENT);
  });

  it('a reply that lands before the timeout clears the pending state instead', async () => {
    const hook = renderHook(() =>
      useClassSession(SESSION, {
        userId: INSTRUCTOR,
        name: INSTRUCTOR,
        avatarUrl: null,
        isInstructor: true,
      })
    );
    await act(async () => {
      await Promise.resolve();
    });
    const { result } = hook;

    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'empty',
      content: '',
      status: 'not_started',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(result.current.stagePendingUserId).toBeNull();
    expect(result.current.stageUnreachableUserId).toBeNull();
  });
});
