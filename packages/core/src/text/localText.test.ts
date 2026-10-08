import { describe, expect, it } from 'vitest';
import { localText } from './localText';

describe('localText', () => {
  it('prefers the locale, then English, then Portuguese, then whatever is there', () => {
    expect(localText({ pt: 'Olá', en: 'Hello' }, 'pt')).toBe('Olá');
    expect(localText({ pt: 'Olá', en: 'Hello' }, 'es')).toBe('Hello');
    expect(localText({ pt: 'Olá' }, 'en')).toBe('Olá');
    expect(localText({ fr: 'Salut' }, 'pt')).toBe('Salut');
  });

  it('no text is the empty string', () => {
    expect(localText(null, 'pt')).toBe('');
    expect(localText(undefined, 'pt')).toBe('');
    expect(localText({}, 'pt')).toBe('');
  });
});
