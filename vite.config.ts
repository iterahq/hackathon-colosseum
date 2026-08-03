import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { readFileSync, existsSync } from "fs";
import { monacoSelfHost } from "./scripts/vendor-monaco";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const swapyInstalled = existsSync(path.resolve(__dirname, "node_modules/swapy/package.json"));

// O `monacoSelfHost()` copia o Monaco (`monaco-editor/min/vs`) para
// `public/vendor/monaco/vs` no `buildStart`, para que o editor seja servido do
// NOSSO domínio e não da jsDelivr. `buildStart` dispara no `vite dev`, no
// `vite build` e no Storybook (que reusa esta config via `viteFinal`). A
// definição mora em `scripts/vendor-monaco.ts` porque o
// `vitest.browser.config.ts` precisa do MESMO plugin — ver o docblock de lá.

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [monacoSelfHost(), react(), mode === "development" && componentTagger()].filter(Boolean),
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
