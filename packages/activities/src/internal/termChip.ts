/**
 * termChip — which `**bold**` runs are TERMS (the thing a subject is: "`head`
 * é o **bastidor**"), as opposed to emphasis ("você **não** precisa"), a UI
 * label ("toque em **Enviar**"), a pseudo-heading or a whole bold line. A term
 * gets the raised chip; everything else stays plain semibold.
 *
 * Pure and measured against the local course fixtures: the matcher is
 * deliberately narrow. Without the context cue 62% of production bold runs
 * became chips and under half of those were terms; with it, see the PR.
 */
import type { Inline } from './richTextInline.js';

export const TERM_MAX_CHARS = 32;
export const TERM_MAX_WORDS = 4;
/** Chips per block: past this the block is bold-heavy, and nothing in it is a term. */
export const TERM_MAX_PER_BLOCK = 3;

const ENDS_LIKE_A_LABEL = /[:：.!?…]$/;
const STARTS_LIKE_A_LIST = /^\d+[.)]/;
const QUOTED = /^["'“”‘’«]|["'“”‘’»]$/;

/** A term is introduced by a determiner, a copula or a naming word right before it. */
const CUE_BEFORE = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'ao', 'à', 'pelo', 'pela',
  'é', 'são', 'era', 'eram', 'vira', 'virou', 'viram', 'chama', 'chama-se', 'chamado', 'chamada',
  'chamados', 'chamadas', 'nome:', 'de', '=', '→', '—', '–',
  'the', 'an', 'is', 'are', 'was', 'were', 'called', 'named', 'becomes', 'of',
]);

/** …or, at the start of a line, is defined by what follows it. */
const CUE_AFTER = /^\s*(é|são|era|=|→|—|–|:|is|are|was)(\s|$)/;

/** Function words that get bolded for stress, never as a term. */
const STOPWORDS = new Set([
  'não', 'sim', 'você', 'vocês', 'seu', 'sua', 'seus', 'suas', 'ele', 'ela', 'eles', 'elas', 'isso',
  'isto', 'aquilo', 'aqui', 'ali', 'lá', 'agora', 'antes', 'depois', 'dentro', 'fora', 'tudo', 'nada',
  'cada', 'outro', 'outra', 'outros', 'outras', 'mesmo', 'mesma', 'sempre', 'nunca', 'só', 'também',
  'ainda', 'enquanto', 'mais', 'menos', 'todo', 'toda', 'todos', 'todas', 'muito', 'pouco', 'um', 'uma',
  'dois', 'duas', 'três', 'quatro', 'cinco', 'e', 'ou', 'mas', 'de', 'em', 'por', 'com', 'sem',
  'true', 'false', 'null', 'undefined',
  'not', 'you', 'your', 'inside', 'outside', 'before', 'after', 'now', 'here', 'everything', 'nothing',
  'each', 'other', 'same', 'always', 'never', 'only', 'also', 'still', 'this', 'that', 'while', 'more',
  'less', 'all', 'every', 'one', 'two', 'three', 'and', 'or', 'but',
]);

/** The run as plain text; `null` when it nests code, a mark or emphasis. */
function plainText(spans: Inline[]): string | null {
  let out = '';
  for (const span of spans) {
    if (span.type !== 'text') return null;
    out += span.value;
  }
  return out;
}

/** True when the run itself has the shape of a term: short, a noun phrase, not a label. */
export function isTermRun(spans: Inline[]): boolean {
  const text = plainText(spans);
  if (text === null) return false;
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > TERM_MAX_CHARS) return false;
  if (ENDS_LIKE_A_LABEL.test(trimmed) || STARTS_LIKE_A_LIST.test(trimmed) || QUOTED.test(trimmed))
    return false;
  const words = trimmed.split(/\s+/);
  if (words.length > TERM_MAX_WORDS) return false;
  if (words.length === 1 && STOPWORDS.has(words[0].toLowerCase())) return false;
  return true;
}

/** True when the words around the run introduce it as a term. */
export function hasTermCue(before: string, after: string): boolean {
  const lastWord = before.trimEnd().split(/\s+/).pop() ?? '';
  if (CUE_BEFORE.has(lastWord.toLowerCase())) return true;
  const atLineStart = /(^|\n)\s*$/.test(before);
  return atLineStart && CUE_AFTER.test(after);
}

/**
 * For each top-level span of a block, whether it is a term chip. A bold run
 * that is the block's only content is a line, not a term; a block with more
 * chips than the cap is bold-heavy and gets none.
 */
export function pickTerms(spans: Inline[]): boolean[] {
  const picked = spans.map((span, i) => {
    if (span.type !== 'strong' || !isTermRun(span.spans)) return false;
    const prev = spans[i - 1];
    const next = spans[i + 1];
    const before = prev?.type === 'text' ? prev.value : prev ? 'x' : '';
    const after = next?.type === 'text' ? next.value : next ? 'x' : '';
    return hasTermCue(before, after);
  });
  const count = picked.filter(Boolean).length;
  if (count === 0) return picked;

  const otherText = spans
    .filter((span, i) => !picked[i])
    .map((span) => (span.type === 'text' ? span.value : 'x'))
    .join('')
    .trim();
  if (otherText === '' || count > TERM_MAX_PER_BLOCK) return spans.map(() => false);
  return picked;
}
