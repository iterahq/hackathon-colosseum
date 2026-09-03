import { createRoot } from "react-dom/client";
// Aponta o Monaco para `/vendor/monaco/vs` (self-hosted) ANTES de qualquer
// editor montar — sem isso o `@monaco-editor/loader` busca da jsDelivr em
// runtime e o editor não abre em rede com CDN bloqueada. Ver src/lib/monaco-loader.ts.
import "./lib/monaco-loader";
import App from "./App.tsx";
import { mountUmami } from "./lib/analytics";
import "./index.css";

document.documentElement.classList.add('dark');

mountUmami();

createRoot(document.getElementById("root")!).render(<App />);
