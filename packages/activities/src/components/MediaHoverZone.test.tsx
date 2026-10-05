/**
 * The hover preview's contract: fine pointers only, a beat of intent before it
 * opens, no delay to close, the switch never opens the lightbox, and one
 * switch flips every zone on screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RichText } from './RichText.js';
import { HOVER_OPEN_DELAY_MS, HOVER_TRAVEL_IDLE_MS } from './useMediaHoverPreview.js';
import { resetMediaHoverPreference } from '../internal/mediaHoverPreference.js';

const TWO_FIGURES = '![a](/lesson-media/a.png)\n\n![b](/lesson-media/b.png)';

function pointer(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('hover') ? matches : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetMediaHoverPreference();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const card = () => screen.getAllByLabelText('Ampliar a imagem')[0];
const preview = () => screen.queryByTestId('media-hover-preview');

describe('MediaHoverZone', () => {
  it('opens after the intent delay on a fine pointer and closes as soon as the pointer turns away', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.pointerEnter(card().parentElement!);
    expect(preview()).toBeNull();
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    expect(preview()).toBeInTheDocument();
    expect(preview()!.className).toContain('pointer-events-none');
    // jsdom lays the switch at (0,0): heading away from it is heading away from the origin.
    fireEvent.pointerLeave(card().parentElement!, { clientX: 300, clientY: 300 });
    expect(preview()).toBeInTheDocument();
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400 });
    expect(preview()).toBeNull();
  });

  it('closes when the pointer pauses on its way to the preview switch', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    fireEvent.pointerLeave(card().parentElement!, { clientX: 300, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    expect(preview()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(HOVER_TRAVEL_IDLE_MS + 1));
    expect(preview()).toBeNull();
  });

  it('never opens for a touch pointer and renders no switch there', () => {
    pointer(false);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS * 3));
    expect(preview()).toBeNull();
    expect(screen.queryByTestId('media-hover-toggle')).toBeNull();
  });

  it('a press closes the preview and the click still opens the lightbox', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    fireEvent.pointerDown(card());
    expect(preview()).toBeNull();
    fireEvent.click(card());
    expect(screen.getByTestId('media-lightbox')).toBeInTheDocument();
  });

  it('the switch turns every zone off, persists, and does not open the lightbox', () => {
    pointer(true);
    render(<RichText text={TWO_FIGURES} />);
    const toggles = screen.getAllByTestId('media-hover-toggle');
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggles[0]);
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'false');
    expect(toggles[1]).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('itera.activities.mediaHoverPreview')).toBe('off');

    const cards = screen.getAllByLabelText('Ampliar a imagem');
    fireEvent.pointerEnter(cards[1].parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    expect(preview()).toBeNull();

    fireEvent.click(toggles[1]);
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('itera.activities.mediaHoverPreview')).toBeNull();
  });

  it('is not nested inside the card button', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(screen.getByTestId('media-hover-toggle').closest('button[aria-label="Ampliar a imagem"]')).toBeNull();
  });
});

describe('MediaHoverZone — the switch on the open preview', () => {
  it('is on the preview, turns the preference off and closes it at once', () => {
    pointer(true);
    render(<RichText text={TWO_FIGURES} />);
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    const onPreview = screen.getByTestId('media-hover-preview-toggle');
    expect(onPreview).toHaveAttribute('aria-pressed', 'true');
    expect(onPreview.className).toContain('pointer-events-auto');

    fireEvent.click(onPreview);
    expect(preview()).toBeNull();
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
    expect(localStorage.getItem('itera.activities.mediaHoverPreview')).toBe('off');
    for (const toggle of screen.getAllByTestId('media-hover-toggle'))
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('closes on Escape while open', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    expect(preview()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(preview()).toBeNull();
  });
});
