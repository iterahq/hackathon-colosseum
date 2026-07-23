/**
 * Vendoriza o Monaco Editor (build AMD `min/vs`) do `node_modules` para
 * `public/vendor/monaco/vs`, para que o editor de código seja servido do NOSSO
 * domínio — nunca de uma CDN pública.
 *
 * POR QUÊ
 * -------
 * `@monaco-editor/react` delega o carregamento pro `@monaco-editor/loader`, que
 * por padrão injeta um `<script src="https://cdn.jsdelivr.net/npm/monaco-editor@X/min/vs/loader.js">`
 * EM RUNTIME. Se a jsDelivr estiver bloqueada/estrangulada (rede de escola,
 * firewall de comunidade, país com bloqueio de CDN), o editor simplesmente NÃO
 * MONTA e o aluno fica sem editor nenhum — a aula acaba.
 *
 * O projeto já tomou essa decisão para o resto do runtime: `public/vendor/`
 * carrega React UMD + Tailwind Play localmente justamente para o preview do
 * snack não depender de rede externa (ADR-12/ADR-14 do plano
 * `20260723-itera-code-live-byoc-arch`). O Monaco era o último buraco.
 *
 * COMO
 * ----
 * Copiamos `monaco-editor/min/vs` (build AMD, o mesmo formato que a jsDelivr
 * serve) para `public/vendor/monaco/vs`, e o bootstrap do app chama
 * `loader.config({ paths: { vs: '/vendor/monaco/vs' } })` (ver
 * `src/lib/monaco-loader.ts`).
 *
 * Os arquivos copiados NÃO são commitados (~16 MB) — ficam no `.gitignore` e
 * são gerados no build:
 *   - plugin do Vite (`monacoSelfHost` em `vite.config.ts`) no `buildStart`,
 *     que cobre `vite dev`, `vite build` e o Storybook;
 *   - hooks `prebuild` / `prebuild-storybook` do npm, como cinto-e-suspensório
 *     para os caminhos de CI/Docker.
 *
 * A cópia é idempotente: um arquivo-carimbo `.monaco-version` guarda a versão
 * já vendorizada e a execução vira no-op quando nada mudou.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const SELF_RELATIVE_PATH = path.join("scripts", "vendor-monaco.ts");

/**
 * Sobe a árvore até achar a raiz do repo (diretório com `package.json` E com
 * este próprio script).
 *
 * Não dá para assumir `path.resolve(scriptDir, "..")`: quando o `vite.config.ts`
 * importa este módulo, o Vite empacota a config num arquivo temporário dentro
 * de `node_modules/.vite-temp/`, e `import.meta.url` passa a apontar para lá.
 * A busca ascendente resolve os dois casos (e o `process.cwd()` cobre o resto).
 */
function findProjectRoot(): string {
  for (const start of [scriptDir, process.cwd()]) {
    let dir = start;
    for (;;) {
      if (existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, SELF_RELATIVE_PATH))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("[vendor-monaco] não consegui localizar a raiz do repositório itera-player.");
}

/** Raiz do repositório (o diretório que contém `package.json`). */
export const PROJECT_ROOT = findProjectRoot();

/** Caminho público (URL) de onde o Monaco é servido. Espelhado em `src/lib/monaco-loader.ts`. */
export const MONACO_PUBLIC_PATH = "/vendor/monaco/vs";

/** Diretório de destino da cópia, dentro de `public/`. */
export const MONACO_TARGET_DIR = path.join(PROJECT_ROOT, "public", "vendor", "monaco", "vs");

const STAMP_FILE = path.join(PROJECT_ROOT, "public", "vendor", "monaco", ".monaco-version");

/** Arquivo que o `@monaco-editor/loader` busca primeiro — a prova de vida da cópia. */
export const MONACO_ENTRY_FILE = "loader.js";

export interface MonacoSource {
  version: string;
  minVsDir: string;
}

/**
 * Resolve o `monaco-editor` instalado (dependência DIRETA do projeto — ver
 * `package.json`) e devolve a versão + o diretório do build AMD.
 */
export function resolveMonacoSource(): MonacoSource {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("monaco-editor/package.json", { paths: [PROJECT_ROOT] });
  const version = JSON.parse(readFileSync(pkgPath, "utf-8")).version as string;
  const minVsDir = path.join(path.dirname(pkgPath), "min", "vs");

  if (!existsSync(path.join(minVsDir, MONACO_ENTRY_FILE))) {
    throw new Error(
      `[vendor-monaco] build AMD do Monaco não encontrado em ${minVsDir}. ` +
        `Rode \`npm install\` (a dependência direta \`monaco-editor\` precisa estar instalada).`,
    );
  }

  return { version, minVsDir };
}

export interface VendorMonacoResult {
  version: string;
  targetDir: string;
  /** `true` quando os arquivos já estavam lá na versão certa (nada foi copiado). */
  skipped: boolean;
}

/**
 * Copia o Monaco para `public/vendor/monaco/vs`. Idempotente.
 *
 * @param force ignora o carimbo de versão e recopia do zero.
 */
export function vendorMonaco({ force = false, silent = false } = {}): VendorMonacoResult {
  const { version, minVsDir } = resolveMonacoSource();
  const stampMatches =
    existsSync(STAMP_FILE) &&
    readFileSync(STAMP_FILE, "utf-8").trim() === version &&
    existsSync(path.join(MONACO_TARGET_DIR, MONACO_ENTRY_FILE));

  if (stampMatches && !force) {
    if (!silent) console.log(`[vendor-monaco] monaco-editor@${version} já vendorizado — no-op.`);
    return { version, targetDir: MONACO_TARGET_DIR, skipped: true };
  }

  rmSync(MONACO_TARGET_DIR, { recursive: true, force: true });
  mkdirSync(path.dirname(MONACO_TARGET_DIR), { recursive: true });
  cpSync(minVsDir, MONACO_TARGET_DIR, { recursive: true });
  writeFileSync(STAMP_FILE, `${version}\n`, "utf-8");

  if (!silent) {
    console.log(
      `[vendor-monaco] monaco-editor@${version} copiado para public${MONACO_PUBLIC_PATH} ` +
        `(servido do nosso domínio, sem jsDelivr).`,
    );
  }

  return { version, targetDir: MONACO_TARGET_DIR, skipped: false };
}

// Execução direta: `tsx scripts/vendor-monaco.ts [--force]`
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  vendorMonaco({ force: process.argv.includes("--force") });
}
