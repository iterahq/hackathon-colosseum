/**
 * Vídeo da instrução: link de PÁGINA não toca em `<video src>`.
 *
 * O autor tem à mão o link do YouTube, não o arquivo `.mp4`. Colado no campo,
 * o `<video>` falha calado — tela preta muda descoberta em aula, na frente da
 * turma. O host conhecido vira cartão de link ANTES de tentar tocar; qualquer
 * outra URL que não toque cai no mesmo cartão pelo `onError`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { InstructionPanel } from '@/components/branded/activity/InstructionPanel';

const renderPanel = (video_url: string) =>
  render(
    <I18nProvider>
      <InstructionPanel spec={{ video_url }} />
    </I18nProvider>,
  );

describe('InstructionPanel — vídeo hospedado fora', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://vimeo.com/123456',
    'https://drive.google.com/file/d/abc/view',
  ])('%s vira cartão de link em vez de player mudo', (url) => {
    renderPanel(url);
    const card = screen.getByTestId('instruction-video-external');
    expect(card).toHaveAttribute('href', url);
    expect(card).toHaveAttribute('target', '_blank');
    expect(card.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByTestId('instruction-video')).toBeNull();
  });

  it('arquivo de vídeo continua tocando no player', () => {
    renderPanel('https://media.exemplo.test/aula.mp4');
    expect(screen.getByTestId('instruction-video')).toBeTruthy();
    expect(screen.queryByTestId('instruction-video-external')).toBeNull();
  });

  it('arquivo que não carrega cai no cartão pelo onError', () => {
    const { container } = renderPanel('https://media.exemplo.test/quebrado.mp4');
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByTestId('instruction-video-external')).toBeTruthy();
  });

  it('um subdomínio do host conhecido também é página, não arquivo', () => {
    renderPanel('https://m.youtube.com/watch?v=abc123');
    expect(screen.getByTestId('instruction-video-external')).toBeTruthy();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'nao-e-url'])(
    'URL que não é http(s) nunca vira href clicável (%s)',
    (url) => {
      renderPanel(url);
      expect(screen.getByTestId('instruction-video-invalid')).toBeTruthy();
      expect(screen.queryByTestId('instruction-video-external')).toBeNull();
      expect(screen.queryByTestId('instruction-video')).toBeNull();
    },
  );

  it('o vídeo seguinte não herda a falha do anterior', () => {
    const { container, rerender } = renderPanel('https://media.exemplo.test/quebrado.mp4');
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByTestId('instruction-video-external')).toBeTruthy();

    rerender(
      <I18nProvider>
        <InstructionPanel spec={{ video_url: 'https://media.exemplo.test/bom.mp4' }} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('instruction-video')).toBeTruthy();
    expect(screen.queryByTestId('instruction-video-external')).toBeNull();
  });
});
