import { describe, expect, it } from 'vitest';
import { renderArt } from './art';
import { DEFAULT_AVATAR_KEY } from './avatars';
import { clampInt, cleanTrail, parsePreview, previewArtInput } from './preview';

const KEYS = new Set(['tera_normal', 'tera_feliz', 'base_lider']);
const parse = (query: string) => parsePreview(new URLSearchParams(query), KEYS);

describe('preview parameters', () => {
  it('needs a known type and nothing else', () => {
    expect(parse('')).toBeNull();
    expect(parse('type=medal')).toBeNull();
    expect(parse('type=certification')).toEqual({ type: 'certification', trail: 'Sua trilha', days: 5, total: 5, tier: 'gold', ink: null, frame: null, lang: 'pt' });
    expect(parse('type=companion')).toEqual({ type: 'companion', avatar: DEFAULT_AVATAR_KEY, outfit: null, lives: 10, level: 1, lang: 'pt' });
  });

  it('reads a full certification request', () => {
    expect(parse('type=certification&trail=Semana%201%20%C2%B7%20HTML&days=2&total=5&tier=bronze&ink=emerald&frame=gold-leaf&lang=en')).toEqual({
      type: 'certification',
      trail: 'Semana 1 · HTML',
      days: 2,
      total: 5,
      tier: 'bronze',
      ink: 'emerald',
      frame: 'gold-leaf',
      lang: 'en',
    });
  });

  it('clamps numbers and falls back on anything that is not one', () => {
    expect(parse('type=certification&total=99&days=99')).toMatchObject({ total: 12, days: 12 });
    expect(parse('type=certification&total=0&days=-3')).toMatchObject({ total: 1, days: 0 });
    expect(parse('type=certification&total=abc&days=1e9')).toMatchObject({ total: 5, days: 5 });
    expect(parse('type=certification&total=3&days=7')).toMatchObject({ total: 3, days: 3 });
    expect(parse('type=companion&lives=99&level=1000')).toMatchObject({ lives: 10, level: 99 });
    expect(parse('type=companion&lives=-1&level=0')).toMatchObject({ lives: 0, level: 1 });
    expect(parse('type=companion&lives=2.5&level=NaN')).toMatchObject({ lives: 10, level: 1 });
    expect(clampInt('12345678', 0, 9, 4)).toBe(4);
    expect(clampInt(' 3 ', 0, 9, 4)).toBe(3);
  });

  it('falls back on unknown enumerations instead of refusing', () => {
    expect(parse('type=certification&tier=platinum&ink=red&frame=neon&lang=fr&days=1')).toMatchObject({ tier: 'bronze', ink: null, frame: null, lang: 'pt' });
    expect(parse('type=companion&outfit=none')).toMatchObject({ outfit: null });
    expect(parse('type=companion&outfit=outfit_crown')).toMatchObject({ outfit: 'outfit_crown' });
    expect(parse('type=companion&outfit=../../etc')).toMatchObject({ outfit: null });
  });

  it('only ever names an avatar of the catalog', () => {
    expect(parse('type=companion&avatar=base_lider')).toMatchObject({ avatar: 'base_lider' });
    for (const avatar of ['unknown', '../secret', 'https://evil.example/x', 'BASE_LIDER', '']) {
      expect(parse(`type=companion&avatar=${encodeURIComponent(avatar)}`)).toMatchObject({ avatar: DEFAULT_AVATAR_KEY });
    }
    expect(parsePreview(new URLSearchParams('type=companion&avatar=base_lider'), new Set())).toMatchObject({ avatar: DEFAULT_AVATAR_KEY });
  });

  it('cuts the trail to 40 characters and drops control characters', () => {
    expect(cleanTrail('a'.repeat(100), 'pt')).toHaveLength(40);
    expect(cleanTrail('  Semana\u0000 1 \n\t HTML  ', 'pt')).toBe('Semana 1 HTML');
    expect(cleanTrail('   ', 'en')).toBe('Your trail');
    expect(cleanTrail(null, 'pt')).toBe('Sua trilha');
  });
});

describe('preview art', () => {
  it('draws the certification page the real endpoint draws, with hostile text escaped', () => {
    const svg = renderArt(previewArtInput(parse('type=certification&trail=%3Cscript%3Ealert(1)%3C%2Fscript%3E&days=2&total=5&ink=violet&frame=gold-leaf')!));
    expect(svg).toContain('data-ink="violet"');
    expect(svg).toContain('data-frame="gold-leaf"');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('PREVIEW');
    expect(renderArt(previewArtInput(parse('type=certification&days=5&total=5')!))).toContain('CERTIFICADA');
  });

  it('draws the companion card with the avatar rule', () => {
    const picture = 'data:image/webp;base64,UklGRg==';
    const plain = renderArt(previewArtInput(parse('type=companion&outfit=outfit_crown&lives=3&level=7')!));
    expect(plain).toContain('data-outfit="outfit_crown"');
    expect(plain).toContain('3/10');
    const painting = renderArt(previewArtInput(parse('type=companion&avatar=base_lider&outfit=outfit_crown')!, { key: 'base_lider', image: picture, allowsOutfit: false }));
    expect(painting).toContain('data-avatar="base_lider"');
    expect(painting).not.toContain('data-outfit');
  });
});
