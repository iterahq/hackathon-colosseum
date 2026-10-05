import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InstructionImage } from './InstructionImage.js';
import { LIGHTBOX_ZOOM_FACTOR, MediaLightbox } from './MediaLightbox.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

const open = (onClose = vi.fn()) => {
  render(<MediaLightbox src="/lesson-media/a.svg" kind="image" label="Diagram" onClose={onClose} />);
  return onClose;
};

describe('MediaLightbox', () => {
  it('is a modal dialog mounted on body, outside any transformed card', () => {
    const { container } = render(
      <div style={{ transform: 'translateY(4px)' }}>
        <MediaLightbox src="/a.png" kind="image" label="Diagram" onClose={vi.fn()} />
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Diagram' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement).toBe(document.body);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens with the whole image fitted to the dynamic viewport and the safe areas', () => {
    open();
    const frame = screen.getByTestId('media-lightbox').className;
    expect(frame).toContain('h-[100dvh]');
    expect(frame).not.toContain('100vh');
    for (const side of ['top', 'right', 'bottom', 'left']) expect(frame).toContain(`env(safe-area-inset-${side})`);
    const image = screen.getByTestId('media-lightbox-media').className;
    for (const name of ['max-h-full', 'max-w-full', 'object-contain', 'm-auto']) expect(image).toContain(name);
    expect(image).not.toContain('min-w-[');
  });

  it('locks the page scroll while open and restores what was there', () => {
    document.documentElement.style.overflow = 'clip';
    const { unmount } = render(<MediaLightbox src="/a.png" kind="image" label="Diagram" onClose={vi.fn()} />);
    expect(document.documentElement.style.overflow).toBe('hidden');
    unmount();
    expect(document.documentElement.style.overflow).toBe('clip');
  });

  it('takes focus, keeps Tab inside and hands focus back to the opener', () => {
    render(<InstructionImage src="/a.png" alt="Diagram" />);
    const opener = screen.getByTestId('instruction-image');
    opener.focus();
    fireEvent.click(opener);
    const close = screen.getByTestId('instruction-image-zoom-close');
    const zoom = screen.getByTestId('instruction-image-zoom-zoom');
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(zoom).toHaveFocus();
    fireEvent.keyDown(zoom, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(screen.queryByTestId('instruction-image-zoom')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on Escape, on the backdrop and on the close control, never on the image', () => {
    const onClose = open();
    fireEvent.click(screen.getByTestId('media-lightbox-media'));
    fireEvent.click(screen.getByTestId('media-lightbox-zoom'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('media-lightbox'));
    fireEvent.click(screen.getByTestId('media-lightbox-close'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('has a close control a finger can hit', () => {
    open();
    const close = screen.getByTestId('media-lightbox-close').className;
    expect(close).toContain('min-h-11');
    expect(close).toContain('min-w-11');
  });

  it('enlarges the fitted image from the zoom control and from a double tap, and fits it back', () => {
    open();
    const image = screen.getByTestId('media-lightbox-media');
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ width: 358, height: 157 } as DOMRect);
    const zoom = screen.getByTestId('media-lightbox-zoom');
    expect(zoom).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(zoom);
    expect(screen.getByTestId('media-lightbox')).toHaveAttribute('data-zoomed', 'true');
    expect(zoom).toHaveAttribute('aria-pressed', 'true');
    expect(image.style.width).toBe(`${358 * LIGHTBOX_ZOOM_FACTOR}px`);
    expect(image.style.height).toBe(`${157 * LIGHTBOX_ZOOM_FACTOR}px`);
    expect(image.className).toContain('max-w-none');

    fireEvent.doubleClick(image);
    expect(screen.getByTestId('media-lightbox')).toHaveAttribute('data-zoomed', 'false');
    expect(image.style.width).toBe('');
    expect(image.className).toContain('max-w-full');
  });

  it('lets the frame pan and pinch', () => {
    open();
    const frame = screen.getByTestId('media-lightbox').className;
    for (const name of ['overflow-auto', 'overscroll-contain', 'touch-pan-x', 'touch-pan-y', 'touch-pinch-zoom'])
      expect(frame).toContain(name);
  });

  it('offers no zoom control on a clip', () => {
    render(<MediaLightbox src="/a.mp4" kind="video" label="Clip" onClose={vi.fn()} />);
    expect(screen.queryByTestId('media-lightbox-zoom')).toBeNull();
    expect(document.querySelector('video')).toHaveAttribute('src', '/a.mp4');
  });
});
