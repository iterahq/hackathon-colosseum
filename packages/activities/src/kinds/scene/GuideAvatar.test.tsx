import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { GuideAvatar } from './GuideAvatar.js';

const face = (container: HTMLElement) => container.querySelector('[data-face]')?.getAttribute('data-face');

describe('GuideAvatar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits with the neutral face and blinks for a beat', () => {
    const { container } = render(<GuideAvatar happy={false} />);
    expect(face(container)).toBe('neutral');
    act(() => void vi.advanceTimersByTime(3600));
    expect(face(container)).toBe('blink');
    act(() => void vi.advanceTimersByTime(140));
    expect(face(container)).toBe('neutral');
  });

  it('beams and stops blinking once the learner nails it', () => {
    const { container } = render(<GuideAvatar happy />);
    expect(face(container)).toBe('happy');
    act(() => void vi.advanceTimersByTime(3600));
    expect(face(container)).toBe('happy');
  });
});
