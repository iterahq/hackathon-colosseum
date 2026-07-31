import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstructionPanel } from '@/components/branded/activity/InstructionPanel';
import { I18nProvider } from '@/i18n';

const renderPanel = (ui: ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

/**
 * A instrução era um <p> corrido. Levantamento em produção (2026-07-31): das 47
 * activities `concept`, 25 já escrevem markdown-leve — o aluno lia `**` e crase
 * na tela. Aqui trancamos as duas pontas: marcação vira elemento, e texto SEM
 * marcação continua saindo exatamente como um parágrafo só.
 */
describe('InstructionPanel + RichText', () => {
  it('texto sem marcação continua um parágrafo só', () => {
    renderPanel(<InstructionPanel spec={{ text: 'Crie um componente BookCard.' }} />);
    const blocks = screen.getByTestId('instruction-text').querySelectorAll('[data-rich-block]');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].getAttribute('data-rich-block')).toBe('paragraph');
    expect(blocks[0].textContent).toBe('Crie um componente BookCard.');
  });

  it('marcação vira elemento e nenhum delimitador sobra na tela', () => {
    renderPanel(
      <InstructionPanel
        spec={{ text: '## Estado\n\nUse **`useState`** aqui.\n\n- um\n- dois\n\n```jsx\n<App />\n```' }}
      />,
    );
    const panel = screen.getByTestId('instruction-text');
    expect([...panel.querySelectorAll('[data-rich-block]')].map((n) => n.getAttribute('data-rich-block'))).toEqual([
      'heading',
      'paragraph',
      'list',
      'code',
    ]);
    expect(panel.querySelector('code')?.textContent).toBe('useState');
    expect(panel.textContent).not.toMatch(/\*\*|`|^##/);
  });

  it('não interpreta o que está dentro de bloco cercado', () => {
    renderPanel(<InstructionPanel spec={{ text: '```\n- não vira lista\n**nem negrito**\n```' }} />);
    const panel = screen.getByTestId('instruction-text');
    expect(panel.querySelectorAll('[data-rich-block="list"]')).toHaveLength(0);
    expect(panel.textContent).toContain('**nem negrito**');
  });

  // O passo é opt-in: um `---` no enunciado de um quiz ao vivo esconderia metade
  // da pergunta atrás de um botão com o cronômetro correndo.
  it('sem stepped nenhum kind ganha passo, mesmo com ---', () => {
    renderPanel(<InstructionPanel spec={{ text: 'um\n\n---\n\ndois' }} />);
    expect(screen.getByText('dois')).toBeTruthy();
    expect(screen.queryByTestId('rich-steps-next')).toBeNull();
  });

  it('?= sem pergunta sai como parágrafo normal', () => {
    renderPanel(<InstructionPanel spec={{ text: '?= resposta solta' }} stepped />);
    const panel = screen.getByTestId('instruction-text');
    expect(panel.querySelector('[data-rich-block="reveal"]')).toBeNull();
    expect(panel.textContent).toBe('resposta solta');
  });

  it('a descrição continua secundária', () => {
    renderPanel(<InstructionPanel spec={{ text: 'a', description: 'nota **importante**' }} />);
    const block = screen.getByTestId('instruction-description').querySelector('[data-rich-block]');
    expect(block?.className).toContain('text-muted-foreground');
    expect(block?.textContent).toBe('nota importante');
  });
});
