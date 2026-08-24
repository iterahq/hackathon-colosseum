import { CODE_BLANK_TOKEN_RE, type CodeBlank, type CodeSpec } from '@iterahq/activity-spec';
import type {
  GuidedGrade,
  GuidedLine,
  GuidedSegment,
  GuidedValues,
  GuidedVariant,
} from './types.js';

/**
 * The pure half of the GUIDED code variants: template → segments, values →
 * source, values → verdict.
 *
 * The whole point of the variants is that the editor is mostly LOCKED and only
 * the authored holes are interactive. That inverts where the difficulty sits: a
 * blank open editor asks the learner to remember syntax they have not learnt
 * yet, and the failure mode is an empty screen. Here the syntax is given and the
 * learner supplies the one decision the exercise is actually about.
 *
 * Kept out of React on purpose — every rule below is a value-in/value-out
 * question, and the components should not be where you go to read them.
 */

const VARIANT_OF_KIND = { bank: 'options', select: 'dropdown', text: 'text' } as const;

export function guidedVariant(blanks: readonly CodeBlank[]): GuidedVariant {
  const kinds = new Set(blanks.map((b) => b.kind));
  if (kinds.size !== 1) return 'mixed';
  return VARIANT_OF_KIND[[...kinds][0]];
}

/** True when this `code` spec should render guided instead of the open editor. */
export function isGuidedCodeSpec(spec: CodeSpec): boolean {
  return (spec.blanks?.length ?? 0) > 0;
}

/**
 * Split the template into lines of segments.
 *
 * Lines first, tokens second: a gutter needs to know where the newlines are,
 * and a widget that straddled a line break would have nowhere to sit. The
 * schema guarantees every declared blank is tokenised exactly once, so an
 * unknown token here is unreachable rather than defended against.
 */
export function splitGuidedTemplate(starter: string, blanks: readonly CodeBlank[]): GuidedLine[] {
  const byId = new Map(blanks.map((b) => [b.id, b]));
  return starter.split('\n').map((line, i) => {
    const segments: GuidedSegment[] = [];
    let cursor = 0;
    for (const match of line.matchAll(CODE_BLANK_TOKEN_RE)) {
      const blank = byId.get(match[1] ?? '');
      if (!blank) continue;
      const before = line.slice(cursor, match.index);
      if (before) segments.push({ kind: 'code', text: before });
      segments.push({ kind: 'blank', blank });
      cursor = (match.index ?? 0) + match[0].length;
    }
    const rest = line.slice(cursor);
    if (rest || !segments.length) segments.push({ kind: 'code', text: rest });
    return { number: i + 1, segments };
  });
}

/**
 * The template with every token replaced by what the learner put there.
 *
 * This is the source that goes to the preview, to the saved draft and up as the
 * settled `response`. An unfilled blank collapses to the empty string, which is
 * why the preview waits for `allBlanksFilled`: half-substituted JSX is a syntax
 * error, and a red error the learner cannot yet fix reads as "I broke it".
 */
export function substituteBlanks(
  starter: string,
  blanks: readonly CodeBlank[],
  values: GuidedValues,
): string {
  const declared = new Set(blanks.map((b) => b.id));
  // Trimmed, because that is what `isBlankCorrect` grades. Substituting the raw
  // value would put a space inside the source that rides up as the response
  // while the verdict said the answer was right.
  return starter.replace(CODE_BLANK_TOKEN_RE, (token, id: string) =>
    declared.has(id) ? (values[id] ?? '').trim() : token,
  );
}

export function allBlanksFilled(blanks: readonly CodeBlank[], values: GuidedValues): boolean {
  return blanks.every((b) => (values[b.id] ?? '').trim().length > 0);
}

/**
 * Every hole filled with its authored `answer` — the gabarito, as values.
 *
 * This is the whole reason the guided variants CAN be revealed while the open
 * editor cannot: `blanks[].answer` is a solution the author already wrote down,
 * so nothing has to be invented (and no field has to be added to `CodeSpec`) to
 * put it on the projector.
 *
 * Trimmed like `substituteBlanks` does, so what is shown and what would grade as
 * correct are the same characters.
 */
export function revealedValues(blanks: readonly CodeBlank[]): GuidedValues {
  return Object.fromEntries(blanks.map((b) => [b.id, b.answer.trim()]));
}

/**
 * Grade one blank. Whitespace around the answer is forgiven (an inline input
 * invites a stray space); everything else is exact, because in code `useState`
 * and `usestate` are not the same word and pretending otherwise teaches the
 * wrong thing.
 */
export function isBlankCorrect(blank: CodeBlank, value: string | undefined): boolean {
  return (value ?? '').trim() === blank.answer.trim();
}

export function gradeGuided(blanks: readonly CodeBlank[], values: GuidedValues): GuidedGrade {
  const byBlank: Record<string, boolean> = {};
  for (const blank of blanks) byBlank[blank.id] = isBlankCorrect(blank, values[blank.id]);
  const correctCount = Object.values(byBlank).filter(Boolean).length;
  return { byBlank, correctCount, allCorrect: correctCount === blanks.length };
}

/**
 * How wide to draw an inline widget, in characters.
 *
 * Never from what is currently typed: a field that grows while the learner types
 * shifts the rest of the line under their eyes.
 *
 * `text` is sized from the PLACEHOLDER alone. The answer is not on screen in that
 * variant — the exercise is recall — so measuring it would hand the learner the
 * length for free, which is the leak the other two variants do not have (their
 * candidates are all visible anyway).
 */
export function blankWidthCh(blank: CodeBlank): number {
  if (blank.kind === 'text') return Math.max(12, (blank.placeholder ?? '').length + 2);
  const candidates = [blank.answer, ...(blank.options ?? []), blank.placeholder ?? ''];
  return Math.max(6, ...candidates.map((c) => c.length)) + 2;
}
