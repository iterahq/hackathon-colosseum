import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountUmami, setUmamiProperty } from './analytics';

function freshDoc(): Document {
  return document.implementation.createHTMLDocument('t');
}

describe('mountUmami', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('emits nothing without a website id', () => {
    const doc = freshDoc();
    expect(mountUmami(doc)).toBe(false);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
  });

  it('injects a tag pointing at our own Umami', () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'abc-123');
    const doc = freshDoc();
    expect(mountUmami(doc)).toBe(true);
    const tag = doc.querySelector('script[data-website-id]') as HTMLScriptElement;
    expect(tag.getAttribute('data-website-id')).toBe('abc-123');
    expect(tag.src).toBe('https://analytics.devfellowship.com/script.js');
  });

  it('does not mount twice, so a remount cannot double-count a pageview', () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'abc-123');
    const doc = freshDoc();
    mountUmami(doc);
    expect(mountUmami(doc)).toBe(false);
    expect(doc.querySelectorAll('script[data-website-id]')).toHaveLength(1);
  });
});

describe('setUmamiProperty', () => {
  const win = (umami?: unknown) => ({ umami }) as unknown as Window;

  it('calls identify with the property when the tracker is loaded', () => {
    const identify = vi.fn();
    expect(setUmamiProperty('shell', '0.2.0', win({ identify }), freshDoc())).toBe(true);
    expect(identify).toHaveBeenCalledExactlyOnceWith({ shell: '0.2.0' });
  });

  it('does nothing when no tracker tag was mounted', () => {
    expect(setUmamiProperty('shell', '0.2.0', win(), freshDoc())).toBe(false);
  });

  it('waits for the tracker script to load when window.umami is not there yet', () => {
    const doc = freshDoc();
    const script = doc.createElement('script');
    script.setAttribute('data-website-id', 'abc-123');
    doc.head.appendChild(script);
    const w = win();
    expect(setUmamiProperty('shell', '0.2.0', w, doc)).toBe(false);
    const identify = vi.fn();
    (w as Window & { umami?: unknown }).umami = { identify };
    script.dispatchEvent(new Event('load'));
    expect(identify).toHaveBeenCalledExactlyOnceWith({ shell: '0.2.0' });
  });
});
