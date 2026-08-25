import { describe, expect, it } from 'vitest';
import { acceptedAnswers, matchesAnswer, normalizeLooseAnswer } from './answerMatch.js';

describe('normalizeLooseAnswer', () => {
  it('folds accents away, composed or decomposed', () => {
    expect(normalizeLooseAnswer('José')).toBe('jose');
    expect(normalizeLooseAnswer('José'.normalize('NFD'))).toBe('jose');
    expect(normalizeLooseAnswer('programação')).toBe('programacao');
  });

  it('folds case away', () => {
    expect(normalizeLooseAnswer('Clean Code')).toBe('clean code');
  });

  it('collapses repeated inner whitespace to one space', () => {
    expect(normalizeLooseAnswer('clean    code')).toBe('clean code');
    expect(normalizeLooseAnswer('clean\tcode')).toBe('clean code');
  });

  it('drops punctuation at the edges and keeps it inside', () => {
    expect(normalizeLooseAnswer('"Clean Code".')).toBe('clean code');
    expect(normalizeLooseAnswer('clean-code')).toBe('clean-code');
  });

  it('leaves a different word different — it folds spelling, never meaning', () => {
    expect(normalizeLooseAnswer('codigo')).not.toBe(normalizeLooseAnswer('codigos'));
    expect(normalizeLooseAnswer('useState')).not.toBe(normalizeLooseAnswer('useEffect'));
  });
});

describe('matchesAnswer — exact (the default)', () => {
  const rule = { answer: 'useState' };

  it('forgives surrounding whitespace and nothing else', () => {
    expect(matchesAnswer(rule, ' useState ')).toBe(true);
  });

  /**
   * The regression this whole change had to not cause: a blank with no `match`
   * is an identifier blank, and `usestate` is a different word.
   */
  it('keeps useState and usestate different when no mode is authored', () => {
    expect(matchesAnswer(rule, 'usestate')).toBe(false);
    expect(matchesAnswer({ answer: 'useState', match: 'exact' }, 'usestate')).toBe(false);
  });

  it('keeps an accent difference wrong', () => {
    expect(matchesAnswer({ answer: 'José' }, 'Jose')).toBe(false);
  });

  it('is false for an unfilled hole', () => {
    expect(matchesAnswer(rule, undefined)).toBe(false);
    expect(matchesAnswer(rule, '   ')).toBe(false);
  });

  it('still takes alternatives from accept, because a synonym is not a spelling', () => {
    expect(matchesAnswer({ answer: 'useState', accept: ['React.useState'] }, 'React.useState')).toBe(
      true,
    );
  });
});

describe('matchesAnswer — loose', () => {
  const titulo = { answer: 'Clean Code', match: 'loose' } as const;

  it('accepts the answer written without the capitals', () => {
    expect(matchesAnswer(titulo, 'clean code')).toBe(true);
  });

  it('accepts the answer written without the accent', () => {
    expect(matchesAnswer({ answer: 'José', match: 'loose' }, 'jose')).toBe(true);
    expect(matchesAnswer({ answer: 'Jose', match: 'loose' }, 'José')).toBe(true);
  });

  it('accepts a doubled inner space', () => {
    expect(matchesAnswer(titulo, 'Clean  Code')).toBe(true);
  });

  it('accepts punctuation the learner put at the edges', () => {
    expect(matchesAnswer(titulo, '"Clean Code".')).toBe(true);
  });

  it('still rejects a different word', () => {
    expect(matchesAnswer(titulo, 'clean coder')).toBe(false);
    expect(matchesAnswer(titulo, 'codigo limpo')).toBe(false);
  });

  it('is false for an unfilled hole, and for one that is only punctuation', () => {
    expect(matchesAnswer(titulo, undefined)).toBe(false);
    expect(matchesAnswer(titulo, '   ')).toBe(false);
    expect(matchesAnswer(titulo, '...')).toBe(false);
  });
});

describe('matchesAnswer — accept', () => {
  const rule = { answer: 'Clean Code', match: 'loose', accept: ['Código Limpo'] } as const;

  it('grades an authored alternative as correct, under the same loose rule', () => {
    expect(matchesAnswer(rule, 'Código Limpo')).toBe(true);
    expect(matchesAnswer(rule, 'codigo limpo')).toBe(true);
  });

  it('keeps the gabarito correct too', () => {
    expect(matchesAnswer(rule, 'Clean Code')).toBe(true);
  });

  it('does not widen to anything that was not authored', () => {
    expect(matchesAnswer(rule, 'código sujo')).toBe(false);
  });

  it('lists the gabarito first — it is what a reveal shows', () => {
    expect(acceptedAnswers(rule)).toEqual(['Clean Code', 'Código Limpo']);
    expect(acceptedAnswers({ answer: 'x' })).toEqual(['x']);
  });
});
