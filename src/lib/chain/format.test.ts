import { describe, expect, it } from 'vitest';
import { formatSol, hexRows } from '@/lib/chain/format';

describe('chain formatting', () => {
  it('prints lamports as SOL without rounding', () => {
    expect(formatSol(0)).toBe('0 SOL');
    expect(formatSol(1_500_000_000)).toBe('1.5 SOL');
    expect(formatSol(2_039_280)).toBe('0.00203928 SOL');
    expect(formatSol(5_000n)).toBe('0.000005 SOL');
  });

  it('cuts a hex dump into rows of 16 with offsets, at most the limit', () => {
    const rows = hexRows(Uint8Array.from({ length: 40 }, (_, i) => i), 33);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ offset: '0000', bytes: '00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f' });
    expect(rows[2]).toEqual({ offset: '0020', bytes: '20' });
  });
});
