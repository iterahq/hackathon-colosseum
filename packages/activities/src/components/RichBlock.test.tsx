/**
 * A cerca ```mermaid dentro do texto rico — desenho quando dá, `<pre>` quando não.
 *
 * `MermaidLite.test.tsx` mede a geometria do desenho. Aqui a pergunta é de
 * fronteira: quem decide desenhar é o bloco, e ele não pode desenhar demais.
 * Cerca sem linguagem, e cerca `mermaid` que o parser recusa, têm que continuar
 * saindo exatamente como saíam antes desta mudança existir.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichText } from './RichText.js';

const bloco = (texto: string) => {
  const { container } = render(<RichText text={texto} />);
  return container.querySelector('[data-rich-block]')!;
};

describe('RichBlock — cerca mermaid', () => {
  it('desenha a cerca `mermaid` que está dentro do subconjunto', () => {
    const marcado = bloco('```mermaid\ngraph LR\n  L[lista pessoas] --> M(.map)\n```');

    expect(marcado.getAttribute('data-rich-block')).toBe('mermaid');
    expect(screen.getByTestId('mermaid-lite')).toBeInTheDocument();
    expect(screen.getByText('lista pessoas')).toBeInTheDocument();
  });

  it('cerca `mermaid` fora do subconjunto continua caindo no `<pre>`', () => {
    const marcado = bloco('```mermaid\nerDiagram\n  ALUNO ||--o{ CARD : tem\n```');

    expect(marcado.getAttribute('data-rich-block')).toBe('code');
    expect(marcado.getAttribute('data-language')).toBe('mermaid');
    expect(screen.queryByTestId('mermaid-lite')).toBeNull();
    expect(marcado.textContent).toContain('erDiagram');
  });

  it('cerca de outra linguagem não vira desenho nem por acidente', () => {
    const marcado = bloco('```\ngraph LR\n  A[a] --> B[b]\n```');

    expect(marcado.getAttribute('data-rich-block')).toBe('code');
    expect(screen.queryByTestId('mermaid-lite')).toBeNull();
  });
});
