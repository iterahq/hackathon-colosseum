/**
 * @vitest-environment node
 *
 * Gate puro — nenhum DOM envolvido. Roda em `node` desde que
 * `src/test/setup.ts` virou DOM-condicional (Fase 2 do plano
 * `20260728-itera-activity-testing`).
 */
import { describe, it, expect } from 'vitest';
import { learnerActivityGate, canLearnerReopen } from './liveActivityGate';
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
        canReopen: false,
        editing: false,
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

  describe('canReopen (ADR-1: answering is not final while the round is open)', () => {
    it('authorizes taking the submission back once answered', () => {
      expect(learnerActivityGate({ ...base, answered: true }).canReopen).toBe(true);
    });

    it('authorizes it with a countdown armed too', () => {
      expect(
        learnerActivityGate({ ...base, timerRunning: true, answered: true }).canReopen
      ).toBe(true);
    });

    it('is bounded by EXPIRY, not by timerRunning — most live rounds arm no countdown', () => {
      // The affordance has to exist in the no-timer round: that is the round the
      // learner asked to reopen in the first real class (06/08).
      expect(learnerActivityGate({ ...base, timerRunning: false, answered: true }).canReopen).toBe(
        true
      );
      // Clock ran out / professor stopped it → "pens down" wins over ADR-1.
      expect(
        learnerActivityGate({ ...base, expired: true, answered: true }).canReopen
      ).toBe(false);
    });

    it('has nothing to reopen while unanswered', () => {
      expect(learnerActivityGate({ ...base }).canReopen).toBe(false);
      expect(learnerActivityGate({ ...base, timerRunning: true }).canReopen).toBe(false);
      expect(learnerActivityGate({ ...base, expired: true }).canReopen).toBe(false);
    });

    it('is spent once used — one click, one way back until they resubmit', () => {
      expect(learnerActivityGate({ ...base, answered: true, reopened: true }).canReopen).toBe(false);
    });
  });

  describe('reopening does NOT un-answer (the lock race)', () => {
    const reopened = { timerRunning: true, expired: false, answered: true, reopened: true };

    it('makes the activity editable and completable again', () => {
      const g = learnerActivityGate(reopened);
      expect(g.editing).toBe(true);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });

    it('a countdown expiring mid-edit is "pens down", NOT the never-answered lock', () => {
      // The bug this guards: while reopening flipped `answered` back to false, an
      // expiry here produced `locked` — the learner saw the "tempo esgotado" screen
      // as if they had never answered, verdict gone from the UI, row still in the DB.
      const g = learnerActivityGate({ ...reopened, expired: true });
      expect(g.locked).toBe(false);
      expect(g.editing).toBe(false);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });

    it('an unanswered learner still gets the real lock on expiry', () => {
      expect(learnerActivityGate({ ...base, expired: true }).locked).toBe(true);
    });
  });

  describe('canLearnerReopen (both halves, as every surface must ask)', () => {
    const answeredRound = learnerActivityGate({ ...base, answered: true });

    it('offers it on an answered code round', () => {
      expect(canLearnerReopen(answeredRound, 'code')).toBe(true);
    });

    it('withholds it on an MCQ round even though the ROUND says yes', () => {
      expect(answeredRound.canReopen).toBe(true);
      expect(canLearnerReopen(answeredRound, 'single_choice')).toBe(false);
      expect(canLearnerReopen(answeredRound, 'quiz')).toBe(false);
    });

    it('withholds it on code once the clock is out, even though the KIND says yes', () => {
      const out = learnerActivityGate({ ...base, expired: true, answered: true });
      expect(canLearnerReopen(out, 'code')).toBe(false);
    });

    it('withholds it before the learner answered', () => {
      expect(canLearnerReopen(learnerActivityGate({ ...base }), 'code')).toBe(false);
    });
  });
});
