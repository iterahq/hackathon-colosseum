import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { RouteScrollReset } from './RouteScrollReset';

let go: ReturnType<typeof useNavigate>;
function Grab() {
  go = useNavigate();
  return null;
}

describe('RouteScrollReset', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteScrollReset />
        <Grab />
      </MemoryRouter>,
    );
    scrollTo.mockClear();
  });
  afterEach(() => scrollTo.mockRestore());

  it('opens a new page at the top', () => {
    act(() => go('/catalog'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });

  it('leaves the offset alone when the learner goes back', () => {
    act(() => go('/catalog'));
    scrollTo.mockClear();
    act(() => go(-1));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing when only the query changes', () => {
    act(() => go('/catalog'));
    scrollTo.mockClear();
    act(() => go('/catalog?tab=all', { replace: true }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
