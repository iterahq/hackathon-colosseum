import { createRoot } from "react-dom/client";
// Aponta o Monaco para `/vendor/monaco/vs` (self-hosted) ANTES de qualquer
// editor montar — sem isso o `@monaco-editor/loader` busca da jsDelivr em
// runtime e o editor não abre em rede com CDN bloqueada. Ver src/lib/monaco-loader.ts.
import "./lib/monaco-loader";
import App from "./App.tsx";
import { captureAttribution } from "./lib/attribution";
import { mountUmami } from "./lib/analytics";
import { mountStaleChunkReload } from "./lib/stale-chunk-reload";
import { mountKeyboardVisibility } from "./lib/keyboard-visibility-mount";
import { mountShellViewport } from "./lib/shell-viewport-mount";
import "./index.css";
import { applyCachedTheme } from "./utils/appTheme";

applyCachedTheme();

document.documentElement.classList.add('dark');

// Antes de o router montar: os dois caminhos de auth voltam em `origin + '/'`,
// então a query string com `utm_*` que trouxe a pessoa não existe mais quando
// ela vira assinante. Só dá pra ler na chegada. Ver src/lib/attribution.ts.
captureAttribution(window.location.href, document.referrer || null);
mountUmami();
mountStaleChunkReload();
mountKeyboardVisibility();
mountShellViewport();

createRoot(document.getElementById("root")!).render(<App />);
