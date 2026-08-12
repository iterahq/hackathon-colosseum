import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { readFileSync, existsSync } from "fs";
import { monacoSelfHost } from "./scripts/vendor-monaco";
import { sourceStamp } from "./scripts/source-stamp";

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
// The full reasoning lives in `scripts/source-stamp.ts`, and CI asserts the
// default over the built artifact (`scripts/assert-no-source-stamp.mjs`).

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
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
  },
}));
