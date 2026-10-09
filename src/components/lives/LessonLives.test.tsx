import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { LessonLives } from './LessonLives';

describe('LessonLives', () => {
  it('fails open: with no auth or query provider it renders nothing and reports no lives', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = vi.fn();
    const { container } = render(
      <LessonLives lessonId="l1" reviewingVerdict={false} lessonCompleted={false} onChange={onChange} onLeave={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(onChange.mock.calls.every(([view]) => view === null)).toBe(true);
    expect(warn).toHaveBeenCalledWith('[lives] disabled on this surface:', expect.any(String));
    warn.mockRestore();
    error.mockRestore();
  });
});
