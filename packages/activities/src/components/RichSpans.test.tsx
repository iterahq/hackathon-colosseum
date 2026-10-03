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
