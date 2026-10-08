/**
 * Provenance: devfellowship/dfl-lesson-studio, apps/ios/src/routes.ts, commit
 * e90a642c4f7a7f4b9651895270a3f489cffc84a7.
 * Changed:
 *  - `ShellRoute` gains `web_paths` (the web page files of the route; checked by
 *    scripts/mobile/one-copy.test.ts, PLAN ADR-7 and ADR-8 rule 3b) and `RouteMapFile` gains
 *    `shell_chrome`, `dom_zones` and `not_counted_routes`.
 *  - The remote-flag and native-host machinery (`NATIVE_SCREENS`, `routeModeFor`, `RouteFlags`,
 *    `nativeRouteCapability`, `native-screens.json`) is removed: this shell has no native route
 *    and no remote flag (ADR-16). The start-up throw for a mode other than `webview` stays; `native`
 *    passes it only for a universal screen named in `NATIVE_HOSTS` (below).
 *  - The route map is `../route-map.json` of this repo, not a copy of a map in another repo.
 *
 * R-11: the map gains its first `universal: true` row, `*` (the not-found screen). It stays `webview`:
 * `compilePattern` gives it a pattern that matches nothing, so an unknown path still opens the home route.
 *
 * Native hosts: a `native` row opens its host route in a release build (`isNativeScreen`, read by
 * `screenPorts.ts`). Nothing sends the learner there yet: the catch-all route still opens the WebView on the
 * path, so a flipped row needs the hand-over from the WebView before it changes what a learner sees.
 *
 * Pure TypeScript: no React Native import, so the unit tests run in plain Node.
 */
import routeMap from '../route-map.json';

export type RouteMode = 'webview' | 'native';

/**
 * The screens that have a native host: a route file under `app/native/` that feeds the universal screen real
 * data. Only these rows may be `native`; the row is flipped in `route-map.json` by its owner, never here.
 */
export const NATIVE_HOSTS: Readonly<Record<string, string>> = { catalog: '/native/catalog', home: '/native/home', profile: '/native/profile' };

export interface ShellRoute {
  path: string;
  screen: string;
  mode: RouteMode;
  universal: boolean;
  web_paths: string[];
}

export interface DomZone {
  id: string;
  reason: string;
  paths: string[];
  kinds: string[];
}

export interface NotCountedRoute {
  path: string;
  reason: string;
}

export interface RouteMapFile {
  version: number;
  routes: ShellRoute[];
  shell_chrome: string[];
  dom_zones: DomZone[];
  not_counted_routes: NotCountedRoute[];
}

export const ROUTE_MAP = routeMap as RouteMapFile;

interface CompiledRoute {
  route: ShellRoute;
  pattern: RegExp;
}

/** `/program/:slug` -> /^\/program\/[^/]+$/ */
export function compilePattern(path: string): RegExp {
  if (path === '/') return /^\/$/;
  // The web's catch-all (the universal not-found screen) is a row of the map, not a path the shell opens.
  if (path === '*') return /(?!)/;
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^/${parts.join('/')}$`);
}

/** A map that names a mode this shell cannot open is a shell bug, not a fallback case: refuse it at start. */
export function compileRoutes(map: RouteMapFile): CompiledRoute[] {
  return map.routes.map((route) => {
    const hosted = route.mode === 'native' && route.universal && Object.prototype.hasOwnProperty.call(NATIVE_HOSTS, route.screen);
    if (route.mode !== 'webview' && !hosted) {
      throw new Error(`Route ${route.path} has mode ${String(route.mode)}; this shell opens webview, and native only for a universal screen with a native host`);
    }
    return { route, pattern: compilePattern(route.path) };
  });
}

const COMPILED = compileRoutes(ROUTE_MAP);

/** True when the row of this screen is `native` in the bundled map: its native host is open in every build, not only in development. */
export function isNativeScreen(screen: string, map: RouteMapFile = ROUTE_MAP): boolean {
  return map.routes.some((route) => route.screen === screen && route.mode === 'native');
}

/** Normalise "lesson/abc/" or "/lesson/abc" to "/lesson/abc". */
export function normalisePath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '/';
}

/** The map entry for a path, or null when the path is not a route of the shell. */
export function matchRoute(path: string, compiled: CompiledRoute[] = COMPILED): ShellRoute | null {
  const p = normalisePath(path);
  return compiled.find((c) => c.pattern.test(p))?.route ?? null;
}

/** The path the WebView opens for a deep link. A path that is not in the map opens the home route. */
export function resolveShellPath(path: string, compiled: CompiledRoute[] = COMPILED): string {
  const p = normalisePath(path);
  return matchRoute(p, compiled) ? p : '/';
}
