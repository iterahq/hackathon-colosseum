import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SandboxBubble } from '@/components/branded/activity/sandbox/SandboxBubble';

/**
 * A bolha do sandbox é o único ponto do engine que interpreta marcação INLINE e
 * mais nada. Ela carrega saída de terminal de verdade, então tratar a linha como
 * bloco transformaria `* [new branch] favoritar` em `<li>` — comendo o `*` e a
 * indentação. Estes testes trancam as duas pontas.
 */
describe('SandboxBubble + marcação inline', () => {
  it('negrito e crase viram elemento, sem delimitador na tela', () => {
    render(<SandboxBubble role="assistant" text="Rodei o **git add** e o `git status`." />);
    const bubble = screen.getByTestId('sandbox-bubble');
    expect(bubble.textContent).toBe('Rodei o git add e o git status.');
    expect(bubble.querySelector('strong')?.textContent).toBe('git add');
    expect(bubble.querySelector('code')?.textContent).toBe('git status');
  });

  it('saída de terminal atravessa intacta: nenhum bloco, nenhuma lista', () => {
    const output = 'To github.com:aluno/cardapio.git\n * [new branch]      favoritar -> favoritar\n   5 * 3 linhas';
    render(<SandboxBubble role="assistant" text={output} />);
    const bubble = screen.getByTestId('sandbox-bubble');
    expect(bubble.textContent).toBe(output);
    expect(bubble.querySelectorAll('li')).toHaveLength(0);
    expect(bubble.querySelectorAll('em')).toHaveLength(0);
  });
});
