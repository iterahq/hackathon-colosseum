import { describe, expect, it } from 'vitest';
import { NATIVE_HOSTS, ROUTE_MAP, compilePattern, compileRoutes, isNativeScreen, matchRoute, normalisePath, resolveShellPath } from './routes';

describe('route map', () => {
  it('holds the 31 rows of the map, each webview unless its universal screen has a native host; each names its web page files', () => {
    expect(ROUTE_MAP.version).toBe(1);
    expect(ROUTE_MAP.routes).toHaveLength(31);
    for (const r of ROUTE_MAP.routes) {
      expect(r.mode === 'webview' || (r.mode === 'native' && r.universal && r.screen in NATIVE_HOSTS), r.path).toBe(true);
      expect(r.web_paths.length).toBeGreaterThan(0);
    }
    expect(ROUTE_MAP.routes.filter((r) => r.universal).map((r) => r.path)).toEqual(['/catalog', '*']);
  });

  it('the catch-all row matches no path: an unknown path still opens the home route', () => {
    expect(compilePattern('*').test('/*')).toBe(false);
    expect(compilePattern('*').test('/anything')).toBe(false);
    expect(matchRoute('/*')).toBeNull();
    expect(resolveShellPath('/*')).toBe('/');
  });

  it('refuses a route whose mode this shell cannot open: native needs a universal screen with a native host', () => {
    const row = { path: '/x', screen: 'x', mode: 'native' as const, universal: true, web_paths: [] };
    expect(() => compileRoutes({ ...ROUTE_MAP, routes: [row] })).toThrow(/native only for a universal screen with a native host/);
    expect(() => compileRoutes({ ...ROUTE_MAP, routes: [{ ...row, screen: 'catalog', universal: false }] })).toThrow(/native host/);
    expect(() => compileRoutes({ ...ROUTE_MAP, routes: [{ ...row, mode: 'dom' as never }] })).toThrow(/mode dom/);
    expect(compileRoutes({ ...ROUTE_MAP, routes: [{ ...row, screen: 'catalog' }] })).toHaveLength(1);
  });

  it('every native host belongs to one universal row, and is open in a release build only when that row is native', () => {
    for (const screen of Object.keys(NATIVE_HOSTS)) {
      expect(ROUTE_MAP.routes.filter((r) => r.screen === screen && r.universal)).toHaveLength(1);
      expect(isNativeScreen(screen)).toBe(ROUTE_MAP.routes.some((r) => r.screen === screen && r.mode === 'native'));
    }
    const closed = { ...ROUTE_MAP, routes: ROUTE_MAP.routes.map((r) => ({ ...r, mode: 'webview' as const })) };
    expect(isNativeScreen('catalog', closed)).toBe(false);
    const flipped = { ...closed, routes: closed.routes.map((r) => (r.screen === 'catalog' ? { ...r, mode: 'native' as const } : r)) };
    expect(isNativeScreen('catalog', flipped)).toBe(true);
    expect(isNativeScreen('home', flipped)).toBe(false);
  });
});

describe('matchRoute', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['login', '/login'],
    ['/program/intro-html', '/program/:slug'],
    ['lesson/abc-123/', '/lesson/:lessonId'],
    ['/live/instructor', '/live/instructor'],
    ['/live/abc', '/live/:sessionId'],
    ['/g/ABCD', '/g/:code'],
    ['/admin/replay/t1', '/admin/replay/:traceId'],
  ])('%s -> %s', (path, route) => {
    expect(matchRoute(path)?.path).toBe(route);
  });

  it.each(['/nope', '/lesson', '/program/a/b', '/prototipo/cena'])('%s is not a shell route', (path) => {
    expect(matchRoute(path)).toBeNull();
  });
});

describe('resolveShellPath', () => {
  it('keeps a route path and sends any other path home', () => {
    expect(resolveShellPath('lesson/l1')).toBe('/lesson/l1');
    expect(resolveShellPath('there-is-no-such-route')).toBe('/');
  });
});

describe('helpers', () => {
  it('normalises slashes', () => {
    expect(normalisePath('//a/b//')).toBe('/a/b');
  });
  it('escapes literal parts of a pattern', () => {
    expect(compilePattern('/a.b').test('/aXb')).toBe(false);
  });
});
