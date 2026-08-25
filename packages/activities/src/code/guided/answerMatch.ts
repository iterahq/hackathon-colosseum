/**
 * Does what the learner typed count as the authored answer?
 *
 * Pure, and deliberately its own module: this is the one rule in the guided
 * variants that decides whether a learner passes or fails, and it needs to be
 * readable — and provable — without a template, a React tree or a spec around
 * it.
 *
 * TWO modes, and which one applies is the AUTHOR's call, per blank:
 *
 *   • `exact` — the default, and the default on purpose. Whitespace around the
 *     value is forgiven (an inline input invites a stray space); everything else
 *     is compared character for character, because in code `useState` and
 *     `usestate` are not the same word and pretending otherwise teaches the
 *     wrong thing. A blank authored before this module existed carries no
 *     `match`, so it lands here and grades exactly as it always did.
 *
 *   • `loose` — for the blanks whose answer is PROSE, not code: a title, a term,
 *     a person's name. It forgives how the word was WRITTEN — case, accents,
 *     repeated inner spaces, punctuation at the edges — and nothing else. A
 *     learner who wrote `jose` for `José` in the middle of a live class knew the
 *     answer, and failing them there is the bug this exists to fix.
 *
 * What `loose` is NOT is a fuzzy matcher. No stemming, no edit distance, no
 * synonym table: a DIFFERENT word stays wrong. A second correct wording is
 * authored data (`accept`), because the author is the one who knows whether it
 * is correct — a guesser here would eventually award a point for a wrong answer,
 * and that is worse than the failure it was meant to fix.
 */

export type AnswerMatchMode = 'exact' | 'loose';

/**
 * The structural slice of a blank that grading reads. Structural, not
 * `CodeBlank`, so this module holds no opinion about the rest of the shape —
 * and so a spec whose `match`/`accept` are still absent flows through it
 * unchanged.
 */
export interface AnswerRule {
  answer: string;
  match?: AnswerMatchMode;
  accept?: readonly string[];
}

const COMBINING_MARKS = /\p{Mn}/gu;
const EDGE_PUNCTUATION = /^\p{P}+|\p{P}+$/gu;

/**
 * The comparison form used by `loose`. For COMPARING only — never store it,
 * never show it: `revealedValues` still puts the authored `answer` on the
 * projector, spelling and capitals intact.
 */
export function normalizeLooseAnswer(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(EDGE_PUNCTUATION, '')
    .trim()
    .toLowerCase();
}

/** Every wording that grades as correct: the gabarito first, then `accept`. */
export function acceptedAnswers(rule: AnswerRule): string[] {
  return [rule.answer, ...(rule.accept ?? [])];
}

export function matchesAnswer(rule: AnswerRule, value: string | undefined): boolean {
  // Anything that is not literally `loose` grades exact, so an unrecognised
  // mode fails closed rather than silently loosening the whole activity.
  if (rule.match !== 'loose') {
    const typed = (value ?? '').trim();
    return acceptedAnswers(rule).some((candidate) => typed === candidate.trim());
  }

  const typed = normalizeLooseAnswer(value ?? '');
  // Stripping edge punctuation can empty a string, and an empty hole is never
  // an answer — without this, `...` would grade correct against an answer that
  // normalized away too.
  if (!typed) return false;
  return acceptedAnswers(rule).some((candidate) => {
    const expected = normalizeLooseAnswer(candidate);
    return expected.length > 0 && typed === expected;
  });
}
