import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { usePublishedHeight } from './usePublishedHeight';

function Bar({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeight(ref, '--test-bar-h', active);
  return active ? <div ref={ref} data-testid="bar" /> : null;
}

const published = () => document.documentElement.style.getPropertyValue('--test-bar-h');

describe('usePublishedHeight', () => {
  let resize: (() => void) | undefined;

  const original = window.ResizeObserver;

  beforeEach(() => {
    // `writable`, not configurable, in the test setup: assigned, not stubbed.
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this as unknown as ResizeObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(134);
  });

  afterEach(() => {
    window.ResizeObserver = original;
    vi.restoreAllMocks();
  });

  it('publishes the height while the bar is up and follows its resizes', () => {
    render(<Bar active />);
    expect(published()).toBe('134px');

    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180);
    resize?.();
    expect(published()).toBe('180px');
  });

  it('withdraws the variable when the bar goes down', () => {
    const { rerender } = render(<Bar active />);
    rerender(<Bar active={false} />);
    expect(published()).toBe('');
  });

  it('publishes nothing for a bar that never came up', () => {
    render(<Bar active={false} />);
    expect(published()).toBe('');
  });
});
