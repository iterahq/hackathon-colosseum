/**
 * Provenance: devfellowship/dfl-lesson-studio, apps/ios/src/routes.ts, commit
 * e90a642c4f7a7f4b9651895270a3f489cffc84a7.
 * Changed:
 *  - `ShellRoute` gains `web_paths` (the web page files of the route; checked by
 *    scripts/mobile/one-copy.test.ts, PLAN ADR-7 and ADR-8 rule 3b) and `RouteMapFile` gains
 *    `shell_chrome`, `dom_zones` and `not_counted_routes`.
 *  - The remote-flag and native-host machinery (`NATIVE_SCREENS`, `routeModeFor`, `RouteFlags`,
 *    `nativeRouteCapability`, `native-screens.json`) is removed: this shell has no native route
 *    and no remote flag this weekend (ADR-16). The start-up throw for a mode other than
 *    `webview` stays, and now covers `native` too.
 *  - The route map is `../route-map.json` of this repo, not a copy of a map in another repo.
 *
 * R-11: the map gains its first `universal: true` row, `*` (the not-found screen). It stays `webview`:
 * `compilePattern` gives it a pattern that matches nothing, so an unknown path still opens the home route.
 *
 * Pure TypeScript: no React Native import, so the unit tests run in plain Node.
 */
import routeMap from '../route-map.json';

export type RouteMode = 'webview';

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
    if (route.mode !== 'webview') {
      throw new Error(`Route ${route.path} has mode ${String(route.mode)}; this shell supports webview only`);
    }
    return { route, pattern: compilePattern(route.path) };
  });
}

const COMPILED = compileRoutes(ROUTE_MAP);

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
