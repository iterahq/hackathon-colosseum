/**
 * The learner's theme painted on the app: canvas colour (background), colour of the "I/" mark and the
 * favicon (icon) and the browser chrome (`theme-color`). Trails, buttons and progress stay Itera green.
 * The last theme is cached in localStorage and applied by a script in `index.html` before first paint.
 */
import { DEFAULT_THEME, type AvatarBorder, type Theme } from '@/types/crystals';

export const THEME_CACHE_KEY = 'itera.theme.v1';

export interface ThemeColors {
  background: string;
  icon: string;
}

export const DEFAULT_COLORS: ThemeColors = { background: DEFAULT_THEME.background.color, icon: DEFAULT_THEME.icon.color };

export interface CachedTheme extends ThemeColors {
  border: AvatarBorder | null;
}

const HEX6 = /^#[0-9a-f]{6}$/i;

export function readCachedTheme(): CachedTheme | null {
  try {
    const raw = JSON.parse(localStorage.getItem(THEME_CACHE_KEY) ?? 'null') as Partial<CachedTheme> | null;
    if (!raw || !HEX6.test(raw.background ?? '') || !HEX6.test(raw.icon ?? '')) return null;
    return { background: raw.background!, icon: raw.icon!, border: raw.border ?? null };
  } catch {
    return null;
  }
}

export function writeCachedTheme(theme: Theme): void {
  const value: CachedTheme = { background: theme.background.color, icon: theme.icon.color, border: theme.border?.border ?? null };
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(value));
  } catch {
    /* private mode: the theme is applied on the next sign-in read */
  }
}

/** "#0B1020" -> "225 45% 8%": the triplet `hsl(var(--background))` expects. */
export function hexToHslTriplet(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** The favicon of the app: the "I/" mark on the canvas colour, the slash in the icon colour. Same drawing as `public/favicon.svg`. */
export function faviconSvg({ background, icon }: ThemeColors): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${background}"/><g fill="#F4EDE2"><rect x="20" y="16" width="14" height="6"/><rect x="24" y="16" width="6" height="32"/><rect x="20" y="42" width="14" height="6"/></g><path d="M44 16 L50 16 L40 48 L34 48 Z" fill="${icon}"/></svg>`;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Paints the theme on the document. Idempotent; the default theme removes every override. */
export function applyTheme(colors: ThemeColors, doc: Document = document): void {
  const root = doc.documentElement;
  const customBg = !same(colors.background, DEFAULT_COLORS.background);
  const customIcon = !same(colors.icon, DEFAULT_COLORS.icon);
  if (customBg) {
    root.style.setProperty('--app-canvas', colors.background);
    root.style.setProperty('--background', hexToHslTriplet(colors.background));
    root.dataset.appBg = '1';
  } else {
    root.style.removeProperty('--app-canvas');
    root.style.removeProperty('--background');
    root.style.removeProperty('background-color');
    delete root.dataset.appBg;
  }
  if (customIcon) {
    root.style.setProperty('--app-icon', colors.icon);
    root.dataset.appIcon = '1';
  } else {
    root.style.removeProperty('--app-icon');
    delete root.dataset.appIcon;
  }
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background);
  const icon = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    if (!icon.dataset.defaultHref) icon.dataset.defaultHref = icon.getAttribute('href') ?? '/favicon.svg';
    icon.setAttribute('href', customBg || customIcon ? `data:image/svg+xml,${encodeURIComponent(faviconSvg(colors))}` : icon.dataset.defaultHref);
  }
}

export function applyCachedTheme(): void {
  const cached = readCachedTheme();
  if (cached) applyTheme(cached);
}
