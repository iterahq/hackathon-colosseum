import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountStaleChunkReload, shouldReloadForStaleChunk } from './stale-chunk-reload';

describe('shouldReloadForStaleChunk', () => {
  it('reloads when no reload happened yet', () => {
    expect(shouldReloadForStaleChunk(null, 1_000)).toBe(true);
  });

  it('does not reload again inside the window', () => {
    expect(shouldReloadForStaleChunk('1000', 5_000)).toBe(false);
  });

  it('reloads again once the window has passed', () => {
    expect(shouldReloadForStaleChunk('1000', 20_000)).toBe(true);
  });

  it('treats a corrupt timestamp as no reload', () => {
    expect(shouldReloadForStaleChunk('garbage', 1_000)).toBe(true);
  });
});

describe('mountStaleChunkReload', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  function setup() {
    const target = new EventTarget();
    const reload = vi.fn();
    const win = Object.assign(target, {
      sessionStorage,
      location: { reload },
    }) as unknown as Window;
    mountStaleChunkReload(win);
    const fire = () => {
      const event = new Event('vite:preloadError', { cancelable: true });
      win.dispatchEvent(event);
      return event;
    };
    return { reload, fire };
  }

  it('reloads once and swallows the error', () => {
    const { reload, fire } = setup();
    const event = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets a repeated failure reach the error boundary', () => {
    const { reload, fire } = setup();
    fire();
    const second = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });
});
