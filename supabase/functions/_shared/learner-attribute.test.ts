import { describe, expect, it } from 'vitest';
import { companionAttributes, type CompanionSnapshot } from './companion.ts';
import { onchainAttributes, type AchievementRow, type CatalogEntry } from './credential.ts';

const USER = '11111111-2222-4333-8444-555555555555';
const WALLET = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const valueOf = (attributes: Array<{ key: string; value: string }>, key: string) => attributes.find((attribute) => attribute.key === key)?.value;

const row = (key: string, state: Record<string, unknown>, wallet: string | null = WALLET): AchievementRow => ({
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  user_id: USER,
  achievement_key: key,
  ref_id: '99999999-0000-4000-8000-000000000001',
  state,
  earned_at: '2026-10-10T02:30:00.000Z',
  mint_status: 'minted',
  wallet_address: wallet,
  asset_address: null,
  tx_signature: null,
  minted_at: null,
});
const entry = (key: string, kind: string): CatalogEntry => ({ key, kind, tier: 'bronze', title_i18n: { en: key }, description_i18n: { en: key }, art: {} });

describe('the on-chain `learner` attribute (security review, finding 8)', () => {
  it('is the owner wallet on a certification, never the internal learner id', () => {
    const attributes = onchainAttributes(row('trail_pass', { program_slug: 'itera-v2', trail_title: { en: 'HTML' }, days_done: 4, total_days: 5 }), entry('trail_pass', 'trail'));
    expect(valueOf(attributes, 'learner')).toBe(WALLET);
    expect(JSON.stringify(attributes)).not.toContain(USER);
  });

  it('is the owner wallet on a medal', () => {
    const attributes = onchainAttributes(row('first_stamp', { lesson_id: 'x' }), entry('first_stamp', 'milestone'));
    expect(valueOf(attributes, 'learner')).toBe(WALLET);
    expect(JSON.stringify(attributes)).not.toContain(USER);
  });

  it('is empty, not an id, for a row that has no wallet yet', () => {
    const attributes = onchainAttributes(row('first_stamp', {}, null), entry('first_stamp', 'milestone'));
    expect(valueOf(attributes, 'learner')).toBe('');
    expect(JSON.stringify(attributes)).not.toContain(USER);
  });

  it('is the owner wallet on the companion mirror', () => {
    const snapshot: CompanionSnapshot = { id: 'c1', userId: USER, wallet: WALLET, lives: 5, maxLives: 5, outfit: null, stats: { level: 1, xp: 0, streak: 0 }, assetAddress: null, mirrored: null, mirroredAt: null };
    const attributes = companionAttributes(snapshot);
    expect(valueOf(attributes, 'learner')).toBe(WALLET);
    expect(JSON.stringify(attributes)).not.toContain(USER);
    expect(valueOf(companionAttributes({ ...snapshot, wallet: null }), 'learner')).toBe('');
  });
});
