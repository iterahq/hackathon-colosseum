import { describe, expect, it } from 'vitest';
import { renderArt } from './art.ts';
import { artInput, buildMetadata, onchainAttributes, type AchievementRow, type CatalogEntry } from './credential.ts';

const USER = '11111111-2222-4333-8444-555555555555';
const catalog = (position: 1 | 2 | 3): CatalogEntry => ({
  key: `podium_${position}`,
  kind: 'milestone',
  tier: (['gold', 'silver', 'bronze'] as const)[position - 1],
  title_i18n: { pt: `${position}º lugar na aula ao vivo`, en: `${['1st', '2nd', '3rd'][position - 1]} place in a live class` },
  description_i18n: { pt: 'Pódio de uma aula ao vivo da Itera.', en: 'On the podium of an Itera live class.' },
  art: { shape: 'medal', glyph: String(position), accent: '#3FD17F' },
});
const row = (position: 1 | 2 | 3, state: Record<string, unknown> = {}): AchievementRow => ({
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  user_id: USER,
  achievement_key: `podium_${position}`,
  ref_id: '99999999-0000-4000-8000-000000000001',
  state: { position, class_title: { pt: 'Dia 1 · Tags', en: 'Day 1 · Tags' }, class_date: '2026-10-09', correct: 3, answered: 3, ...state },
  earned_at: '2026-10-10T02:30:00.000Z',
  mint_status: 'unclaimed',
  wallet_address: null,
  asset_address: null,
  tx_signature: null,
  minted_at: null,
});
const svg = (position: 1 | 2 | 3, lang: 'pt' | 'en' = 'pt') => renderArt(artInput(row(position), catalog(position), lang, null));

describe('podium medal art', () => {
  it('draws the place over the three steps, one variant per position', () => {
    for (const position of [1, 2, 3] as const) {
      const art = svg(position);
      expect(art).toContain(`data-podium="${position}"`);
      expect(art).toContain(`>${position}</text>`);
      expect(art.match(/<rect x="(208|240|272)" y="\d+" width="32"/g)).toHaveLength(1);
    }
    expect(new Set([svg(1), svg(2), svg(3)]).size).toBe(3);
  });

  it('keeps Itera green as the only fill and uses gold, silver and bronze only as the metal', () => {
    expect(svg(1)).toContain('#E8B84A');
    expect(svg(2)).toContain('#C3C9D2');
    expect(svg(3)).toContain('#C8834A');
    for (const position of [1, 2, 3] as const) {
      const emblem = svg(position).split('data-podium')[1].split('</g>')[0];
      expect(emblem).toContain('#3FD17F');
      expect(emblem).not.toMatch(/#E8B84A|#C3C9D2|#C8834A/);
    }
  });

  it('shows the class and its day, escaped, and no glyph text', () => {
    expect(svg(1, 'en')).toContain('Day 1 · Tags · 2026-10-09');
    const hostile = renderArt(artInput(row(1, { class_title: { pt: '<script>x</script>' } }), catalog(1), 'pt', null));
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&lt;script&gt;');
  });

  it('leaves the other medals as they were', () => {
    const plain = renderArt({ shape: 'medal', tier: 'bronze', title: 'First stamp', subtitle: '', daysDone: 0, totalDays: 0, stampedDays: [], highlightDay: null, glyph: '1', accent: '#3FD17F', programSlug: '', serial: 'X', lang: 'en' });
    expect(plain).not.toContain('data-podium');
    expect(plain).toContain('font-size="84"');
  });
});

describe('podium medal on chain and in metadata', () => {
  it('writes the place, the class and the day, and no internal id of the learner', () => {
    const attributes = onchainAttributes(row(2), catalog(2));
    expect(attributes).toEqual([
      { key: 'kind', value: 'milestone_medal' },
      { key: 'achievement', value: 'podium_2' },
      { key: 'tier', value: 'silver' },
      { key: 'completed_at', value: '2026-10-10T02:30:00.000Z' },
      { key: 'position', value: '2' },
      { key: 'class', value: 'Day 1 · Tags' },
      { key: 'class_date', value: '2026-10-09' },
    ]);
    expect(JSON.stringify(attributes)).not.toContain(USER);
  });

  it('writes the week of a weekly goal, again with no learner id', () => {
    const weekly: AchievementRow = { ...row(1), achievement_key: 'weekly_goal', state: { week: '2026-W41', count: 20, goal: 20 } };
    const entry: CatalogEntry = { ...catalog(1), key: 'weekly_goal', tier: 'bronze', title_i18n: { en: 'Weekly goal' }, description_i18n: { en: '20 activities in 7 days' } };
    expect(onchainAttributes(weekly, entry)).toEqual([
      { key: 'kind', value: 'milestone_medal' },
      { key: 'achievement', value: 'weekly_goal' },
      { key: 'tier', value: 'bronze' },
      { key: 'completed_at', value: '2026-10-10T02:30:00.000Z' },
      { key: 'week', value: '2026-W41' },
    ]);
    expect(renderArt(artInput(weekly, entry, 'en', null))).toContain('20 activities in 7 days · 2026-W41');
    expect(buildMetadata(weekly, entry, 'en', 'https://f', null).attributes).toContainEqual({ trait_type: 'Week', value: '2026-W41' });
  });

  it('keeps the older medals unchanged', () => {
    const first: AchievementRow = { ...row(1), achievement_key: 'first_stamp', state: {} };
    const entry: CatalogEntry = { ...catalog(1), key: 'first_stamp', tier: 'bronze' };
    expect(onchainAttributes(first, entry).map((attribute) => attribute.key)).toEqual(['kind', 'achievement', 'program', 'tier', 'completed_at', 'learner']);
  });

  it('describes the place in the metadata', () => {
    const metadata = buildMetadata(row(3), catalog(3), 'en', 'https://f', null);
    expect(metadata.name).toBe('3rd place in a live class');
    expect(metadata.attributes).toEqual(expect.arrayContaining([{ trait_type: 'Position', value: 3 }, { trait_type: 'Class', value: 'Day 1 · Tags' }, { trait_type: 'Class date', value: '2026-10-09' }]));
    expect(JSON.stringify(metadata)).not.toContain(USER);
  });
});
