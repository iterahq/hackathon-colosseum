import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ArtZoom } from './ArtZoom';

const show = () =>
  render(
    <I18nProvider>
      <ArtZoom title="HTML" line="3 de 5 dias" src="/art.svg" asset="Asset1111">
        <img src="/art.svg" alt="" />
      </ArtZoom>
    </I18nProvider>
  );

describe('ArtViewer', () => {
  it('opens from the art, shows title, line and explorer link, and closes on Escape', () => {
    show();
    expect(screen.queryByTestId('art-viewer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('art-zoom'));
    expect(screen.getByTestId('art-viewer-title')).toHaveTextContent('HTML');
    expect(screen.getByTestId('art-viewer')).toHaveTextContent('3 de 5 dias');
    expect(screen.getByTestId('art-viewer-explorer')).toHaveAttribute('href', expect.stringContaining('/address/Asset1111'));
    expect(screen.getByTestId('art-viewer-close')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('art-viewer')).not.toBeInTheDocument();
  });

  it('zooms with the buttons and the keyboard, and returns to fit', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    show();
    fireEvent.click(screen.getByTestId('art-zoom'));
    const viewer = screen.getByTestId('art-viewer');
    expect(viewer).toHaveAttribute('data-zoom', '1.00');
    expect(screen.getByTestId('art-viewer-out')).toBeDisabled();
    fireEvent.click(screen.getByTestId('art-viewer-in'));
    expect(viewer).toHaveAttribute('data-zoom', '1.50');
    fireEvent.keyDown(window, { key: '+' });
    expect(viewer).toHaveAttribute('data-zoom', '2.25');
    fireEvent.click(screen.getByTestId('art-viewer-fit'));
    expect(viewer).toHaveAttribute('data-zoom', '1.00');
  });

  it('keeps Tab inside the viewer', () => {
    show();
    fireEvent.click(screen.getByTestId('art-zoom'));
    screen.getByTestId('art-viewer-explorer').focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByTestId('art-viewer-fit')).toHaveFocus();
  });
});
