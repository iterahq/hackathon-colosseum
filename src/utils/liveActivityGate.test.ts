import { describe, it, expect } from 'vitest';
import { learnerActivityGate } from './liveActivityGate';
import { hasRevealableAnswer } from './isAnswerableLiveKind';

const base = { timerRunning: false, expired: false, answered: false };

describe('learnerActivityGate', () => {
  describe('interactive on arrival (no pre-start gate)', () => {
    it('lets the learner answer as soon as the activity is advanced to', () => {
      const g = learnerActivityGate({ ...base });
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
      expect(g.locked).toBe(false);
    });

    it('stays interactive while a timer runs', () => {
      const g = learnerActivityGate({ ...base, timerRunning: true });
      expect(g.started).toBe(true);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });
  });

  describe('expiry locks, never completes', () => {
    it('locks read-only when the timer expired before answering', () => {
      const g = learnerActivityGate({ ...base, expired: true });
      expect(g.started).toBe(true);
      expect(g.locked).toBe(true);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });

    it('does not re-lock an activity the learner already answered before expiry', () => {
      const g = learnerActivityGate({ ...base, timerRunning: true, expired: true, answered: true });
      expect(g.locked).toBe(false);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });
  });

  describe('answered', () => {
    it('is read-only and cannot re-complete once answered', () => {
      const g = learnerActivityGate({ ...base, answered: true });
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });
  });

  /* ── round 3: the lock needs a revealed answer to justify it ────────────── */

  describe('nothing to reveal → expiry must NOT lock', () => {
    it('keeps the learner interactive when the countdown runs out', () => {
      const g = learnerActivityGate({ ...base, expired: true, revealable: false });
      expect(g.started).toBe(true); // the round did happen
      expect(g.locked).toBe(false); // …but nothing was revealed, so nothing to protect
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true); // they can still finish their exercise
    });

    it('keeps the learner interactive when the professor STOPS the timer early', () => {
      // The instructor's stop broadcast is what the page turns into `expired`.
      const g = learnerActivityGate({
        ...base,
        timerRunning: false,
        expired: true,
        revealable: false,
      });
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });

    it('still goes read-only once the learner answered (unchanged)', () => {
      const g = learnerActivityGate({ ...base, expired: true, answered: true, revealable: false });
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });

    it('is a no-op before the timer expires', () => {
      const g = learnerActivityGate({ ...base, timerRunning: true, revealable: false });
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });
  });

  describe('explicit revealable: true is identical to the default', () => {
    for (const over of [
      { expired: true },
      { expired: true, answered: true },
      { timerRunning: true },
      { answered: true },
      {},
    ]) {
      it(`same gate with and without the flag for ${JSON.stringify(over)}`, () => {
        expect(learnerActivityGate({ ...base, ...over, revealable: true })).toEqual(
          learnerActivityGate({ ...base, ...over })
        );
      });
    }
  });

  /* ── the wiring the live page actually performs ─────────────────────────── */

  describe('as composed by LiveSessionPage (kind → revealable → gate)', () => {
    /** Exactly what the page does: professor stopped/expired the timer, learner hadn't answered. */
    const afterTimerStops = (kind: string) =>
      learnerActivityGate({
        timerRunning: false,
        expired: true,
        answered: false,
        revealable: hasRevealableAnswer(kind),
      });

    it('code: stopping the time does NOT make the student read-only', () => {
      const g = afterTimerStops('code');
      expect(g.locked).toBe(false);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });

    it.each(['single_choice', 'multi_choice', 'match', 'order', 'quiz', 'sandbox_scenario'])(
      '%s: lock + reveal behaviour is unchanged',
      (kind) => {
        const g = afterTimerStops(kind);
        expect(g.locked).toBe(true);
        expect(g.readOnly).toBe(true);
        expect(g.canComplete).toBe(false);
      }
    );
  });
});
