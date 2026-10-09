import { describe, expect, it } from 'vitest';
import { parseCredential } from '@/services/credential.service';
import { companionFacts, credentialFacts, looksLikeAddress } from '@/utils/credential';

const pick = (t: Record<string, string>) => t.pt ?? '';

describe('credentialFacts', () => {
  it('counts the stamped days from the attributes', () => {
    const c = parseCredential(
      { verified: true, attributes: [{ key: 'day_2', value: 'false' }, { key: 'day_1', value: 'true' }, { key: 'trail', value: 'HTML' }], achievement: { key: 'k', tier: 'gold', title: { pt: 'X' } } },
      'A'
    );
    expect(credentialFacts(c, pick)).toMatchObject({ trail: 'HTML', tier: 'gold', daysDone: 1, totalDays: 2 });
    expect(credentialFacts(c, pick).days.map((d) => d.day)).toEqual([1, 2]);
  });

  it('reads days_done and the stamp list of a real row', () => {
    const c = parseCredential(
      { verified: true, attributes: [{ key: 'days_done', value: '2' }], achievement: { key: 'trail_pass', tier: 'bronze', title: 'Pass', state: { total_days: 5 }, stamps: [{ day: 1 }, { day: 2 }] } },
      'A'
    );
    const f = credentialFacts(c, pick);
    expect(f).toMatchObject({ daysDone: 2, totalDays: 5 });
    expect(f.days.map((d) => d.done)).toEqual([true, true, false, false, false]);
  });

  it('falls back to the achievement title', () => {
    const c = parseCredential({ verified: true, attributes: [], achievement: { key: 'k', tier: null, title: { pt: 'Semana HTML' } } }, 'A');
    expect(credentialFacts(c, pick)).toMatchObject({ trail: 'Semana HTML', totalDays: 0 });
  });
});

describe('credentialFacts language', () => {
  it('prefers the localized trail of the response over the on-chain attribute', () => {
    const c = parseCredential({ verified: true, attributes: [{ key: 'trail', value: 'Week 1 · HTML' }], achievement: { key: 'k', tier: 'gold', title: 'x', trail: 'Semana 1 · HTML' } }, 'A');
    expect(credentialFacts(c, pick, 'pt').trail).toBe('Semana 1 · HTML');
  });

  it('falls back to the state bag in the current language, then the attribute', () => {
    const state = { trail_title: { pt: 'Semana 1 · HTML', en: 'Week 1 · HTML' } };
    const bag = parseCredential({ verified: true, attributes: [{ key: 'trail', value: 'raw' }], achievement: { key: 'k', tier: null, title: 'x', state } }, 'A');
    expect(credentialFacts(bag, pick, 'en').trail).toBe('Week 1 · HTML');
    const raw = parseCredential({ verified: true, attributes: [{ key: 'trail', value: 'raw' }], achievement: { key: 'k', tier: null, title: 'x' } }, 'A');
    expect(credentialFacts(raw, pick, 'pt').trail).toBe('raw');
  });
});

describe('companionFacts', () => {
  const base = { verified: true, asset: 'a', owner: 'o', frozen: true, collection: null, update_authority: null, minted_at: null } as const;
  it('reads state first, attributes as fallback', () => {
    const f = companionFacts({ ...base, attributes: [{ key: 'lives', value: '2' }, { key: 'streak', value: '4' }, { key: 'outfit', value: 'outfit_crown' }], achievement: { key: 'companion', tier: null, title: '', image_url: 'x.svg', state: { lives: 3, level: 4, xp: 780 }, stamps: [] } });
    expect(f).toMatchObject({ lives: 3, maxLives: 5, level: 4, xp: 780, streak: 4, outfit: 'outfit_crown', image: 'x.svg' });
  });
  it('treats none as no outfit', () => {
    expect(companionFacts({ ...base, attributes: [{ key: 'outfit', value: 'none' }], achievement: null }).outfit).toBeNull();
  });
});

describe('looksLikeAddress', () => {
  it('accepts base58 addresses only', () => {
    expect(looksLikeAddress('Dk35TCfPRrZymFnpP6MfQ55Zg9LEe7BDojStY1ZfQM45')).toBe(true);
    expect(looksLikeAddress('garbage')).toBe(false);
  });
});
