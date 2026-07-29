import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearOutbox,
  enqueueWrite,
  flushOutbox,
  readOutbox,
  MAX_QUEUED_WRITES,
} from '@/utils/answerOutbox';
import type { OutboxEntry } from '@/types/answerOutbox';

/**
 * O caso que o outbox existe para cobrir: wifi de escola caindo no meio da aula.
 * Antes, a escrita falhava dentro de um `catch {}` e a resposta do aluno sumia
 * sem ninguém ficar sabendo.
 */

const progress = (activityId: string, passed = false): OutboxEntry => ({
  kind: 'progress',
  activityId,
  passed,
  response: null,
});

const classAnswer = (activityId: string, sessionId = 's1'): OutboxEntry => ({
  kind: 'classAnswer',
  sessionId,
  activityId,
  correct: true,
  elapsedMs: 1200,
});

beforeEach(() => {
  clearOutbox();
});

describe('a failed write survives in the queue', () => {
  it('keeps what the network ate and drains it when it comes back', async () => {
    enqueueWrite(progress('a1'));
    enqueueWrite(classAnswer('a1'));
    expect(readOutbox()).toHaveLength(2);

    const offline = vi.fn(async () => false);
    expect(await flushOutbox(offline)).toBe(0);
    expect(offline).toHaveBeenCalledTimes(2);
    expect(readOutbox()).toHaveLength(2);

    const online = vi.fn(async () => true);
    expect(await flushOutbox(online)).toBe(2);
    expect(readOutbox()).toHaveLength(0);
  });

  it('counts attempts without ever discarding — a resposta não é telemetria', async () => {
    enqueueWrite(progress('a1'));

    await flushOutbox(async () => false);
    await flushOutbox(async () => false);
    await flushOutbox(async () => false);

    const [queued] = readOutbox();
    expect(queued.attempts).toBe(3);
    expect(queued.entry).toMatchObject({ kind: 'progress', activityId: 'a1' });
  });

  it('drains only what landed, keeping the rest', async () => {
    enqueueWrite(progress('a1'));
    enqueueWrite(progress('a2'));

    const sent = await flushOutbox(async (e) =>
      e.kind === 'progress' ? e.activityId === 'a1' : false
    );

    expect(sent).toBe(1);
    expect(readOutbox().map((q) => (q.entry as { activityId: string }).activityId)).toEqual(['a2']);
  });

  it('an exception in the sender is a failure, not a crash', async () => {
    enqueueWrite(progress('a1'));

    await expect(
      flushOutbox(async () => {
        throw new Error('network');
      })
    ).resolves.toBe(0);
    expect(readOutbox()).toHaveLength(1);
  });
});

describe('the queue holds one slot per target', () => {
  it('a retry on the same activity replaces the older attempt', () => {
    enqueueWrite(progress('a1', false));
    enqueueWrite(progress('a1', true));

    const queue = readOutbox();
    expect(queue).toHaveLength(1);
    expect(queue[0].entry).toMatchObject({ passed: true });
  });

  it('progress and classAnswer for the same activity are distinct targets', () => {
    enqueueWrite(progress('a1'));
    enqueueWrite(classAnswer('a1'));

    expect(readOutbox()).toHaveLength(2);
  });

  it('the same activity in another session is another target', () => {
    enqueueWrite(classAnswer('a1', 's1'));
    enqueueWrite(classAnswer('a1', 's2'));

    expect(readOutbox()).toHaveLength(2);
  });
});

describe('the queue cannot blow up localStorage', () => {
  it('caps itself, dropping the OLDEST — recent answers still matter to this class', () => {
    for (let i = 0; i < MAX_QUEUED_WRITES + 10; i += 1) enqueueWrite(progress(`a${i}`));

    const queue = readOutbox();
    expect(queue).toHaveLength(MAX_QUEUED_WRITES);
    expect((queue[0].entry as { activityId: string }).activityId).toBe('a10');
  });
});

describe('a corrupt or absent store never throws', () => {
  it('garbage reads as an empty queue', () => {
    localStorage.setItem('itera.answer.outbox', '{"not":"an array"}');
    expect(readOutbox()).toEqual([]);
  });

  it('flushing an empty queue does nothing', async () => {
    const send = vi.fn(async () => true);
    expect(await flushOutbox(send)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
