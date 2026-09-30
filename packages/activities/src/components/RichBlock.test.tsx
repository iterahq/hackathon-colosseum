/**
 * A cerca ```mermaid dentro do texto rico — desenho quando dá, `<pre>` quando não.
 *
 * `MermaidLite.test.tsx` mede a geometria do desenho. Aqui a pergunta é de
 * fronteira: quem decide desenhar é o bloco, e ele não pode desenhar demais.
 * Cerca sem linguagem, e cerca `mermaid` que o parser recusa, têm que continuar
 * saindo exatamente como saíam antes desta mudança existir.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('RichBlock — citação', () => {
  it('vira destaque em caixa, nunca itálico', () => {
    const marcado = bloco('> Hoje você cria a **sua** página.');

    expect(marcado.getAttribute('data-rich-block')).toBe('quote');
    expect(marcado.className).not.toContain('italic');
    expect(marcado.className).toContain('bg-evergreen-soft');
  });
});

describe('RichBlock — media', () => {
  it('renders an mp4 as a silent looping clip', () => {
    const { container } = render(<RichText text="![demo](/lesson-media/demo.mp4)" />);
    const video = container.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute('controls')).toBe(false);
    expect(screen.getByText('demo')).toBeInTheDocument();
  });

  it('renders a gif as a lazy image', () => {
    const { container } = render(<RichText text="![demo](/lesson-media/demo.gif)" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(container.querySelector('video')).toBeNull();
  });

  it('opens the lightbox on click and closes on Escape', () => {
    const { container } = render(<RichText text="![demo](/lesson-media/demo.png)" />);
    fireEvent.click(container.querySelector('figure button')!);
    expect(screen.getByTestId('media-lightbox')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
  });

  it('lays a pair out as two figures', () => {
    const { container } = render(
      <RichText text="![a](/lesson-media/a.png) ![b](/lesson-media/b.png)" />,
    );
    expect(container.querySelectorAll('figure')).toHaveLength(2);
  });
});
