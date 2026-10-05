import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RichText } from './RichText.js';

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
