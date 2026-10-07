import { describe, expect, it } from 'vitest';
import { activeChromeLocale, CHROME_COPY, chromeLocale, chromeStrings, fill, setChromeLocale } from './chromeCopy';

describe('chromeLocale', () => {
  it.each([['en'], ['en-US'], ['en_US'], ['EN-gb'], [' en-AU ']])('English first language "%s" gives en', (tag) => {
    expect(chromeLocale([tag, 'pt-BR'])).toBe('en');
  });
  it.each([['pt'], ['pt-BR'], ['pt_BR'], ['es-ES'], ['fr'], ['de-DE'], ['zh-Hans-CN'], ['english'], ['']])('"%s" gives pt', (tag) => {
    expect(chromeLocale([tag])).toBe('pt');
  });
  it('only the FIRST language counts', () => {
    expect(chromeLocale(['pt-BR', 'en-US'])).toBe('pt');
    expect(chromeLocale(['es-ES', 'en-US'])).toBe('pt');
  });
  it('skips empty entries and defaults to pt when nothing is known', () => {
    expect(chromeLocale(['', null, undefined, 'en-US'])).toBe('en');
    expect(chromeLocale([])).toBe('pt');
    expect(chromeLocale([null, undefined])).toBe('pt');
  });
});

describe('CHROME_COPY', () => {
  it('has the same keys in both languages, all non-empty', () => {
    expect(Object.keys(CHROME_COPY.en).sort()).toEqual(Object.keys(CHROME_COPY.pt).sort());
    for (const locale of ['pt', 'en'] as const) for (const text of Object.values(CHROME_COPY[locale])) expect(text.trim().length).toBeGreaterThan(0);
  });
  it('keeps the same slots in both languages', () => {
    const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(CHROME_COPY.pt) as (keyof typeof CHROME_COPY.pt)[]) expect(slots(CHROME_COPY.en[key])).toEqual(slots(CHROME_COPY.pt[key]));
  });
  it('the product is masculine in Portuguese and has no article in English', () => {
    const all = (locale: 'pt' | 'en') => Object.values(CHROME_COPY[locale]).join('\n');
    expect(all('pt')).not.toMatch(/\b(a|da|na|à) Itera\b/);
    expect(all('pt')).toMatch(/o Itera/);
    expect(all('en')).not.toMatch(/\b(the|a) Itera\b/i);
  });
  it('the offline body says only to check the connection', () => {
    for (const locale of ['pt', 'en'] as const) expect(CHROME_COPY[locale].offlineBody).not.toMatch(/navegador|browser/i);
  });
  it('the notices are short and carry no URL', () => {
    for (const locale of ['pt', 'en'] as const) {
      for (const key of ['blocked', 'openFailed', 'authBusy', 'authFailed'] as const) {
        expect(CHROME_COPY[locale][key].length).toBeLessThan(40);
        expect(CHROME_COPY[locale][key]).not.toMatch(/https?:|\//);
      }
    }
  });
});

describe('the active locale', () => {
  it('defaults to pt and follows setChromeLocale', () => {
    expect(activeChromeLocale()).toBe('pt');
    expect(chromeStrings().veilLabel).toBe('Carregando');
    setChromeLocale('en');
    expect(chromeStrings().veilLabel).toBe('Loading');
    expect(chromeStrings('pt').veilLabel).toBe('Carregando');
    setChromeLocale('pt');
  });
});

describe('fill', () => {
  it('replaces named slots and leaves unknown ones', () => {
    expect(fill('a {x} b {y}', { x: '1' })).toBe('a 1 b {y}');
  });
});
