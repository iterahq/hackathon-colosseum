/**
 * @vitest-environment node
 *
 * The answer-state matrix, enumerated EXHAUSTIVELY.
 *
 * CI cost (plan ADR-9): these assertions are pure and want no DOM — and desde a
 * Fase 2 elas de fato não montam um: `src/test/setup.ts` virou DOM-condicional
 * (`typeof window !== 'undefined'`), então `@vitest-environment node` finalmente
 * funciona aqui. Era o drift capturado na Fase 1; o comentário antigo dizia
 * "candidato para a Fase 2" e é exatamente o que aconteceu.
 *
 * The machine's input space is five booleans = 32 combinations, so every state
 * is asserted rather than sampled — strictly stronger than property-based
 * fuzzing here, and with zero new dependency (plan ADR-11).
 *
 * The final block is the REFACTOR SAFETY NET: it re-derives, from the machine,
 * exactly the expression each of the six duplicated call sites used to compute
 * inline, so a future change to the machine that would have silently altered
 * one of those components fails here first.
 */
import { describe, it, expect } from 'vitest';
import { answerMachine, choiceOptionState, type AnswerMachineInput } from './answerMachine';

const BOOLS = [false, true] as const;

/** All 32 input combinations, in a stable order. */
const ALL_INPUTS: AnswerMachineInput[] = BOOLS.flatMap((done) =>
  BOOLS.flatMap((submitted) =>
    BOOLS.flatMap((reveal) =>
      BOOLS.flatMap((correct) => BOOLS.map((hasAnswer) => ({ done, submitted, reveal, correct, hasAnswer }))),
    ),
  ),
);

const label = (i: AnswerMachineInput) =>
  `done=${i.done} submitted=${i.submitted} reveal=${i.reveal} correct=${i.correct} hasAnswer=${i.hasAnswer}`;

describe('answerMachine — the state axes', () => {
  /* ── Tainan's enumerated list, one describe per state he named ──────────── */

  describe('activity ENABLED (fresh, answerable)', () => {
    const m = answerMachine({ done: false, submitted: false, reveal: false, correct: false, hasAnswer: false });

    it('is not locked and accepts interaction', () => {
      expect(m.locked).toBe(false);
      expect(m.acceptsSubmit).toBe(true);
    });

    it('shows no verdict and no answer key', () => {
      expect(m.shown).toBe(false);
      expect(m.showKey).toBe(false);
      expect(m.gradeResult).toBeUndefined();
    });

    it('keeps SUBMIT DISABLED until there is an answer (the "resposta desabilitada" state)', () => {
      expect(m.submitDisabled).toBe(true);
      expect(m.submitLocked).toBe(false);
    });
  });

  describe('ANSWERED but NOT submitted (an answer exists, "Enviar" not pressed)', () => {
    const m = answerMachine({ done: false, submitted: false, reveal: false, correct: true, hasAnswer: true });

    it('ENABLES submit — this is the whole point of the state', () => {
      expect(m.submitDisabled).toBe(false);
      expect(m.acceptsSubmit).toBe(true);
    });

    it('leaks NOTHING about correctness before the learner commits', () => {
      expect(m.shown).toBe(false);
      expect(m.gradeResult).toBeUndefined();
      expect(m.submitLocked).toBe(false);
    });

    it('leaks nothing even when the current answer happens to be wrong', () => {
      const wrong = answerMachine({ done: false, submitted: false, reveal: false, correct: false, hasAnswer: true });
      expect(wrong.shown).toBe(false);
      expect(wrong.gradeResult).toBeUndefined();
    });
  });

  describe('ANSWERED + CORRECT (submitted this session, right)', () => {
    const m = answerMachine({ done: false, submitted: true, reveal: false, correct: true, hasAnswer: true });

    it('shows the verdict and grades TRUE', () => {
      expect(m.shown).toBe(true);
      expect(m.gradeResult).toBe(true);
    });

    it('freezes the inputs and refuses a second submit', () => {
      expect(m.locked).toBe(true);
      expect(m.acceptsSubmit).toBe(false);
      expect(m.submitLocked).toBe(true);
    });

    it('shows the learner’s own answer, not the key', () => {
      expect(m.showKey).toBe(false);
    });
  });

  describe('ANSWERED + INCORRECT (submitted this session, wrong)', () => {
    const m = answerMachine({ done: false, submitted: true, reveal: false, correct: false, hasAnswer: true });

    it('shows the verdict and grades FALSE — not undefined', () => {
      expect(m.shown).toBe(true);
      expect(m.gradeResult).toBe(false);
      // Guards the SubmitButton contract: `graded = submitted && correct !== undefined`,
      // so `false` (red) and `undefined` (neutral) are DIFFERENT renders.
      expect(m.gradeResult).not.toBeUndefined();
    });

    it('freezes exactly like the correct case — being wrong is not a retry', () => {
      expect(m.locked).toBe(true);
      expect(m.acceptsSubmit).toBe(false);
    });
  });

  describe('RESPONSE DISABLED via reveal (clock stopped, answer key exposed)', () => {
    const m = answerMachine({ done: false, submitted: false, reveal: true, correct: false, hasAnswer: true });

    it('locks the inputs and the submit button even with a valid answer staged', () => {
      expect(m.locked).toBe(true);
      expect(m.acceptsSubmit).toBe(false);
      expect(m.submitDisabled).toBe(true);
    });

    it('shows the ANSWER KEY, not a graded version of the learner’s answer', () => {
      expect(m.shown).toBe(true);
      expect(m.showKey).toBe(true);
      expect(m.gradeResult).toBeUndefined();
    });

    it('does NOT claim the learner submitted anything', () => {
      // Regression guard: `submitLocked` is `submitted || done` — NOT `locked`.
      // A revealed-but-unanswered activity must not render "Enviado".
      expect(m.submitLocked).toBe(false);
    });
  });

  describe('ACTIVITY DISABLED via done (completed in an earlier session)', () => {
    const m = answerMachine({ done: true, submitted: false, reveal: false, correct: true, hasAnswer: false });

    it('locks the activity', () => {
      expect(m.locked).toBe(true);
      expect(m.acceptsSubmit).toBe(false);
      expect(m.submitLocked).toBe(true);
    });

    it('does NOT expose a verdict — the earlier answer is unknown to this render', () => {
      // The whole reason `gradeResult` is gated on `submitted` and not on
      // `done`: on a done render `correct` is computed against an EMPTY local
      // selection, so honouring it would paint the button red at random.
      expect(m.gradeResult).toBeUndefined();
      expect(m.shown).toBe(false);
      expect(m.showKey).toBe(false);
    });
  });

  describe('done AND reveal together (a completed activity on a stopped clock)', () => {
    const m = answerMachine({ done: true, submitted: false, reveal: true, correct: false, hasAnswer: true });

    it('shows the key, stays locked, and still reports no grade', () => {
      expect(m).toEqual({
        shown: true,
        locked: true,
        acceptsSubmit: false,
        submitLocked: true,
        submitDisabled: true,
        gradeResult: undefined,
        showKey: true,
      });
    });
  });
});

describe('answerMachine — exhaustive matrix (all 32 combinations)', () => {
  it('enumerates exactly 32 distinct inputs', () => {
    expect(ALL_INPUTS).toHaveLength(32);
    expect(new Set(ALL_INPUTS.map(label)).size).toBe(32);
  });

  it.each(ALL_INPUTS.map((i) => [label(i), i] as const))('%s', (_l, input) => {
    const m = answerMachine(input);
    const { done, submitted, reveal = false, correct, hasAnswer } = input;

    // Each output re-derived independently from the spec prose, not copied
    // from the implementation.
    expect(m.shown).toBe(submitted || reveal);
    expect(m.locked).toBe(submitted || done || reveal);
    expect(m.acceptsSubmit).toBe(!(submitted || done || reveal));
    expect(m.submitLocked).toBe(submitted || done);
    expect(m.submitDisabled).toBe(!hasAnswer || reveal);
    expect(m.gradeResult).toBe(submitted ? correct : undefined);
    expect(m.showKey).toBe(reveal && !submitted);
  });
});

describe('answerMachine — invariants that must hold across the whole matrix', () => {
  it('a grade is NEVER exposed without a submission', () => {
    for (const i of ALL_INPUTS) {
      if (!i.submitted) expect(answerMachine(i).gradeResult).toBeUndefined();
    }
  });

  it('a graded state is ALWAYS also a shown state (no silent verdict)', () => {
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      if (m.gradeResult !== undefined) expect(m.shown).toBe(true);
    }
  });

  it('accepting a submit and being locked are mutually exclusive', () => {
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      expect(m.acceptsSubmit).toBe(!m.locked);
    }
  });

  it('an accepted submit is always still interactive (never shown, never key)', () => {
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      if (m.acceptsSubmit) {
        expect(m.shown).toBe(false);
        expect(m.showKey).toBe(false);
        expect(m.submitLocked).toBe(false);
      }
    }
  });

  it('the answer key is only ever shown on an unsubmitted reveal', () => {
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      if (m.showKey) {
        expect(i.reveal).toBe(true);
        expect(i.submitted).toBe(false);
        expect(m.gradeResult).toBeUndefined();
      }
    }
  });

  it('the EFFECTIVE submit-button disabled state is true whenever the machine is locked', () => {
    // `SubmitButton` renders `disabled={submitted || disabled}` where its
    // `submitted` prop is our `submitLocked`. So the effective disabled is the
    // OR — and it must cover every locked state, or a locked activity would
    // expose a live "Enviar".
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      const effectiveDisabled = m.submitLocked || m.submitDisabled;
      if (m.locked) expect(effectiveDisabled).toBe(true);
    }
  });

  it('submit is enabled ONLY when an answer exists and nothing is locked', () => {
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      const effectiveDisabled = m.submitLocked || m.submitDisabled;
      if (!effectiveDisabled) {
        expect(i.hasAnswer).toBe(true);
        expect(m.locked).toBe(false);
        expect(m.acceptsSubmit).toBe(true);
      }
    }
  });

  it('`reveal` defaults to false when omitted (kinds that never reveal, e.g. quiz)', () => {
    const withOmitted = answerMachine({ done: false, submitted: true, correct: true, hasAnswer: true });
    const withExplicit = answerMachine({ done: false, submitted: true, reveal: false, correct: true, hasAnswer: true });
    expect(withOmitted).toEqual(withExplicit);
  });
});

describe('choiceOptionState', () => {
  it('is neutral before the verdict is shown', () => {
    expect(choiceOptionState({ shown: false, chosen: false, isCorrectOption: false })).toBe('idle');
    expect(choiceOptionState({ shown: false, chosen: false, isCorrectOption: true })).toBe('idle');
    expect(choiceOptionState({ shown: false, chosen: true, isCorrectOption: false })).toBe('chosen');
    expect(choiceOptionState({ shown: false, chosen: true, isCorrectOption: true })).toBe('chosen');
  });

  it('flags the correct option green once shown, picked or not', () => {
    expect(choiceOptionState({ shown: true, chosen: true, isCorrectOption: true })).toBe('correct');
    expect(choiceOptionState({ shown: true, chosen: false, isCorrectOption: true })).toBe('correct');
  });

  it('flags a WRONG PICK red, but leaves an unpicked distractor neutral', () => {
    expect(choiceOptionState({ shown: true, chosen: true, isCorrectOption: false })).toBe('wrong');
    expect(choiceOptionState({ shown: true, chosen: false, isCorrectOption: false })).toBe('idle');
  });

  it('never reports both correct and wrong for the same option', () => {
    for (const shown of BOOLS)
      for (const chosen of BOOLS)
        for (const isCorrectOption of BOOLS) {
          const s = choiceOptionState({ shown, chosen, isCorrectOption });
          expect(['correct', 'wrong', 'chosen', 'idle']).toContain(s);
          if (s === 'wrong') expect(isCorrectOption).toBe(false);
          if (s === 'correct') expect(isCorrectOption).toBe(true);
        }
  });
});

/* ── REFACTOR SAFETY NET ──────────────────────────────────────────────────────
   Each case below is the expression the component computed INLINE before the
   extraction, re-derived from the machine. If the machine ever drifts from what
   a component used to do, this fails before the component's own test does — and
   names which component broke. */
describe('answerMachine — equivalence with the six former inline copies', () => {
  it.each(ALL_INPUTS.map((i) => [label(i), i] as const))(
    'SingleChoice / MultiChoice: %s',
    (_l, { done, submitted, reveal = false, correct, hasAnswer }) => {
      const m = answerMachine({ done, submitted, reveal, correct, hasAnswer });
      // SingleChoiceActivity.tsx:55-61 / MultiChoiceActivity.tsx:56-63
      expect(m.shown).toBe(submitted || reveal);
      expect(m.gradeResult).toBe(submitted ? correct : undefined);
      // option `disabled={submitted || isDone || reveal}`
      expect(m.locked).toBe(submitted || done || reveal);
      // <SubmitButton submitted={submitted || isDone} disabled={!hasAnswer || reveal} />
      expect(m.submitLocked).toBe(submitted || done);
      expect(m.submitDisabled).toBe(!hasAnswer || reveal);
    },
  );

  it.each(ALL_INPUTS.map((i) => [label(i), i] as const))(
    'Order / Match: %s',
    (_l, { done, submitted, reveal = false, correct, hasAnswer }) => {
      const m = answerMachine({ done, submitted, reveal, correct, hasAnswer });
      // OrderActivity.tsx:41-46,62 / MatchActivity.tsx:115-120,163
      expect(m.locked).toBe(submitted || done || reveal);
      expect(m.shown).toBe(submitted || reveal);
      expect(m.gradeResult).toBe(submitted ? correct : undefined);
      // `displayOrder = reveal && !submitted ? correctOrder : order`
      // `displayedPairs = reveal && !submitted ? pairs : made`
      expect(m.showKey).toBe(reveal && !submitted);
    },
  );

  it.each(ALL_INPUTS.map((i) => [label(i), i] as const))(
    'Quiz (inline, has NO reveal prop): %s',
    (_l, { done, submitted, correct, hasAnswer }) => {
      // ActivityRenderer.tsx:439-452 — quiz never reveals, so reveal is pinned false.
      const m = answerMachine({ done, submitted, reveal: false, correct, hasAnswer });
      expect(m.shown).toBe(submitted); // `showCorrect = submitted && o.isCorrect`
      expect(m.gradeResult).toBe(submitted ? correct : undefined);
      expect(m.submitLocked).toBe(submitted || done);
      expect(m.submitDisabled).toBe(!hasAnswer); // `disabled={selected === null}`
      // `if (submitted || isDone) return;` — with reveal pinned false this is
      // exactly !acceptsSubmit.
      expect(m.acceptsSubmit).toBe(!(submitted || done));
    },
  );

  it.each(ALL_INPUTS.map((i) => [label(i), i] as const))(
    'ByocTree: %s',
    (_l, { done, submitted, reveal = false, correct, hasAnswer }) => {
      const m = answerMachine({ done, submitted, reveal, correct, hasAnswer });
      // ByocTree.tsx:38-39,49,107-110
      expect(m.shown).toBe(submitted || reveal);
      expect(m.locked).toBe(submitted || reveal || done);
      expect(m.acceptsSubmit).toBe(!(submitted || reveal || done));
      expect(m.submitLocked).toBe(submitted || done);
      // ByocTree passed `disabled={locked || !isAnswerComplete(...)}`. The
      // machine drops the `locked` term because SubmitButton ORs in
      // `submitLocked` anyway — so the EFFECTIVE disabled is unchanged.
      const before = (submitted || done) || ((submitted || reveal || done) || !hasAnswer);
      const after = m.submitLocked || m.submitDisabled;
      expect(after).toBe(before);
    },
  );

  it('SingleChoice/MultiChoice/Quiz: the submit GUARD is unchanged in practice', () => {
    // Those three guarded on `submitted || isDone` (no `reveal`), while the
    // machine's `acceptsSubmit` also excludes `reveal`. The difference is only
    // reachable by invoking handleSubmit while `reveal` is true — impossible
    // through the UI, because `submitDisabled` already includes `reveal` and
    // <SubmitButton> renders a real `disabled` attribute (and drops onClick).
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      const oldGuardWouldAccept = !(i.submitted || i.done);
      if (oldGuardWouldAccept !== m.acceptsSubmit) {
        // The only divergent inputs are reveal=true ones …
        expect(i.reveal).toBe(true);
        // … and in every one of them the button is disabled, so the guard is
        // unreachable either way.
        expect(m.submitLocked || m.submitDisabled).toBe(true);
      }
    }
  });
});
