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
import { liveTimerSeconds } from './liveTimerSeconds';

const base = { timerRunning: false, expired: false, answered: false };

describe('learnerActivityGate', () => {
  describe('interactive on arrival (activity WITHOUT a clock)', () => {
    it('lets the learner answer as soon as the activity is advanced to', () => {
      const g = learnerActivityGate({ ...base });
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
      expect(g.locked).toBe(false);
      expect(g.awaitingStart).toBe(false);
    });

    it('stays interactive while a timer runs', () => {
      const g = learnerActivityGate({ ...base, timerRunning: true });
      expect(g.started).toBe(true);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });
  });

  describe('pre-start lock (activity WITH a clock the professor has not started)', () => {
    it('is inert before the professor starts the clock', () => {
      const g = learnerActivityGate({ ...base, timerConfigured: true });
      expect(g.awaitingStart).toBe(true);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
      // Não é expiry: quem lê `locked` mostra "tempo esgotado", e o tempo nem começou.
      expect(g.locked).toBe(false);
      expect(g.started).toBe(false);
    });

    it('opens the moment the clock starts', () => {
      const g = learnerActivityGate({ ...base, timerConfigured: true, timerRunning: true });
      expect(g.awaitingStart).toBe(false);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });

    it('reads as expiry, not as pre-start, once the clock ran out', () => {
      const g = learnerActivityGate({ ...base, timerConfigured: true, expired: true });
      expect(g.awaitingStart).toBe(false);
      expect(g.locked).toBe(true);
      expect(g.canComplete).toBe(false);
    });

    it('an activity with no clock is never caught by the pre-start lock', () => {
      // É esta assimetria que impede a regressão do build antigo, em que o gate
      // armado só por `timerRunning` deixava TODO slide/sandbox read-only.
      expect(learnerActivityGate({ ...base, timerConfigured: false }).awaitingStart).toBe(false);
      expect(learnerActivityGate({ ...base }).awaitingStart).toBe(false);
    });

    it('never reopens an activity the learner already answered', () => {
      const g = learnerActivityGate({ ...base, timerConfigured: true, answered: true });
      expect(g.awaitingStart).toBe(false);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });
  });

  /* A composição EXATA do LiveSessionPage. O gate sozinho não erra; o que já
     errou uma vez foi a expressão que alimenta ele. */
  describe('as composed by LiveSessionPage (aula + atividade)', () => {
    const compose = (timerGated: boolean, kind: string, spec?: unknown) =>
      learnerActivityGate({
        timerRunning: false,
        expired: false,
        answered: false,
        timerConfigured: Boolean(timerGated && liveTimerSeconds(kind, spec) > 0),
      });

    it('aula sem trava: nada fica inerte, nem o exercício', () => {
      expect(compose(false, 'single_choice').canComplete).toBe(true);
      expect(compose(false, 'code').canComplete).toBe(true);
    });

    it('aula com trava: o exercício espera a largada', () => {
      expect(compose(true, 'single_choice').awaitingStart).toBe(true);
      expect(compose(true, 'code').awaitingStart).toBe(true);
      expect(compose(true, 'chat_sandbox').awaitingStart).toBe(true);
    });

    it('aula com trava: slide/leitura seguem livres (a regressão do build antigo)', () => {
      for (const kind of ['concept', 'concept_reveal', 'video', 'diagram']) {
        const g = compose(true, kind);
        expect(g.awaitingStart).toBe(false);
        expect(g.canComplete).toBe(true);
      }
    });

    it('aula com trava: BYOC num concept É exercício e espera a largada', () => {
      // BYOC transforma o kind de conteúdo em rodada avaliada, e é `liveTimerSeconds`
      // quem já sabe disso — por isso a expressão passa o spec, não só o kind.
      const spec = {
        byoc: {
          seed: { prompt: 'Conte um hobby seu.' },
          harness: { generation_prompt: 'Crie duas versões sobre {seed}.', interaction: 'pick_best' },
        },
      };
      expect(liveTimerSeconds('concept', spec)).toBeGreaterThan(0);
      expect(compose(true, 'concept', spec).awaitingStart).toBe(true);
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

    it.each(['code', 'single_choice', 'multi_choice', 'match', 'order', 'quiz', 'chat_sandbox'])(
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
        awaitingStart: false,
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

  /* ── ADR-1 × pre-start gate ──────────────────────────────────────────────────
     Neither rule was written knowing about the other, and they overlap in one
     reachable state: a learner who already submitted while the round was open,
     and then sees the clock armed-but-not-started again (the professor walks the
     class back to this activity). "Antes ou depois de terminar, n deve poder
     mexer" is the newer instruction and the stricter one, so it wins: the way
     back is withheld until the professor starts the clock. */
  describe('an armed-but-unstarted clock outranks ADR-1', () => {
    const armedAgain = { ...base, timerConfigured: true, answered: true };

    it('withholds the way back until the professor starts the clock', () => {
      const g = learnerActivityGate(armedAgain);
      expect(g.canReopen).toBe(false);
      expect(canLearnerReopen(g, 'code')).toBe(false);
      expect(g.readOnly).toBe(true);
    });

    it('refuses to honour a reopen that predates the largada', () => {
      // `reopened` is page state, so it survives the professor rearming the clock.
      // Honouring it here would hand out an edit box for a round that has not
      // opened, and the resubmit would land outside the window being timed.
      const g = learnerActivityGate({ ...armedAgain, reopened: true });
      expect(g.editing).toBe(false);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
      // Still not the expiry screen: nothing has run out.
      expect(g.locked).toBe(false);
      expect(g.awaitingStart).toBe(false);
    });

    it('hands ADR-1 back the moment the clock is running', () => {
      const g = learnerActivityGate({ ...armedAgain, timerRunning: true });
      expect(g.canReopen).toBe(true);
      expect(learnerActivityGate({ ...armedAgain, timerRunning: true, reopened: true }).editing).toBe(
        true
      );
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
