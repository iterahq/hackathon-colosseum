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
});
