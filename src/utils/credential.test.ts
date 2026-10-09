import { describe, expect, it } from 'vitest';
import { parseCredential } from '@/services/credential.service';
import { credentialFacts } from '@/utils/credential';

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
