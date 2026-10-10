import { describe, expect, it } from 'vitest';
import { escapeXml, renderArt, wrapText, type ArtInput } from './art';
import { OUTFIT_LAYERS, TERA_FACE_DATA_URI } from './outfit-art';
import { companionArtInput, companionChainImageUrl, companionFromAttributes, withChainValues } from './companion';
import { artInput, assetName, awardView, buildMetadata, onchainAttributes, type AchievementRow, type CatalogEntry } from './credential';

const BASE = 'https://example.supabase.co/functions/v1';
const passportCatalog: CatalogEntry = {
  key: 'trail_pass',
  kind: 'trail',
  tier: 'bronze',
  title_i18n: { pt: 'Certificação', en: 'Certification' },
  description_i18n: { en: 'You opened a page.' },
  art: { shape: 'passport' },
};
const passport: AchievementRow = {
  id: '70f5eb27-e08d-4270-aa56-3d609395da79',
  user_id: '1c6ab4d7-804f-45fa-8b68-e9a8a108e26c',
  achievement_key: 'trail_pass',
  ref_id: '9624052c-4efb-49ca-8bbf-f63d0e5d6c2d',
  state: {
    trail_title: { en: 'Week 1 · HTML', pt: 'Semana 1 · HTML' },
    program_slug: 'itera-v2',
    days_done: 2,
    total_days: 5,
    stamped_days: [1, 3],
    tier: 'bronze',
    completed_at: null,
  },
  earned_at: '2026-10-05T15:00:00.000Z',
  mint_status: 'unclaimed',
  wallet_address: null,
  asset_address: null,
  tx_signature: null,
  minted_at: null,
};

const art = (patch: Partial<ArtInput> = {}): ArtInput => ({ ...artInput(passport, passportCatalog, 'en', null), ...patch });
const count = (svg: string, needle: string) => svg.split(needle).length - 1;
const GREEN = '#3FD17F';
const VIOLET = '#A78BFA';
const PAGE = '#15120F';

describe('renderArt', () => {
  it('draws one slot per day and fills only the stamped ones', () => {
    const svg = renderArt(art());
    expect(count(svg, 'stroke-dasharray="5 6"')).toBe(3);
    expect(count(svg, 'stroke-width="3.5"')).toBe(2);
    expect(svg).toContain('Week 1 · HTML');
    expect(svg).not.toContain('CERTIFIED');
    expect(svg).toContain('TERA CERTIFICATION');
    expect(svg).not.toMatch(/PASSPORT|PASSAPORTE/);
  });

  it('switches to the gold treatment when the trail is complete', () => {
    const svg = renderArt(art({ tier: 'gold', daysDone: 5, stampedDays: [1, 2, 3, 4, 5] }));
    expect(svg).toContain('CERTIFIED');
    expect(renderArt(art({ tier: 'gold', lang: 'pt' }))).toContain('CERTIFICADA');
    expect(count(svg, 'stroke-dasharray="5 6"')).toBe(0);
  });

  it('paints every trail in Itera green and never leaks markup from titles', () => {
    const other: typeof passport = { ...passport, ref_id: '11111111-2222-4333-8444-555555555555' };
    expect(renderArt(artInput(other, passportCatalog, 'en', null))).toBe(renderArt(art()));
    expect(renderArt(art())).toContain(`stroke="${GREEN}" stroke-width="3.5"`);
    expect(renderArt(art())).not.toMatch(/hsl\(/);
    const svg = renderArt(art({ subtitle: '<script>alert(1)</script> & "x"' }));
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('stays small enough to be served inline, mascot included', () => {
    expect(renderArt(art()).length).toBeLessThan(150_000);
    expect(renderArt(art({ shape: 'medal', glyph: '3', accent: 'red; fill: url(x)' }))).not.toContain('url(x)');
  });
});

describe('passport cosmetics', () => {
  const gold = { tier: 'gold' as const, daysDone: 5, stampedDays: [1, 2, 3, 4, 5] };
  const dressed = (cosmetics: Record<string, unknown>): AchievementRow => ({ ...passport, state: { ...passport.state, cosmetics } });

  it('leaves the default page alone when nothing is set', () => {
    const plain = renderArt(art());
    expect(renderArt(art({ ink: null, frame: null }))).toBe(plain);
    expect(plain).toContain('data-ink="default"');
    expect(plain).not.toContain('data-frame');
    expect(plain).not.toContain('url(#emerald)');
    expect(plain).not.toContain(VIOLET);
  });

  it('keeps the page green under either ink: only stamps and accent change', () => {
    const plain = renderArt(art());
    const emerald = renderArt(art({ ink: 'emerald' }));
    const violet = renderArt(art({ ink: 'violet' }));
    for (const svg of [plain, emerald, violet]) expect(svg).toContain(`fill="${PAGE}" stroke="${GREEN}" stroke-width="3"`);
    expect(new Set([plain, emerald, violet]).size).toBe(3);
    expect(emerald).toContain('data-ink="emerald"');
    expect(violet).toContain('data-ink="violet"');
  });

  it('draws emerald as a jewel: gradient stamps with a sheen and an inner glow', () => {
    const emerald = renderArt(art({ ink: 'emerald' }));
    expect(count(emerald, 'fill="url(#emerald)" stroke=')).toBe(2);
    expect(count(emerald, 'fill="url(#sheen)"')).toBe(2);
    expect(count(emerald, 'filter="url(#soft)"')).toBe(1);
    expect(count(emerald, 'stroke-width="3.5"')).toBe(0);
    expect(emerald).not.toContain(VIOLET);
  });

  it('draws violet as line stamps in violet, with no jewel treatment', () => {
    const violet = renderArt(art({ ink: 'violet' }));
    expect(count(violet, `stroke="${VIOLET}" stroke-width="3.5"`)).toBe(2);
    expect(violet).not.toContain('url(#emerald)');
    expect(violet).not.toContain('url(#soft)');
  });

  it('adds the gold-leaf border without touching the ink', () => {
    const framed = renderArt(art({ frame: 'gold-leaf' }));
    expect(framed).toContain('data-frame="gold-leaf"');
    expect(framed).toContain('data-ink="default"');
    expect(count(renderArt(art({ ink: 'violet', frame: 'gold-leaf' })), 'data-frame')).toBe(1);
  });

  it('keeps ink and frame on a gold page, each look its own', () => {
    const plainGold = renderArt(art(gold));
    const emeraldGold = renderArt(art({ ...gold, ink: 'emerald', frame: 'gold-leaf' }));
    const violetGold = renderArt(art({ ...gold, ink: 'violet' }));
    expect(emeraldGold).toContain('CERTIFIED');
    expect(count(emeraldGold, 'fill="url(#emerald)" stroke=')).toBe(5);
    expect(emeraldGold).toContain('data-frame="gold-leaf"');
    expect(count(violetGold, `stroke="${VIOLET}" stroke-width="3.5"`)).toBe(5);
    expect(plainGold).not.toContain('url(#emerald)');
    expect(plainGold).not.toContain(VIOLET);
    expect(plainGold).not.toContain(GREEN + '" stroke-width="3.5"');
    for (const svg of [plainGold, emeraldGold, violetGold]) expect(svg).toContain(`fill="${PAGE}" stroke="url(#metal)"`);
  });

  it('flows from the row state into art, metadata and on-chain attributes', () => {
    const row = dressed({ ink: 'violet', frame: 'gold-leaf' });
    expect(artInput(row, passportCatalog, 'en', null)).toMatchObject({ ink: 'violet', frame: 'gold-leaf' });
    expect(buildMetadata(row, passportCatalog, 'en', BASE, null).attributes).toEqual(
      expect.arrayContaining([{ trait_type: 'Ink', value: 'violet' }, { trait_type: 'Frame', value: 'gold-leaf' }]),
    );
    const onchain = onchainAttributes(row, passportCatalog);
    expect(onchain.slice(0, 8)).toEqual(onchainAttributes(passport, passportCatalog));
    expect(onchain.slice(8)).toEqual([{ key: 'ink', value: 'violet' }, { key: 'frame', value: 'gold-leaf' }]);
  });

  it('adds nothing for an unset or unknown cosmetic', () => {
    const traits = (row: AchievementRow) => buildMetadata(row, passportCatalog, 'en', BASE, null).attributes.map((entry) => entry.trait_type);
    expect(traits(passport)).not.toContain('Ink');
    expect(traits(dressed({ ink: 'neon' }))).not.toContain('Ink');
    expect(onchainAttributes(dressed({ ink: 'neon', frame: '<svg>' }), passportCatalog)).toEqual(onchainAttributes(passport, passportCatalog));
    expect(traits(dressed({ ink: 'emerald' }))).toContain('Ink');
    expect(traits(dressed({ ink: 'emerald' }))).not.toContain('Frame');
  });

  it('survives a later stamp: the state merge keeps the cosmetics on chain', () => {
    const stamped = { ...dressed({ ink: 'emerald' }).state, days_done: 3, stamped_days: [1, 2, 3] };
    const attributes = Object.fromEntries(onchainAttributes({ ...passport, state: stamped }, passportCatalog).map(({ key, value }) => [key, value]));
    expect(attributes).toMatchObject({ days_done: '3', ink: 'emerald' });
  });

  it('exposes the row in the shape the app reads from `passport`', () => {
    const view = awardView(dressed({ ink: 'emerald' }), passportCatalog, 'pt', BASE);
    expect(Object.keys(view)).toEqual([
      'id', 'key', 'kind', 'tier', 'title', 'description', 'ref_id', 'state', 'earned_at', 'mint_status',
      'asset_address', 'tx_signature', 'explorer_url', 'tx_explorer_url', 'metadata_url', 'image_url',
    ]);
    expect(view.state).toMatchObject({ trail: 'Semana 1 · HTML', cosmetics: { ink: 'emerald' } });
  });
});

describe('companion art', () => {
  const snapshot = {
    id: '70f5eb27-e08d-4270-aa56-3d609395da79',
    userId: '1c6ab4d7-804f-45fa-8b68-e9a8a108e26c',
    lives: 2,
    maxLives: 5,
    outfit: null as string | null,
    stats: { level: 4, xp: 780, streak: 2 },
    assetAddress: null,
    mirrored: null,
    mirroredAt: null,
  };
  const draw = (patch: Partial<typeof snapshot> = {}, lang: 'pt' | 'en' = 'en') => renderArt(companionArtInput({ ...snapshot, ...patch }, lang));

  it('draws the asset\'s values instead of the live row when asked for the chain snapshot', () => {
    const onchain = companionFromAttributes([
      { key: 'lives', value: '5' },
      { key: 'max_lives', value: '5' },
      { key: 'outfit', value: 'outfit_crown' },
      { key: 'level', value: '3' },
    ]);
    const redrawn = withChainValues(snapshot, onchain);
    const svg = renderArt(companionArtInput(redrawn, 'en'));
    expect(svg).toContain('5/5 LIVES');
    expect(svg).toContain('LEVEL 3');
    expect(svg).not.toBe(draw());
    expect(redrawn.id).toBe(snapshot.id);
    expect(redrawn.userId).toBe(snapshot.userId);
    expect(draw()).toContain('2/5 LIVES');
  });

  it('puts the chain values in the art URL, so each snapshot has its own cache entry', () => {
    const base = 'https://x.supabase.co/functions/v1';
    const values = { lives: 5, max_lives: 5, outfit: null, level: 1, xp: 0, streak: 0 };
    const url = companionChainImageUrl(base, snapshot.id, values);
    expect(url).toBe(`${base}/credential-meta/companion/${snapshot.id}/image.svg?source=chain&v=5-5-1-none`);
    expect(companionChainImageUrl(base, snapshot.id, { ...values, lives: 0 })).not.toBe(url);
    expect(companionChainImageUrl(base, snapshot.id, { ...values, outfit: 'outfit_crown' }, 'pt')).toContain('?source=chain&lang=pt&v=5-5-1-outfit_crown');
  });

  it('draws one heart per life slot, filled up to the current lives', () => {
    const svg = draw();
    expect(count(svg, 'stroke-dasharray="2.4 2.4"')).toBe(3);
    expect(svg).toContain('2/5 LIVES');
    expect(svg).toContain('LEVEL 4');
    expect(draw({ lives: 5 })).not.toContain('stroke-dasharray="2.4 2.4"');
    expect(draw({}, 'pt')).toContain('2/5 VIDAS');
  });

  it('draws the equipped outfit by key and nothing for an unknown one', () => {
    const bare = draw();
    expect(bare).not.toContain('data-outfit');
    const keys = ['outfit_glasses', 'outfit_crown', 'outfit_headphones', 'outfit_laurel'];
    const outfits = keys.map((outfit) => draw({ outfit }));
    outfits.forEach((svg, index) => expect(svg).toContain(`data-outfit="${keys[index]}"`));
    expect(new Set([bare, ...outfits]).size).toBe(5);
    expect(draw({ outfit: 'outfit_"><script>' })).toBe(bare);
    expect(draw({ outfit: 'toString' })).toBe(bare);
  });

  it('layers the outfit like the app: back under the face, front over it, all inlined', () => {
    const svg = draw({ outfit: 'outfit_laurel' });
    const back = svg.indexOf('data-outfit-layer="back"');
    const face = svg.indexOf(TERA_FACE_DATA_URI.slice(0, 80));
    const front = svg.indexOf('data-outfit-layer="front"');
    expect(back).toBeGreaterThan(-1);
    expect(back).toBeLessThan(face);
    expect(face).toBeLessThan(front);
    expect(draw({ outfit: 'outfit_crown' })).not.toContain('data-outfit-layer="back"');
    expect(svg).not.toMatch(/href="https?:/);
  });

  it('keeps every companion drawing under 250 KB', () => {
    for (const outfit of [null, ...Object.keys(OUTFIT_LAYERS)]) expect(draw({ outfit }).length, String(outfit)).toBeLessThan(250_000);
  });

  it('carries no user id', () => {
    expect(draw()).not.toContain(snapshot.userId);
  });
});

describe('text helpers', () => {
  it('escapes XML and strips control characters', () => {
    expect(escapeXml(`a<b>&"'\u0000`)).toBe('a&lt;b&gt;&amp;&quot;&#39;');
  });

  it('wraps long titles into a bounded number of lines', () => {
    const lines = wrapText('01 · From signals to useful data — model fleet telemetry and much more text', 23, 3);
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.length <= 23)).toBe(true);
    expect(lines[2].endsWith('…')).toBe(true);
  });
});

describe('credential metadata', () => {
  it('exposes the achievement and trail, keyed by the row id, with no personal data', () => {
    const metadata = buildMetadata(passport, passportCatalog, 'en', BASE, null);
    expect(metadata.name).toBe('Certification · Week 1 · HTML');
    expect(assetName(passport, passportCatalog)).toBe('Tera Certification · Week 1 · HTML');
    expect(metadata.image).toBe(`${BASE}/credential-meta/${passport.id}/image.svg`);
    expect(metadata.external_url.endsWith(`/c/${passport.id}`)).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain(passport.user_id);
  });

  it('builds the on-chain attribute list for a passport', () => {
    expect(Object.fromEntries(onchainAttributes(passport, passportCatalog).map(({ key, value }) => [key, value]))).toEqual({
      kind: 'trail_passport',
      program: 'itera-v2',
      trail: 'Week 1 · HTML',
      days_done: '2',
      total_days: '5',
      tier: 'bronze',
      completed_at: '',
      learner: passport.user_id,
    });
  });
});
