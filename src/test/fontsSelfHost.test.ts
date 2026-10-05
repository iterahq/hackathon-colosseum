/**
 * Guarda de regressão: as fontes da marca NUNCA podem voltar a ser buscadas do
 * Google Fonts (ou de qualquer CDN pública) em runtime.
 *
 * Contexto do bug que este teste tranca: o `index.html` carregava
 * `<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed…">`,
 * que por sua vez baixa os `.woff2` do `fonts.gstatic.com`. Medido em produção
 * (app.iterahq.dev, 2026-07-23) com tudo bloqueado exceto o app e o Supabase:
 * **zero faces carregadas** — a Barlow Condensed dos títulos renderizava com a
 * MESMA largura do `sans-serif` do sistema (1027.97px vs 760px da fonte real),
 * ou seja, fallback silencioso. Em rede de escola isso é cenário realista.
 *
 * Espelha `monacoSelfHost.test.ts` (mesma regra dura, outro asset). Tudo aqui é
 * leitura de arquivo + string — nenhuma chamada de rede, para o teste rodar na
 * CI atrás de qualquer firewall. Regerar os arquivos: `npm run vendor:fonts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FAMILIES,
  FONTS_PUBLIC_PATH,
  FONTS_TARGET_DIR,
  PROJECT_ROOT,
  SUBSETS,
  parseGoogleCss,
  renderLocalCss,
} from '../../scripts/vendor-fonts';

const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com'];

const read = (rel: string) => readFileSync(path.join(PROJECT_ROOT, rel), 'utf-8');

const fontsCss = readFileSync(path.join(FONTS_TARGET_DIR, 'fonts.css'), 'utf-8');
const indexHtml = read('index.html');
const previewHead = read('.storybook/preview-head.html');

/** Famílias declaradas em `FAMILIES` ("Barlow+Condensed:wght@400;500" → nome + pesos). */
const expectedFamilies = FAMILIES.map((spec) => {
  const [rawName, rawWeights] = spec.split(':');
  return {
    name: rawName.replace(/\+/g, ' '),
    weights: (rawWeights ?? '').replace('wght@', '').split(';').filter(Boolean),
  };
});

/** `unicode-range` → predicado de cobertura, para provar que os acentos PT entram. */
function coversCodepoint(unicodeRange: string, cp: number): boolean {
  return unicodeRange.split(',').some((part) => {
    const m = /U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/.exec(part.trim());
    if (!m) return false;
    const start = parseInt(m[1], 16);
    const end = m[2] ? parseInt(m[2], 16) : start;
    return cp >= start && cp <= end;
  });
}

interface ParsedFace {
  family: string;
  weight: string;
  url: string;
  unicodeRange: string;
  display: string;
}

const faces: ParsedFace[] = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
  family: /font-family:\s*'([^']+)'/.exec(body)?.[1] ?? '',
  weight: /font-weight:\s*([^;]+);/.exec(body)?.[1].trim() ?? '',
  url: /src:\s*url\('([^']+)'\)/.exec(body)?.[1] ?? '',
  unicodeRange: /unicode-range:\s*([^;]+);/.exec(body)?.[1].trim() ?? '',
  display: /font-display:\s*([^;]+);/.exec(body)?.[1].trim() ?? '',
}));

describe('fontes self-hosted', () => {
  it('o index.html não referencia nenhuma CDN de fontes', () => {
    for (const host of CDN_HOSTS) {
      expect(indexHtml, `index.html não pode contatar ${host}`).not.toContain(host);
    }
    expect(indexHtml).toContain(`${FONTS_PUBLIC_PATH}/fonts.css`);
  });

  it('o Storybook (iframe próprio) carrega o MESMO CSS local', () => {
    // O preview do Storybook NÃO reusa o index.html: sem este arquivo as stories
    // renderizariam no fallback do sistema e a auditoria visual mentiria.
    for (const host of CDN_HOSTS) {
      expect(previewHead, `preview-head.html não pode contatar ${host}`).not.toContain(host);
    }
    expect(previewHead).toContain(`${FONTS_PUBLIC_PATH}/fonts.css`);
    expect(read('.storybook/main.ts'), 'staticDirs precisa servir public/').toContain("staticDirs: ['../public']");
  });

  it('todo @font-face aponta para o NOSSO domínio e o arquivo existe em disco', () => {
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(face.url, `${face.family} ${face.weight}`).toMatch(
        new RegExp(`^${FONTS_PUBLIC_PATH}/[\\w.-]+\\.woff2$`),
      );
      expect(face.url).not.toMatch(/^https?:/);
      const file = path.join(FONTS_TARGET_DIR, path.basename(face.url));
      expect(existsSync(file), `${face.url} declarado no CSS mas ausente do repo`).toBe(true);
    }
  });

  it('serve todas as famílias/pesos que o app declara', () => {
    for (const { name, weights } of expectedFamilies) {
      const mine = faces.filter((f) => f.family === name);
      expect(mine.length, `nenhum @font-face para ${name}`).toBeGreaterThan(0);
      for (const weight of weights) {
        expect(
          mine.some((f) => f.weight === weight || /\s/.test(f.weight)),
          `${name} sem cobertura para o peso ${weight}`,
        ).toBe(true);
      }
    }
  });

  it('as famílias usadas no CSS/Tailwind têm @font-face', () => {
    const declared = new Set(faces.map((f) => f.family));
    const sources = read('src/index.css');
    for (const family of ['Barlow Condensed', 'Inter', 'JetBrains Mono']) {
      expect(sources, `${family} deveria ser usada em algum lugar`).toContain(family);
      expect(declared.has(family), `${family} usada mas sem @font-face local`).toBe(true);
    }
  });

  it('usa font-display: swap (texto legível enquanto a fonte carrega)', () => {
    for (const face of faces) {
      expect(face.display, `${face.family} ${face.weight}`).toBe('swap');
    }
  });

  it('cobre latin E latin-ext — os acentos do português não podem cair no fallback', () => {
    expect([...SUBSETS]).toEqual(['latin', 'latin-ext']);
    for (const { name } of expectedFamilies) {
      const mine = faces.filter((f) => f.family === name);
      // ç (U+00E7), õ (U+00F5), Ê (U+00CA) — vivem no subset `latin` (U+0000-00FF).
      for (const [label, cp] of [
        ['ç', 0x00e7],
        ['õ', 0x00f5],
        ['Ê', 0x00ca],
      ] as const) {
        expect(
          mine.some((f) => coversCodepoint(f.unicodeRange, cp)),
          `${name} não cobre "${label}"`,
        ).toBe(true);
      }
      // …e o latin-ext (U+0100+) precisa estar presente como face separada.
      expect(
        mine.some((f) => coversCodepoint(f.unicodeRange, 0x0150)),
        `${name} sem o subset latin-ext`,
      ).toBe(true);
    }
  });

  it('mantém os .woff2 COMMITADOS (ao contrário do Monaco, que é gerado no build)', () => {
    // Não há pacote npm dessas fontes: um script no `prebuild` teria que buscar
    // do gstatic NA HORA DO BUILD — só mudaria a dependência externa de runtime
    // para a CI, e quebraria build atrás da mesma rede restrita.
    const gitignore = read('.gitignore');
    expect(gitignore).not.toMatch(/vendor\/fonts/);
    expect(gitignore, 'o Monaco continua gerado no build').toMatch(/^\/public\/vendor\/monaco\/$/m);
    // E o vendorizador NÃO pode entrar no prebuild (build offline).
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['vendor:fonts']).toBe('tsx scripts/vendor-fonts.ts');
    for (const hook of ['prebuild', 'prebuild:dev', 'prebuild-storybook']) {
      expect(pkg.scripts[hook] ?? '', `${hook} não pode depender de rede`).not.toContain('vendor-fonts');
    }
  });

  it('o CSS gerado bate com o gerador (nada foi editado à mão)', () => {
    const parsed = parseGoogleCss(fontsCss.replace(/\/\* ([\w ]+) (\d+) · ([\w-]+) \*\//g, '/* $3 */'));
    expect(renderLocalCss(parsed)).toBe(fontsCss);
  });

  it('o parser mantém só latin/latin-ext e deduplica arquivos variáveis', () => {
    const fixture = `
/* cyrillic */
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/cyr.woff2) format('woff2'); unicode-range: U+0301, U+0400-045F; }
/* latin */
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/var.woff2) format('woff2'); unicode-range: U+0000-00FF; }
/* latin */
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 700; font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/var.woff2) format('woff2'); unicode-range: U+0000-00FF; }
/* latin-ext */
@font-face { font-family: 'Barlow Condensed'; font-style: normal; font-weight: 700; font-display: swap;
  src: url(https://fonts.gstatic.com/s/bc/v13/bc700ext.woff2) format('woff2'); unicode-range: U+0100-02BA; }
`;
    const out = parseGoogleCss(fixture);
    // cyrillic descartado; os dois pesos do Inter compartilham UM arquivo.
    expect(out.map((f) => `${f.family}|${f.weight}|${f.subset}`)).toEqual([
      'Inter|400|latin',
      'Inter|700|latin',
      'Barlow Condensed|700|latin-ext',
    ]);
    expect(out[0].fileName).toBe('inter-variable-latin.woff2');
    expect(out[1].fileName).toBe(out[0].fileName);
    expect(out[2].fileName).toBe('barlow-condensed-700-latin-ext.woff2');
    // E o CSS renderizado nunca reintroduz o host externo.
    const css = renderLocalCss(out);
    for (const host of CDN_HOSTS) expect(css).not.toContain(host);
  });
});
