import { describe, expect, it } from 'vitest';
import { parseProfile } from '@/services/learnerProfile.service';

const body = {
  wallet: 'W1',
  verified_count: 3,
  companion: { asset: 'C1', verified: true, lives: 3, max_lives: 5, outfit: 'outfit_crown', level: 4, xp: 780, streak: 2, image_url: 'c.svg', explorer_url: 'e' },
  certifications: [{ asset: 'A1', verified: true, trail: 'HTML', trail_title: { pt: 'HTML pt', en: 'HTML en' }, days_done: 4, total_days: 5, tier: 'bronze', ink: 'emerald', frame: null, image_url: 'a.svg', page_url: '/c/A1' }, { verified: true }],
  medals: [{ asset: 'M1', verified: true, key: 'first_stamp', title: 'First stamp', image_url: 'm.svg' }],
};

describe('parseProfile', () => {
  it('maps the wire shape and picks the trail title in the language', () => {
    const p = parseProfile(body, 'W1', 'en');
    expect(p.verifiedCount).toBe(3);
    expect(p.companion).toMatchObject({ asset: 'C1', lives: 3, maxLives: 5, outfit: 'outfit_crown', level: 4 });
    expect(p.certifications).toHaveLength(1);
    expect(p.certifications[0]).toMatchObject({ trail: 'HTML en', daysDone: 4, totalDays: 5, ink: 'emerald', frame: null });
    expect(p.medals[0]).toMatchObject({ asset: 'M1', title: 'First stamp' });
  });
  it('an unknown wallet is an empty profile', () => {
    const p = parseProfile({ wallet: 'W2', companion: null, certifications: [], medals: [] }, 'W2', 'pt');
    expect(p).toMatchObject({ companion: null, certifications: [], medals: [], verifiedCount: 0 });
  });
});
