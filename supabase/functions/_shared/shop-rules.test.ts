import { describe, expect, it } from 'vitest';
import { GLOBAL_REF } from './awards';
import { companionAttributes, companionMetadata, sameAttributes, type CompanionSnapshot } from './companion';
import { cosmeticsFromPurchases, cosmeticsOf, sameCosmetics } from './cosmetics';
import { eligibility, isItemKind, type EligibilityFacts } from './shop-rules';

const TRAIL = '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d';
const facts = (patch: Partial<EligibilityFacts> = {}): EligibilityFacts => ({
  refId: GLOBAL_REF,
  lives: 2,
  maxLives: 5,
  owned: false,
  passportMinted: false,
  ...patch,
});

describe('eligibility', () => {
  it('sells a life refill only below the maximum', () => {
    expect(eligibility('life', facts())).toEqual({ ok: true });
    expect(eligibility('life', facts({ lives: 5 }))).toEqual({ ok: false, error: 'not_needed' });
    expect(eligibility('life', facts({ refId: TRAIL }))).toEqual({ ok: false, error: 'invalid_ref' });
  });

  it('sells an outfit once per learner', () => {
    expect(eligibility('outfit', facts())).toEqual({ ok: true });
    expect(eligibility('outfit', facts({ owned: true }))).toEqual({ ok: false, error: 'already_owned' });
    expect(eligibility('outfit', facts({ refId: TRAIL }))).toEqual({ ok: false, error: 'invalid_ref' });
  });

  it.each(['ink', 'frame'] as const)('sells a passport %s once per trail, only on a minted passport', (kind) => {
    expect(eligibility(kind, facts({ refId: TRAIL, passportMinted: true }))).toEqual({ ok: true });
    expect(eligibility(kind, facts({ refId: TRAIL }))).toEqual({ ok: false, error: 'passport_required' });
    expect(eligibility(kind, facts({ refId: TRAIL, passportMinted: true, owned: true }))).toEqual({ ok: false, error: 'already_owned' });
    expect(eligibility(kind, facts({ passportMinted: true }))).toEqual({ ok: false, error: 'invalid_ref' });
  });

  it('knows the four kinds and nothing else', () => {
    expect(['life', 'outfit', 'ink', 'frame'].every(isItemKind)).toBe(true);
    expect(isItemKind('pledge')).toBe(false);
  });
});

describe('cosmetics', () => {
  it('reads only known values from a passport row', () => {
    expect(cosmeticsOf({})).toEqual({ ink: null, frame: null });
    expect(cosmeticsOf({ cosmetics: { ink: 'emerald', frame: 'gold-leaf' } })).toEqual({ ink: 'emerald', frame: 'gold-leaf' });
    expect(cosmeticsOf({ cosmetics: { ink: '"><script>', frame: 7 } })).toEqual({ ink: null, frame: null });
    expect(cosmeticsOf({ cosmetics: ['emerald'] })).toEqual({ ink: null, frame: null });
  });

  it('lets the latest ink win and keeps the frame', () => {
    const purchases = [
      { kind: 'ink', value: 'violet', paid_at: '2026-10-09T12:02:00Z' },
      { kind: 'frame', value: 'gold-leaf', paid_at: '2026-10-09T12:01:00Z' },
      { kind: 'ink', value: 'emerald', paid_at: '2026-10-09T12:00:00Z' },
      { kind: 'life', value: undefined, paid_at: '2026-10-09T12:03:00Z' },
      { kind: 'ink', value: 'neon', paid_at: '2026-10-09T12:04:00Z' },
    ];
    expect(cosmeticsFromPurchases(purchases)).toEqual({ ink: 'violet', frame: 'gold-leaf' });
    expect(cosmeticsFromPurchases([])).toEqual({ ink: null, frame: null });
    expect(sameCosmetics({ ink: 'violet', frame: null }, { ink: 'violet', frame: null })).toBe(true);
    expect(sameCosmetics({ ink: 'violet', frame: null }, { ink: 'emerald', frame: null })).toBe(false);
  });
});

describe('companion mirror', () => {
  const snapshot: CompanionSnapshot = {
    id: '70f5eb27-e08d-4270-aa56-3d609395da79',
    userId: '1c6ab4d7-804f-45fa-8b68-e9a8a108e26c',
    lives: 3,
    maxLives: 5,
    outfit: 'outfit_crown',
    stats: { level: 4, xp: 780, streak: 2 },
    assetAddress: null,
    mirrored: null,
    mirroredAt: null,
  };

  it('mirrors lives, outfit and stats as string attributes', () => {
    expect(Object.fromEntries(companionAttributes(snapshot).map(({ key, value }) => [key, value]))).toEqual({
      kind: 'companion',
      lives: '3',
      max_lives: '5',
      outfit: 'outfit_crown',
      level: '4',
      xp: '780',
      streak: '2',
      learner: snapshot.userId,
    });
    expect(companionAttributes({ ...snapshot, outfit: null })[3]).toEqual({ key: 'outfit', value: 'none' });
    expect(companionAttributes({ ...snapshot, outfit: 'outfit_unknown' })[3]).toEqual({ key: 'outfit', value: 'none' });
  });

  it('detects when the chain is behind', () => {
    const written = companionAttributes(snapshot);
    expect(sameAttributes(written, companionAttributes(snapshot))).toBe(true);
    expect(sameAttributes(written, companionAttributes({ ...snapshot, lives: 2 }))).toBe(false);
    expect(sameAttributes(null, written)).toBe(false);
  });

  it('publishes metadata keyed by the companion id, with no user id', () => {
    const metadata = companionMetadata(snapshot, 'pt', 'https://example.supabase.co/functions/v1');
    expect(metadata.image).toBe(`https://example.supabase.co/functions/v1/credential-meta/companion/${snapshot.id}/image.svg?lang=pt`);
    expect(JSON.stringify(metadata)).not.toContain(snapshot.userId);
  });
});
