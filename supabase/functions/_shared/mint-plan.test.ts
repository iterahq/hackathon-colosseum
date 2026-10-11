import { describe, expect, it } from 'vitest';
import type { AchievementRow } from './credential';
import { planMintJobs } from './mint-plan';

const MEDALS = new Set(['first_stamp', 'streak_3']);
const UNIT = 'unit-1';

function row(id: string, key: string, patch: Partial<AchievementRow> = {}): AchievementRow {
  return {
    id,
    user_id: 'user-1',
    achievement_key: key,
    ref_id: key === 'trail_pass' || key === 'trail_complete' ? UNIT : id,
    state: key === 'day_stamp' ? { unit_id: UNIT } : {},
    earned_at: '2026-10-05T15:00:00.000Z',
    mint_status: 'unclaimed',
    wallet_address: null,
    asset_address: null,
    tx_signature: null,
    minted_at: null,
    ...patch,
  };
}

const summary = (rows: AchievementRow[]) =>
  planMintJobs(rows, MEDALS).map((job) => `${job.type}:${job.rows.map((entry) => entry.id).join('+')}`);

describe('planMintJobs', () => {
  it('creates a passport together with the stamps it already has, and each medal on its own', () => {
    const rows = [row('pass', 'trail_pass'), row('d1', 'day_stamp'), row('d2', 'day_stamp'), row('medal', 'first_stamp')];
    expect(summary(rows).sort()).toEqual(['create_medal:medal', 'create_passport:pass+d1+d2']);
  });

  it('updates a minted passport once for every new stamp and its completion', () => {
    const minted = { mint_status: 'minted' as const, asset_address: 'asset' };
    const rows = [
      row('pass', 'trail_pass', minted),
      row('d1', 'day_stamp', minted),
      row('d2', 'day_stamp'),
      row('done', 'trail_complete'),
    ];
    expect(summary(rows)).toEqual(['update_passport:d2+done']);
  });

  it('retries failed rows and plans nothing once everything is minted', () => {
    const minted = { mint_status: 'minted' as const };
    expect(summary([row('pass', 'trail_pass', { mint_status: 'failed' }), row('d1', 'day_stamp', { mint_status: 'failed' })])).toEqual([
      'create_passport:pass+d1',
    ]);
    expect(summary([row('pass', 'trail_pass', minted), row('d1', 'day_stamp', minted), row('medal', 'first_stamp', minted)])).toEqual([]);
  });

  it('keeps stamps of another trail out of a passport job and orders jobs by time', () => {
    const rows = [
      row('medal', 'first_stamp', { earned_at: '2026-10-06T15:00:00.000Z' }),
      row('pass', 'trail_pass'),
      row('other', 'day_stamp', { state: { unit_id: 'unit-2' } }),
    ];
    expect(summary(rows)).toEqual(['create_passport:pass', 'create_medal:medal']);
  });

  it('mints the certification before medals earned at the same moment', () => {
    const rows = [row('a-medal', 'first_stamp'), row('z-pass', 'trail_pass'), row('m-stamp', 'day_stamp')];
    expect(summary(rows)).toEqual(['create_passport:z-pass+m-stamp', 'create_medal:a-medal']);
  });
});
