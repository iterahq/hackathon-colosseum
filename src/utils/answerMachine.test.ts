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
 * The machine's input space is six booleans = 64 combinations, so every state
 * is asserted rather than sampled — strictly stronger than property-based
 * fuzzing here, and with zero new dependency (plan ADR-11).
 *
 * ── The sixth boolean: `restored` ───────────────────────────────────────────
 * It arrived with `<ActivityRenderer priorAnswer={…}>` — the host replaying the
 * completion this activity handed up in an earlier session, so a `done` render
 * can show WHICH answer the learner gave instead of a fresh-but-greyed one.
 *
 * The matrix DOUBLED rather than being relaxed. Three properties keep it that
 * way, and each one is asserted below:
 *
 *  1. **Backward compatibility is exact, not approximate.** `RESTORED_IS_INERT`
 *     re-derives all seven outputs from the PRE-restore formulas over the 32
 *     no-restore combinations. A machine that changed any of them by a hair
 *     fails there.
 *  2. **`restored` alone never grades.** The verdict is gated on
 *     `done && restored`, so no prop can settle a fresh activity — plan
 *     `20260728-itera-activity-testing`, ADR-4.
 *  3. **The old invariants got STRONGER, not weaker.** "A grade is never
 *     exposed without a submission" became "never exposed without a KNOWN
 *     answer", and its two halves are asserted separately so neither can be
 *     satisfied by the other.
 *
 * The final block is the REFACTOR SAFETY NET: it re-derives, from the machine,
 * exactly the expression each of the six duplicated call sites used to compute
 * inline, so a future change to the machine that would have silently altered
 * one of those components fails here first. Those six call sites pass no
 * `restored` — none of them existed when it did — so the net runs over the
 * 32-combination BASE matrix, pinned.
 */
import { describe, it, expect } from 'vitest';
import { answerMachine, choiceOptionState, type AnswerMachineInput } from './answerMachine';

const BOOLS = [false, true] as const;

/**
 * The 32 combinations of the FIVE original inputs — the machine as it was
 * before `priorAnswer` existed.
 *
 * Kept as its own list because two blocks below are statements ABOUT that
 * earlier machine: the refactor safety net (the six call sites predate
 * `restored`) and the backward-compatibility net. Deriving them by filtering
 * the 64 would work, but it would hide which claim is being made.
 */
const BASE_INPUTS: AnswerMachineInput[] = BOOLS.flatMap((done) =>
  BOOLS.flatMap((submitted) =>
    BOOLS.flatMap((reveal) =>
      BOOLS.flatMap((correct) => BOOLS.map((hasAnswer) => ({ done, submitted, reveal, correct, hasAnswer }))),
    ),
  ),
);

/** All 64 input combinations, in a stable order. */
const ALL_INPUTS: AnswerMachineInput[] = BASE_INPUTS.flatMap((base) =>
  BOOLS.map((restored) => ({ ...base, restored })),
);

const label = (i: AnswerMachineInput) =>
  `done=${i.done} submitted=${i.submitted} reveal=${i.reveal} restored=${i.restored} correct=${i.correct} hasAnswer=${i.hasAnswer}`;

/**
 * The learner's own answer is KNOWN to this render — re-derived from the prose,
 * not read off the implementation. They either sent it in THIS session, or the
 * host replayed the one they sent in an earlier, completed one.
 */
const isGraded = (i: AnswerMachineInput) =>
  i.submitted || (i.done && Boolean(i.restored));

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

  /* ── the state `priorAnswer` added ────────────────────────────────────── */

  describe('RESTORED (done, with the learner\u2019s own earlier answer replayed)', () => {
    const right = answerMachine({
      done: true,
      submitted: false,
      reveal: false,
      restored: true,
      correct: true,
      hasAnswer: true,
    });
    const wrong = answerMachine({
      done: true,
      submitted: false,
      reveal: false,
      restored: true,
      correct: false,
      hasAnswer: true,
    });

    it('EXPOSES the verdict — this is the whole point of the state', () => {
      expect(right.shown).toBe(true);
      expect(right.gradeResult).toBe(true);
      expect(wrong.shown).toBe(true);
      expect(wrong.gradeResult).toBe(false);
      // The wrong case is the pedagogically valuable one, so it must be `false`
      // (red) and not `undefined` (neutral) — two different renders.
      expect(wrong.gradeResult).not.toBeUndefined();
    });

    it('stays locked and still refuses a submit — a replay is not a retry', () => {
      for (const m of [right, wrong]) {
        expect(m.locked).toBe(true);
        expect(m.acceptsSubmit).toBe(false);
        expect(m.submitLocked).toBe(true);
      }
    });

    it('shows the LEARNER\u2019S answer, never the key', () => {
      expect(right.showKey).toBe(false);
      expect(wrong.showKey).toBe(false);
    });

    it('matches the state a live submit reaches, output for output', () => {
      // The claim the feature makes, written as an equality: replaying an
      // answer renders the SAME thing as having just sent it. `submitLocked`
      // is `submitted || done`, so both sides say \u201cEnviado\u201d.
      const live = answerMachine({
        done: false,
        submitted: true,
        reveal: false,
        correct: true,
        hasAnswer: true,
      });
      expect(right).toEqual(live);
    });

    it('keeps the ANSWER KEY off the screen even on a stopped clock', () => {
      // done + reveal used to show the key, because the learner\u2019s answer was
      // unknown. Once it is known, painting the solution over it would hide the
      // one thing this render exists to say.
      const m = answerMachine({
        done: true,
        submitted: false,
        reveal: true,
        restored: true,
        correct: false,
        hasAnswer: true,
      });
      expect(m.showKey).toBe(false);
      expect(m.gradeResult).toBe(false);
      expect(m.locked).toBe(true);
    });
  });

  describe('RESTORED but NOT done \u2014 the ADR-4 floor', () => {
    // Plan `20260728-itera-activity-testing`, ADR-4: a state reachable by a prop
    // but not by a real user is a false green. `restored` is gated on `done`
    // INSIDE the machine, so a host that replays an answer onto a fresh row
    // seeds the inputs and reaches NO verdict.
    const m = answerMachine({
      done: false,
      submitted: false,
      reveal: false,
      restored: true,
      correct: true,
      hasAnswer: true,
    });

    it('reaches NO verdict — a prop cannot settle an unfinished activity', () => {
      expect(m.gradeResult).toBeUndefined();
      expect(m.shown).toBe(false);
    });

    it('leaves the activity fully answerable', () => {
      expect(m.locked).toBe(false);
      expect(m.acceptsSubmit).toBe(true);
      expect(m.submitLocked).toBe(false);
      expect(m.submitDisabled).toBe(false);
    });

    it('is INDISTINGUISHABLE from the same render without the replay', () => {
      const without = answerMachine({
        done: false,
        submitted: false,
        reveal: false,
        correct: true,
        hasAnswer: true,
      });
      expect(m).toEqual(without);
    });
  });
});

describe('answerMachine — exhaustive matrix (all 64 combinations)', () => {
  it('enumerates exactly 64 distinct inputs', () => {
    expect(ALL_INPUTS).toHaveLength(64);
    expect(new Set(ALL_INPUTS.map(label)).size).toBe(64);
    // The doubling is honest: the 64 are the 32 with each value of `restored`,
    // so nothing from the earlier matrix was dropped to make room.
    expect(BASE_INPUTS).toHaveLength(32);
    expect(ALL_INPUTS.filter((i) => i.restored === false)).toHaveLength(32);
    expect(ALL_INPUTS.filter((i) => i.restored === true)).toHaveLength(32);
  });

  it.each(ALL_INPUTS.map((i) => [label(i), i] as const))('%s', (_l, input) => {
    const m = answerMachine(input);
    const { done, submitted, reveal = false, correct, hasAnswer } = input;
    const graded = isGraded(input);

    // Each output re-derived independently from the spec prose, not copied
    // from the implementation.
    expect(m.shown).toBe(graded || reveal);
    expect(m.locked).toBe(submitted || done || reveal);
    expect(m.acceptsSubmit).toBe(!(submitted || done || reveal));
    expect(m.submitLocked).toBe(submitted || done);
    expect(m.submitDisabled).toBe(!hasAnswer || reveal);
    expect(m.gradeResult).toBe(graded ? correct : undefined);
    expect(m.showKey).toBe(reveal && !graded);
  });
});

/* ── BACKWARD-COMPATIBILITY NET ───────────────────────────────────────────────
   `restored` is an ADDITION, and this block is what makes that word mean
   something. It re-derives all seven outputs from the formulas the machine used
   BEFORE `priorAnswer` existed, over the 32 no-restore combinations, and it
   also pins that OMITTING the input equals passing `false`. A host that never
   heard of the prop therefore gets the machine it already had — bit for bit,
   not "in spirit". */
describe('answerMachine — `restored` is INERT when the host does not replay', () => {
  it.each(BASE_INPUTS.map((i) => [label(i), i] as const))(
    'pre-restore formulas still hold: %s',
    (_l, { done, submitted, reveal = false, correct, hasAnswer }) => {
      const m = answerMachine({ done, submitted, reveal, restored: false, correct, hasAnswer });
      expect(m.shown).toBe(submitted || reveal);
      expect(m.locked).toBe(submitted || done || reveal);
      expect(m.acceptsSubmit).toBe(!(submitted || done || reveal));
      expect(m.submitLocked).toBe(submitted || done);
      expect(m.submitDisabled).toBe(!hasAnswer || reveal);
      expect(m.gradeResult).toBe(submitted ? correct : undefined);
      expect(m.showKey).toBe(reveal && !submitted);
    },
  );

  it.each(BASE_INPUTS.map((i) => [label(i), i] as const))(
    'omitting `restored` equals passing false: %s',
    (_l, input) => {
      expect(answerMachine(input)).toEqual(answerMachine({ ...input, restored: false }));
    },
  );

  it('a restore only ever CHANGES a render that is `done` and not already submitted', () => {
    // The blast radius, measured rather than asserted in prose: outside
    // done-and-not-submitted, flipping `restored` must change nothing at all.
    for (const base of BASE_INPUTS) {
      const off = answerMachine({ ...base, restored: false });
      const on = answerMachine({ ...base, restored: true });
      if (base.done && !base.submitted) continue;
      expect(on).toEqual(off);
    }
  });
});

describe('answerMachine — invariants that must hold across the whole matrix', () => {
  it('a grade is NEVER exposed without a KNOWN answer', () => {
    // The pre-restore wording was "without a submission". It was the same
    // assertion then, because a submission was the only way an answer could be
    // known. `priorAnswer` adds the second way, so the invariant is stated over
    // the property rather than over the mechanism — and the two halves below
    // pin each mechanism separately, so neither can carry the other.
    for (const i of ALL_INPUTS) {
      if (!isGraded(i)) expect(answerMachine(i).gradeResult).toBeUndefined();
    }
  });

  it('half 1 — nothing but `submitted` grades an activity that is NOT done', () => {
    for (const i of ALL_INPUTS) {
      if (i.done) continue;
      expect(answerMachine(i).gradeResult).toBe(i.submitted ? i.correct : undefined);
    }
  });

  it('half 2 — on a `done` activity, ONLY a replay adds the verdict', () => {
    // ADR-4 restated as a bound: `restored` buys exactly one thing, on exactly
    // one kind of render, and it buys it only in company with `done`.
    for (const i of ALL_INPUTS) {
      if (!i.done || i.submitted) continue;
      expect(answerMachine(i).gradeResult).toBe(i.restored ? i.correct : undefined);
    }
  });

  it('a replay never unlocks, never re-arms submit, and never claims a NEW send', () => {
    for (const base of BASE_INPUTS) {
      const on = answerMachine({ ...base, restored: true });
      const off = answerMachine({ ...base, restored: false });
      expect(on.locked).toBe(off.locked);
      expect(on.acceptsSubmit).toBe(off.acceptsSubmit);
      expect(on.submitLocked).toBe(off.submitLocked);
      expect(on.submitDisabled).toBe(off.submitDisabled);
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

  it('the answer key is only ever shown when the learner\u2019s own answer is UNKNOWN', () => {
    // Pre-restore this read "on an unsubmitted reveal", and it still implies
    // that. The key exists to fill a gap; once the real answer is on screen
    // there is no gap, so the condition is now stated over the gap itself.
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      if (m.showKey) {
        expect(i.reveal).toBe(true);
        expect(i.submitted).toBe(false);
        expect(isGraded(i)).toBe(false);
        expect(m.gradeResult).toBeUndefined();
      }
    }
  });

  it('the key and the learner\u2019s graded answer are never on screen together', () => {
    for (const i of ALL_INPUTS) {
      const m = answerMachine(i);
      if (m.showKey) expect(m.gradeResult).toBeUndefined();
      if (m.gradeResult !== undefined) expect(m.showKey).toBe(false);
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

  it('`restored` defaults to false when omitted (kinds that cannot replay)', () => {
    const withOmitted = answerMachine({ done: true, submitted: false, correct: true, hasAnswer: false });
    const withExplicit = answerMachine({
      done: true,
      submitted: false,
      restored: false,
      correct: true,
      hasAnswer: false,
    });
    expect(withOmitted).toEqual(withExplicit);
    // And the default is the SAFE one: a kind that never heard of the replay
    // keeps the old \u201cthe earlier answer is unknown\u201d render.
    expect(withOmitted.gradeResult).toBeUndefined();
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
   names which component broke.

   ⚠️ It runs over `BASE_INPUTS`, i.e. `restored` pinned false, and that is the
   only configuration in which the claim is even meaningful: none of the six
   inline copies had a replayed answer to read, so there is no earlier
   expression for `restored: true` to be equivalent TO. Pinning it keeps the net
   a statement about the PAST. What the new input does to the present is pinned
   separately, and just as exhaustively, by `restored is INERT` above and by the
   two ADR-4 halves in the invariants block. */
describe('answerMachine — equivalence with the six former inline copies', () => {
  it.each(BASE_INPUTS.map((i) => [label(i), i] as const))(
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

  it.each(BASE_INPUTS.map((i) => [label(i), i] as const))(
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

  it.each(BASE_INPUTS.map((i) => [label(i), i] as const))(
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

  it.each(BASE_INPUTS.map((i) => [label(i), i] as const))(
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
