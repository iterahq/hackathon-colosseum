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

  /* ── "pens down": the lock is UNIVERSAL over answerable kinds ────────────────
     Tainan 2026-07-23: "se acabar o clock deve disable tudo mesmo". The gate no
     longer knows or cares whether the kind has a revealable answer — the clock
     running out locks the activity for whoever hasn't answered, `code` included.
     (Reveal-button visibility is a separate concern; see `hasRevealableAnswer`.) */

  describe('as composed by LiveSessionPage (timer stopped/expired → gate)', () => {
    /** Exactly what the page does: professor stopped/expired the timer, learner hadn't answered. */
    const afterTimerStops = () =>
      learnerActivityGate({ timerRunning: false, expired: true, answered: false });

    it.each(['code', 'single_choice', 'multi_choice', 'match', 'order', 'quiz', 'sandbox_scenario'])(
      '%s: expiring the clock locks the learner read-only (identical across kinds)',
      () => {
        const g = afterTimerStops();
        expect(g.started).toBe(true);
        expect(g.locked).toBe(true);
        expect(g.readOnly).toBe(true);
        expect(g.canComplete).toBe(false);
      }
    );

    it('code locks on expiry EVEN THOUGH it has no revealable answer', () => {
      // Regression guard for the PR-#158 divergence: the lock is decoupled from
      // `hasRevealableAnswer`. `code` has no Reveal button (no answer to show)…
      expect(hasRevealableAnswer('code')).toBe(false);
      // …but the clock running out still locks it — same as the MCQ family.
      expect(afterTimerStops()).toEqual({
        started: true,
        locked: true,
        readOnly: true,
        canComplete: false,
      });
    });

    it('code: still interactive BEFORE the clock runs out', () => {
      const g = learnerActivityGate({ timerRunning: true, expired: false, answered: false });
      expect(g.locked).toBe(false);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });

    it('already-answered stays read-only but is not a fresh lock (any kind)', () => {
      const g = learnerActivityGate({ timerRunning: false, expired: true, answered: true });
      expect(g.locked).toBe(false);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });
  });
});
