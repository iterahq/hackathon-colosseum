/**
 * The rules of "one copy of each component/screen" (PLAN ADR-8), as pure functions over a
 * snapshot of the repo. `one-copy.test.ts` runs them against the real tree and against one
 * negative fixture per rule.
 *
 * Everything here reads files as text and JSON. Nothing imports from `apps/mobile/**`
 * (that would pull React Native types into the root `tsc` program).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface Repo {
  /** Every file of the snapshot, repo-relative, posix separators. */
  paths: readonly string[];
  read(file: string): string;
}

export interface RouteEntry {
  path: string;
  screen: string;
  mode: string;
  universal: boolean;
  web_paths: string[];
}

export interface RouteMap {
  version: number;
  routes: RouteEntry[];
  shell_chrome: string[];
  dom_zones: { id: string; reason: string; paths: string[]; kinds: string[] }[];
  not_counted_routes: { path: string; reason: string }[];
}

const SKIP_DIRS = new Set(["node_modules", ".expo", "dist-ios", "dist", ".git"]);
const WALK_ROOTS = ["apps/mobile", "packages", "src"];
const EXTRA_FILES = ["e2e/support/capture-manifest.json"];

export const MAP_PATH = "apps/mobile/route-map.json";
export const APP_PATH = "src/App.tsx";
export const GUEST_PATH_FILE = "src/guest/guestRoute.ts";
export const MANIFEST_PATH = "e2e/support/capture-manifest.json";

/** Wrappers that sit around a page inside `element=` (ADR-8 rule 3b). */
export const ROUTE_WRAPPERS: ReadonlySet<string> = new Set([
  "RequireAuth",
  "RequireSubscription",
  "RequireRole",
  "LazyRoute",
  "Suspense",
  "WebOnlyRoute",
  "ShellAccessGate",
]);

export function loadRepo(root: string): Repo {
  const paths: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      if (SKIP_DIRS.has(name)) continue;
      const child = `${rel}/${name}`;
      if (statSync(path.join(root, child)).isDirectory()) walk(child);
      else paths.push(child);
    }
  };
  for (const r of WALK_ROOTS) walk(r);
  for (const f of EXTRA_FILES) if (existsSync(path.join(root, f))) paths.push(f);
  return { paths, read: (file) => readFileSync(path.join(root, file), "utf8") };
}

export function repoFromFiles(files: Record<string, string>): Repo {
  return {
    paths: Object.keys(files),
    read: (file) => {
      const text = files[file];
      if (text === undefined) throw new Error(`fixture has no file ${file}`);
      return text;
    },
  };
}

export const readMap = (repo: Repo): RouteMap => JSON.parse(repo.read(MAP_PATH)) as RouteMap;

// ---------------------------------------------------------------- text helpers

/** Drops block comments and line comments. A `//` counts only after whitespace, so `https://` survives. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** Every module specifier the file imports, re-exports, `import()`s or `require()`s. */
export function importSpecifiers(source: string): string[] {
  const text = stripComments(source);
  const found: string[] = [];
  const re =
    /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"`]([^'"`]+)['"`]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of text.matchAll(re)) found.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return found;
}

const under = (repo: Repo, prefix: string) => repo.paths.filter((p) => p.startsWith(prefix));
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const mobileFiles = (repo: Repo) => under(repo, "apps/mobile/");
/** Source files of the shell that Metro bundles: every extension, `app/` and `src/` only. */
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const shellSource = (repo: Repo) => mobileFiles(repo).filter((p) => /^apps\/mobile\/(app|src)\//.test(p) && SOURCE_EXT.test(p));
const stem = (p: string) => basename(p).replace(/\.[^.]+$/, "");
const chromePaths = (map: RouteMap) => map.shell_chrome.map((p) => `apps/mobile/${p}`);

// ---------------------------------------------------------------- rule 1, 1b, 1c

const THIN_ROUTE_MAX_LINES = 15;
const THIN_ROUTE_MAX_LINE_LENGTH = 120;
/** The one shell module a thin route may import next to the screen: the adapters of the screen's ports (R-11). */
export const SHELL_PORTS_FILE = "apps/mobile/src/screenPorts.ts";
const isScreensSpec = (spec: string) => spec === "@iterahq/screens" || spec.startsWith("@iterahq/screens/");
const resolveRelative = (file: string, spec: string) => path.posix.normalize(`${path.posix.dirname(file)}/${spec}`);

/** A route file that only mounts a universal screen: short, and importing nothing but the screen, its router and its ports. */
export function isThinRoute(repo: Repo, file: string): boolean {
  if (!file.startsWith("apps/mobile/app/") || !file.endsWith(".tsx")) return false;
  const text = repo.read(file);
  const lines = text.split("\n").filter((l) => l.trim() !== "").length;
  const longest = Math.max(...text.split("\n").map((l) => l.length));
  const specs = importSpecifiers(text);
  return (
    lines <= THIN_ROUTE_MAX_LINES &&
    longest <= THIN_ROUTE_MAX_LINE_LENGTH &&
    specs.some(isScreensSpec) &&
    specs.every(
      (s) => isScreensSpec(s) || s === "react" || s === "expo-router" || (s.startsWith(".") && `${resolveRelative(file, s)}.ts` === SHELL_PORTS_FILE),
    )
  );
}

/**
 * Rule 1: every `.tsx` under apps/mobile is shell chrome, or a thin route file that renders a
 * `@iterahq/screens` export. Also: no `.js`/`.jsx` under `app/` or `src/` (Metro bundles them), and a
 * non-chrome `.ts` there imports neither `react` nor `react-native` (a copy built without JSX).
 *
 * R-11 fixed what "thin" admits, with the first real route: the screen by its own entry
 * (`@iterahq/screens/<screen>`, one lazy chunk per screen on the web), `react`, `expo-router` (the
 * router the file is a route of) and `src/screenPorts.ts` (the adapters the screen is handed).
 */
export function rule1(repo: Repo, map: RouteMap): string[] {
  const chrome = new Set(chromePaths(map));
  const out: string[] = [];
  for (const file of mobileFiles(repo).filter((p) => p.endsWith(".tsx"))) {
    if (chrome.has(file)) continue;
    if (!isThinRoute(repo, file)) out.push(`rule 1: ${file} is neither in shell_chrome nor a route file of at most ${THIN_ROUTE_MAX_LINES} lines that renders an export of @iterahq/screens`);
  }
  for (const file of shellSource(repo)) {
    if (/\.(js|jsx|mjs|cjs)$/.test(file)) out.push(`rule 1: ${file} is a ${file.slice(file.lastIndexOf("."))} file under apps/mobile/{app,src}; the shell is TypeScript`);
    else if (file.endsWith(".ts") && !chrome.has(file)) {
      const bad = importSpecifiers(repo.read(file)).find((s) => s === "react" || s.startsWith("react/") || s === "react-native" || s.startsWith("react-native/"));
      if (bad) out.push(`rule 1: ${file} is a non-chrome .ts that imports ${bad} (a UI copy without JSX)`);
    }
  }
  return out;
}

// `@iterahq/shell-bridge` and `@iterahq/shell-core` (bare names only) are admitted: the two pure, react-free
// packages (ADR-9, R-6; ADR-3, R-11). The bridge's `/web` entry (DOM) and every other `@iterahq/*` package
// stay forbidden. `@iterahq/screens` is admitted in ONE kind of file, a thin route (rule 1): chrome and
// helpers never import a screen.
const CHROME_FORBIDDEN_IMPORT = /^(@iterahq\/(?!shell-bridge$|shell-core$)|@supabase\/|@tanstack\/|react-router)/;
const PROBE_FILE = "apps/mobile/src/backendProbe.ts";
// R-12 admits ONE more file: the development probe that reads the backend with the learner's access token.
// It is held tighter than `shellGate.ts`: one call, and no host written in it (its host is a parameter,
// the origin of EXPO_PUBLIC_SUPABASE_URL).
const FETCH_ALLOWED: readonly string[] = ["apps/mobile/src/shellGate.ts", PROBE_FILE];
const HOST_LITERAL = /\bhttps?:\/\/[A-Za-z0-9[]/;

/**
 * Rule 1b: the closed chrome list. The forbidden data-layer imports and `fetch(` apply to EVERY
 * file under apps/mobile/{app,src}, so a helper imported by a chrome file is held to the same line.
 */
export function rule1b(repo: Repo, map: RouteMap, closed: readonly string[]): string[] {
  const out: string[] = [];
  const a = [...map.shell_chrome].sort().join("\n");
  const b = [...closed].sort().join("\n");
  if (a !== b) out.push(`rule 1b: shell_chrome [${[...map.shell_chrome].sort().join(", ")}] differs from the closed list [${[...closed].sort().join(", ")}]`);
  for (const file of chromePaths(map)) {
    if (!repo.paths.includes(file)) out.push(`rule 1b: shell_chrome names ${file}, which is not on disk`);
  }
  for (const file of shellSource(repo)) {
    const text = repo.read(file);
    const thinRoute = !chromePaths(map).includes(file) && isThinRoute(repo, file);
    for (const spec of importSpecifiers(text)) {
      if (thinRoute && isScreensSpec(spec)) continue;
      if (CHROME_FORBIDDEN_IMPORT.test(spec)) out.push(`rule 1b: ${file} imports ${spec}`);
      else if (/(^|\/)packages\/bridge(\/|$)/.test(spec)) out.push(`rule 1b: ${file} imports ${spec}; reach the bridge by the package name @iterahq/shell-bridge only`);
    }
    const code = stripComments(text);
    if (!FETCH_ALLOWED.includes(file) && /\bfetch\(/.test(code)) out.push(`rule 1b: ${file} contains fetch( (only ${FETCH_ALLOWED.join(" and ")} may)`);
    if (file === PROBE_FILE) {
      if ((code.match(/\bfetch\(/g) ?? []).length > 1) out.push(`rule 1b: ${file} contains more than one fetch(`);
      if (HOST_LITERAL.test(code)) out.push(`rule 1b: ${file} names a host; its only host is the origin it is given`);
    }
  }
  return out;
}

const ONMESSAGE_FILE = "apps/mobile/app/[...path].tsx";
const RECEIVER_FILE = "apps/mobile/src/receiveShellMessage.ts";
const RECEIVER_TEST = "apps/mobile/src/receiveShellMessage.test.ts";
/**
 * Error events carry no page-controlled payload: `onError` (description, and the locale-free `code` and `domain` the offline card is classified by)
 * and `onHttpError` (statusCode). `.data` and `.url` stay refused.
 */
const ERROR_EVENT_FIELD = /\.nativeEvent\.(description|code|domain|statusCode)\b/g;
/**
 * The one place a WebView event may be read: handed whole, as the `event` of the options object, to
 * `receiveShellMessage`. That function (src/receiveShellMessage.ts, with its own behaviour test) is the
 * order of the gates, the two parsers (console shape, bridge envelope) and the two windows.
 */
/** The two parsers `receiveShellMessage` calls, and their tests: "both parsers stay unit-tested" (docs/mobile-shell.md). */
const PARSER_FILES = ["apps/mobile/src/consoleMessage.test.ts", "apps/mobile/src/bridgeMessage.ts", "apps/mobile/src/bridgeMessage.test.ts"] as const;
const PARSER_CALL = /\breceiveShellMessage\(\s*\{\s*event:\s*[A-Za-z_$][\w$]*\.nativeEvent\s*(?:,|\}(?!\s*[.[?]))/g;

const PARSER_IMPORTS: readonly (readonly [string, string])[] = [["receiveShellMessage", "../src/receiveShellMessage"]];
const importsFrom = (text: string, name: string, mod: string) =>
  new RegExp(`\\bimport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]${mod.replace(/[./]/g, "\\$&")}['"]`).test(text);

/**
 * Rule 1c, for every file under apps/mobile/{app,src}: no raw network; `onMessage` is handled in one
 * file; and `nativeEvent` appears only as the `event` of a call to `receiveShellMessage` (a pure function
 * in `src/receiveShellMessage.ts` with its own behaviour test: origin and size gate, raw window, console
 * shape (development only), bridge envelope, page budget; it returns what to do or a drop). Destructuring `nativeEvent`, or reading `.data` anywhere
 * else, is flagged. The error events of the WebView (`.nativeEvent.description`, `.code`, `.domain`, `.nativeEvent.statusCode`)
 * carry no page-controlled payload and are the only other reads allowed.
 */
export function rule1c(repo: Repo): string[] {
  const out: string[] = [];
  for (const file of shellSource(repo)) {
    const text = stripComments(repo.read(file));
    for (const token of ["XMLHttpRequest", "WebSocket", "expo/fetch"]) {
      if (text.includes(token)) out.push(`rule 1c: ${file} references ${token}`);
    }
    const handlesMessage = /\bonMessage\b/.test(text);
    if (file !== ONMESSAGE_FILE && handlesMessage) out.push(`rule 1c: ${file} handles onMessage; the single handler lives in ${ONMESSAGE_FILE}`);
    if ((text.match(/\bonMessage=/g) ?? []).length > 1) out.push(`rule 1c: ${file} sets onMessage more than once`);
    const rest = text.replace(PARSER_CALL, "").replace(ERROR_EVENT_FIELD, "");
    if (/\bnativeEvent\b/.test(rest)) {
      out.push(`rule 1c: ${file} reads nativeEvent outside receiveShellMessage({ event: e.nativeEvent, ... }); the payload must go through the tested function`);
    }
    if (file === ONMESSAGE_FILE && handlesMessage) {
      for (const [parser, mod] of PARSER_IMPORTS) {
        if (new RegExp(`\\b${parser}\\(`).test(text) && !importsFrom(text, parser, mod)) {
          out.push(`rule 1c: ${file} calls ${parser} but does not import it from ${mod} (a local shadow is not the tested parser)`);
        }
      }
      if (!/\breceiveShellMessage\b/.test(text)) out.push(`rule 1c: ${file} handles onMessage without receiveShellMessage`);
      if (!repo.paths.includes(RECEIVER_FILE)) out.push(`rule 1c: ${RECEIVER_FILE} is missing`);
      if (!repo.paths.includes(RECEIVER_TEST)) out.push(`rule 1c: ${RECEIVER_TEST} is missing (the function needs its own behaviour test)`);
      for (const f of PARSER_FILES) if (!repo.paths.includes(f)) out.push(`rule 1c: ${f} is missing (both parsers stay unit-tested)`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- rules 2, 2b, 2c

const SCREENS_SRC = "packages/screens/src/";

/** Rule 2: every file under packages/screens/src is inside the directory of exactly one universal route's screen. */
export function rule2(repo: Repo, map: RouteMap): string[] {
  const out: string[] = [];
  const universal = map.routes.filter((r) => r.universal);
  for (const file of under(repo, SCREENS_SRC)) {
    if (file === `${SCREENS_SRC}index.ts`) continue; // the package barrel (ADR-3), the one file no single route owns
    const dir = file.slice(SCREENS_SRC.length).split("/")[0];
    const owners = universal.filter((r) => `${r.screen}` === dir);
    if (owners.length !== 1) out.push(`rule 2: ${file} belongs to ${owners.length} universal routes (want exactly 1)`);
  }
  return out;
}

const PLATFORM_FILE = /\.(native|web|ios|android)\.tsx$/;

/** Rule 2b: platform files only inside `slots/`, and a slot has no default export. */
export function rule2b(repo: Repo): string[] {
  const out: string[] = [];
  for (const file of under(repo, SCREENS_SRC)) {
    const inSlots = file.includes("/slots/");
    if (PLATFORM_FILE.test(file) && !inSlots) out.push(`rule 2b: ${file} is a platform file outside a slots/ directory`);
    if (inSlots && /\.(ts|tsx)$/.test(file) && /\bexport\s+default\b/.test(stripComments(repo.read(file)))) {
      out.push(`rule 2b: slot file ${file} has a default export`);
    }
  }
  return out;
}

/** Rule 2c: `Platform.OS` and `Platform.select` only inside `slots/`. */
export function rule2c(repo: Repo): string[] {
  const out: string[] = [];
  for (const file of under(repo, SCREENS_SRC)) {
    if (file.includes("/slots/") || !/\.(ts|tsx)$/.test(file)) continue;
    if (/\bPlatform\.(OS|select)\b/.test(stripComments(repo.read(file)))) out.push(`rule 2c: ${file} uses Platform.OS or Platform.select outside slots/`);
  }
  return out;
}

// ---------------------------------------------------------------- rules 3, 3b, 4

/** Rule 3: a universal route has none of its web_paths on disk. */
export function rule3(repo: Repo, map: RouteMap): string[] {
  const out: string[] = [];
  for (const r of map.routes.filter((x) => x.universal)) {
    for (const p of r.web_paths) if (repo.paths.includes(p)) out.push(`rule 3: universal route ${r.path} still has ${p} on disk`);
  }
  return out;
}

export interface AppRoute {
  path: string;
  element: string;
}

/** Index of the `}` that closes the `{` at `open`, skipping quoted strings. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Every `<Route path=…>` of `App.tsx` with its path composed with its parents'. `index` routes
 * (no path) are skipped. `consts` resolves `path={NAME}` (the guest route constant).
 */
export function parseAppRoutes(source: string, consts: Record<string, string> = {}): AppRoute[] {
  const text = stripComments(source);
  const out: AppRoute[] = [];
  const stack: string[] = [];
  const tokens = /<Route(?=[\s/>])|<\/Route>/g;
  let m: RegExpExecArray | null;
  while ((m = tokens.exec(text)) !== null) {
    if (m[0] === "</Route>") {
      stack.pop();
      continue;
    }
    let i = tokens.lastIndex;
    const start = i;
    let depth = 0;
    let quote: string | null = null;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const attrs = text.slice(start, i);
    const selfClosing = text[i - 1] === "/";
    tokens.lastIndex = i + 1;
    let element = "";
    let rest = attrs;
    const el = /\belement=\{/.exec(attrs);
    if (el) {
      const open = el.index + el[0].length - 1;
      const close = closingBrace(attrs, open);
      element = attrs.slice(open + 1, close);
      rest = attrs.slice(0, el.index) + attrs.slice(close + 1);
    }
    const pm = /\bpath=(?:"([^"]*)"|\{"([^"]*)"\}|\{([A-Za-z_]\w*)\})/.exec(rest);
    const parent = stack[stack.length - 1] ?? "";
    let full: string | null = null;
    if (pm) {
      const raw = pm[1] ?? pm[2] ?? consts[pm[3]];
      if (raw === undefined) throw new Error(`App.tsx: cannot resolve path={${pm[3]}}`);
      full = raw.startsWith("/") || raw === "*" ? raw : `${parent}/${raw}`;
      out.push({ path: full, element });
    }
    if (!selfClosing) stack.push(full ?? parent);
  }
  return out;
}

/** The page file of an `element=` expression: the innermost JSX tag that is not a wrapper, resolved through App.tsx's imports. */
export function pageOfElement(element: string, appSource: string, repo: Repo): string | null {
  const tags = [...element.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((t) => t[1]).filter((t) => !ROUTE_WRAPPERS.has(t));
  const name = tags[tags.length - 1];
  if (!name) return null;
  const text = stripComments(appSource);
  let spec: string | null = null;
  const lazy = new RegExp(`\\bconst\\s+${name}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*['"]([^'"]+)['"]\\s*\\)`).exec(text);
  if (lazy) spec = lazy[1];
  for (const im of text.matchAll(/\bimport\s+([^'";]+?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = im[1];
    const def = /^([A-Za-z_]\w*)\s*(,|$)/.exec(clause)?.[1];
    const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
    const locals = named.split(",").map((s) => s.trim().split(/\s+as\s+/).pop() ?? "");
    if (def === name || locals.includes(name)) spec = im[2];
  }
  if (!spec) return null;
  const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? path.posix.normalize(`src/${spec}`) : null;
  if (!base) return null;
  for (const cand of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (repo.paths.includes(cand)) return cand;
  }
  return null;
}

export function appConsts(repo: Repo): Record<string, string> {
  const m = /export const GUEST_ROUTE_PATH = ['"]([^'"]+)['"]/.exec(repo.paths.includes(GUEST_PATH_FILE) ? repo.read(GUEST_PATH_FILE) : "");
  return m ? { GUEST_ROUTE_PATH: m[1] } : {};
}

const inZone = (map: RouteMap, id: string, p: string) => map.dom_zones.find((z) => z.id === id)?.paths.includes(p) ?? false;

/** Rule 3b: web_paths is checked, not declared. */
export function rule3b(repo: Repo, map: RouteMap): string[] {
  const out: string[] = [];
  const source = repo.read(APP_PATH);
  const appRoutes = new Map(parseAppRoutes(source, appConsts(repo)).map((r) => [r.path, r]));
  for (const r of map.routes) {
    if (!r.universal && r.web_paths.length === 0) out.push(`rule 3b: route ${r.path} is not universal and has empty web_paths`);
    if (inZone(map, "staff", r.path)) continue;
    const app = appRoutes.get(r.path);
    if (!app) {
      out.push(`rule 3b: route ${r.path} is not a path of ${APP_PATH}`);
      continue;
    }
    // A ported route renders a package component; its web_paths are the deleted pages (rule 3).
    if (r.universal) continue;
    const page = pageOfElement(app.element, source, repo);
    if (!page) out.push(`rule 3b: cannot resolve the page component of ${r.path} in ${APP_PATH}`);
    else if (!r.web_paths.includes(page)) out.push(`rule 3b: route ${r.path} renders ${page}, which is not in its web_paths [${r.web_paths.join(", ")}]`);
  }
  return out;
}

const WEB_HOST_MAX_LINES = 15;

/**
 * Rule 3c (R-11): on the web a universal route is mounted by a host that only hands the screen its ports.
 * The element of the route in `App.tsx` resolves either to the package itself or to a file under `src/`;
 * that file is held to the line of a thin native route: at most 15 lines, an import of the screen, no
 * host tag. Without this a "host" could grow back into the page the port deleted.
 */
export function rule3c(repo: Repo, map: RouteMap): string[] {
  const out: string[] = [];
  const source = repo.read(APP_PATH);
  const appRoutes = new Map(parseAppRoutes(source, appConsts(repo)).map((r) => [r.path, r]));
  for (const r of map.routes.filter((x) => x.universal)) {
    const app = appRoutes.get(r.path);
    if (!app) continue; // rule 3b reports it
    const host = pageOfElement(app.element, source, repo);
    if (!host) {
      if (!importSpecifiers(source).some(isScreensSpec)) out.push(`rule 3c: universal route ${r.path} renders neither a web host under src/ nor an export of @iterahq/screens`);
      continue;
    }
    const text = repo.read(host);
    const lines = text.split("\n").filter((l) => l.trim() !== "").length;
    if (lines > WEB_HOST_MAX_LINES) out.push(`rule 3c: ${host}, the web host of universal route ${r.path}, has ${lines} lines (at most ${WEB_HOST_MAX_LINES}: a host only hands the screen its ports)`);
    if (!importSpecifiers(text).some(isScreensSpec)) out.push(`rule 3c: ${host}, the web host of universal route ${r.path}, does not import the screen from @iterahq/screens`);
    const tag = HOST_TAG.exec(stripComments(text));
    if (tag) out.push(`rule 3c: ${host}, the web host of universal route ${r.path}, renders the lowercase JSX host tag <${tag[2]}>`);
  }
  return out;
}

/** Rule 4: `mode: native` requires `universal: true`. */
export function rule4(map: RouteMap): string[] {
  return map.routes.filter((r) => r.mode === "native" && !r.universal).map((r) => `rule 4: route ${r.path} is native but not universal`);
}

// ---------------------------------------------------------------- rule 5

const manifestPath = (p: string) => (p === "/*" ? "*" : p);

/** Rule 5: the frozen manifest is the primary source; the scan of App.tsx is the secondary one. */
export function rule5(repo: Repo, map: RouteMap, expectedPaths: number): string[] {
  const out: string[] = [];
  const rows = [...map.routes.map((r) => r.path), ...map.not_counted_routes.map((r) => r.path)];
  const dup = rows.filter((p, i) => rows.indexOf(p) !== i);
  for (const p of new Set(dup)) out.push(`rule 5: ${p} is in the map more than once (it must be in exactly one of routes and not_counted_routes)`);
  const manifest = (JSON.parse(repo.read(MANIFEST_PATH)) as { routes: { route: string }[] }).routes.map((r) => manifestPath(r.route));
  for (const p of manifest) if (!rows.includes(p)) out.push(`rule 5: manifest route ${p} has no row in the map`);
  const scanned = parseAppRoutes(repo.read(APP_PATH), appConsts(repo)).map((r) => r.path);
  if (scanned.length !== expectedPaths) out.push(`rule 5: scanning ${APP_PATH} found ${scanned.length} paths, expected ${expectedPaths}`);
  for (const p of scanned) {
    if (!manifest.includes(p)) out.push(`rule 5: ${APP_PATH} has path ${p}, which is not in the manifest`);
    if (!rows.includes(p)) out.push(`rule 5: ${APP_PATH} has path ${p}, which has no row in the map`);
  }
  return out;
}

/**
 * The route meter of ADR-8: the routes still to port, i.e. outside every DOM zone and not yet universal.
 * R-11: a universal route no longer counts, so a port moves the meter down by one (R-13: 14 -> 13).
 */
export function routeMeter(map: RouteMap): number {
  const zoned = new Set(map.dom_zones.flatMap((z) => z.paths));
  return map.routes.filter((r) => !zoned.has(r.path) && !r.universal).length;
}

// ---------------------------------------------------------------- rules 6, 7

const SHARED_PACKAGES = ["bridge", "core", "screens"];
const DOM_GLOBALS = /(?<![.\w$])(document|window|localStorage|sessionStorage|HTMLElement|DOMParser)\b/;
const HOST_TAG = /(^|[\s(>{?:&|,])<([a-z][A-Za-z0-9]*)(?=[\s/>])/m;

const isInjectedStringsOnly = (file: string, text: string) =>
  /\.injected\.ts$/.test(file) &&
  (text.match(/^export\s.*$/gm) ?? []).every((l) => /^export const \w+(\s*:\s*string)?\s*=\s*[`'"]/.test(l));

/** What a universal screen may import by name: the libraries both bundles have (R-11). Everything else is relative. */
const UNIVERSAL_IMPORTS: ReadonlySet<string> = new Set(["react", "react/jsx-runtime", "react-native", "uniwind", "@iterahq/shell-core"]);
/** A platform file of a slot (`slots/x.web.tsx`, `slots/x.native.ts`) is bundled on one side only and may import that side's libraries. */
const PLATFORM_SLOT = /\/slots\/[^/]+\.(native|web|ios|android)\.(ts|tsx)$/;
const isBare = (spec: string) => !spec.startsWith(".") && !spec.startsWith("/");

/**
 * Rule 6: the shell and the shared packages stay clear of the web tree, the DOM and (for bridge/core) React.
 * R-11 adds, now that the packages exist: `packages/core` imports no package at all; a file of
 * `packages/screens` imports only what exists on both platforms (so `react-router-dom`, `react-native-web`,
 * `expo-router` or `react-native-webview` in a screen is red), and neither reaches into `apps/`.
 */
export function rule6(repo: Repo): string[] {
  const out: string[] = [];
  const scope = [...mobileFiles(repo), ...SHARED_PACKAGES.flatMap((n) => under(repo, `packages/${n}/`))];
  for (const file of scope.filter((p) => /\.(ts|tsx|js|jsx|mjs)$/.test(p))) {
    const text = repo.read(file);
    const isTest = /\.test\.(ts|tsx)$/.test(file);
    for (const spec of importSpecifiers(text)) {
      const resolved = spec.startsWith(".") ? path.posix.normalize(`${path.posix.dirname(file)}/${spec}`) : spec;
      if (spec === "react-dom" || spec.startsWith("react-dom/") || spec.startsWith("src/") || spec.startsWith("@/") || resolved.startsWith("src/")) {
        out.push(`rule 6: ${file} imports ${spec}`);
        continue;
      }
      if (/^packages\/(bridge|core)\//.test(file) && (spec === "react" || spec.startsWith("react/"))) out.push(`rule 6: ${file} imports ${spec} (bridge and core import no react)`);
      else if (file.startsWith("packages/core/") && isBare(spec) && !isTest) out.push(`rule 6: ${file} imports ${spec} (core is platform-free: relative imports only)`);
      if (/^packages\/(core|screens)\//.test(file) && (resolved.startsWith("apps/") || spec.includes("apps/mobile"))) out.push(`rule 6: ${file} imports ${spec} (a shared package does not reach into the shell)`);
      if (file.startsWith(SCREENS_SRC) && isBare(spec) && !UNIVERSAL_IMPORTS.has(spec) && !PLATFORM_SLOT.test(file) && !isTest) {
        out.push(`rule 6: ${file} imports ${spec}, which is not on both platforms (a universal screen imports ${[...UNIVERSAL_IMPORTS].join(", ")} or a relative module)`);
      }
    }
    const dom = file.startsWith("apps/mobile/") || file.startsWith("packages/screens/");
    if (!dom || isInjectedStringsOnly(file, text)) continue;
    const code = stripComments(text);
    const g = DOM_GLOBALS.exec(code);
    if (g) out.push(`rule 6: ${file} uses the DOM global ${g[1]}`);
    const tag = /\.(tsx|jsx)$/.test(file) ? HOST_TAG.exec(code) : null;
    if (tag) out.push(`rule 6: ${file} renders the lowercase JSX host tag <${tag[2]}>`);
  }
  return out;
}

/**
 * Rule 7: no file stem under the shell or screens src equals one in the web tree (`index` is exempt).
 * R-11: and no shell file has the stem of a universal screen's file (a second copy on the native side).
 */
export function rule7(repo: Repo): string[] {
  const web = new Set([...under(repo, "src/pages/"), ...under(repo, "src/components/"), ...under(repo, "packages/activities/src/")].map(stem));
  const screens = new Set(under(repo, SCREENS_SRC).map(stem).filter((n) => n !== "index"));
  return [
    ...[...under(repo, "apps/mobile/src/"), ...under(repo, SCREENS_SRC)]
      .filter((p) => stem(p) !== "index" && web.has(stem(p)))
      .map((p) => `rule 7: ${p} has the same file stem as a file of the web tree`),
    ...shellSource(repo)
      .filter((p) => screens.has(stem(p)))
      .map((p) => `rule 7: ${p} has the same file stem as a file of packages/screens/src`),
  ];
}
