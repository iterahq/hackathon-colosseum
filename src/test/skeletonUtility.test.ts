/**
 * Guarda de regressão: `ds-shimmer` é a classe que TODO skeleton do app usa, e
 * durante meses ela não existia em CSS nenhum. Resultado: cada estado de
 * carregamento renderizava uma `<div>` invisível — a tela ficava em branco e
 * nada na CI acusava, porque classe Tailwind inexistente não é erro.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
// Comentar o bloco tem exatamente o mesmo efeito de apagá-lo, então o guard
// enxerga o CSS já sem comentários.
const css = readFileSync(path.join(ROOT, 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const sources = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
});

function rule(cls: string): string | null {
  return css.match(new RegExp(`\\.${cls}(?![\\w-])\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

describe('ds-shimmer', () => {
  it('tem definição de verdade, com preenchimento e animação', () => {
    const body = rule('ds-shimmer');
    expect(body).toBeTruthy();
    expect(body).toContain('background-color');
    expect(body).toMatch(/animation:\s*\S+/);
  });

  it('respeita prefers-reduced-motion', () => {
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.ds-shimmer[\s\S]*?animation:\s*none/);
  });

  it('ds-settling-bar starts invisible and waits before it appears', () => {
    const body = rule('ds-settling-bar');
    expect(body).toMatch(/opacity:\s*0\b/);
    expect(body).toMatch(/animation:[\s\S]*\b400ms\b/);
  });

  it('nenhum consumidor usa uma classe `ds-*` sem CSS', () => {
    const used = new Set<string>();
    for (const source of Object.values(sources)) {
      for (const m of (source as string).matchAll(/(?<![\w-])ds-[a-z0-9-]+/g)) used.add(m[0]);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const cls of used) expect(rule(cls), `.${cls} sem CSS`).toBeTruthy();
  });
});
