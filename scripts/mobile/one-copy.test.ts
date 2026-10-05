// @vitest-environment node
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  loadRepo,
  parseAppRoutes,
  readMap,
  repoFromFiles,
  routeMeter,
  rule1,
  rule1b,
  rule1c,
  rule2,
  rule2b,
  rule2c,
  rule3,
  rule3b,
  rule4,
  rule5,
  rule6,
  rule7,
  type Repo,
  type RouteMap,
} from "./oneCopyRules";

/**
 * ADR-8, "one copy of each component/screen". The closed chrome list is asserted HERE, so adding
 * a chrome file is a visible edit of this test (PR-2 adds `src/LoadingVeil.tsx` and
 * `src/OfflineCard.tsx`; R-7 adds `src/UpdateNowCard.tsx`). Whether a new file on the list is chrome or a copy is decided by the
 * reviewer; rules 1b and 1c only close the data routes into such a file.
 */
const CLOSED_CHROME = [
  "app/_layout.tsx",
  "app/[...path].tsx",
  "app/index.tsx",
  "src/DevOverlay.tsx",
  "src/LoadingVeil.tsx",
  "src/OfflineCard.tsx",
  "src/UpdateNowCard.tsx",
];

/** `src/App.tsx` has 32 paths (ADR-8 rule 5). A new non-literal path fails the scan instead of being skipped. */
const APP_PATHS = 32;
/** 32 paths - 14 staff - 2 not counted - 2 learner DOM zones = 14 (ADR-8 consequence). */
const ROUTE_METER = 14;

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const real = loadRepo(ROOT);
const realMap = readMap(real);

describe("one copy, the real tree", () => {
  it("rule 1: every .tsx of apps/mobile is chrome or a thin screens route", () => {
    expect(rule1(real, realMap)).toEqual([]);
  });
  it("rule 1b: the chrome list is closed and chrome stays out of the data layer", () => {
    expect(rule1b(real, realMap, CLOSED_CHROME)).toEqual([]);
  });
  it("rule 1c: no raw network in chrome, one onMessage handler", () => {
    expect(rule1c(real)).toEqual([]);
  });
  it("rule 2: every packages/screens file belongs to one universal route", () => {
    expect(rule2(real, realMap)).toEqual([]);
  });
  it("rule 2b: platform files only under slots/", () => {
    expect(rule2b(real)).toEqual([]);
  });
  it("rule 2c: Platform.OS and Platform.select only under slots/", () => {
    expect(rule2c(real)).toEqual([]);
  });
  it("rule 3: a universal route has no web page left on disk", () => {
    expect(rule3(real, realMap)).toEqual([]);
  });
  it("rule 3b: web_paths is the page App.tsx renders", () => {
    expect(rule3b(real, realMap)).toEqual([]);
  });
  it("rule 4: native requires universal", () => {
    expect(rule4(realMap)).toEqual([]);
  });
  it("rule 5: the map covers the frozen manifest and every path of App.tsx", () => {
    expect(rule5(real, realMap, APP_PATHS)).toEqual([]);
  });
  it("rule 6: no web imports, DOM globals, host tags or react in the wrong places", () => {
    expect(rule6(real)).toEqual([]);
  });
  it("rule 7: no file name shared with the web tree", () => {
    expect(rule7(real)).toEqual([]);
  });
  it("prints the route meter and the DOM zones", () => {
    const meter = routeMeter(realMap);
    const zones = realMap.dom_zones.map((z) => z.id).join(", ");
    console.log(`route meter = ${meter}; DOM zones: ${zones}`);
    expect(meter).toBe(ROUTE_METER);
  });
});

// ---------------------------------------------------------------- fixtures

const MAP: RouteMap = {
  version: 1,
  routes: [{ path: "/login", screen: "login", mode: "webview", universal: false, web_paths: ["src/pages/auth/LoginPage.tsx"] }],
  shell_chrome: CLOSED_CHROME,
  dom_zones: [{ id: "staff", reason: "staff", paths: [], kinds: [] }],
  not_counted_routes: [{ path: "*", reason: "NotFound" }],
};

const APP = `
import { Routes, Route } from "react-router-dom";
import LoginPage from "./pages/auth/LoginPage";
import NotFound from "./pages/NotFound";
const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);
`;

const CLEAN: Record<string, string> = {
  "apps/mobile/route-map.json": JSON.stringify(MAP),
  "apps/mobile/app/_layout.tsx": "import { Stack } from 'expo-router';\nexport default function L() { return <Stack />; }\n",
  "apps/mobile/app/[...path].tsx": "import { WebView } from 'react-native-webview';\nexport default function S() { return <WebView />; }\n",
  "apps/mobile/app/index.tsx": "export { default } from './[...path]';\n",
  "apps/mobile/src/DevOverlay.tsx": "import { Text } from 'react-native';\nexport const DevOverlay = () => <Text>ok</Text>;\n",
  "apps/mobile/src/LoadingVeil.tsx": "import { Text } from 'react-native';\nexport const LoadingVeil = () => <Text>veil</Text>;\n",
  "apps/mobile/src/OfflineCard.tsx": "import { Text } from 'react-native';\nexport const OfflineCard = () => <Text>card</Text>;\n",
  "apps/mobile/src/UpdateNowCard.tsx": "import { Text } from 'react-native';\nexport const UpdateNowCard = () => <Text>update</Text>;\n",
  "apps/mobile/src/origin.ts": "export const x = 1;\n",
  "src/App.tsx": APP,
  "src/pages/auth/LoginPage.tsx": "export default function LoginPage() { return null; }\n",
  "src/pages/NotFound.tsx": "export default function NotFound() { return null; }\n",
  "e2e/support/capture-manifest.json": JSON.stringify({ routes: [{ route: "/login" }, { route: "/*" }] }),
};

const SCREEN_MAP: RouteMap = {
  ...MAP,
  routes: [...MAP.routes, { path: "/catalog", screen: "catalog", mode: "webview", universal: true, web_paths: [] }],
};

function fixture(overrides: Record<string, string | null> = {}, map: RouteMap | null = null): { repo: Repo; map: RouteMap } {
  const files: Record<string, string> = { ...CLEAN };
  if (map) files["apps/mobile/route-map.json"] = JSON.stringify(map);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete files[k];
    else files[k] = v;
  }
  const repo = repoFromFiles(files);
  return { repo, map: readMap(repo) };
}

describe("the clean fixture is green on every rule", () => {
  const { repo, map } = fixture({}, SCREEN_MAP);
  it.each([
    ["1", () => rule1(repo, map)],
    ["1b", () => rule1b(repo, map, CLOSED_CHROME)],
    ["1c", () => rule1c(repo)],
    ["2", () => rule2(repo, map)],
    ["2b", () => rule2b(repo)],
    ["2c", () => rule2c(repo)],
    ["3", () => rule3(repo, map)],
    ["4", () => rule4(map)],
    ["6", () => rule6(repo)],
    ["7", () => rule7(repo)],
  ])("rule %s", (_n, run) => {
    expect(run()).toEqual([]);
  });
  it("rules 3b and 5", () => {
    const base = fixture();
    expect(rule3b(base.repo, base.map)).toEqual([]);
    expect(rule5(base.repo, base.map, 2)).toEqual([]);
  });
});

describe("negative fixtures, one per rule", () => {
  it("1: a .tsx under apps/mobile that is not chrome", () => {
    const { repo, map } = fixture({ "apps/mobile/src/CatalogCopy.tsx": "export const A = () => null;\n" });
    expect(rule1(repo, map)).toEqual([expect.stringContaining("rule 1: apps/mobile/src/CatalogCopy.tsx")]);
  });
  it("1: a route file of more than 15 lines is not thin", () => {
    const body = "import { X } from '@iterahq/screens';\n" + "// pad\n".repeat(1) + "const a = 1;\n".repeat(20) + "export default X;\n";
    const { repo, map } = fixture({ "apps/mobile/app/big.tsx": body });
    expect(rule1(repo, map).length).toBe(1);
  });
  it("1: a thin route file that renders an export of @iterahq/screens is allowed", () => {
    const { repo, map } = fixture({ "apps/mobile/app/catalog.tsx": "import { CatalogScreen } from '@iterahq/screens';\nexport default CatalogScreen;\n" });
    expect(rule1(repo, map)).toEqual([]);
  });
  it("1b: the chrome list differs from the closed list", () => {
    const { repo, map } = fixture({ "apps/mobile/src/Extra.tsx": "export const E = () => null;\n" }, { ...MAP, shell_chrome: [...CLOSED_CHROME, "src/Extra.tsx"] });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("differs from the closed list")]);
  });
  it("1b: a chrome file imports @supabase/supabase-js", () => {
    const { repo, map } = fixture({ "apps/mobile/src/DevOverlay.tsx": "import { createClient } from '@supabase/supabase-js';\nexport const D = createClient;\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("imports @supabase/supabase-js")]);
  });
  it("1b: fetch( outside shellGate.ts", () => {
    const { repo, map } = fixture({ "apps/mobile/src/other.ts": "export const g = () => fetch('/x');\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("contains fetch(")]);
  });
  it("1b: fetch( in shellGate.ts is the one allowed place", () => {
    const { repo, map } = fixture({ "apps/mobile/src/shellGate.ts": "export const g = () => fetch('/x');\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([]);
  });
  it("1c: a chrome file opens a WebSocket", () => {
    const { repo, map } = fixture({ "apps/mobile/src/DevOverlay.tsx": "export const s = () => new WebSocket('wss://x');\n" });
    expect(rule1c(repo)).toEqual([expect.stringContaining("references WebSocket")]);
  });
  it("1c: a chrome file renders a non-console onMessage payload", () => {
    const { repo, map } = fixture({
      "apps/mobile/app/[...path].tsx":
        "import { WebView } from 'react-native-webview';\nexport default function S() { const f = (e) => show(e.nativeEvent.data); return <WebView onMessage={f} />; }\n",
    });
    expect(rule1c(repo)).toEqual(expect.arrayContaining([expect.stringContaining("reads nativeEvent outside parseConsoleMessage")]));
  });
  it("1c: onMessage handled outside app/[...path].tsx", () => {
    const { repo, map } = fixture({ "apps/mobile/src/DevOverlay.tsx": "export const D = (p) => <View onMessage={p.f} />;\n" });
    expect(rule1c(repo)).toEqual([expect.stringContaining("the single handler lives in")]);
  });
  it("2: a screens file that no universal route owns", () => {
    const { repo, map } = fixture({ "packages/screens/src/orphan/Orphan.tsx": "export const O = () => null;\n" }, SCREEN_MAP);
    expect(rule2(repo, map)).toEqual([expect.stringContaining("rule 2: packages/screens/src/orphan/Orphan.tsx belongs to 0")]);
  });
  it("2b: Foo.native.tsx outside slots/", () => {
    const { repo } = fixture({ "packages/screens/src/catalog/Foo.tsx": "export const F = 1;\n", "packages/screens/src/catalog/Foo.native.tsx": "export const F = 2;\n" }, SCREEN_MAP);
    expect(rule2b(repo)).toEqual([expect.stringContaining("Foo.native.tsx is a platform file outside")]);
  });
  it("2b: a slot file with a default export", () => {
    const { repo } = fixture({ "packages/screens/src/catalog/slots/Pick.native.tsx": "export default function Pick() { return null; }\n" }, SCREEN_MAP);
    expect(rule2b(repo)).toEqual([expect.stringContaining("has a default export")]);
  });
  it("2b: a slot file with a named export is allowed", () => {
    const { repo } = fixture({ "packages/screens/src/catalog/slots/Pick.native.tsx": "export function Pick() { return null; }\n" }, SCREEN_MAP);
    expect(rule2b(repo)).toEqual([]);
  });
  it("2c: Platform.select outside slots/", () => {
    const { repo } = fixture({ "packages/screens/src/catalog/Cat.tsx": "import { Platform } from 'react-native';\nexport const p = Platform.select({ ios: 1 });\n" }, SCREEN_MAP);
    expect(rule2c(repo)).toEqual([expect.stringContaining("uses Platform.OS or Platform.select outside slots/")]);
  });
  it("2c: Platform.OS inside slots/ is allowed", () => {
    const { repo } = fixture({ "packages/screens/src/catalog/slots/S.tsx": "export const p = Platform.OS;\n" }, SCREEN_MAP);
    expect(rule2c(repo)).toEqual([]);
  });
  it("3: a universal route keeps a web page on disk", () => {
    const { repo, map } = fixture({}, { ...MAP, routes: [{ ...MAP.routes[0], universal: true }] });
    expect(rule3(repo, map)).toEqual([expect.stringContaining("still has src/pages/auth/LoginPage.tsx on disk")]);
  });
  it("3b: a route with empty web_paths", () => {
    const { repo, map } = fixture({}, { ...MAP, routes: [{ ...MAP.routes[0], web_paths: [] }] });
    expect(rule3b(repo, map)).toEqual(expect.arrayContaining([expect.stringContaining("empty web_paths")]));
  });
  it("3b: web_paths names a page the route does not render", () => {
    const { repo, map } = fixture({}, { ...MAP, routes: [{ ...MAP.routes[0], web_paths: ["src/pages/NotFound.tsx"] }] });
    expect(rule3b(repo, map)).toEqual([expect.stringContaining("renders src/pages/auth/LoginPage.tsx, which is not in its web_paths")]);
  });
  it("3b: wrappers are skipped, a lazy import resolves to its target", () => {
    const app = `
      import { lazy } from "react";
      const Roster = lazy(() => import("./pages/admin/RosterPage"));
      const a = <Route path="/admin/roster" element={<RequireAuth><RequireRole role="x"><LazyRoute><Suspense><Roster /></Suspense></LazyRoute></RequireRole></RequireAuth>} />;
    `;
    const { repo } = fixture({ "src/App.tsx": app, "src/pages/admin/RosterPage.tsx": "export default 1;\n" });
    const found = parseAppRoutes(app)[0];
    expect(found.path).toBe("/admin/roster");
    const map: RouteMap = { ...MAP, routes: [{ path: "/admin/roster", screen: "roster", mode: "webview", universal: false, web_paths: ["src/pages/admin/RosterPage.tsx"] }] };
    expect(rule3b(repo, map)).toEqual([]);
  });
  it("4: a native route that is not universal", () => {
    const { map } = fixture({}, { ...MAP, routes: [{ ...MAP.routes[0], mode: "native" }] });
    expect(rule4(map)).toEqual([expect.stringContaining("native but not universal")]);
  });
  it("5: a manifest route with no row in the map", () => {
    const { repo, map } = fixture({ "e2e/support/capture-manifest.json": JSON.stringify({ routes: [{ route: "/login" }, { route: "/*" }, { route: "/new" }] }) });
    expect(rule5(repo, map, 2)).toEqual([expect.stringContaining("manifest route /new has no row")]);
  });
  it("5: a path of App.tsx that is not in the manifest, and a wrong path count", () => {
    const app = APP.replace("</Routes>", '<Route path="/extra" element={<NotFound />} /></Routes>');
    const { repo, map } = fixture({ "src/App.tsx": app });
    const out = rule5(repo, map, 2);
    expect(out).toEqual(expect.arrayContaining([expect.stringContaining("found 3 paths, expected 2"), expect.stringContaining("/extra, which is not in the manifest")]));
  });
  it("5: nested routes compose with their parent and a path constant resolves", () => {
    const app = `
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="roster" />} />
        <Route path="roster" element={<Roster />} />
      </Route>
      <Route path={GUEST_ROUTE_PATH} element={<GuestLiveRoute />} />
    `;
    expect(parseAppRoutes(app, { GUEST_ROUTE_PATH: "/g/:code" }).map((r) => r.path)).toEqual(["/admin", "/admin/roster", "/g/:code"]);
  });
  it("6: chrome imports from the web tree (alias and relative)", () => {
    const { repo } = fixture({
      "apps/mobile/src/a.ts": "import { x } from '@/components/ui/button';\nexport const a = x;\n",
      "apps/mobile/src/b.ts": "import { y } from '../../../src/utils/y';\nexport const b = y;\n",
      "apps/mobile/src/c.ts": "import { createRoot } from 'react-dom/client';\nexport const c = createRoot;\n",
    });
    expect(rule6(repo)).toEqual([
      expect.stringContaining("a.ts imports @/components/ui/button"),
      expect.stringContaining("b.ts imports ../../../src/utils/y"),
      expect.stringContaining("c.ts imports react-dom/client"),
    ]);
  });
  it("6: a lowercase JSX host tag and a DOM global in the shell", () => {
    const { repo } = fixture({
      "apps/mobile/src/DevOverlay.tsx": "export const D = () => <div>hi</div>;\n",
      "apps/mobile/src/dom.ts": "export const t = () => document.title;\n",
    });
    expect(rule6(repo)).toEqual([expect.stringContaining("host tag <div>"), expect.stringContaining("DOM global document")]);
  });
  it("6: a *.injected.ts that exports only strings may name DOM globals", () => {
    const { repo } = fixture({ "apps/mobile/src/forwarder.injected.ts": "export const SCRIPT = `window.addEventListener('error', () => {});`;\n" });
    expect(rule6(repo)).toEqual([]);
  });
  it("6: packages/core imports react", () => {
    const { repo } = fixture({ "packages/core/src/x.ts": "import { useState } from 'react';\nexport const u = useState;\n" });
    expect(rule6(repo)).toEqual([expect.stringContaining("bridge and core import no react")]);
  });
  it("7: a shell file with the name of a web page", () => {
    const { repo } = fixture({ "apps/mobile/src/NotFound.tsx": "export const N = () => null;\n" });
    expect(rule7(repo)).toEqual([expect.stringContaining("apps/mobile/src/NotFound.tsx has the same file stem")]);
  });
});

describe("review fixes: copies that are not a .tsx (finding 3)", () => {
  it("1: a .jsx or .js file under apps/mobile/src", () => {
    const { repo, map } = fixture({ "apps/mobile/src/CatalogView.jsx": "export const C = () => fetch('/x');\n", "apps/mobile/src/helper.js": "export const h = 1;\n" });
    expect(rule1(repo, map)).toEqual([expect.stringContaining("CatalogView.jsx is a .jsx file"), expect.stringContaining("helper.js is a .js file")]);
  });
  it("1b: fetch( in a .jsx file is found", () => {
    const { repo, map } = fixture({ "apps/mobile/src/CatalogView.jsx": "export const C = () => fetch('/x');\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("CatalogView.jsx contains fetch(")]);
  });
  it("6: a lowercase host tag in a .jsx file", () => {
    const { repo } = fixture({ "apps/mobile/src/Other.jsx": "export const C = () => <div>x</div>;\n" });
    expect(rule6(repo)).toEqual([expect.stringContaining("host tag <div>")]);
  });
  it("1: a non-chrome .ts that builds UI with react, without JSX", () => {
    const { repo, map } = fixture({ "apps/mobile/src/catalogScreen.ts": "import { createElement } from 'react';\nexport const c = () => createElement('div');\n" });
    expect(rule1(repo, map)).toEqual([expect.stringContaining("non-chrome .ts that imports react")]);
  });
  it("1: a thin route file with one very long line is not thin", () => {
    const body = `import { X } from '@iterahq/screens';\nexport default () => X(${"a, ".repeat(80)});\n`;
    const { repo, map } = fixture({ "apps/mobile/app/long.tsx": body });
    expect(rule1(repo, map).length).toBe(1);
  });
  it("7: the same stem with another extension (CatalogPage.jsx vs CatalogPage.tsx)", () => {
    const { repo } = fixture({ "apps/mobile/src/NotFound.jsx": "export const N = 1;\n" });
    expect(rule7(repo)).toEqual([expect.stringContaining("NotFound.jsx has the same file stem")]);
  });
});

describe("review fixes: data routes into chrome (finding 4)", () => {
  const DATA = "import { createClient } from '@supabase/supabase-js';\nimport { useQuery } from '@tanstack/react-query';\nexport const s = () => new WebSocket('wss://x');\nexport const r = (e) => e.nativeEvent.data;\nexport const q = [createClient, useQuery];\n";
  it("1b and 1c: a helper imported by a chrome file is held to the same line", () => {
    const { repo, map } = fixture({
      "apps/mobile/src/data.ts": DATA,
      "apps/mobile/src/DevOverlay.tsx": "import { s } from './data';\nexport const D = () => s;\n",
    });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([
      expect.stringContaining("data.ts imports @supabase/supabase-js"),
      expect.stringContaining("data.ts imports @tanstack/react-query"),
    ]);
    expect(rule1c(repo)).toEqual(
      expect.arrayContaining([expect.stringContaining("data.ts references WebSocket"), expect.stringContaining("data.ts reads nativeEvent")]),
    );
  });
});

describe("review fixes: onMessage payload goes through one parser (finding 5)", () => {
  const HANDLER = (body: string) =>
    `import { WebView } from 'react-native-webview';\nimport { parseConsoleMessage } from '../src/consoleMessage';\nexport default function S() { const f = (e) => { ${body} }; return <WebView onMessage={f} />; }\n`;
  const PARSER = { "apps/mobile/src/consoleMessage.ts": "export const parseConsoleMessage = (e: unknown) => (e ? null : null);\n", "apps/mobile/src/consoleMessage.test.ts": "export {};\n" };
  it("a handler that checks type console and then uses the payload another way is flagged", () => {
    const { repo } = fixture({
      "apps/mobile/app/[...path].tsx": "import { WebView } from 'react-native-webview';\nexport default function S() { const f = (e) => { const m = JSON.parse(e.nativeEvent.data); if (m.type === 'console') return; setCatalog(m.items); }; return <WebView onMessage={f} />; }\n",
    });
    expect(rule1c(repo)).toEqual(expect.arrayContaining([expect.stringContaining("reads nativeEvent outside parseConsoleMessage"), expect.stringContaining("without parseConsoleMessage")]));
  });
  it("destructuring nativeEvent is flagged", () => {
    const { repo } = fixture({ ...PARSER, "apps/mobile/app/[...path].tsx": HANDLER("const { nativeEvent: { data } } = e; setCatalog(data);") });
    expect(rule1c(repo)).toEqual([expect.stringContaining("reads nativeEvent outside parseConsoleMessage")]);
  });
  it("the parser call is the one allowed form", () => {
    const { repo } = fixture({ ...PARSER, "apps/mobile/app/[...path].tsx": HANDLER("const m = parseConsoleMessage(e.nativeEvent, 'https://app.iterahq.dev'); void m;") });
    expect(rule1c(repo)).toEqual([]);
  });
  it("a handler without the parser file and its unit test is flagged", () => {
    const { repo } = fixture({ "apps/mobile/app/[...path].tsx": HANDLER("parseConsoleMessage(e.nativeEvent);") });
    expect(rule1c(repo)).toEqual([expect.stringContaining("consoleMessage.ts is missing"), expect.stringContaining("consoleMessage.test.ts is missing")]);
  });
});

describe("R-6: the bridge parser joins the forwarder parser (rules 1b and 1c widened)", () => {
  const BRIDGE_HANDLER = (body: string) =>
    `import { WebView } from 'react-native-webview';\nimport { parseConsoleMessage } from '../src/consoleMessage';\nimport { parseBridgeMessage } from '../src/bridgeMessage';\nexport default function S() { const f = (e) => { ${body} }; return <WebView onMessage={f} />; }\n`;
  const PARSERS = {
    "apps/mobile/src/consoleMessage.ts": "export const parseConsoleMessage = (e: unknown) => (e ? null : null);\n",
    "apps/mobile/src/consoleMessage.test.ts": "export {};\n",
    "apps/mobile/src/bridgeMessage.ts": "export const parseBridgeMessage = (e: unknown) => (e ? null : null);\n",
    "apps/mobile/src/bridgeMessage.test.ts": "export {};\n",
  };
  it("1b: the bare @iterahq/shell-bridge import is the one @iterahq/* admitted", () => {
    const { repo, map } = fixture({ "apps/mobile/src/bridgeMessage.ts": "import { createShellRouter } from '@iterahq/shell-bridge';\nexport const r = createShellRouter;\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([]);
  });
  it("1b: the DOM entry @iterahq/shell-bridge/web is still forbidden", () => {
    const { repo, map } = fixture({ "apps/mobile/src/bridgeMessage.ts": "import { domTransport } from '@iterahq/shell-bridge/web';\nexport const t = domTransport;\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("imports @iterahq/shell-bridge/web")]);
  });
  it("1b: another @iterahq package in a shell file is still forbidden", () => {
    const { repo, map } = fixture({ "apps/mobile/src/DevOverlay.tsx": "import { CatalogScreen } from '@iterahq/screens';\nexport const D = CatalogScreen;\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("imports @iterahq/screens")]);
  });
  it("1b: a look-alike package name is still forbidden", () => {
    const { repo, map } = fixture({ "apps/mobile/src/other.ts": "import x from '@iterahq/shell-bridge-extra';\nexport default x;\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("imports @iterahq/shell-bridge-extra")]);
  });
  it("1c: both parsers called with the whole nativeEvent is the allowed form", () => {
    const { repo } = fixture({ ...PARSERS, "apps/mobile/app/[...path].tsx": BRIDGE_HANDLER("const c = parseConsoleMessage(e.nativeEvent, 'o'); const b = parseBridgeMessage(e.nativeEvent, 'o'); void [c, b];") });
    expect(rule1c(repo)).toEqual([]);
  });
  it("1c: a bridge payload read outside the two parsers is flagged", () => {
    const { repo } = fixture({ ...PARSERS, "apps/mobile/app/[...path].tsx": BRIDGE_HANDLER("const m = JSON.parse(e.nativeEvent.data); run(m.method);") });
    expect(rule1c(repo)).toEqual([expect.stringContaining("reads nativeEvent outside parseConsoleMessage")]);
  });
  it("1c: a destructured nativeEvent next to the bridge parser is flagged", () => {
    const { repo } = fixture({ ...PARSERS, "apps/mobile/app/[...path].tsx": BRIDGE_HANDLER("const { nativeEvent: { data } } = e; parseBridgeMessage(e.nativeEvent, 'o'); run(data);") });
    expect(rule1c(repo)).toEqual([expect.stringContaining("reads nativeEvent outside parseConsoleMessage")]);
  });
  it("1c: the handler uses parseBridgeMessage but the parser file and its unit test are missing", () => {
    const { repo } = fixture({
      "apps/mobile/src/consoleMessage.ts": PARSERS["apps/mobile/src/consoleMessage.ts"],
      "apps/mobile/src/consoleMessage.test.ts": "export {};\n",
      "apps/mobile/app/[...path].tsx": BRIDGE_HANDLER("parseConsoleMessage(e.nativeEvent); parseBridgeMessage(e.nativeEvent);"),
    });
    expect(rule1c(repo)).toEqual([expect.stringContaining("bridgeMessage.ts is missing"), expect.stringContaining("bridgeMessage.test.ts is missing")]);
  });
  it("1b: a relative deep import into packages/bridge from a shell file is flagged", () => {
    const { repo, map } = fixture({ "apps/mobile/src/bridgeMessage.ts": "import { domTransport } from '../../../packages/bridge/src/web';\nexport const t = domTransport;\n" });
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([expect.stringContaining("imports ../../../packages/bridge/src/web")]);
  });
  it("1c: a locally defined parseBridgeMessage shadow is flagged", () => {
    const { repo } = fixture({
      ...PARSERS,
      "apps/mobile/app/[...path].tsx":
        "import { WebView } from 'react-native-webview';\nimport { parseConsoleMessage } from '../src/consoleMessage';\nconst parseBridgeMessage = (x: unknown) => x;\nexport default function S() { const f = (e) => { parseConsoleMessage(e.nativeEvent, 'o'); parseBridgeMessage(e.nativeEvent, 'o'); }; return <WebView onMessage={f} />; }\n",
    });
    expect(rule1c(repo)).toEqual([expect.stringContaining("calls parseBridgeMessage but does not import it from ../src/bridgeMessage")]);
  });
  it("1c: a locally defined parseConsoleMessage shadow is flagged", () => {
    const { repo } = fixture({
      ...PARSERS,
      "apps/mobile/app/[...path].tsx":
        "import { WebView } from 'react-native-webview';\nimport { parseBridgeMessage } from '../src/bridgeMessage';\nconst parseConsoleMessage = (x: unknown) => x;\nexport default function S() { const f = (e) => { parseConsoleMessage(e.nativeEvent, 'o'); parseBridgeMessage(e.nativeEvent, 'o'); }; return <WebView onMessage={f} />; }\n",
    });
    expect(rule1c(repo)).toEqual([expect.stringContaining("calls parseConsoleMessage but does not import it from ../src/consoleMessage")]);
  });
  it("1c: onMessage in the bridge parser file is flagged (the one handler stays in app/[...path].tsx)", () => {
    const { repo } = fixture({ "apps/mobile/src/bridgeMessage.ts": "export const x = { onMessage: () => null };\n" });
    expect(rule1c(repo)).toEqual([expect.stringContaining("the single handler lives in")]);
  });
});

describe("review fixes: the first ported universal route can go green (finding 6)", () => {
  const PORTED_APP = APP.replace('import NotFound', 'import { CatalogScreen } from "@iterahq/screens";\nimport NotFound').replace(
    '<Route path="*"',
    '<Route path="/catalog" element={<RequireAuth><CatalogScreen /></RequireAuth>} />\n    <Route path="*"',
  );
  const PORTED_MAP: RouteMap = {
    ...MAP,
    routes: [...MAP.routes, { path: "/catalog", screen: "catalog", mode: "webview", universal: true, web_paths: ["src/pages/CatalogPage.tsx"] }],
  };
  const PORTED = {
    "src/App.tsx": PORTED_APP,
    "e2e/support/capture-manifest.json": JSON.stringify({ routes: [{ route: "/login" }, { route: "/catalog" }, { route: "/*" }] }),
    "packages/screens/src/index.ts": "export { CatalogScreen } from './catalog/CatalogScreen';\n",
    "packages/screens/src/catalog/CatalogScreen.tsx": "import { View } from 'react-native';\nexport const CatalogScreen = () => <View />;\n",
    "packages/screens/src/catalog/slots/Pick.native.tsx": "export function Pick() { return null; }\n",
  };
  it("all 12 rules pass for a ported route (page deleted, barrel present)", () => {
    const { repo, map } = fixture(PORTED, PORTED_MAP);
    expect(rule1(repo, map)).toEqual([]);
    expect(rule1b(repo, map, CLOSED_CHROME)).toEqual([]);
    expect(rule1c(repo)).toEqual([]);
    expect(rule2(repo, map)).toEqual([]);
    expect(rule2b(repo)).toEqual([]);
    expect(rule2c(repo)).toEqual([]);
    expect(rule3(repo, map)).toEqual([]);
    expect(rule3b(repo, map)).toEqual([]);
    expect(rule4(map)).toEqual([]);
    expect(rule5(repo, map, 3)).toEqual([]);
    expect(rule6(repo)).toEqual([]);
    expect(rule7(repo)).toEqual([]);
  });
  it("3 and 3b still fail when the old page stays on disk", () => {
    const { repo, map } = fixture({ ...PORTED, "src/pages/CatalogPage.tsx": "export default 1;\n" }, PORTED_MAP);
    expect(rule3(repo, map)).toEqual([expect.stringContaining("still has src/pages/CatalogPage.tsx on disk")]);
  });
  it("3b: a universal route that is not a path of App.tsx is flagged", () => {
    const { repo, map } = fixture({ ...PORTED, "src/App.tsx": APP }, PORTED_MAP);
    expect(rule3b(repo, map)).toEqual([expect.stringContaining("route /catalog is not a path")]);
  });
  it("2: a screens file outside any route's directory is still flagged next to the barrel", () => {
    const { repo, map } = fixture({ ...PORTED, "packages/screens/src/stray/Stray.tsx": "export const S = 1;\n" }, PORTED_MAP);
    expect(rule2(repo, map)).toEqual([expect.stringContaining("stray/Stray.tsx belongs to 0")]);
  });
});

describe("review fixes: minor evasions", () => {
  it("6: a backtick import() of the web tree is found", () => {
    const { repo } = fixture({ "apps/mobile/src/lazy.ts": "export const l = () => import(`@/pages/CatalogPage`);\n" });
    expect(rule6(repo)).toEqual([expect.stringContaining("lazy.ts imports @/pages/CatalogPage")]);
  });
});
