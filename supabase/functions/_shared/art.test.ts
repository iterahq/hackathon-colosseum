import { describe, expect, it } from 'vitest';
import { escapeXml, renderArt, trailColor, wrapText, type ArtInput } from './art';
import { companionArtInput } from './companion';
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

  it('gives each trail its own color and never leaks markup from titles', () => {
    expect(trailColor('unit-a')).not.toBe(trailColor('unit-b'));
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
    expect(plain).not.toContain('data-frame');
    expect(plain).not.toContain('#34D399');
    expect(plain).not.toContain('#A78BFA');
  });

  it('draws the stamps in the bought ink, each ink its own colour', () => {
    const emerald = renderArt(art({ ink: 'emerald' }));
    const violet = renderArt(art({ ink: 'violet' }));
    expect(emerald).toContain('#34D399');
    expect(violet).toContain('#A78BFA');
    expect(emerald).not.toContain('#A78BFA');
    expect(emerald).not.toContain(trailColor(passport.ref_id));
    expect(emerald).not.toBe(violet);
  });

  it('adds the gold-leaf border without touching the ink', () => {
    const framed = renderArt(art({ frame: 'gold-leaf' }));
    expect(framed).toContain('data-frame="gold-leaf"');
    expect(framed).toContain(trailColor(passport.ref_id));
    expect(count(renderArt(art({ ink: 'violet', frame: 'gold-leaf' })), 'data-frame')).toBe(1);
  });

  it('keeps both on a gold page', () => {
    const plainGold = renderArt(art(gold));
    const dressedGold = renderArt(art({ ...gold, ink: 'emerald', frame: 'gold-leaf' }));
    expect(dressedGold).toContain('CERTIFIED');
    expect(dressedGold).toContain('#34D399');
    expect(dressedGold).toContain('data-frame="gold-leaf"');
    expect(plainGold).not.toContain('#34D399');
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
  };
  const draw = (patch: Partial<typeof snapshot> = {}, lang: 'pt' | 'en' = 'en') => renderArt(companionArtInput({ ...snapshot, ...patch }, lang));

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
    const outfits = ['outfit_glasses', 'outfit_crown', 'outfit_headphones'].map((outfit) => draw({ outfit }));
    outfits.forEach((svg, index) => expect(svg).toContain(`data-outfit="${['outfit_glasses', 'outfit_crown', 'outfit_headphones'][index]}"`));
    expect(new Set([bare, ...outfits]).size).toBe(4);
    expect(draw({ outfit: 'outfit_"><script>' })).toBe(bare);
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
