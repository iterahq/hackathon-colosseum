import { describe, expect, it } from 'vitest';
import type { PassportAward, PassportResult } from '@/types/achievements';
import type { LessonEndInput, PassportCall, TrailPreview } from '@/types/lessonEnd';
import { ceremonyFromResult } from '@/utils/ceremony';
import { firstUnfinishedIndex, lessonEndView, preparingModel, shouldCallPassport } from '@/utils/lessonEnd';

const DAY5: TrailPreview = { day: 5, totalDays: 5, stampedBefore: 4, trailTitle: 'HTML', colorIndex: 1 };
const DAY2: TrailPreview = { day: 2, totalDays: 5, stampedBefore: 1, trailTitle: 'HTML', colorIndex: 1 };

const input = (over: Partial<LessonEndInput> = {}): LessonEndInput => ({
  learner: true,
  done: 16,
  total: 16,
  fresh: true,
  trail: DAY5,
  call: { state: 'pending' },
  ...over,
});

const row = (over: Partial<PassportAward>): PassportAward => ({
  id: 'x', key: 'day_stamp', kind: 'day', tier: null, title: 'Day', ref_id: null, state: { days_done: 0, total_days: 0 },
  mint_status: 'pending', asset_address: null, tx_signature: null, explorer_url: null, ...over,
});

/** What the server answers when it stamped `lesson` as day `day`, leaving the pass at `daysDone`/5. */
function stamped(lesson: string, day: number, daysDone: number, over: { tier?: string; mint?: PassportResult['mint']; minted?: boolean } = {}): PassportResult {
  const minted = over.minted ?? true;
  const pass = row({
    id: 'pass', key: 'trail_pass', kind: 'trail', tier: over.tier ?? 'bronze', ref_id: 'unit',
    state: { days_done: daysDone, total_days: 5, tier: over.tier ?? 'bronze', trail_title: { pt: 'Semana 1 · HTML', en: 'Week 1 · HTML' } },
    mint_status: minted ? 'minted' : 'unclaimed', asset_address: minted ? 'ASSET' : null, tx_signature: minted ? 'SIG' : null,
  });
  const stamp = row({ id: 'stamp', ref_id: lesson, state: { days_done: daysDone, total_days: 5, day, parent_id: 'pass' } });
  return { awards: [stamp], updated: [pass], remaining: 0, mint: over.mint ?? { wallet: 'W', cluster: 'devnet', attempted: 1, blocked: null }, day_incomplete: null };
}

const answered = (result: PassportResult, lesson = 'l5'): PassportCall => ({ state: 'done', result, model: ceremonyFromResult(result, lesson, 'pt') });

describe('lessonEndView', () => {
  it('15/16: no ceremony, the card says one is missing with the real numbers', () => {
    for (const call of [{ state: 'idle' }, { state: 'pending' }, answered(stamped('l5', 5, 5, { tier: 'gold' })), { state: 'timeout' }] as PassportCall[]) {
      expect(lessonEndView(input({ done: 15, call }))).toEqual({ kind: 'incomplete', missing: 1, done: 15, total: 16 });
    }
    expect(lessonEndView(input({ done: 15, fresh: false }))).toEqual({ kind: 'incomplete', missing: 1, done: 15, total: 16 });
    expect(shouldCallPassport({ done: 15, total: 16 })).toBe(false);
  });

  it('13/16 counts three missing', () => {
    expect(lessonEndView(input({ done: 13 }))).toMatchObject({ kind: 'incomplete', missing: 3 });
  });

  it('the server says the day is not whole although the client thought so: its numbers win, no ceremony', () => {
    const result = { ...stamped('l5', 5, 5, { tier: 'gold' }), day_incomplete: { lesson_id: 'l5', done: 15, total: 16 } };
    expect(lessonEndView(input({ call: answered(result) }))).toEqual({ kind: 'incomplete', missing: 1, done: 15, total: 16 });
  });

  it('16/16, just finished: the ceremony prepares before the server answers and claims nothing', () => {
    const view = lessonEndView(input());
    expect(view).toEqual({ kind: 'preparing', preview: DAY5 });
    expect(lessonEndView(input({ call: { state: 'idle' } }))).toEqual(view);
    const model = preparingModel(DAY5);
    expect(model).toMatchObject({ status: 'minting', last: false, day: 5, daysDone: 5, totalDays: 5, newMedals: [], txSignature: null });
    expect(shouldCallPassport({ done: 16, total: 16 })).toBe(true);
  });

  it('16/16 + minted: the ceremony of what the server stamped', () => {
    const view = lessonEndView(input({ trail: DAY2, call: answered(stamped('l2', 2, 2), 'l2') }));
    expect(view).toMatchObject({ kind: 'ceremony', model: { day: 2, daysDone: 2, totalDays: 5, status: 'minted', last: false, txSignature: 'SIG', trailTitle: 'HTML' } });
  });

  it('16/16 + no wallet (e-mail learner): the same ceremony, ending in "earned, link a wallet"', () => {
    const result = stamped('l2', 2, 2, { minted: false, mint: { wallet: null, cluster: 'devnet', attempted: 0, blocked: 'no_wallet' } });
    expect(lessonEndView(input({ trail: DAY2, call: { state: 'pending' } })).kind).toBe('preparing');
    expect(lessonEndView(input({ trail: DAY2, call: answered(result, 'l2') }))).toMatchObject({ kind: 'ceremony', model: { status: 'no_wallet', txSignature: null } });
  });

  it('16/16 + passport error: the plain card plus the honest line; a missing function says nothing', () => {
    expect(lessonEndView(input({ call: { state: 'error', silent: false } }))).toEqual({ kind: 'card', note: 'stampLater' });
    expect(lessonEndView(input({ call: { state: 'timeout' } }))).toEqual({ kind: 'card', note: 'stampLater' });
    expect(lessonEndView(input({ call: { state: 'error', silent: true } }))).toEqual({ kind: 'card', note: null });
  });

  it('last day: gold only when the server says so', () => {
    expect(preparingModel(DAY5).last).toBe(false);
    const short = lessonEndView(input({ call: answered(stamped('l5', 5, 4)) }));
    expect(short).toMatchObject({ kind: 'ceremony', model: { day: 5, daysDone: 4, last: false } });
    const whole = lessonEndView(input({ call: answered(stamped('l5', 5, 5)) }));
    expect(whole).toMatchObject({ kind: 'ceremony', model: { last: true } });
    const tier = lessonEndView(input({ call: answered(stamped('l5', 5, 4, { tier: 'gold' })) }));
    expect(tier).toMatchObject({ kind: 'ceremony', model: { last: true } });
  });

  it('the server holds the day (plausibility floor): the card carries the reason, nothing is claimed', () => {
    const held: PassportResult = { awards: [], updated: [], remaining: 0, mint: { wallet: 'W', cluster: 'devnet', attempted: 0, blocked: null }, day_incomplete: null, day_pending_review: { lesson_id: 'l5', reason: 'too_fast', min_seconds: 20, clears_by: 'redo_one_activity' } };
    expect(lessonEndView(input({ call: answered(held) }))).toEqual({ kind: 'card', note: 'pendingReview', reason: 'too_fast', minSeconds: 20, clearsBy: 'redo_one_activity' });
  });

  it('the server stamped nothing for this lesson: the plain card, no note', () => {
    const nothing: PassportResult = { awards: [], updated: [], remaining: 0, day_incomplete: null };
    expect(lessonEndView(input({ call: answered(nothing) }))).toEqual({ kind: 'card', note: null });
    expect(lessonEndView(input({ call: answered(stamped('other', 1, 1)) }))).toEqual({ kind: 'card', note: null });
  });

  it('non-trail lesson: nothing but the plain card, whole or not, whatever the call does', () => {
    for (const call of [{ state: 'idle' }, { state: 'pending' }, { state: 'error', silent: false }, { state: 'timeout' }] as PassportCall[]) {
      expect(lessonEndView(input({ trail: 'none', call }))).toEqual({ kind: 'card', note: null });
      expect(lessonEndView(input({ trail: 'none', done: 15, call }))).toEqual({ kind: 'card', note: null });
    }
  });

  it('trails still loading: holds briefly instead of guessing', () => {
    expect(lessonEndView(input({ trail: 'loading' }))).toEqual({ kind: 'hold' });
    expect(lessonEndView(input({ trail: 'loading', done: 15 }))).toEqual({ kind: 'hold' });
    expect(lessonEndView(input({ trail: 'loading', fresh: false }))).toEqual({ kind: 'card', note: null });
    expect(lessonEndView(input({ trail: 'loading', call: { state: 'error', silent: false } }))).toEqual({ kind: 'card', note: null });
  });

  it('a lesson reopened already whole: the card, and a ceremony only if the server stamps it now', () => {
    expect(lessonEndView(input({ fresh: false }))).toEqual({ kind: 'card', note: null });
    expect(lessonEndView(input({ fresh: false, call: { state: 'error', silent: false } }))).toEqual({ kind: 'card', note: null });
    expect(lessonEndView(input({ fresh: false, call: answered(stamped('l5', 5, 5)) })).kind).toBe('ceremony');
  });

  it('guests, signed-out visitors and empty lessons never see any of it', () => {
    expect(lessonEndView(input({ learner: false }))).toEqual({ kind: 'card', note: null });
    expect(lessonEndView(input({ learner: false, done: 15 }))).toEqual({ kind: 'card', note: null });
    expect(lessonEndView(input({ learner: false, call: answered(stamped('l5', 5, 5)) }))).toEqual({ kind: 'card', note: null });
    expect(lessonEndView(input({ done: 0, total: 0 }))).toEqual({ kind: 'card', note: null });
  });

  it('"Depois" closes the ceremony into the plain card', () => {
    expect(lessonEndView(input({ dismissed: true, call: answered(stamped('l5', 5, 5)) }))).toEqual({ kind: 'card', note: null });
  });
});

describe('firstUnfinishedIndex', () => {
  it('points at the first activity not completed, or the start when none is known', () => {
    expect(firstUnfinishedIndex(['a', 'b', 'c'], new Set(['a', 'c']))).toBe(1);
    expect(firstUnfinishedIndex(['a', 'b'], new Set(['a', 'b']))).toBe(0);
  });
});
