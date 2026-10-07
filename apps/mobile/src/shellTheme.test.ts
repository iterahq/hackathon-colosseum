import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as theme from './shellTheme';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const CSS: Record<string, string> = {
  'theme.css': read('../../../packages/screens/theme/theme.css'),
  'tokens.css': read('../../../packages/screens/theme/tokens.css'),
};

// The hex a token resolves to: `--name: #rrggbb;` in theme.css, or the hex noted in the comment after `--name: <hsl>;` in tokens.css.
function tokenHex(css: string, token: string): string | null {
  const escaped = token.replace(/[-]/g, '\\-');
  const direct = new RegExp(`${escaped}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (direct) return direct[1]!.toUpperCase();
  const noted = new RegExp(`^\\s*${escaped}:[^;]*;\\s*/\\*\\s*(#[0-9a-fA-F]{6})`, 'm').exec(css);
  return noted ? noted[1]!.toUpperCase() : null;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('shellTheme follows the shared theme', () => {
  it.each(theme.TOKEN_CLAIMS.map((c) => [`${c.name} = ${c.token} in ${c.css}`, c] as const))('%s', (_label, claim) => {
    expect(tokenHex(CSS[claim.css]!, claim.token)).toBe(claim.value.toUpperCase());
  });
  it('the dev strip is the background at 85%', () => {
    expect(theme.STRIP_BACKGROUND).toBe(`${theme.BACKGROUND}D9`);
    expect(parseInt('D9', 16) / 255).toBeCloseTo(0.85, 2);
  });
});

describe('contrast', () => {
  it('the theme muted ink fails AA on the background, which is why the cards keep lighter values', () => {
    const muted = tokenHex(CSS['theme.css']!, '--color-brand-muted')!;
    expect(muted).toBe('#7D7568');
    expect(contrast(muted, theme.BACKGROUND)).toBeLessThan(4.5);
  });
  it.each([
    ['INK', theme.INK, theme.BACKGROUND],
    ['MUTED_BODY', theme.MUTED_BODY, theme.BACKGROUND],
    ['MUTED_DETAIL', theme.MUTED_DETAIL, theme.BACKGROUND],
    ['DANGER', theme.DANGER, theme.BACKGROUND],
    ['BACKGROUND on the primary button', theme.BACKGROUND, theme.INK],
  ])('%s passes AA (4.5:1)', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('the accent and the button outline pass the 3:1 of a graphic', () => {
    expect(contrast(theme.ACCENT, theme.BACKGROUND)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.BUTTON_BORDER, theme.BACKGROUND)).toBeGreaterThanOrEqual(3);
  });
});

describe('no colour literal outside shellTheme', () => {
  const FILES = [
    'src/LoadingVeil.tsx',
    'src/OfflineCard.tsx',
    'src/UpdateNowCard.tsx',
    'src/BackConfirmCard.tsx',
    'src/DevOverlay.tsx',
    'app/_layout.tsx',
    'app/[...path].tsx',
    'app/index.tsx',
  ];
  it.each(FILES)('%s', (file) => {
    const code = read(`../${file}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\b(rgba?|hsla?)\(/);
  });
});
