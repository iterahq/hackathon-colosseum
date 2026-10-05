/**
 * The term matcher is a widened matcher over `**bold**`, so these are mostly
 * refusals: every case below is a real shape from the course fixtures that
 * must stay plain semibold.
 */
import { describe, expect, it } from 'vitest';
import { parseInline } from './richTextInline.js';
import { hasTermCue, isTermRun, pickTerms } from './termChip.js';

const chips = (line: string) => {
  const spans = parseInline(line);
  return spans.filter((span, i) => pickTerms(spans)[i]).map((span) => (span.type === 'strong' ? span.spans[0] : span));
};
const chipTexts = (line: string) => chips(line).map((s) => ('value' in s ? s.value : ''));

describe('isTermRun — the shape of a term', () => {
  it('accepts a short noun phrase', () => {
    expect(isTermRun(parseInline('arquivo de texto'))).toBe(true);
    expect(isTermRun(parseInline('Regra 2 do Gito'))).toBe(true);
  });

  it('refuses a label ending in punctuation, a pseudo-list and a quoted word', () => {
    for (const run of ['Toda função tem três partes:', 'Tela B.', 'Quero um bolo!', '1. Faça a massa…', '"cozinha"'])
      expect(isTermRun(parseInline(run)), run).toBe(false);
  });

  it('refuses long runs, stressed function words and nested markup', () => {
    expect(isTermRun(parseInline('a última que abriu é a primeira que fecha'))).toBe(false);
    for (const word of ['não', 'você', 'dentro', 'true', 'not'])
      expect(isTermRun(parseInline(word)), word).toBe(false);
    expect(isTermRun(parseInline('1. Sentou? `git pull`.'))).toBe(false);
    expect(isTermRun(parseInline('==chave=='))).toBe(false);
  });
});

describe('hasTermCue — what introduces a term', () => {
  it('reads a determiner, a copula or a naming word right before the run', () => {
    expect(hasTermCue('`head` é o ', ': nada aparece')).toBe(true);
    expect(hasTermCue('Esse bilhete tem nome: ', '.')).toBe(true);
    expect(hasTermCue('`body` = ', ': tudo')).toBe(true);
    expect(hasTermCue('Cada página se chama ', '.')).toBe(true);
    expect(hasTermCue('The head is the ', '.')).toBe(true);
  });

  it('reads a definition that starts the line', () => {
    expect(hasTermCue('', ' são os dados que o pai manda')).toBe(true);
    expect(hasTermCue('Texto antes.\n', ' — memória do componente')).toBe(true);
    expect(hasTermCue('', ' (feita) desenha a marcada')).toBe(false);
  });

  it('finds no cue behind a verb, a preposition or a UI label', () => {
    expect(hasTermCue('você só ', ' quando ela entrega')).toBe(false);
    expect(hasTermCue('toque em ', ' e pronto')).toBe(false);
    expect(hasTermCue('o botão ', ' esticou')).toBe(false);
  });
});

describe('pickTerms — the block decides', () => {
  it('chips the predicate on the Day-1 lines and leaves the stress word plain', () => {
    expect(chipTexts('`head` é o **bastidor**: nada dele aparece. Lá mora o nome da **aba**')).toEqual(['bastidor', 'aba']);
    expect(chipTexts('A página é um **arquivo de texto**, e todo arquivo tem o mesmo esqueleto.')).toEqual(['arquivo de texto']);
    expect(chipTexts('Repare: uma tag pode ficar **dentro** de outra.')).toEqual([]);
  });

  it('leaves a bold-only line and a pseudo-heading plain', () => {
    expect(chipTexts('**Toda função tem três partes:**')).toEqual([]);
    expect(chipTexts('**Props**')).toEqual([]);
    expect(chipTexts('**Aba** → `title`: é o nome que aparece na aba.')).toEqual(['Aba']);
  });

  it('gives a bold-heavy block no chips at all', () => {
    const line = 'o **a**, o **b**, o **c** e o **d** são quatro.';
    expect(chipTexts(line)).toEqual([]);
    expect(chipTexts('o **a**, o **b** e o **c** são três.')).toEqual(['a', 'b', 'c']);
  });

  it('returns one flag per top-level span', () => {
    const spans = parseInline('texto **x** `code`');
    expect(pickTerms(spans)).toHaveLength(spans.length);
  });
});
