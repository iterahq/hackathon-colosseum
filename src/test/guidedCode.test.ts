/**
 * A metade PURA do `code` guiado, provada pela porta pública do pacote
 * (`@iterahq/activities/code`) — que é como um host consome. O `packages/`
 * não tem runner próprio; o vitest da raiz só coleta `src/**`.
 */
import { describe, it, expect } from 'vitest';
import type { CodeBlank, CodeSpec } from '@iterahq/activity-spec';
import {
  allBlanksFilled,
  blankWidthCh,
  gradeGuided,
  guidedVariant,
  isBlankCorrect,
  isGuidedCodeSpec,
  splitGuidedTemplate,
  substituteBlanks,
} from '@iterahq/activities/code';

const bank = (id: string, answer: string): CodeBlank => ({ id, kind: 'bank', answer });
const select = (id: string, answer: string, options: string[]): CodeBlank => ({
  id,
  kind: 'select',
  answer,
  options,
});
const text = (id: string, answer: string): CodeBlank => ({ id, kind: 'text', answer });

describe('guidedVariant', () => {
  it('names the variant by the single kind in use', () => {
    expect(guidedVariant([bank('a', 'x'), bank('b', 'y')])).toBe('options');
    expect(guidedVariant([select('a', 'x', ['x'])])).toBe('dropdown');
    expect(guidedVariant([text('a', 'x')])).toBe('text');
  });

  it('falls to mixed when the author combines kinds', () => {
    expect(guidedVariant([bank('a', 'x'), text('b', 'y')])).toBe('mixed');
  });
});

describe('isGuidedCodeSpec', () => {
  it('is the dispatch: blanks present means guided', () => {
    expect(isGuidedCodeSpec({ prompt: 'p' } as CodeSpec)).toBe(false);
    expect(isGuidedCodeSpec({ prompt: 'p', blanks: [] } as CodeSpec)).toBe(false);
    expect(isGuidedCodeSpec({ prompt: 'p', blanks: [bank('a', 'x')] } as CodeSpec)).toBe(true);
  });
});

describe('splitGuidedTemplate', () => {
  it('numbers every line, including the ones with no blank', () => {
    const lines = splitGuidedTemplate('um\n{{blank:a}}\ntres', [bank('a', 'x')]);
    expect(lines.map((l) => l.number)).toEqual([1, 2, 3]);
    expect(lines[0].segments).toEqual([{ kind: 'code', text: 'um' }]);
  });

  it('keeps the code around a blank on the same line', () => {
    const [line] = splitGuidedTemplate('const [n, s] = {{blank:hook}}(0);', [
      bank('hook', 'useState'),
    ]);
    expect(line.segments.map((s) => (s.kind === 'code' ? s.text : `#${s.blank.id}`))).toEqual([
      'const [n, s] = ',
      '#hook',
      '(0);',
    ]);
  });

  it('never emits a line with zero segments — the gutter needs a row to sit on', () => {
    const lines = splitGuidedTemplate('a\n\nb', []);
    expect(lines[1].segments).toEqual([{ kind: 'code', text: '' }]);
  });

  it('leaves real JSX braces alone', () => {
    // The token grammar is namespaced precisely so `style={{color}}` survives.
    const [line] = splitGuidedTemplate('<b style={{color}}>{{blank:a}}</b>', [bank('a', 'x')]);
    expect(line.segments[0]).toEqual({ kind: 'code', text: '<b style={{color}}>' });
    expect(line.segments[1].kind).toBe('blank');
  });
});

describe('substituteBlanks', () => {
  const blanks = [bank('hook', 'useState'), bank('evento', 'onClick')];
  const starter = 'const x = {{blank:hook}}(0); <b {{blank:evento}}={f} />';

  it('assembles the source the preview and the response ride on', () => {
    expect(substituteBlanks(starter, blanks, { hook: 'useState', evento: 'onClick' })).toBe(
      'const x = useState(0); <b onClick={f} />',
    );
  });

  it('collapses an unfilled hole — which is why the preview waits for filled', () => {
    expect(substituteBlanks(starter, blanks, { hook: 'useState' })).toBe(
      'const x = useState(0); <b ={f} />',
    );
  });

  it('trims, so the source matches the answer the verdict already accepted', () => {
    expect(substituteBlanks(starter, blanks, { hook: ' useState ', evento: 'onClick' })).toBe(
      'const x = useState(0); <b onClick={f} />',
    );
  });
});

describe('allBlanksFilled', () => {
  const blanks = [bank('a', 'x'), bank('b', 'y')];

  it('needs every hole to carry something other than whitespace', () => {
    expect(allBlanksFilled(blanks, { a: 'x' })).toBe(false);
    expect(allBlanksFilled(blanks, { a: 'x', b: '   ' })).toBe(false);
    expect(allBlanksFilled(blanks, { a: 'x', b: 'y' })).toBe(true);
  });
});

describe('isBlankCorrect', () => {
  const blank = text('a', 'setCurtidas');

  it('forgives surrounding whitespace — an inline field invites a stray space', () => {
    expect(isBlankCorrect(blank, ' setCurtidas ')).toBe(true);
  });

  it('is case-sensitive: in code, setcurtidas is a different word', () => {
    expect(isBlankCorrect(blank, 'setcurtidas')).toBe(false);
    expect(isBlankCorrect(blank, undefined)).toBe(false);
  });

  /**
   * A tolerância é opt-in do autor, e o `as CodeBlank` mede exatamente o que
   * falta: `match`/`accept` só entram no TIPO quando o `@iterahq/activity-spec`
   * que os declara for publicado. O cast some junto com o bump — a regra em si
   * está provada em `packages/activities/src/code/guided/answerMatch.test.ts`.
   */
  it('honra match: loose e accept quando o autor pede', () => {
    const prosa = {
      id: 'titulo',
      kind: 'text',
      answer: 'Clean Code',
      match: 'loose',
      accept: ['Código Limpo'],
    } as CodeBlank;
    expect(isBlankCorrect(prosa, 'clean  code')).toBe(true);
    expect(isBlankCorrect(prosa, 'codigo limpo')).toBe(true);
    expect(isBlankCorrect(prosa, 'clean coder')).toBe(false);
  });
});

describe('gradeGuided', () => {
  it('reports the verdict per hole plus the tally the score line reads', () => {
    const grade = gradeGuided([bank('a', 'x'), bank('b', 'y')], { a: 'x', b: 'z' });
    expect(grade.byBlank).toEqual({ a: true, b: false });
    expect(grade.correctCount).toBe(1);
    expect(grade.allCorrect).toBe(false);
  });
});

describe('blankWidthCh', () => {
  it('sizes from the longest candidate, so the field never leaks the answer length', () => {
    const short = blankWidthCh(select('a', 'ok', ['ok', 'umaOpcaoBemLonga']));
    expect(short).toBe('umaOpcaoBemLonga'.length + 2);
  });

  it('ignores the answer in text, where nothing on screen gives its length away', () => {
    expect(blankWidthCh(text('a', 'umNomeDeFuncaoBemLongo'))).toBe(12);
    expect(
      blankWidthCh({ id: 'a', kind: 'text', answer: 'x', placeholder: 'nome do estado' }),
    ).toBe('nome do estado'.length + 2);
  });
});
