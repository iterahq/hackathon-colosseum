import { describe, expect, it } from 'vitest';
import { parseCredential } from '@/services/credential.service';

describe('parseCredential', () => {
  it('maps the function body', () => {
    const c = parseCredential(
      { verified: true, owner: 'O1', frozen: true, attributes: [{ key: 'day_1', value: 'true' }, { value: 'x' }], achievement: { key: 'trail_html', tier: 'gold', title: 'HTML' }, minted_at: '2026-10-09' },
      'A1'
    );
    expect(c).toMatchObject({ verified: true, asset: 'A1', owner: 'O1', frozen: true, minted_at: '2026-10-09' });
    expect(c.attributes).toEqual([{ key: 'day_1', value: 'true' }]);
    expect(c.achievement?.tier).toBe('gold');
  });

  it('survives an empty body', () => {
    expect(parseCredential(null, 'A1')).toMatchObject({ verified: false, asset: 'A1', attributes: [], achievement: null });
  });

  it('reads the optional snapshot', () => {
    expect(parseCredential({ verified: true, snapshot: { source: 'chain', mirrored_at: '2026-10-10T12:00:00Z' } }, 'A').snapshot).toEqual({ source: 'chain', mirrored_at: '2026-10-10T12:00:00Z' });
    expect(parseCredential({ verified: true, snapshot: { source: 'chain', mirrored_at: null } }, 'A').snapshot?.mirrored_at).toBeNull();
    expect(parseCredential({ verified: true }, 'A').snapshot).toBeNull();
  });
});

describe('a Tera asset', () => {
  const avatar = { key: 'tera_feliz', rarity: 'sponsor', tier_name: 'Sponsor Tera', serial: 1, lore: { name: 'Tera, happy' } };

  it('reads which Tera it is and how it was obtained', () => {
    const earned = parseCredential({ verified: true, asset: 'A1', avatar: { ...avatar, rarity: 'rare', tier_name: 'Super Tera', origin: 'earned', transferable: false, earned: { certification: 'C1', trail: 'Week 1 · HTML', day: 2, tier: 'rare', chest_id: 'x' } } }, 'A1');
    expect(earned.tera).toMatchObject({ key: 'tera_feliz', name: 'Tera, happy', tierName: 'Super Tera', serial: 1 });
    expect(earned.tera?.origin).toMatchObject({ kind: 'earned', transferable: false, proof: { asset: 'A1' }, earned: { day: 2, chestId: 'x' } });
    expect(parseCredential({ verified: true, asset: 'A1' }, 'A1').tera).toBeNull();
  });

  it('names a sponsor Tera by its brand, not by the base it was drawn on', () => {
    const sponsored = parseCredential({ verified: true, asset: 'A2', avatar: { ...avatar, origin: 'sponsor', sponsor: { brand: 'Corner Bakery', accent: '#ff8a5c', bounty_slug: 'menu', bounty_title: 'A menu', payout_tx: 'sig' } } }, 'A2');
    expect(sponsored.tera?.name).toBe('Corner Bakery');
  });
});
