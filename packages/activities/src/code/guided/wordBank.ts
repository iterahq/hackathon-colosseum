import type { CodeBlank, CodeSpec } from '@iterahq/activity-spec';
import type { GuidedValues } from './types.js';

/**
 * The word bank of the `bank` variant, and the one thing that depends on it: what
 * a saved draft is still allowed to put back on screen.
 *
 * Split out of `guidedCode.ts` because these three answer the same question —
 * WHICH WORDS EXIST for this spec — while the rest of that module is about the
 * template and the verdict.
 */

/**
 * The chip pool for `bank` blanks.
 *
 * A declared `word_bank` wins verbatim — the order is a teaching decision (a
 * bank that lists the words in the order they are needed is a different
 * exercise from one that does not). With no `word_bank` the pool is derived:
 * every `bank` answer plus the distractors those blanks carry. Derived rather
 * than required because the common case — one right word per hole — should not
 * make the author type the same list twice.
 *
 * ⚠️ The pool is a MULTISET, and that is the whole point: two holes whose answer
 * is the same word need two chips. Deduping it made that exercise impossible to
 * finish — the first placement spent the only chip and the second hole could
 * never be filled. Only distractors are deduped, since a repeated wrong option
 * is noise rather than a second slot.
 *
 * ⚠️ And the derived pool is SORTED, not left in authoring order. In authoring
 * order the answers come out first and in hole order, so tapping the chips left
 * to right scored full marks without reading the code. Sorted rather than
 * shuffled because a pool that reorders itself between renders moves the chip
 * out from under the learner's finger.
 */
export function buildWordBank(spec: CodeSpec): string[] {
  if (spec.word_bank?.length) return [...spec.word_bank];
  const pool: string[] = [];
  const distractors: string[] = [];
  for (const blank of spec.blanks ?? []) {
    if (blank.kind !== 'bank') continue;
    pool.push(blank.answer);
    distractors.push(...(blank.options ?? []));
  }
  for (const word of distractors) if (!pool.includes(word)) pool.push(word);
  return pool.sort((a, b) => a.localeCompare(b));
}

/**
 * How many holes each word is currently sitting in, so the bank can dim exactly
 * that many chips — counting, not a set, for the same reason the pool is a
 * multiset.
 */
export function spentBankCounts(
  blanks: readonly CodeBlank[],
  values: GuidedValues,
): Record<string, number> {
  const spent: Record<string, number> = {};
  for (const blank of blanks) {
    if (blank.kind !== 'bank') continue;
    const value = values[blank.id];
    if (value) spent[value] = (spent[value] ?? 0) + 1;
  }
  return spent;
}

/**
 * The learner's saved answers, minus the ones this spec can no longer accept.
 *
 * Ids are not enough. A `select` restored with a value the author has since
 * removed from `options` shows the empty placeholder while the state still holds
 * the old word — the hole reads as blank, submit unlocks anyway, and the verdict
 * describes something that is not on screen. Same for a chip that left the bank.
 *
 * The type check is not paranoia about our own writer: this comes back through
 * the storage port, i.e. out of localStorage in every host that does not
 * redirect it, which anyone with the device console can hand-edit. A number in
 * there reaches `.trim()` and takes the whole activity down.
 */
export function restoreGuidedValues(spec: CodeSpec, saved: GuidedValues): GuidedValues {
  const bank = buildWordBank(spec);
  const kept: GuidedValues = {};
  for (const blank of spec.blanks ?? []) {
    const value = saved[blank.id];
    if (!value || typeof value !== 'string') continue;
    if (blank.kind === 'select' && ![blank.answer, ...(blank.options ?? [])].includes(value))
      continue;
    if (blank.kind === 'bank' && !bank.includes(value)) continue;
    kept[blank.id] = value;
  }
  return kept;
}
