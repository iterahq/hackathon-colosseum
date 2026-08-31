/**
 * A GEOMETRIA do desenho — a parte que nenhum teste de comportamento pega.
 *
 * Layout errado não lança, não some e não deixa rastro: ele desenha uma tela
 * plausível e ERRADA. Uma seta escondida atrás de uma caixa e dois rótulos
 * empilhados no mesmo pixel passam por qualquer asserção de "renderizou", e a
 * única forma de vê-los é medir as coordenadas.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MermaidLite } from './MermaidLite';
import { parseMermaidLite } from '../internal/mermaidLite.js';

const NODE_W = 176;
const NODE_H = 56;

const desenhar = (source: string) => {
  render(<MermaidLite graph={parseMermaidLite(source)!} />);
  return screen.getByTestId('mermaid-lite');
};

const caixaDe = (svg: HTMLElement, id: string) => {
  const rect = svg.querySelector(`[data-node-id="${id}"] rect`)!;
  const x = Number(rect.getAttribute('x'));
  const y = Number(rect.getAttribute('y'));
  return { x1: x, y1: y, x2: x + NODE_W, y2: y + NODE_H };
};

const pontosDe = (svg: HTMLElement, edge: string) => {
  const d = svg.querySelector(`[data-edge="${edge}"]`)!.getAttribute('d')!;
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const pares: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length; i += 2) pares.push({ x: nums[i], y: nums[i + 1] });
  return pares;
};

/** O meio da quadrática, ou o meio da reta quando não há ponto de controle. */
const meioDe = (svg: HTMLElement, edge: string) => {
  const p = pontosDe(svg, edge);
  if (p.length === 2) return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  return { x: (p[0].x + 2 * p[1].x + p[2].x) / 4, y: (p[0].y + 2 * p[1].y + p[2].y) / 4 };
};

const dentro = (caixa: ReturnType<typeof caixaDe>, p: { x: number; y: number }) =>
  p.x >= caixa.x1 && p.x <= caixa.x2 && p.y >= caixa.y1 && p.y <= caixa.y2;

describe('MermaidLite — a aresta que pula uma faixa', () => {
  /**
   * O losango: A aponta para B e para C, e B também aponta para C. B fica na
   * faixa do meio, exatamente sobre a reta A→C — e como as arestas são pintadas
   * ANTES dos nós, a caixa de B cobriria a seta e a relação A→C sumiria da tela.
   */
  const LOSANGO = ['graph TD', 'A[um] --> B[dois]', 'A --> C[tres]', 'B --> C'].join('\n');

  it('contorna a caixa do meio em vez de passar por dentro dela', () => {
    const svg = desenhar(LOSANGO);
    expect(dentro(caixaDe(svg, 'B'), meioDe(svg, 'A->C'))).toBe(false);
  });

  it('desenha reta a aresta que NÃO pula faixa', () => {
    const svg = desenhar(LOSANGO);
    expect(pontosDe(svg, 'A->B')).toHaveLength(2);
    expect(pontosDe(svg, 'A->C')).toHaveLength(3);
  });

  it('mantém o desvio dentro do `viewBox` — nada é cortado', () => {
    const svg = desenhar(LOSANGO);
    const [largura, altura] = svg.getAttribute('viewBox')!.split(' ').slice(2).map(Number);

    for (const p of pontosDe(svg, 'A->C')) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(largura);
      expect(p.y).toBeLessThanOrEqual(altura);
    }
  });
});

describe('MermaidLite — arestas repetidas entre o mesmo par', () => {
  it('separa os dois rótulos em vez de empilhá-los no mesmo ponto', () => {
    const svg = desenhar(['graph TD', 'A[um] -->|faz| B[dois]', 'A --> |devolve| B'].join('\n'));

    const pilulas = [...svg.querySelectorAll('rect[rx="6"]')].map((r) => ({
      x: Number(r.getAttribute('x')),
      y: Number(r.getAttribute('y')),
    }));

    expect(pilulas).toHaveLength(2);
    expect(Math.hypot(pilulas[0].x - pilulas[1].x, pilulas[0].y - pilulas[1].y)).toBeGreaterThan(18);
  });
});

describe('MermaidLite — grafo montado à mão por consumidor externo', () => {
  it('ignora a aresta que aponta para um nó inexistente', () => {
    render(
      <MermaidLite
        graph={{
          direction: 'TD',
          nodes: [{ id: 'A', label: 'um', shape: 'rect', rank: 0, index: 0 }],
          edges: [{ from: 'A', to: 'FANTASMA' }],
        }}
      />,
    );

    const svg = screen.getByTestId('mermaid-lite');
    expect(svg.querySelector('[data-node-id="A"]')).toBeInTheDocument();
    expect(svg.querySelectorAll('[data-edge]')).toHaveLength(0);
  });
});
