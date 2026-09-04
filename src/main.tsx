import { createRoot } from "react-dom/client";
// Aponta o Monaco para `/vendor/monaco/vs` (self-hosted) ANTES de qualquer
// editor montar — sem isso o `@monaco-editor/loader` busca da jsDelivr em
// runtime e o editor não abre em rede com CDN bloqueada. Ver src/lib/monaco-loader.ts.
import "./lib/monaco-loader";
import App from "./App.tsx";
import { captureAttribution } from "./lib/attribution";
import { mountUmami } from "./lib/analytics";
import "./index.css";

document.documentElement.classList.add('dark');

// Antes de o router montar: os dois caminhos de auth voltam em `origin + '/'`,
// então a query string com `utm_*` que trouxe a pessoa não existe mais quando
// ela vira assinante. Só dá pra ler na chegada. Ver src/lib/attribution.ts.
captureAttribution(window.location.href, document.referrer || null);
mountUmami();

createRoot(document.getElementById("root")!).render(<App />);
