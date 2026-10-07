import { describe, expect, it } from 'vitest';
import { ROUTE_MAP, compilePattern, compileRoutes, matchRoute, normalisePath, resolveShellPath } from './routes';

describe('route map', () => {
  it('holds the 31 rows of the map, all webview; each has a web page unless it is universal', () => {
    expect(ROUTE_MAP.version).toBe(1);
    expect(ROUTE_MAP.routes).toHaveLength(31);
    for (const r of ROUTE_MAP.routes) {
      expect(r.mode).toBe('webview');
      expect(r.web_paths.length).toBeGreaterThan(0);
    }
    expect(ROUTE_MAP.routes.filter((r) => r.universal).map((r) => r.path)).toEqual(['*']);
  });

  it('the catch-all row matches no path: an unknown path still opens the home route', () => {
    expect(compilePattern('*').test('/*')).toBe(false);
    expect(compilePattern('*').test('/anything')).toBe(false);
    expect(matchRoute('/*')).toBeNull();
    expect(resolveShellPath('/*')).toBe('/');
  });

  it('refuses a route whose mode this shell cannot open', () => {
    const bad = { path: '/x', screen: 'x', mode: 'native' as never, universal: true, web_paths: [] };
    expect(() => compileRoutes({ ...ROUTE_MAP, routes: [bad] })).toThrow(/webview only/);
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
