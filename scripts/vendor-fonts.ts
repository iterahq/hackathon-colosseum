/**
 * Vendoriza as fontes da marca (Barlow Condensed · Inter · JetBrains Mono) do
 * Google Fonts para `public/vendor/fonts/`, para que sejam servidas do NOSSO
 * domínio — nunca do `fonts.googleapis.com` / `fonts.gstatic.com`.
 *
 * POR QUÊ
 * -------
 * O `index.html` carregava um `<link>` pro `fonts.googleapis.com`, que por sua
 * vez baixa os `.woff2` do `fonts.gstatic.com`. Numa rede de escola/comunidade
 * que só libera o app + o Supabase (o cenário do piloto Educar+ RJ), esses dois
 * hosts caem e a tipografia inteira degrada pro fallback do sistema — títulos em
 * Barlow Condensed viram Arial/Roboto, o layout "pula" e a aula fica com cara de
 * página quebrada.
 *
 * É a mesma decisão já tomada pro resto do runtime: `public/vendor/` serve React
 * UMD + Tailwind Play localmente (ADR-12/ADR-14) e o Monaco foi vendorizado em
 * `public/vendor/monaco/vs` (ADR-24, `scripts/vendor-monaco.ts`). As fontes eram
 * o último fetch externo não-essencial do caminho da aula.
 *
 * COMMITADO vs GERADO NO BUILD — por que aqui é DIFERENTE do Monaco
 * -----------------------------------------------------------------
 * O Monaco é `.gitignore`-ado e gerado no build porque a fonte da cópia é o
 * `node_modules/monaco-editor` — que já é dependência do projeto. Copiar é
 * offline, determinístico e de graça; commitar 16 MB seria desperdício.
 *
 * As fontes NÃO têm origem local: não existe pacote npm delas no projeto. Um
 * script rodando no `prebuild` teria que buscar do `fonts.gstatic.com` NA HORA
 * DO BUILD — ou seja, só moveria a dependência externa de runtime pra CI, e
 * quebraria qualquer build atrás da mesma rede restrita que estamos endurecendo.
 * Por isso os `.woff2` são COMMITADOS (12 arquivos, ~365 KB, imutáveis — as URLs
 * do gstatic são versionadas por revisão da família).
 *
 * Este script existe só pra REGERAR/atualizar esse conteúdo de forma auditável:
 *
 *     npm run vendor:fonts
 *
 * Ele reescreve `public/vendor/fonts/*.woff2` + `public/vendor/fonts/fonts.css`
 * e o diff resultante vai pro PR. NÃO roda no `prebuild` — build não pode
 * depender de rede.
 *
 * ESCOPO (pesos/subsets)
 * ----------------------
 * `FAMILIES` abaixo espelha EXATAMENTE o que o `<link>` do Google servia antes,
 * então a renderização é idêntica por construção — nenhum peso a mais, nenhum a
 * menos (`font-black`/`font-extrabold` continuam sintetizados a partir do 700,
 * como já eram). Subsets: `latin` + `latin-ext`.
 *
 * ⚠️ Os acentos do português (ç, õ, ã, é…) moram em U+00C0–U+00FF, que está
 * dentro do subset `latin` (`U+0000-00FF`) — NÃO no `latin-ext`. Ainda assim o
 * `latin-ext` é vendorizado: ele cobre U+0100-02BA, símbolos de moeda e marcas
 * tipográficas, e como cada `@font-face` traz seu `unicode-range`, o browser só
 * baixa o arquivo se a página realmente usar um caractere daquela faixa — custo
 * zero nas páginas que não usam.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const FONTS_TARGET_DIR = path.join(PROJECT_ROOT, "public", "vendor", "fonts");
export const FONTS_PUBLIC_PATH = "/vendor/fonts";

/**
 * Espelha o `<link href="https://fonts.googleapis.com/css2?...">` que existia no
 * `index.html`. Mudou aqui? Rode `npm run vendor:fonts` e commite o diff.
 */
export const FAMILIES = [
  "Barlow+Condensed:wght@400;500;600;700",
  "Inter:wght@400;500;600;700",
  "JetBrains+Mono:wght@400;500",
] as const;

/** Só o que o app precisa. Ver nota sobre `latin-ext` no cabeçalho. */
export const SUBSETS = ["latin", "latin-ext"] as const;

/** UA moderno — sem isso o Google devolve `.ttf` em vez de `.woff2`. */
const MODERN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FontFace {
  family: string;
  weight: string;
  subset: string;
  unicodeRange: string;
  remoteUrl: string;
  /** Nome do arquivo local dentro de `public/vendor/fonts/`. */
  fileName: string;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Extrai os `@font-face` do CSS do Google, mantendo só os subsets desejados. */
export function parseGoogleCss(css: string): FontFace[] {
  const faces: FontFace[] = [];
  // O css2 emite `/* <subset> */` imediatamente antes de cada bloco @font-face.
  const blockRe = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (const match of css.matchAll(blockRe)) {
    const [, subset, body] = match;
    if (!(SUBSETS as readonly string[]).includes(subset)) continue;

    const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
    const weight = /font-weight:\s*([\d\s]+);/.exec(body)?.[1]?.trim();
    // Aspas opcionais: o Google emite `url(https://…)` cru, o nosso
    // `renderLocalCss` emite `url('/vendor/…')` — o parser aceita os dois para
    // que o CSS gerado possa ser re-lido (round-trip verificado em teste).
    const remoteUrl = /url\(\s*['"]?([^)'"]+\.woff2)['"]?\s*\)/.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    if (!family || !weight || !remoteUrl || !unicodeRange) {
      throw new Error(`@font-face inesperado no CSS do Google:\n${body}`);
    }
    faces.push({ family, weight, subset, unicodeRange, remoteUrl, fileName: "" });
  }
  if (faces.length === 0) throw new Error("Nenhum @font-face latin/latin-ext encontrado no CSS do Google.");

  // Famílias variáveis (Inter, JetBrains Mono) servem o MESMO arquivo pra todos
  // os pesos — deduplica por URL pra não baixar/commitar 4 cópias idênticas.
  const nameByUrl = new Map<string, string>();
  const weightsByUrl = new Map<string, string[]>();
  for (const f of faces) {
    const list = weightsByUrl.get(f.remoteUrl) ?? [];
    if (!list.includes(f.weight)) list.push(f.weight);
    weightsByUrl.set(f.remoteUrl, list);
  }
  for (const f of faces) {
    let name = nameByUrl.get(f.remoteUrl);
    if (!name) {
      const shared = (weightsByUrl.get(f.remoteUrl) ?? []).length > 1;
      // `variable` quando um arquivo cobre vários pesos; senão o peso estático.
      name = `${slugify(f.family)}-${shared ? "variable" : f.weight}-${f.subset}.woff2`;
      nameByUrl.set(f.remoteUrl, name);
    }
    f.fileName = name;
  }
  return faces;
}

/** Gera o CSS local — 1:1 com o do Google, trocando gstatic por `/vendor/fonts`. */
export function renderLocalCss(faces: FontFace[]): string {
  const header = [
    "/*",
    " * GERADO por `npm run vendor:fonts` (scripts/vendor-fonts.ts) — NÃO EDITE À MÃO.",
    " *",
    " * Fontes da marca Itera servidas do NOSSO domínio: numa rede que só libera o",
    " * app + o Supabase (piloto Educar+ RJ), a CDN pública de fontes cai e a",
    " * tipografia inteira degrada pro fallback do sistema.",
    " *",
    " * (Sem os hostnames literais de propósito — assim um grep de auditoria por",
    " * CDN externa no `dist/` não acusa falso-positivo.)",
    " *",
    " * Espelha 1:1 os @font-face que o css2 do Google emitia pro mesmo",
    " * `family=...&display=swap`, mantendo `font-display: swap` e o",
    " * `unicode-range` de cada subset (o browser só baixa o arquivo do subset que",
    " * a página realmente usa) — renderização idêntica, zero fetch externo.",
    " */",
    "",
  ].join("\n");

  const blocks = faces.map((f) =>
    [
      `/* ${f.family} ${f.weight} · ${f.subset} */`,
      "@font-face {",
      `  font-family: '${f.family}';`,
      "  font-style: normal;",
      `  font-weight: ${f.weight};`,
      "  font-display: swap;",
      `  src: url('${FONTS_PUBLIC_PATH}/${f.fileName}') format('woff2');`,
      `  unicode-range: ${f.unicodeRange};`,
      "}",
    ].join("\n"),
  );

  return `${header}${blocks.join("\n\n")}\n`;
}

export async function vendorFonts({ silent = false } = {}): Promise<FontFace[]> {
  const log = (msg: string) => {
    if (!silent) console.log(msg);
  };

  const query = `${FAMILIES.map((f) => `family=${f}`).join("&")}&display=swap`;
  const cssUrl = `https://fonts.googleapis.com/css2?${query}`;
  log(`[vendor-fonts] GET ${cssUrl}`);

  const cssRes = await fetch(cssUrl, { headers: { "User-Agent": MODERN_UA } });
  if (!cssRes.ok) throw new Error(`Google Fonts CSS respondeu ${cssRes.status}`);
  const faces = parseGoogleCss(await cssRes.text());

  mkdirSync(FONTS_TARGET_DIR, { recursive: true });

  const uniqueByFile = new Map<string, FontFace>();
  for (const f of faces) if (!uniqueByFile.has(f.fileName)) uniqueByFile.set(f.fileName, f);

  let bytes = 0;
  for (const [fileName, face] of uniqueByFile) {
    const res = await fetch(face.remoteUrl, { headers: { "User-Agent": MODERN_UA } });
    if (!res.ok) throw new Error(`Download de ${face.remoteUrl} respondeu ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    bytes += buf.byteLength;
    writeFileSync(path.join(FONTS_TARGET_DIR, fileName), buf);
    log(`[vendor-fonts]   ${fileName} — ${(buf.byteLength / 1024).toFixed(1)} KB`);
  }

  // Remove arquivos órfãos de uma execução anterior (peso/subset retirado).
  for (const entry of readdirSync(FONTS_TARGET_DIR)) {
    if (entry.endsWith(".woff2") && !uniqueByFile.has(entry)) {
      rmSync(path.join(FONTS_TARGET_DIR, entry));
      log(`[vendor-fonts]   removido órfão: ${entry}`);
    }
  }

  writeFileSync(path.join(FONTS_TARGET_DIR, "fonts.css"), renderLocalCss(faces), "utf-8");
  log(
    `[vendor-fonts] ${uniqueByFile.size} arquivos · ${(bytes / 1024).toFixed(1)} KB · ` +
      `${faces.length} @font-face em ${FONTS_PUBLIC_PATH}/fonts.css`,
  );
  return faces;
}

// Execução direta: `npm run vendor:fonts`.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  vendorFonts().catch((err) => {
    console.error("[vendor-fonts] FALHOU:", err);
    process.exit(1);
  });
}
