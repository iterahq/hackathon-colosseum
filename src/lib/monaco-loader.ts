/**
 * Aponta o `@monaco-editor/react` para o Monaco SELF-HOSTED (servido do nosso
 * domínio, em `/vendor/monaco/vs`) em vez da CDN pública.
 *
 * ⚠️ POR QUE ISSO EXISTE — não remova.
 * Sem esta configuração, o `@monaco-editor/loader` injeta em RUNTIME um
 * `<script src="https://cdn.jsdelivr.net/npm/monaco-editor@X/min/vs/loader.js">`.
 * Em rede de escola/comunidade com CDN bloqueada ou estrangulada, o editor
 * NÃO MONTA — o aluno fica sem editor nenhum e a aula acaba. É o mesmo motivo
 * pelo qual `public/vendor/` já carrega React UMD + Tailwind Play localmente
 * (ADR-12/ADR-14 do plano `20260723-itera-code-live-byoc-arch`); o Monaco era
 * o último fetch externo crítico que sobrava.
 *
 * Os arquivos são copiados no build por `scripts/vendor-monaco.ts` (plugin
 * `monacoSelfHost` do Vite + hooks `prebuild`/`prebuild-storybook`).
 *
 * Este módulo tem EFEITO COLATERAL no import e deve ser importado UMA vez, no
 * bootstrap da aplicação (`src/main.tsx`) e no preview do Storybook
 * (`.storybook/preview.tsx`) — nunca dentro do `CodeEditor`, para que a
 * configuração já esteja aplicada antes do primeiro mount do editor.
 */
import loader from "@monaco-editor/loader";

/** Caminho público do Monaco vendorizado. Espelha `MONACO_PUBLIC_PATH` em `scripts/vendor-monaco.ts`. */
export const MONACO_VS_PATH = "/vendor/monaco/vs";

/** Resolve o caminho respeitando o `base` do Vite (default `/`). */
export function resolveMonacoVsPath(baseUrl: string = import.meta.env.BASE_URL ?? "/"): string {
  const base = (baseUrl || "/").replace(/\/+$/, "");
  return `${base}${MONACO_VS_PATH}`;
}

let configured = false;

/**
 * Configura o loader do Monaco para o caminho self-hosted. Idempotente —
 * chamadas repetidas são no-op (o loader só aceita config antes do `init`).
 */
export function configureMonacoSelfHosted(): string {
  const vs = resolveMonacoVsPath();
  if (configured) return vs;
  configured = true;
  loader.config({ paths: { vs } });
  return vs;
}

configureMonacoSelfHosted();
