import { describe, expect, it } from 'vitest';
import { translatorOf } from './i18n';

describe('translatorOf', () => {
  const t = translatorOf({ 'a.b': 'value' });

  it('returns the string of a known key', () => {
    expect(t('a.b')).toBe('value');
  });

  it('returns the key itself for an unknown key', () => {
    expect(t('a.c')).toBe('a.c');
  });

  it('does not read inherited object members', () => {
    expect(t('toString')).toBe('toString');
  });
});
