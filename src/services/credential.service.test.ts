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
});
