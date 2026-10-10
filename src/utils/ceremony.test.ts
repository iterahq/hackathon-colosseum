import { describe, expect, it } from 'vitest';
import type { PassportAward, PassportResult } from '@/types/achievements';
import { ceremonyFromResult, mergeResults, shouldContinue } from '@/utils/ceremony';

const row = (over: Partial<PassportAward>): PassportAward => ({
  id: 'r', key: 'trail_pass', kind: 'trail', tier: 'bronze', title: 'T', ref_id: 'u1',
  state: { days_done: 2, total_days: 5, trail_title: { pt: 'Semana 1 · HTML', en: 'Week 1 · HTML' } },
  mint_status: 'unclaimed', asset_address: null, tx_signature: null, explorer_url: null, ...over,
});
const stamp = row({ id: 's', key: 'day_stamp', kind: 'day', ref_id: 'l2', state: { days_done: 2, total_days: 5, day: 2, parent_id: 'p' } });
const pass = (over: Partial<PassportAward> = {}) => row({ id: 'p', ...over });
const result = (over: Partial<PassportResult> = {}): PassportResult => ({ awards: [stamp], updated: [pass()], remaining: 0, mint: { wallet: null, cluster: 'devnet', attempted: 0, blocked: 'no_wallet' }, ...over });

describe('ceremonyFromResult', () => {
  it('takes N and total from the trail passport', () => {
    expect(ceremonyFromResult(result(), 'l2', 'pt')).toMatchObject({ day: 2, totalDays: 5, trailTitle: 'HTML', daysDone: 2, last: false, status: 'no_wallet' });
  });

  it('is null when the call stamped nothing for this lesson', () => {
    expect(ceremonyFromResult(result({ awards: [], updated: [] }), 'l2', 'pt')).toBeNull();
    expect(ceremonyFromResult(result(), 'other', 'pt')).toBeNull();
  });

  it('marks the last day and reads the minted transaction', () => {
    const done = pass({ mint_status: 'minted', tx_signature: 'sig', asset_address: 'A1', state: { days_done: 5, total_days: 5 } });
    const m = ceremonyFromResult(result({ updated: [done], mint: { wallet: 'W', cluster: 'devnet', attempted: 1, blocked: null } }), 'l2', 'pt');
    expect(m).toMatchObject({ last: true, status: 'minted', txSignature: 'sig', assetAddress: 'A1' });
  });

  it('maps a blocked authority to a neutral pending state, not a failure', () => {
    const m = ceremonyFromResult(result({ mint: { wallet: 'W', cluster: 'devnet', attempted: 0, blocked: 'authority_unfunded' } }), 'l2', 'en');
    expect(m).toMatchObject({ status: 'pending', trailTitle: 'HTML' });
  });

  it('reports a failed transaction', () => {
    const m = ceremonyFromResult(result({ updated: [pass({ mint_status: 'failed' })], mint: { wallet: 'W', cluster: 'devnet', attempted: 1, blocked: null } }), 'l2', 'pt');
    expect(m?.status).toBe('failed');
  });

  it('lists the medals earned by this call', () => {
    const medal = row({ id: 'm', key: 'first_stamp', kind: 'milestone', title: { pt: 'Primeiro carimbo' } as never });
    expect(ceremonyFromResult(result({ awards: [stamp, medal] }), 'l2', 'pt')?.newMedals).toEqual([{ key: 'first_stamp', kind: 'milestone', credentialId: expect.anything(), title: 'Primeiro carimbo', glyph: 'PRI' }]);
  });
});

describe('mergeResults', () => {
  it('keeps the latest copy of each row and the last remaining', () => {
    const a = result({ remaining: 2, mint: { wallet: 'W', cluster: 'devnet', attempted: 3, blocked: null } });
    const b = result({ awards: [], updated: [pass({ mint_status: 'minted' })], remaining: 0, mint: { wallet: 'W', cluster: 'devnet', attempted: 1, blocked: null } });
    const merged = mergeResults([a, b]);
    expect(merged.remaining).toBe(0);
    expect(merged.updated.find((r) => r.id === 'p')?.mint_status).toBe('minted');
    expect(merged.awards.map((r) => r.id)).toEqual(['s']);
    expect(shouldContinue(a)).toBe(true);
    expect(shouldContinue(merged)).toBe(false);
  });
});
