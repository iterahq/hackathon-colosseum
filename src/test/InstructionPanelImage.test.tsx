/**
 * Imagem da instrução: inteira, no tamanho útil e ampliável.
 *
 * O campo recebe diagrama e ilustração larga (960×420 nas aulas de Git). Numa
 * caixa de altura fixa a arte encolhia para ~150px de altura no celular, com o
 * texto do diagrama ilegível — mesmo prejuízo do `object-cover` que cortava a
 * borda: informação perdida.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n';
import { InstructionPanel } from '@/components/branded/activity/InstructionPanel';

const renderPanel = () =>
  render(
    <I18nProvider>
      <InstructionPanel spec={{ image_url: 'https://exemplo.test/diagrama.png' }} />
    </I18nProvider>,
  );

describe('InstructionPanel — imagem da instrução', () => {
  it('mostra a imagem inteira, sem cortar', () => {
    renderPanel();
    const img = screen.getAllByRole('img')[0];
    expect(img.className).toContain('object-contain');
    expect(img.className).not.toContain('object-cover');
  });

  it('a caixa acompanha a imagem em vez de travar numa altura fixa', () => {
    renderPanel();
    const box = screen.getByTestId('instruction-image');
    expect(box.className).not.toContain('h-64 ');
    expect(box.className).toContain('min-h-32');
    expect(box.className).toContain('bg-obsidiana/60');
  });

  it('abre ampliada no clique e fecha no Esc', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.queryByTestId('instruction-image-zoom')).toBeNull();
    await user.click(screen.getByTestId('instruction-image'));
    const zoom = screen.getByTestId('instruction-image-zoom');
    // Numa tela estreita a arte só fica legível se puder rolar na horizontal.
    expect(zoom.className).toContain('overflow-auto');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('instruction-image-zoom')).toBeNull();
  });
});
