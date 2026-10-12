/**
 * What the end of a lesson shows. Pure: the screen is decided from what the client knows about the
 * lesson and what the `passport` function answered, and it never claims a stamp the server did not confirm.
 */
import type { DayIncomplete } from '@/types/achievements';
import type { LessonEndInput, LessonEndView, TrailPreview } from '@/types/lessonEnd';
import type { StampExpectation } from '@/types/loop';
import type { CeremonyModel } from '@/utils/ceremony';

const CARD: LessonEndView = { kind: 'card', note: null };

const incomplete = (done: number, total: number): LessonEndView => ({
  kind: 'incomplete',
  missing: Math.max(1, total - done),
  done: Math.max(0, Math.min(done, total)),
  total,
});

const serverSaysIncomplete = (d: DayIncomplete | null | undefined): d is DayIncomplete => Boolean(d) && d!.total > 0 && d!.done < d!.total;

export function lessonEndView(input: LessonEndInput): LessonEndView {
  const { learner, done, total, fresh, trail, call } = input;
  if (!learner || total <= 0) return CARD;
  if (done < total) return trail === 'none' ? CARD : trail === 'loading' ? { kind: 'hold' } : incomplete(done, total);
  if (input.dismissed) return CARD;

  if (call.state === 'done') {
    if (serverSaysIncomplete(call.result.day_incomplete)) return incomplete(call.result.day_incomplete.done, call.result.day_incomplete.total);
    if (call.model) return { kind: 'ceremony', model: call.model };
    const held = call.result.day_pending_review;
    return held ? { kind: 'card', note: 'pendingReview', reason: held.reason, minSeconds: held.min_seconds ?? null, clearsBy: held.clears_by ?? null } : CARD;
  }
  // A ceremony was due only for a day finished now, in a trail the client can name.
  const due = fresh && trail !== 'none' && trail !== 'loading';
  if (call.state === 'error') return { kind: 'card', note: due && !call.silent ? 'stampLater' : null };
  if (call.state === 'timeout') return { kind: 'card', note: due ? 'stampLater' : null };
  if (!fresh || trail === 'none') return CARD;
  return trail === 'loading' ? { kind: 'hold' } : { kind: 'preparing', preview: trail };
}

/** Whether the `passport` call is worth making at all: an unfinished day has nothing to stamp. */
export const shouldCallPassport = (i: Pick<LessonEndInput, 'done' | 'total'>): boolean => i.total > 0 && i.done >= i.total;

/** The ceremony's model while it only prepares: the page as it was, nothing claimed. */
export function preparingModel(p: TrailPreview): CeremonyModel {
  return {
    day: p.day,
    daysDone: p.stampedBefore + 1,
    totalDays: p.totalDays,
    trailTitle: p.trailTitle,
    status: 'minting',
    last: false,
    newMedals: [],
    txSignature: null,
    assetAddress: null,
  };
}

/** What the profile must show once the chain is read again; null unless the server confirmed the stamp on chain. */
export function confirmedStamp(model: CeremonyModel, trail?: number | null, day?: number | null): StampExpectation | null {
  if (model.status !== 'minted' || !model.assetAddress) return null;
  return { asset: model.assetAddress, daysDone: model.daysDone, trail, day };
}

/** Index of the first activity not completed, or 0 (the start) when the client knows of none. */
export function firstUnfinishedIndex(ids: readonly string[], done: ReadonlySet<string>): number {
  const at = ids.findIndex((id) => !done.has(id));
  return at < 0 ? 0 : at;
}
