import { describe, expect, it } from 'vitest';
import data from './tera-lore.json';
import { loreOf, loreText, loreView } from './lore';

describe('lore reader', () => {
  it('finds the entry of a key and resolves one language', () => {
    expect(loreOf('base_lider')?.name.en).toBe('Dom');
    const view = loreView('base_lider', 'pt');
    expect(view).not.toBeNull();
    expect(Object.keys(view ?? {})).toEqual(['name', 'epithet', 'story', 'quote']);
    expect(view?.epithet).toBe('Coroa de ninguém');
    expect(loreView('base_lider', 'en')?.epithet).toBe('Crown of no one');
  });

  it('returns null for a missing, empty or inherited key', () => {
    expect(loreOf('does_not_exist')).toBeNull();
    expect(loreOf('')).toBeNull();
    expect(loreOf(null)).toBeNull();
    expect(loreOf('constructor')).toBeNull();
    expect(loreOf('__proto__')).toBeNull();
    expect(loreView(undefined, 'pt')).toBeNull();
  });

  it('falls back to the other language, then to an empty string', () => {
    expect(loreText({ pt: 'oi' }, 'en')).toBe('oi');
    expect(loreText({ en: 'hi' }, 'pt')).toBe('hi');
    expect(loreText({}, 'pt')).toBe('');
    expect(loreText(undefined, 'en')).toBe('');
  });

  it('has every field in both languages for every avatar', () => {
    for (const [key, entry] of Object.entries(data.avatars)) {
      for (const field of ['name', 'epithet', 'story', 'quote'] as const) {
        expect(entry[field].pt.trim(), `${key}.${field}.pt`).not.toBe('');
        expect(entry[field].en.trim(), `${key}.${field}.en`).not.toBe('');
      }
    }
  });
});
