import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountUmami } from './analytics';

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
