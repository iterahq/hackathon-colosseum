import { describe, expect, it } from 'vitest';
import { ROUTE_MAP, compilePattern, compileRoutes, matchRoute, normalisePath, pathOnOrigin, resolveShellPath } from './routes';

describe('route map', () => {
  it('holds the 30 routes of the shell, all webview, each with a web page', () => {
    expect(ROUTE_MAP.version).toBe(1);
    expect(ROUTE_MAP.routes).toHaveLength(30);
    for (const r of ROUTE_MAP.routes) {
      expect(r.mode).toBe('webview');
      expect(r.universal).toBe(false);
      expect(r.web_paths.length).toBeGreaterThan(0);
    }
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
  it('reads the path of a URL on the app origin only', () => {
    const o = 'https://app.iterahq.dev';
    expect(pathOnOrigin(`${o}/lesson/1?x=2#h`, o)).toBe('/lesson/1');
    expect(pathOnOrigin(`${o}.evil.example/lesson/1`, o)).toBeNull();
    expect(pathOnOrigin('https://other.example/', o)).toBeNull();
  });
});
