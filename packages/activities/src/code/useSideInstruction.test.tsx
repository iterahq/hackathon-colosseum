import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useSideInstruction } from './useSideInstruction.js';

function Probe() {
  const instruction = useRef<HTMLDivElement>(null);
  const side = useSideInstruction(instruction);
  return (
    <div ref={instruction} data-testid="instruction" data-side={side ? 'yes' : 'no'}>
      instruction
    </div>
  );
}

function setup({ width, viewport, instruction, fit = true }: { width: number; viewport: number; instruction: number; fit?: boolean }) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', viewport);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: instruction } as DOMRect);
  render(fit ? <main data-fit-viewport><Probe /></main> : <Probe />);
  return screen.getByTestId('instruction').dataset.side;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useSideInstruction', () => {
  it('moves a long instruction beside the panes on a wide screen', () => {
    expect(setup({ width: 1366, viewport: 768, instruction: 420 })).toBe('yes');
  });

  it('keeps a short instruction above the panes', () => {
    expect(setup({ width: 1366, viewport: 768, instruction: 96 })).toBe('no');
  });

  it('keeps a long instruction above the panes on a narrow screen', () => {
    expect(setup({ width: 820, viewport: 1180, instruction: 600 })).toBe('no');
  });

  it('does nothing in a host that did not opt in', () => {
    expect(setup({ width: 1366, viewport: 768, instruction: 420, fit: false })).toBe('no');
  });

  it('follows the window when it is resized', () => {
    expect(setup({ width: 1366, viewport: 768, instruction: 420 })).toBe('yes');
    vi.stubGlobal('innerWidth', 900);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByTestId('instruction').dataset.side).toBe('no');
  });
});
