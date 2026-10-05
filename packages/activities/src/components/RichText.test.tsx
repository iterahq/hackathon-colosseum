/**
 * What the block cascade promises: text is never held back where the browser
 * cannot observe, a block the reader scrolls to lands when it appears, and the
 * long-form treatment (lead paragraph, section numbers, wider rhythm) is a
 * choice of the reading screen, not of every prompt.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { RichText } from './RichText.js';

const LONG = `## Primeira

Abertura do texto.

Segundo parágrafo.

## Segunda

- um
- dois`;

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

function fakeIntersectionObserver() {
  const callbacks: IOCallback[] = [];
  class FakeIO {
    constructor(cb: IOCallback) {
      callbacks.push(cb);
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeIO);
  return callbacks;
}

afterEach(() => vi.unstubAllGlobals());

describe('RichText — reveal', () => {
  it('lands every block at once where nothing can observe the viewport', () => {
    const { container } = render(<RichText text={LONG} />);
    const states = [...container.querySelectorAll('[data-rich-reveal]')].map((n) =>
      n.getAttribute('data-rich-reveal'),
    );
    expect(states).toHaveLength(5);
    expect(new Set(states)).toEqual(new Set(['landed']));
  });

  it('keeps a block pending until it is on screen, then lands it', () => {
    const callbacks = fakeIntersectionObserver();
    const { container } = render(<RichText text={LONG} />);
    const blocks = container.querySelectorAll('[data-rich-reveal]');
    expect(blocks[0].getAttribute('data-rich-reveal')).toBe('pending');

    act(() => callbacks[0]([{ isIntersecting: false }]));
    expect(blocks[0].getAttribute('data-rich-reveal')).toBe('pending');

    act(() => callbacks[0]([{ isIntersecting: true }]));
    expect(blocks[0].getAttribute('data-rich-reveal')).toBe('landed');
    expect(blocks[1].getAttribute('data-rich-reveal')).toBe('pending');
  });
});

describe('RichText — reading screen vs prompt', () => {
  it('sizes up the paragraph under the opening heading only when reading', () => {
    const reading = render(<RichText text={LONG} reading />);
    expect(reading.container.querySelector('[data-lead="true"]')!.textContent).toBe('Abertura do texto.');
    expect(reading.container.querySelectorAll('[data-lead]')).toHaveLength(1);

    const prompt = render(<RichText text={LONG} />);
    expect(prompt.container.querySelector('[data-lead]')).toBeNull();
  });

  it('numbers the sections when reading and there is more than one', () => {
    const { container } = render(<RichText text={LONG} reading />);
    const numbers = [...container.querySelectorAll('[data-rich-section]')].map((n) => n.textContent);
    expect(numbers).toEqual(['01', '02']);
  });

  it('leaves a single section unnumbered', () => {
    const { container } = render(<RichText text="## Só uma\n\nTexto." reading />);
    expect(container.querySelector('[data-rich-section]')).toBeNull();
  });

  it('never numbers a prompt', () => {
    const { container } = render(<RichText text={LONG} />);
    expect(container.querySelector('[data-rich-section]')).toBeNull();
  });

  it('keeps the muted description plain even on a reading screen', () => {
    const { container } = render(<RichText text={LONG} reading muted />);
    expect(container.querySelector('[data-lead]')).toBeNull();
    expect(container.querySelector('[data-rich-section]')).toBeNull();
    expect(container.querySelector('[data-rich-block="list"]')!.className).toContain('list-disc');
  });
});
