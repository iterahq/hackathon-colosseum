import { describe, expect, it } from 'vitest';
import { brandBlocks, brandError, isAccent, prizePreviewUrl, tidyBrand } from './prizeTera';

describe('brandError', () => {
  it('accepts a plain brand name, accents and the few signs a name uses', () => {
    for (const name of ['Acme', 'Café do Zé', 'R&D + Co.', "Joe's Lab!", 'XP_2']) expect(brandError(name, 2, 24), name).toBeNull();
  });

  it('says why a name is refused: too short, too long, markup or emoji, posing as the team', () => {
    expect(brandError(' A ', 2, 24)).toBe('short');
    expect(brandError('x'.repeat(25), 2, 24)).toBe('long');
    for (const name of ['<b>Acme</b>', 'Acme "Labs"', 'Acme 🚀', 'a/b', '...', 'Асме', 'Acme 株式', 'Acme ٣']) expect(brandError(name, 2, 24), name).toBe('chars');
    for (const name of ['Itera Labs', 'Solana Official', 'Verified Co']) expect(brandError(name, 2, 24), name).toBe('reserved');
  });

  it('lets a team name through to the server, which knows whether the account is staff of that team', () => {
    expect(brandError('DevFellowship', 2, 24)).toBe('reserved');
    expect(brandBlocks('reserved')).toBe(false);
    expect([brandBlocks(null), brandBlocks('chars'), brandBlocks('short'), brandBlocks('long')]).toEqual([false, true, true, true]);
  });

  it('counts the name as it will be written: spaces collapsed, ends trimmed', () => {
    expect(tidyBrand('  Acme    Labs ')).toBe('Acme Labs');
  });
});

describe('prizePreviewUrl', () => {
  const url = 'https://x.supabase.co/functions/v1/credential-meta/sponsor-preview.svg';

  it('asks for the art only once the three values are valid', () => {
    expect(prizePreviewUrl(url, { brand: 'A', accent: '#ff8800', base: 'tera_normal' }, 2, 24)).toBeNull();
    expect(prizePreviewUrl(url, { brand: 'Acme', accent: 'orange', base: 'tera_normal' }, 2, 24)).toBeNull();
    expect(prizePreviewUrl(url, { brand: 'Acme', accent: '#ff8800', base: '' }, 2, 24)).toBeNull();
    expect(prizePreviewUrl(null, { brand: 'Acme', accent: '#ff8800', base: 'tera_normal' }, 2, 24)).toBeNull();
    expect(prizePreviewUrl(url, { brand: ' Acme  Labs ', accent: '#FF8800', base: 'tera_normal' }, 2, 24)).toBe(`${url}?brand=Acme+Labs&accent=%23ff8800&base=tera_normal`);
  });

  it('knows a hex colour', () => {
    expect([isAccent('#ff8800'), isAccent('#FFF'), isAccent('red')]).toEqual([true, false, false]);
  });
});
