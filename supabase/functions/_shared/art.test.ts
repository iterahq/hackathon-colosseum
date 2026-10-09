import { describe, expect, it } from 'vitest';
import { escapeXml, renderArt, trailColor, wrapText, type ArtInput } from './art';
import { artInput, buildMetadata, onchainAttributes, type AchievementRow, type CatalogEntry } from './credential';

const BASE = 'https://example.supabase.co/functions/v1';
const passportCatalog: CatalogEntry = {
  key: 'trail_pass',
  kind: 'trail',
  tier: 'bronze',
  title_i18n: { pt: 'Passaporte da trilha', en: 'Trail passport' },
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
    expect(svg).not.toContain('TRAIL COMPLETE');
  });

  it('switches to the gold treatment when the trail is complete', () => {
    const svg = renderArt(art({ tier: 'gold', daysDone: 5, stampedDays: [1, 2, 3, 4, 5] }));
    expect(svg).toContain('TRAIL COMPLETE');
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
    expect(metadata.name).toBe('Trail passport · Week 1 · HTML');
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
