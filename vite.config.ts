import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { readFileSync, existsSync } from "fs";
import { vendorMonaco } from "./scripts/vendor-monaco";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const swapyInstalled = existsSync(path.resolve(__dirname, "node_modules/swapy/package.json"));

/**
 * Copia o Monaco (`monaco-editor/min/vs`) para `public/vendor/monaco/vs` antes
 * de qualquer build/dev-server, para que o editor seja servido do NOSSO domínio
 * e não da jsDelivr (ver `scripts/vendor-monaco.ts` e `src/lib/monaco-loader.ts`).
 *
 * Roda em `buildStart`, que dispara tanto no `vite dev` quanto no `vite build`
 * e no Storybook (que reusa esta config via `viteFinal`). A cópia é idempotente,
 * então o custo em runs subsequentes é ~zero.
 */
function monacoSelfHost(): PluginOption {
  return {
    name: "itera:monaco-self-host",
    // Precisa acontecer antes do publicDir ser copiado para o dist.
    buildStart() {
      vendorMonaco({ silent: true });
    },
  };
}

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
