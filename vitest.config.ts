import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { universalScreens } from "./scripts/vite/universal-screens";

export default defineConfig({
  // `universalScreens()`: a test that renders a screen of `packages/screens` gets the same
  // `react-native` -> Uniwind web components -> react-native-web resolution as the build.
  plugins: [react(), ...universalScreens()],
  define: { __DEV__: "true" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Both ship ESM that imports `react-native`; inlined, that import goes through the alias above.
    server: { deps: { inline: ["uniwind", "react-native-web"] } },
    // `scripts/` joined `src/` when the build-time `data-source` stamp landed
    // there (`scripts/source-stamp.ts`). Build tooling that decides what ships
    // deserves the same unit coverage as product code, and the alternative -
    // parking its test under `src/` - would put a `typescript` import inside the
    // app's own tsconfig program for no reason.
    // `e2e/support/**` joined them for the capture: `resolveRegionAt` decides
    // which file a click reports, its tie-breaking rules are the part a real
    // screen exercises only by accident, and it is a pure function — so it
    // belongs in the fast unit run, not only in the browser suite.
    // ⚠️ `.test.ts` ONLY under `e2e/`. Playwright globs `*.spec.ts` there;
    // widening this to `spec` would make both runners claim the same files.
    // `packages/*/src/**` joined them so a pure rule inside a workspace package
    // can be proven from the file NEXT to it. The tests in `src/test/` stay what
    // they are — the PUBLIC door, what a host may import — while a co-located
    // test may reach a module the package deliberately does not export, which is
    // what `code/guided/answerMatch.ts` is.
    // ⚠️ `packages/*/tsconfig.build.json` EXCLUDES `*.test.ts`. Without that,
    // `build:packages` would emit these into `dist/` and ship an import of
    // `vitest` — not a dependency of the published package — to every consumer.
    // `db/seeds/**` joined them with `program-fixture.test.ts`, co-located with
    // the seed it tests (test sits next to the file, never under a separate
    // `__tests__/`) — the pure parts of a seed (key stripping, URL rewriting,
    // plan building, idempotency keys) deserve the same fast unit run as
    // everything else here.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
      "e2e/support/**/*.test.ts",
      "packages/*/src/**/*.{test,spec}.{ts,tsx}",
      "db/seeds/**/*.{test,spec}.ts",
    ],
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // The ES module build, as the Vite build bundles it (Node would pick `dist/cjs`, which the
      // edits of `universalScreens()` do not reach). Exact match: deep imports keep their path.
      { find: /^react-native-web$/, replacement: path.resolve(__dirname, "./node_modules/react-native-web/dist/index.js") },
    ],
  },
});
