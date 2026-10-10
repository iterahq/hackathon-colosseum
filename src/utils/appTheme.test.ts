import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, faviconSvg, hexToHslTriplet, readCachedTheme, THEME_CACHE_KEY, writeCachedTheme } from '@/utils/appTheme';
import { DEFAULT_THEME } from '@/types/crystals';

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#0A0908"><link rel="icon" type="image/svg+xml" href="/favicon.svg">';
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-app-bg');
  document.documentElement.removeAttribute('data-app-icon');
});

describe('appTheme', () => {
  it('converts a hex colour to the hsl triplet', () => {
    expect(hexToHslTriplet('#000000')).toBe('0 0% 0%');
    expect(hexToHslTriplet('#FFFFFF')).toBe('0 0% 100%');
    expect(hexToHslTriplet('#0B1020')).toBe('226 49% 8%');
  });

  it('paints a custom theme and clears it on the defaults', () => {
    applyTheme({ background: '#0B1020', icon: '#F5B301' });
    const root = document.documentElement;
    expect(root.dataset.appBg).toBe('1');
    expect(root.dataset.appIcon).toBe('1');
    expect(root.style.getPropertyValue('--app-canvas')).toBe('#0B1020');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0B1020');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toContain('data:image/svg+xml');
    applyTheme({ background: '#0A0908', icon: '#3FD17F' });
    expect(root.dataset.appBg).toBeUndefined();
    expect(root.style.getPropertyValue('--app-canvas')).toBe('');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('draws the slash of the favicon in the icon colour', () => {
    expect(faviconSvg({ background: '#0B1020', icon: '#8B5CF6' })).toContain('fill="#8B5CF6"');
  });

  it('round-trips the cache and refuses garbage', () => {
    expect(readCachedTheme()).toBeNull();
    writeCachedTheme({ ...DEFAULT_THEME, background: { key: 'bg_ember', color: '#1A0C0C' } });
    expect(readCachedTheme()).toEqual({ background: '#1A0C0C', icon: '#3FD17F', border: null });
    localStorage.setItem(THEME_CACHE_KEY, '{"background":"red"}');
    expect(readCachedTheme()).toBeNull();
  });
});
