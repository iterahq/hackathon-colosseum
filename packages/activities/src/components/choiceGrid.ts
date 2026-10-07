/**
 * Options that are only a few characters ("A", "B", "<h1>", "12 px") sit side by
 * side instead of one per row: three stacked rows for three letters cost a
 * screen's worth of scroll under the snippets they point at.
 *
 * On a phone the limits are what a label has room for on the narrowest column
 * (294 px at 360 wide) inside a compact card (`ChoiceOptionCard compact`,
 * 60 px of padding, border and key): about 82 px in two columns, 31 px in
 * three and next to nothing in four. A label that does not fit is not wrapped,
 * it is broken one letter per line, so a longer one drops to fewer columns.
 * From `sm` up the cards are wide enough for the roomier limits.
 */
import { parseInline, type Inline } from '../internal/richText.js';

interface GridOption {
  label?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
}

const PHONE: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };
const WIDE: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };

/** Longest label, in drawn characters, that a row of N options holds on one line of a phone. */
const PHONE_ROW_MAX_CHARS: Record<number, number> = { 3: 3, 4: 1 };
const PHONE_PAIR_MAX_WORD = 9;
const WIDE_ROW_MAX_CHARS = 6;
const PAIR_MAX_CHARS = 14;
/** An inline code chip is drawn with padding and a border: about two characters wide. */
const CODE_CHIP_CHARS = 2;

/** The label as drawn, one string per unbreakable run: marks the renderer consumes are gone, a chip carries its padding. */
function drawnText(spans: Inline[]): string {
  return spans
    .map((span) => {
      if (span.type === 'text') return span.value;
      if (span.type === 'code') return span.value.replace(/\s/g, '\u00a0') + '\u00a0'.repeat(CODE_CHIP_CHARS);
      return drawnText(span.spans);
    })
    .join('');
}

function phoneColumns(count: number, longest: number, longestWord: number): number {
  if (PHONE_ROW_MAX_CHARS[count] && longest <= PHONE_ROW_MAX_CHARS[count]) return count;
  return longest <= PAIR_MAX_CHARS && longestWord <= PHONE_PAIR_MAX_WORD ? 2 : 1;
}

function wideColumns(count: number, longest: number): number {
  if (count <= 4 && longest <= WIDE_ROW_MAX_CHARS) return count;
  return longest <= PAIR_MAX_CHARS ? 2 : 1;
}

/** Grid classes for a list of options; an empty string means one option per row at every width. */
export function choiceGridClass(options: GridOption[]): string {
  if (options.length < 2 || options.some((o) => o.image_url || o.audio_url || !o.label)) return '';
  const labels = options.map((o) => drawnText(parseInline(o.label ?? '')));
  const longest = Math.max(...labels.map((label) => label.length));
  const longestWord = Math.max(...labels.flatMap((label) => label.split(/[ \t\n]+/).map((word) => word.length)));
  const phone = phoneColumns(options.length, longest, longestWord);
  const wide = wideColumns(options.length, longest);
  if (phone === 1 && wide === 1) return '';
  return phone === wide ? PHONE[phone] : `${PHONE[phone]} ${WIDE[wide]}`;
}
