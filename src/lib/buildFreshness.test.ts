import { afterEach, describe, expect, it, vi } from 'vitest';
import { deployedEntryScript, loadedEntryScript, shouldReloadForNewBuild } from './buildFreshness';

const html = (name: string) => `<html><head><script type="module" crossorigin src="/assets/${name}"></script></head></html>`;
const serving = (name: string) => vi.fn(async () => new Response(html(name), { status: 200 })) as unknown as typeof fetch;

afterEach(() => {
  sessionStorage.clear();
  document.head.innerHTML = '';
});

describe('build freshness', () => {
  it('reads the entry script the tab booted from', () => {
    expect(loadedEntryScript()).toBeNull();
    document.head.innerHTML = '<script type="module" src="/assets/index-AbC_12-x.js"></script>';
    expect(loadedEntryScript()).toBe('/assets/index-AbC_12-x.js');
  });

  it('reads the entry script the server hands out now, bypassing the cache', async () => {
    const fetcher = serving('index-NEW.js');
    expect(await deployedEntryScript(fetcher)).toBe('/assets/index-NEW.js');
    expect(fetcher).toHaveBeenCalledWith('/index.html', { cache: 'no-store' });
    expect(await deployedEntryScript(vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch)).toBeNull();
    expect(await deployedEntryScript(vi.fn(async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch)).toBeNull();
  });

  it('asks for one reload per path when a newer build is deployed', async () => {
    expect(await shouldReloadForNewBuild('/bounties', '/assets/index-OLD.js', serving('index-NEW.js'))).toBe(true);
    expect(await shouldReloadForNewBuild('/bounties', '/assets/index-OLD.js', serving('index-NEW.js'))).toBe(false);
    expect(await shouldReloadForNewBuild('/other', '/assets/index-OLD.js', serving('index-NEW.js'))).toBe(true);
  });

  it('never reloads an up-to-date tab, a dev build, or when the server cannot be read', async () => {
    expect(await shouldReloadForNewBuild('/x', '/assets/index-SAME.js', serving('index-SAME.js'))).toBe(false);
    expect(await shouldReloadForNewBuild('/x', null, serving('index-NEW.js'))).toBe(false);
    expect(await shouldReloadForNewBuild('/x', '/assets/index-OLD.js', vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch)).toBe(false);
  });
});
