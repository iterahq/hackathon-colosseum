import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const upsert = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    functions: { invoke },
    from: () => ({
      upsert,
      insert: async () => ({ error: null }),
    }),
  }),
}));
vi.mock('@/services/iteraUser', () => ({ getIteraUserId: async () => 'user-1' }));
vi.mock('@/services/gamification.service', () => ({ awardActivityXp: vi.fn(async () => undefined) }));

import { MAX_GRADED_RESPONSE_CHARS, submitForGrading, submittedAnswer } from '@/services/grade.service';
import { persistActivityProgress } from '@/services/progress.service';

const verdict = (value: 'pass' | 'fail') => ({ data: { verdict: value, mode: 'server', attempt_id: 'a', answer_hash: 'h', graded_at: 't' }, error: null });

beforeEach(() => {
  invoke.mockReset();
  upsert.mockReset();
});

describe('submittedAnswer', () => {
  it('is the payload of the last answer_submitted action', () => {
    const actions = [
      { type: 'option_selected', at: 1, payload: { option_id: 'a' } },
      { type: 'answer_submitted', at: 2, payload: { option_ids: ['a'] } },
      { type: 'option_selected', at: 3, payload: { option_id: 'b' } },
      { type: 'answer_submitted', at: 4, payload: { option_ids: ['b'] } },
    ] as never;
    expect(submittedAnswer(actions)).toEqual({ option_ids: ['b'] });
  });

  it('is null when the activity recorded no submission', () => {
    expect(submittedAnswer(undefined)).toBeNull();
    expect(submittedAnswer([{ type: 'option_selected', at: 1, payload: { option_id: 'a' } }] as never)).toBeNull();
  });
});

describe('submitForGrading', () => {
  it('posts the claim, the answer and the text to the grade function', async () => {
    invoke.mockResolvedValue(verdict('pass'));
    const actions = [{ type: 'answer_submitted', at: 2, payload: { order: ['x', 'y'] } }] as never;
    await expect(submitForGrading({ activityId: 'act-1', passed: true, response: '1. x', actions })).resolves.toMatchObject({ verdict: 'pass' });
    expect(invoke).toHaveBeenCalledWith('grade', {
      method: 'POST',
      body: { activity_id: 'act-1', passed: true, response: '1. x', answer: { order: ['x', 'y'] } },
    });
  });

  it('cuts a text longer than the server accepts', async () => {
    invoke.mockResolvedValue(verdict('fail'));
    await submitForGrading({ activityId: 'act-1', passed: false, response: 'x'.repeat(MAX_GRADED_RESPONSE_CHARS + 10) });
    expect(invoke.mock.calls[0][1].body.response).toHaveLength(MAX_GRADED_RESPONSE_CHARS);
  });

  it('is null when the function fails, throws or answers something else', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('500') });
    await expect(submitForGrading({ activityId: 'a', passed: true })).resolves.toBeNull();
    invoke.mockRejectedValueOnce(new Error('offline'));
    await expect(submitForGrading({ activityId: 'a', passed: true })).resolves.toBeNull();
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(submitForGrading({ activityId: 'a', passed: true })).resolves.toBeNull();
  });
});

describe('persistActivityProgress and the server verdict', () => {
  const settled = { response: 'b', duration: null, settledAt: null };

  it('never writes itera.progress from the browser', async () => {
    invoke.mockResolvedValue(verdict('pass'));
    await expect(persistActivityProgress('act-1', { passed: true, ...settled })).resolves.toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('a pass the server does not confirm is not saved', async () => {
    invoke.mockResolvedValue(verdict('fail'));
    await expect(persistActivityProgress('act-1', { passed: true, ...settled })).resolves.toBe(false);
  });

  it('an answer the server never received is not saved', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(persistActivityProgress('act-1', { passed: true, ...settled })).resolves.toBe(false);
    await expect(persistActivityProgress('act-1', { passed: false, ...settled })).resolves.toBe(false);
  });

  it('a miss the server recorded is saved', async () => {
    invoke.mockResolvedValue(verdict('fail'));
    await expect(persistActivityProgress('act-1', { passed: false, ...settled })).resolves.toBe(true);
  });
});
