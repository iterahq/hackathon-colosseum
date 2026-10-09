/**
 * The hover preview's contract: fine pointers only, a beat of intent before it
 * opens, no delay to close, the switch never opens the lightbox, and one
 * switch flips every zone on screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RichText } from './RichText.js';
import { HOVER_OPEN_DELAY_MS, HOVER_TRAVEL_IDLE_MS } from './useMediaHoverPreview.js';
import { COACH_SEEN_AFTER_MS } from './useMediaHoverCoach.js';
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

const on = () => {
  localStorage.setItem('itera.activities.mediaHoverPreview', 'on');
  resetMediaHoverPreference();
};

const card = () => screen.getAllByLabelText('Ampliar a imagem')[0];
const preview = () => screen.queryByTestId('media-hover-preview');

describe('MediaHoverZone', () => {
  it('opens after the intent delay on a fine pointer and closes as soon as the pointer turns away', () => {
    pointer(true);
    on();
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
    on();
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
    on();
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    fireEvent.pointerDown(card());
    expect(preview()).toBeNull();
    fireEvent.click(card());
    expect(screen.getByTestId('media-lightbox')).toBeInTheDocument();
  });

  it('starts off: hovering does nothing, the switch is visible, and the click still opens the lightbox', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    const toggle = screen.getByTestId('media-hover-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('aria-label', 'Ampliar ao passar o mouse');
    expect(toggle).toHaveAttribute('title', 'Ampliar ao passar o mouse');
    expect(toggle.className).not.toContain('opacity-0');
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS * 3));
    expect(preview()).toBeNull();
    fireEvent.click(card());
    expect(screen.getByTestId('media-lightbox')).toBeInTheDocument();
  });

  it('respects an earlier explicit "off"', () => {
    pointer(true);
    localStorage.setItem('itera.activities.mediaHoverPreview', 'off');
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(screen.getByTestId('media-hover-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  it('the switch turns every zone on, persists, and does not open the lightbox', () => {
    pointer(true);
    render(<RichText text={TWO_FIGURES} />);
    const toggles = screen.getAllByTestId('media-hover-toggle');
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggles[0]);
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'true');
    expect(toggles[1]).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('itera.activities.mediaHoverPreview')).toBe('on');

    const cards = screen.getAllByLabelText('Ampliar a imagem');
    fireEvent.pointerEnter(cards[1].parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    expect(preview()).toBeInTheDocument();

    fireEvent.click(toggles[1]);
    expect(toggles[0]).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('itera.activities.mediaHoverPreview')).toBe('off');
  });

  it('is not nested inside the card button', () => {
    pointer(true);
    on();
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(screen.getByTestId('media-hover-toggle').closest('button[aria-label="Ampliar a imagem"]')).toBeNull();
  });
});

describe('MediaHoverZone — the switch on the open preview', () => {
  it('is on the preview, turns the preference off and closes it at once', () => {
    pointer(true);
    on();
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
    on();
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.pointerEnter(card().parentElement!);
    act(() => vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 1));
    expect(preview()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(preview()).toBeNull();
  });
});

describe('MediaHoverZone — first-time coach mark', () => {
  const coach = () => screen.queryByTestId('media-hover-coach');

  it('shows once, on the first image only, with the arrow text and a button', () => {
    pointer(true);
    render(<RichText text={TWO_FIGURES} />);
    expect(screen.getAllByTestId('media-hover-coach')).toHaveLength(1);
    expect(coach()).toHaveTextContent('Quer ver maior? Ative aqui e passe o mouse sobre a imagem.');
    expect(screen.getByTestId('media-hover-coach-ok')).toHaveTextContent('Entendi');
    expect(coach()!.closest('[data-testid="media-hover-zone"]')).toBe(
      screen.getAllByTestId('media-hover-zone')[0],
    );
  });

  it('dismisses on the button and never comes back', () => {
    pointer(true);
    const first = render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.click(screen.getByTestId('media-hover-coach-ok'));
    expect(coach()).toBeNull();
    first.unmount();
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(coach()).toBeNull();
  });

  it('dismisses on Escape', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(coach()).toBeNull();
  });

  it('dismisses when the switch is toggled', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    fireEvent.click(screen.getByTestId('media-hover-toggle'));
    expect(coach()).toBeNull();
  });

  it('counts as seen once it has stood for a moment, even without a click', () => {
    pointer(true);
    const first = render(<RichText text="![a](/lesson-media/a.png)" />);
    act(() => vi.advanceTimersByTime(COACH_SEEN_AFTER_MS + 1));
    first.unmount();
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(coach()).toBeNull();
  });

  it('is not shown on a touch pointer', () => {
    pointer(false);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(coach()).toBeNull();
  });

  it('is not shown to a learner who already turned the preview on', () => {
    pointer(true);
    on();
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(coach()).toBeNull();
  });

  it('does not take focus', () => {
    pointer(true);
    render(<RichText text="![a](/lesson-media/a.png)" />);
    expect(document.activeElement).toBe(document.body);
  });
});
