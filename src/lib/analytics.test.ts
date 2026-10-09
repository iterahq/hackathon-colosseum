import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FUNNEL_STEPS, mountUmami, setUmamiProperty, trackFunnel, trackFunnelOnce, type FunnelStep } from './analytics';

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

describe('trackFunnel', () => {
  const winWith = (track?: unknown) => ({ umami: { track }, localStorage }) as unknown as Window;

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'abc-123');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the six steps closed and in funnel order', () => {
    expect([...FUNNEL_STEPS]).toEqual([
      'signup_started',
      'signup_completed',
      'subscribe_clicked',
      'checkout_returned_success',
      'first_activity_opened',
      'first_lesson_completed',
    ]);
    // @ts-expect-error a step outside the closed list does not compile
    const unknown: FunnelStep = 'page_viewed';
    expect(unknown).toBeDefined();
  });

  it('sends nothing without a website id', () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '');
    const track = vi.fn();
    expect(trackFunnel('signup_started', winWith(track))).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it('sends nothing while the tracker script has not loaded', () => {
    expect(trackFunnel('signup_started', { localStorage } as unknown as Window)).toBe(false);
  });

  it('sends only the step and the stored utm fields', () => {
    localStorage.setItem(
      'itera_attribution',
      JSON.stringify({
        utm: { utm_source: 'teste', utm_medium: 'cpc', utm_campaign: 'out', utm_term: 'x' },
        referrer: 'example.com',
        landing: '/',
        capturedAt: new Date().toISOString(),
      }),
    );
    const track = vi.fn();
    expect(trackFunnel('subscribe_clicked', winWith(track))).toBe(true);
    expect(track).toHaveBeenCalledExactlyOnceWith('subscribe_clicked', {
      utm_source: 'teste',
      utm_medium: 'cpc',
      utm_campaign: 'out',
    });
  });

  it('sends an empty payload when nothing is attributed', () => {
    const track = vi.fn();
    trackFunnel('signup_started', winWith(track));
    expect(track).toHaveBeenCalledExactlyOnceWith('signup_started', {});
  });

  it('never throws when the tracker does', () => {
    const track = vi.fn(() => {
      throw new Error('boom');
    });
    expect(() => trackFunnel('signup_started', winWith(track))).not.toThrow();
  });

  it('fires a once-only step a single time per browser', () => {
    const track = vi.fn();
    const w = winWith(track);
    expect(trackFunnelOnce('first_lesson_completed', w)).toBe(true);
    expect(trackFunnelOnce('first_lesson_completed', w)).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('funnel.itera.first_lesson_completed')).toBe('1');
  });

  it('does not burn the flag when the tracker is not ready', () => {
    expect(trackFunnelOnce('first_activity_opened', { localStorage } as unknown as Window)).toBe(false);
    expect(localStorage.getItem('funnel.itera.first_activity_opened')).toBeNull();
  });
});
