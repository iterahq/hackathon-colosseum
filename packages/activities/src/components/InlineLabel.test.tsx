import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { InlineLabel } from './InlineLabel.js';

describe('InlineLabel', () => {
  it('draws inline code without the backticks', () => {
    const { container } = render(<InlineLabel text="`<li><strong>Ninho</li></strong>`" />);
    expect(container.querySelector('code')?.textContent).toBe('<li><strong>Ninho</li></strong>');
    expect(container.textContent).not.toContain('`');
  });

  it('draws bold as plain emphasis, never as a term chip', () => {
    const { container } = render(<InlineLabel text="é o **palco** da página" />);
    expect(container.querySelector('strong')?.textContent).toBe('palco');
    expect(container.querySelector('[data-term-chip]')).toBeNull();
    expect(container.textContent).toBe('é o palco da página');
  });

  it('leaves a plain label untouched', () => {
    const { container } = render(<InlineLabel text="na página, grande" />);
    expect(container.textContent).toBe('na página, grande');
  });

  it.each([
    'Deixar só a versão final e apagar as linhas <<<<<<<, ======= e >>>>>>>',
    "'10' === 10",
    '10 === 10',
    'x == y',
    '5 * 3 * 2',
  ])('keeps every character of code-like label %j', (label) => {
    const { container } = render(<InlineLabel text={label} />);
    expect(container.textContent).toBe(label);
  });
});
