import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RichText } from './RichText.js';
import { RichSpans } from './RichSpans.js';
import { parseInline } from '../internal/richText.js';

describe('RichSpans — bold vs mark', () => {
  it('renders bold as plain emphasis with no background', () => {
    const { container } = render(<RichText text="a **bold** word" />);
    const strong = container.querySelector('strong')!;
    expect(strong.className).toContain('font-semibold');
    expect(strong.style.backgroundImage).toBe('');
    expect(strong.style.backgroundSize).toBe('');
  });

  it('renders ==x== as a highlighted mark', () => {
    const { container } = render(<RichText text="a ==key phrase== word" />);
    const mark = container.querySelector('mark')!;
    expect(mark.textContent).toBe('key phrase');
    expect(mark.style.backgroundImage).toContain('rgba(63, 209, 127, 0.1)');
    expect(mark.style.boxShadow).toContain('inset');
  });
});

describe('RichSpans — inline code', () => {
  it('renders inline code as a keycap with a ledge', () => {
    const { container } = render(<RichText text="run `git pull` now" />);
    const code = container.querySelector('code')!;
    expect(code.textContent).toBe('git pull');
    expect(code.className).toContain('border-b-2');
    expect(code.className).toContain('font-mono');
  });
});

describe('RichSpans — term chip', () => {
  const DAY1 = '`head` é o **bastidor**: nada dele aparece. Repare: uma tag fica **dentro** de outra.';

  it('raises the term and leaves the stressed word plain inside a reading block', () => {
    const { container } = render(<RichText text={DAY1} />);
    const chips = [...container.querySelectorAll('[data-term-chip]')].map((n) => n.textContent);
    expect(chips).toEqual(['bastidor']);
    const plain = [...container.querySelectorAll('strong:not([data-term-chip])')].map((n) => n.textContent);
    expect(plain).toEqual(['dentro']);
  });

  it('raises nothing for a bare RichSpans caller, a muted text, a heading or a quote', () => {
    const bare = render(<RichSpans spans={parseInline(DAY1)} />);
    expect(bare.container.querySelector('[data-term-chip]')).toBeNull();
    const muted = render(<RichText text={DAY1} muted />);
    expect(muted.container.querySelector('[data-term-chip]')).toBeNull();
    const framed = render(<RichText text={`## O ${DAY1}\n\n> ${DAY1}`} />);
    expect(framed.container.querySelector('[data-term-chip]')).toBeNull();
    expect(framed.container.querySelectorAll('strong')).toHaveLength(4);
  });

  it('raises a term inside a list row', () => {
    const { container } = render(<RichText text={'- `body` é o **palco**: tudo que aparece'} />);
    expect(container.querySelector('[data-rich-block="list"] [data-term-chip]')!.textContent).toBe('palco');
  });
});
