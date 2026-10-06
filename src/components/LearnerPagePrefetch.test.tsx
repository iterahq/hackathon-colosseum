import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  session: null as object | null,
  loaders: [vi.fn(() => Promise.resolve({})), vi.fn(() => Promise.reject(new Error('offline')))],
}));

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock('@/pages/learnerPageLoaders', () => ({ LEARNER_PAGE_LOADERS: mocks.loaders }));

import { LearnerPagePrefetch } from './LearnerPagePrefetch';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
}

describe('LearnerPagePrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal('requestIdleCallback', undefined);
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches nothing while signed out', () => {
    mocks.session = null;
    render(<LearnerPagePrefetch />);
    vi.advanceTimersByTime(5000);
    expect(mocks.loaders[0]).not.toHaveBeenCalled();
  });

  it('fetches every learner page once the learner is signed in, and survives a failed one', async () => {
    mocks.session = {};
    render(<LearnerPagePrefetch />);
    expect(mocks.loaders[0]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.loaders[0]).toHaveBeenCalledTimes(1);
    expect(mocks.loaders[1]).toHaveBeenCalledTimes(1);
  });

  it('fetches nothing offline', () => {
    mocks.session = {};
    setOnline(false);
    render(<LearnerPagePrefetch />);
    vi.advanceTimersByTime(5000);
    expect(mocks.loaders[0]).not.toHaveBeenCalled();
  });

  it('does not fetch after an unmount that came first', () => {
    mocks.session = {};
    const { unmount } = render(<LearnerPagePrefetch />);
    unmount();
    vi.advanceTimersByTime(5000);
    expect(mocks.loaders[0]).not.toHaveBeenCalled();
  });
});
