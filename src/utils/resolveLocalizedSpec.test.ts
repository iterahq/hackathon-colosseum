import { afterEach, describe, expect, it } from 'vitest';
import { resolveLocalizedSpec } from './resolveLocalizedSpec';

afterEach(() => localStorage.clear());

describe('resolveLocalizedSpec', () => {
  it('collapses a top-level bilingual bag to the active locale', () => {
    localStorage.setItem('itera.locale', 'en');
    expect(resolveLocalizedSpec({ prompt: { pt: 'Olá', en: 'Hello' } })).toEqual({
      prompt: 'Hello',
    });
  });

  it('defaults to pt when no locale is set', () => {
    expect(resolveLocalizedSpec({ prompt: { pt: 'Olá', en: 'Hello' } })).toEqual({
      prompt: 'Olá',
    });
  });

  it('resolves bags nested in arrays and objects', () => {
    const spec = {
      instruction: { text: { pt: 'Leia', en: 'Read' } },
      options: [
        { id: 'a', label: { pt: 'Sim', en: 'Yes' } },
        { id: 'b', label: { pt: 'Não', en: 'No' } },
      ],
    };
    expect(resolveLocalizedSpec(spec)).toEqual({
      instruction: { text: 'Leia' },
      options: [
        { id: 'a', label: 'Sim' },
        { id: 'b', label: 'Não' },
      ],
    });
  });

  it('leaves plain strings and non-bag objects untouched', () => {
    const spec = { title: 'Static', meta: { count: 3, flag: true } };
    expect(resolveLocalizedSpec(spec)).toEqual(spec);
  });

  it('falls back to pt when the active-locale value is missing', () => {
    localStorage.setItem('itera.locale', 'en');
    expect(resolveLocalizedSpec({ prompt: { pt: 'Só PT' } })).toEqual({ prompt: 'Só PT' });
  });

  describe('explicit locale argument', () => {
    it('wins over the ambient localStorage value', () => {
      localStorage.setItem('itera.locale', 'pt');
      expect(resolveLocalizedSpec({ prompt: { pt: 'Olá', en: 'Hello' } }, 'en')).toEqual({
        prompt: 'Hello',
      });
    });

    it('still resolves to pt when asked for pt with EN present', () => {
      localStorage.setItem('itera.locale', 'en');
      expect(resolveLocalizedSpec({ prompt: { pt: 'Olá', en: 'Hello' } }, 'pt')).toEqual({
        prompt: 'Olá',
      });
    });

    it('resolves a rubric the same way a spec is resolved', () => {
      // The rubric carries the AI-judge criteria and the artifact label. Before
      // the services resolved it, a bag here reached the judge — and the artifact
      // filename — as "[object Object]".
      const rubric = {
        mode: 'ai-judge',
        min_words: 80,
        artifact: { pt: 'Reflexão', en: 'Reflection' },
        criteria: [
          { pt: 'Normalização correta', en: 'Correct normalisation' },
          { pt: 'Justifica as escolhas', en: 'Justifies the choices' },
        ],
      };
      expect(resolveLocalizedSpec(rubric, 'en')).toEqual({
        mode: 'ai-judge',
        min_words: 80,
        artifact: 'Reflection',
        criteria: ['Correct normalisation', 'Justifies the choices'],
      });
    });

    it('leaves an EN string that mirrors PT alone (the backfill fixes data, not this)', () => {
      // A mirrored bag is indistinguishable from a legitimately identical one
      // (a command, an identifier). Resolution must not try to be clever here.
      expect(resolveLocalizedSpec({ cmd: { pt: 'git status', en: 'git status' } }, 'en')).toEqual({
        cmd: 'git status',
      });
    });
  });
});
