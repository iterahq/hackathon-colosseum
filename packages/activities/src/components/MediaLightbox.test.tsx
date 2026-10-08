import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InstructionImage } from './InstructionImage.js';
import { LIGHTBOX_PINCH_MAX, LIGHTBOX_ZOOM_FACTOR, MediaLightbox } from './MediaLightbox.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

const open = (onClose = vi.fn()) => {
  render(<MediaLightbox src="/lesson-media/a.svg" kind="image" label="Diagram" onClose={onClose} />);
  return onClose;
};

describe('InstructionImage loading', () => {
  it('shows the description instead of a skeleton that never ends when the file does not arrive', () => {
    render(<InstructionImage src="/lesson-media/gone.png" alt="A página antes e depois do clique" />);
    expect(screen.getByTestId('media-skeleton')).toBeInTheDocument();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByTestId('media-skeleton')).toBeNull();
    expect(screen.getByTestId('instruction-image-failed')).toHaveTextContent('A página antes e depois do clique');
  });

  it('drops the skeleton once the image has loaded', () => {
    render(<InstructionImage src="/a.png" alt="Diagram" />);
    fireEvent.load(screen.getByRole('img'));
    expect(screen.queryByTestId('media-skeleton')).toBeNull();
  });
});

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

  it('lets the frame pan, and keeps the pinch for itself instead of the browser', () => {
    open();
    const frame = screen.getByTestId('media-lightbox').className;
    for (const name of ['overflow-auto', 'overscroll-contain', 'touch-pan-x', 'touch-pan-y']) expect(frame).toContain(name);
    expect(frame).not.toContain('touch-pinch-zoom');
  });

  const touches = (type: string, points: [number, number][]) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
    return event;
  };

  it('enlarges the image with two fingers, up to the limit, and fits it back when pinched in', () => {
    const onClose = open();
    const frame = screen.getByTestId('media-lightbox');
    const image = screen.getByTestId('media-lightbox-media');
    const box = { left: 16, top: 200, width: 358, height: 157 };
    vi.spyOn(image, 'getBoundingClientRect').mockImplementation(() => box as DOMRect);

    fireEvent(frame, touches('touchstart', [[100, 280], [200, 280]]));
    const move = touches('touchmove', [[50, 280], [250, 280]]);
    fireEvent(frame, move);
    expect(move.defaultPrevented).toBe(true);
    expect(frame).toHaveAttribute('data-zoomed', 'true');
    expect(image.style.width).toBe(`${358 * 2}px`);
    expect(image.style.height).toBe(`${157 * 2}px`);
    expect(screen.getByTestId('media-lightbox-zoom')).toHaveAttribute('aria-pressed', 'true');

    fireEvent(frame, touches('touchmove', [[-900, 280], [1100, 280]]));
    expect(image.style.width).toBe(`${358 * LIGHTBOX_PINCH_MAX}px`);

    fireEvent(frame, touches('touchend', []));
    fireEvent.click(frame);
    expect(onClose).not.toHaveBeenCalled();
    expect(frame).toHaveAttribute('data-zoomed', 'true');

    // A second pinch starts from the enlarged box and pinches all the way in.
    Object.assign(box, { width: 358 * LIGHTBOX_PINCH_MAX, height: 157 * LIGHTBOX_PINCH_MAX });
    fireEvent(frame, touches('touchstart', [[0, 280], [300, 280]]));
    fireEvent(frame, touches('touchmove', [[140, 280], [160, 280]]));
    expect(image.style.width).toBe('358px');
    fireEvent(frame, touches('touchend', []));
    expect(frame).toHaveAttribute('data-zoomed', 'false');
    expect(image.style.width).toBe('');
  });

  it('leaves a one-finger move to the frame scroll', () => {
    open();
    const frame = screen.getByTestId('media-lightbox');
    fireEvent(frame, touches('touchstart', [[100, 280]]));
    const move = touches('touchmove', [[100, 200]]);
    fireEvent(frame, move);
    expect(move.defaultPrevented).toBe(false);
    expect(frame).toHaveAttribute('data-zoomed', 'false');
  });

  it('offers no zoom control on a clip', () => {
    render(<MediaLightbox src="/a.mp4" kind="video" label="Clip" onClose={vi.fn()} />);
    expect(screen.queryByTestId('media-lightbox-zoom')).toBeNull();
    expect(document.querySelector('video')).toHaveAttribute('src', '/a.mp4');
  });
});
