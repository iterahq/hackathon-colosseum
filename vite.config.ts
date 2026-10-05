import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { readFileSync, existsSync } from "fs";
import { monacoSelfHost } from "./scripts/vendor-monaco";
import { sourceStamp } from "./scripts/source-stamp";
import { universalScreens } from "./scripts/vite/universal-screens";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const swapyInstalled = existsSync(path.resolve(__dirname, "node_modules/swapy/package.json"));

// O `monacoSelfHost()` copia o Monaco (`monaco-editor/min/vs`) para
// `public/vendor/monaco/vs` no `buildStart`, para que o editor seja servido do
// NOSSO domínio e não da jsDelivr. `buildStart` dispara no `vite dev`, no
// `vite build` e no Storybook (que reusa esta config via `viteFinal`). A
// definição mora em `scripts/vendor-monaco.ts` porque o
// `vitest.browser.config.ts` precisa do MESMO plugin — ver o docblock de lá.

// `sourceStamp()` writes `data-source="<file>:<line>"` on every host element and
// returns UNDEFINED unless `ITERA_SOURCE_STAMP` is set in the process
// environment — so it is absent from a normal build, including this one.
//
// ⚠️ It is NOT gated on `mode`, and that is deliberate. A capture build is a
// production-mode build, so `mode !== "development"` would fail OPEN and ship
// the repository layout to every learner. `componentTagger()` below IS gated on
// the mode because it is a dev-server tool; the two look alike and are not.
// The plugin itself now comes from `@devfellowship/ux-paths-capture`;
// `scripts/source-stamp.ts` is the thin wrapper that pins the switch NAME to
// this repository's `ITERA_SOURCE_STAMP`. CI still asserts the default over the
// built artifact, with the `ux-paths-assert-no-stamp` bin the same package
// ships — one detector, held to both verdicts, in both consuming repositories.

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    sourceStamp({ root: __dirname }),
    monacoSelfHost(),
    react(),
    ...universalScreens(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Source-only workspace: the Docker build runs `npm ci` before `COPY . .`, so the workspace link
      // is not there to resolve through. The more specific entry must come first.
      "@iterahq/shell-bridge/web": path.resolve(__dirname, "./packages/bridge/src/web.ts"),
      "@iterahq/shell-bridge": path.resolve(__dirname, "./packages/bridge/src/index.ts"),
      "@iterahq/shell-core": path.resolve(__dirname, "./packages/core/src/index.ts"),
      "@iterahq/screens/not-found/messages": path.resolve(__dirname, "./packages/screens/src/not-found/messages.ts"),
      "@iterahq/screens/not-found": path.resolve(__dirname, "./packages/screens/src/not-found/index.ts"),
      ...(swapyInstalled
        ? {}
        : {
            swapy: path.resolve(__dirname, "./src/shims/swapy.ts"),
          }),
    },
  },
  define: {
    "import.meta.env.VITE_APP_NAME": JSON.stringify(pkg.name),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    // Uniwind's web runtime reads the React Native `__DEV__` global.
    __DEV__: JSON.stringify(mode === "development"),
  },
}));
