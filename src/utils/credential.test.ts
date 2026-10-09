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

  it('falls back to the achievement title', () => {
    const c = parseCredential({ verified: true, attributes: [], achievement: { key: 'k', tier: null, title: { pt: 'Semana HTML' } } }, 'A');
    expect(credentialFacts(c, pick)).toMatchObject({ trail: 'Semana HTML', totalDays: 0 });
  });
});
