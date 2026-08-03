/**
 * Guarda de regressão: o Monaco NUNCA pode voltar a ser buscado de uma CDN
 * pública em runtime.
 *
 * Contexto do bug que este teste tranca: `@monaco-editor/react` delega o
 * carregamento ao `@monaco-editor/loader`, cujo default é injetar um
 * `<script src="https://cdn.jsdelivr.net/npm/monaco-editor@X/min/vs/loader.js">`.
 * Medido em produção (app.iterahq.dev, 2026-07-23) com a jsDelivr bloqueada:
 * o editor NÃO montava — 0 linhas de código, aluno sem editor nenhum. Em rede
 * de escola/comunidade isso é cenário realista e derruba a aula.
 *
 * As asserções abaixo cobrem as três pernas do fix:
 *   1. `monaco-editor` é dependência DIRETA e compatível com o peer do wrapper;
 *   2. o bootstrap configura o loader para um caminho do NOSSO domínio;
 *   3. a vendorização (`scripts/vendor-monaco.ts`) entrega o build AMD em
 *      `public/vendor/monaco/vs` — inclusive `loader.js`, o primeiro arquivo
 *      que o loader busca.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import loader from '@monaco-editor/loader';
import {
  MONACO_ENTRY_FILE,
  MONACO_PUBLIC_PATH,
  MONACO_TARGET_DIR,
  PROJECT_ROOT,
  resolveMonacoSource,
  vendorMonaco,
} from '../../scripts/vendor-monaco';
import { MONACO_VS_PATH, resolveMonacoVsPath } from '@/lib/monaco-loader';

const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8')) as {
  dependencies: Record<string, string>;
};

describe('Monaco self-hosted', () => {
  it('declara `monaco-editor` como dependência direta e fixa', () => {
    const declared = pkg.dependencies['monaco-editor'];
    expect(declared, '`monaco-editor` precisa ser dependência DIRETA — sem ela não há o que vendorizar').toBeDefined();
    // Pin exato: a cópia servida precisa ser reprodutível entre builds.
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('usa a versão que o `@monaco-editor/react` espera (peer range)', () => {
    const wrapperPkg = JSON.parse(
      readFileSync(path.join(PROJECT_ROOT, 'node_modules/@monaco-editor/react/package.json'), 'utf-8'),
    ) as { peerDependencies: Record<string, string> };
    const range = wrapperPkg.peerDependencies['monaco-editor'];
    expect(range).toBeTruthy();

    // Peer é `>= X < 1`; comparamos major/minor sem puxar um resolvedor semver.
    const [minRaw] = range.replace(/[>=<]/g, ' ').trim().split(/\s+/);
    const toParts = (v: string) => v.split('.').map(Number);
    const [instMajor, instMinor] = toParts(resolveMonacoSource().version);
    const [minMajor, minMinor] = toParts(minRaw);

    expect(instMajor).toBe(minMajor);
    expect(instMinor).toBeGreaterThanOrEqual(minMinor);
  });

  it('configura o loader para um caminho do nosso domínio (nunca CDN)', () => {
    // `src/lib/monaco-loader.ts` roda `loader.config()` no import (efeito colateral),
    // e `src/main.tsx` / `.storybook/preview.tsx` o importam no bootstrap.
    expect(MONACO_VS_PATH).toBe(MONACO_PUBLIC_PATH);
    expect(resolveMonacoVsPath('/')).toBe('/vendor/monaco/vs');
    expect(resolveMonacoVsPath('/sub/')).toBe('/sub/vendor/monaco/vs');

    for (const host of CDN_HOSTS) {
      expect(MONACO_VS_PATH).not.toContain(host);
    }
    expect(MONACO_VS_PATH.startsWith('/')).toBe(true);
    expect(MONACO_VS_PATH).not.toMatch(/^https?:/);
  });

  it('o bootstrap do app e o preview do Storybook importam o configurador', () => {
    const files = ['src/main.tsx', '.storybook/preview.tsx'];
    for (const file of files) {
      const src = readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
      expect(src, `${file} precisa importar o configurador do Monaco`).toMatch(/lib\/monaco-loader/);
    }
  });

  it('não deixa a URL de CDN vazar para o bootstrap (o default do loader só vale sem config)', () => {
    const src = readFileSync(path.join(PROJECT_ROOT, 'src/lib/monaco-loader.ts'), 'utf-8');
    // Menções em comentário explicando o bug são bem-vindas; o que não pode é
    // uma URL de CDN dentro de uma chamada de config.
    expect(src).not.toMatch(/paths\s*:\s*\{[^}]*https?:\/\//);
    expect(typeof loader.config).toBe('function');
  });

  it('vendoriza o build AMD do Monaco em public/vendor/monaco/vs', () => {
    const result = vendorMonaco({ silent: true });

    expect(result.targetDir).toBe(MONACO_TARGET_DIR);
    expect(existsSync(path.join(MONACO_TARGET_DIR, MONACO_ENTRY_FILE))).toBe(true);
    // O que o loader pede em seguida (`require(['vs/editor/editor.main'])`).
    expect(existsSync(path.join(MONACO_TARGET_DIR, 'editor', 'editor.main.js'))).toBe(true);
    expect(existsSync(path.join(MONACO_TARGET_DIR, 'editor', 'editor.main.css'))).toBe(true);

    // Idempotência: a segunda chamada é no-op (o build não recopia 16 MB à toa).
    expect(vendorMonaco({ silent: true }).skipped).toBe(true);
  });

  /**
   * A perna que FALTAVA, e que custou toda run do `test:browser` vermelha
   * desde 79b8fb1 (2026-07-28): a cópia é gerada por um plugin de Vite, então
   * ela só existe nas configs que carregam esse plugin. O
   * `vitest.browser.config.ts` não o tinha, o servidor do Vitest dava 404 em
   * `/vendor/monaco/vs/loader.js`, e o loader rejeitava com o `Event` de
   * `onerror` — duas unhandled rejections, `exit 1`, com os testes passando.
   *
   * Assertar "os arquivos existem" não pegaria isso: no `npm test` eles
   * existem, porque o teste acima acabou de vendorizá-los. O que precisa ser
   * travado é o WIRING de cada config que serve a aplicação.
   */
  it('toda config de Vite que serve o app carrega o plugin de vendorização', () => {
    const configs = ['vite.config.ts', 'vitest.browser.config.ts'];
    for (const file of configs) {
      const src = readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
      expect(src, `${file} precisa importar monacoSelfHost de scripts/vendor-monaco`).toMatch(
        /import\s*\{[^}]*\bmonacoSelfHost\b[^}]*\}\s*from\s*['"][./]*scripts\/vendor-monaco['"]/,
      );
      expect(src, `${file} precisa CHAMAR monacoSelfHost() na lista de plugins`).toMatch(
        /plugins\s*:\s*\[[\s\S]*?monacoSelfHost\(\)/,
      );
    }
  });

  it('mantém a cópia fora do git (é gerada no build)', () => {
    const gitignore = readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toMatch(/^\/public\/vendor\/monaco\/$/m);
  });
});
