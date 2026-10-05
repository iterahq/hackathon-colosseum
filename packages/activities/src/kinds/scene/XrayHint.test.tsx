import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { XrayHint } from './XrayHint.js';

const mockHover = (none: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(hover: none)' && none,
        media: query,
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );

describe('XrayHint', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks for the mouse on a screen that hovers', () => {
    mockHover(false);
    render(<XrayHint />);
    expect(screen.getByTestId('xray-hint').textContent).toBe('Passe o mouse aqui');
  });

  it('asks for the finger on a touch-only screen', () => {
    mockHover(true);
    render(<XrayHint />);
    expect(screen.getByTestId('xray-hint').textContent).toBe('Passe o dedo aqui');
  });
});
