/**
 * O `diagram` desenhado — e as DUAS promessas que o desenho não pode quebrar.
 *
 *  1. **O `<pre>` é o chão.** Fonte fora do subconjunto do `parseMermaidLite`
 *     (`erDiagram`, `;`, cadeia, nó sem rótulo) continua saindo como texto cru,
 *     exatamente como saía antes de existir renderer. Nenhuma linha que já está
 *     no banco pode piorar porque o SVG entrou.
 *  2. **Highlight que não casa não vira botão.** O chip só ganha foco e
 *     `aria-pressed` quando o `term` de fato aponta para um nó do desenho;
 *     senão ele volta a ser a `<div>` que pulsa e nada mais. Um `aria-pressed`
 *     em algo que não faz nada é pior para quem usa leitor de tela do que não
 *     ter interação nenhuma.
 *
 * O parser em si é provado ao lado dele, em
 * `packages/activities/src/internal/mermaidLite.test.ts`. Aqui a pergunta é
 * outra: o renderer honra o veredito do parser, e a ligação chip↔nó funciona
 * pelo TECLADO, que é como o professor usa a tela no meio da aula.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DiagramActivity } from '@/components/branded/activity/DiagramActivity';
import type { Activity } from '@/types/content';

const activity = (spec: Record<string, unknown>): Activity =>
  ({ id: 'a1', kind: 'diagram', spec, status: 'todo' }) as unknown as Activity;

const MAP_SOURCE = [
  'graph TD',
  '  A[Lista original] --> B(.map)',
  '  B -->|um item por vez| C[Função de transformação]',
  '  C --> D[Lista nova]',
].join('\n');

const noop = () => {};

describe('DiagramActivity — o desenho', () => {
  it('desenha o SVG quando a fonte está dentro do subconjunto', () => {
    render(<DiagramActivity activity={activity({ prompt: 'p', mermaid: MAP_SOURCE })} onComplete={noop} />);

    const svg = screen.getByTestId('mermaid-lite');
    expect(svg).toHaveAttribute('data-direction', 'TD');
    expect(screen.queryByTestId('diagram-mermaid-source')).toBeNull();
    expect(within(svg).getByText('.map')).toBeInTheDocument();
    expect(within(svg).getByText('um item por vez')).toBeInTheDocument();
  });

  it('cai no `<pre>` de sempre quando a fonte sai do subconjunto', () => {
    const mermaid = 'erDiagram\n  ALUNO ||--o{ EMPRESTIMO : faz';
    render(<DiagramActivity activity={activity({ prompt: 'p', mermaid })} onComplete={noop} />);

    expect(screen.getByTestId('diagram-mermaid-source')).toHaveTextContent('erDiagram');
    expect(screen.queryByTestId('mermaid-lite')).toBeNull();
  });

  it('mantém a precedência da imagem sobre o mermaid', () => {
    render(
      <DiagramActivity
        activity={activity({ prompt: 'p', imageUrl: 'https://exemplo.test/d.png', mermaid: MAP_SOURCE })}
        onComplete={noop}
      />,
    );

    expect(screen.getByAltText('p')).toBeInTheDocument();
    expect(screen.queryByTestId('mermaid-lite')).toBeNull();
  });
});

describe('DiagramActivity — o chip que aponta para o desenho', () => {
  const withHighlights = (highlights: { term: string; caption?: string }[]) =>
    render(
      <DiagramActivity
        activity={activity({ prompt: 'p', mermaid: MAP_SOURCE, highlights })}
        onComplete={noop}
      />,
    );

  /**
   * O nó do SVG também é `role="button"` com o rótulo como nome acessível — que é
   * exatamente a ligação sendo provada. Por isso toda busca por papel aqui é
   * ANCORADA no container: `getByRole` global casaria os dois e o teste ficaria
   * ambíguo justamente onde ele deveria ser mais preciso.
   */
  const chips = () => within(screen.getByTestId('diagram-highlights'));

  it('vira botão só quando o `term` casa com o rótulo de um nó', () => {
    withHighlights([{ term: 'lista NOVA' }, { term: 'for' }]);

    // Casa apesar da caixa diferente — a comparação é normalizada.
    expect(chips().getByRole('button', { name: /lista NOVA/ })).toBeInTheDocument();
    expect(chips().queryByRole('button', { name: /for/ })).toBeNull();
    expect(chips().getByText('for')).toBeInTheDocument();
  });

  it('não cria botão nenhum quando NENHUM term casa — a degradação é total', () => {
    withHighlights([{ term: 'for' }, { term: 'imutabilidade' }]);

    expect(chips().queryAllByRole('button')).toHaveLength(0);
  });

  it('o foco no chip acende o nó, e o clique o fixa (`aria-pressed`)', () => {
    withHighlights([{ term: '.map' }]);

    const chip = chips().getByRole('button', { name: /\.map/ });
    const node = () => screen.getByTestId('mermaid-lite').querySelector('[data-node-id="B"]')!;

    expect(node()).not.toHaveAttribute('data-active');
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.focus(chip);
    expect(node()).toHaveAttribute('data-active', 'true');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    // Sai o foco e o nó CONTINUA aceso: fixado é estado à parte do preview, que
    // é o que permite o professor falar dez minutos sem manter o mouse parado.
    fireEvent.blur(chip);
    expect(node()).toHaveAttribute('data-active', 'true');

    fireEvent.keyDown(chip, { key: 'Escape' });
    expect(node()).not.toHaveAttribute('data-active');
  });

  it('o caminho inverso também vale: acender o nó acende o chip', () => {
    withHighlights([{ term: 'Lista original' }]);

    const chip = chips().getByRole('button', { name: /Lista original/ });
    const node = screen.getByTestId('mermaid-lite').querySelector('[data-node-id="A"]')!;

    expect(chip).not.toHaveAttribute('data-active');

    fireEvent.focus(node);
    expect(chip).toHaveAttribute('data-active', 'true');

    fireEvent.keyDown(node, { key: 'Enter' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('o nó sem chip correspondente não é focável — não há o que apontar', () => {
    withHighlights([{ term: '.map' }]);
    const svg = screen.getByTestId('mermaid-lite');

    expect(svg.querySelector('[data-node-id="B"]')).toHaveAttribute('role', 'button');
    expect(svg.querySelector('[data-node-id="C"]')).not.toHaveAttribute('tabindex');
  });
});
