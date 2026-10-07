import { describe, expect, it } from 'vitest';
import { cardAnnouncement, hiddenBeneath, hiddenProps, surfaceOf, veilMotion } from './chromeA11y';

describe('surfaceOf', () => {
  it('the leave card is above every phase', () => {
    expect(surfaceOf('ready', true)).toBe('leave');
    expect(surfaceOf('failed', true)).toBe('leave');
    expect(surfaceOf('loading', true)).toBe('leave');
  });
  it('otherwise the phase is the surface', () => {
    expect(surfaceOf('loading', false)).toBe('loading');
    expect(surfaceOf('failed', false)).toBe('failed');
    expect(surfaceOf('ready', false)).toBe('ready');
  });
});

describe('hiddenBeneath', () => {
  it('shows the WebView only when nothing covers it', () => {
    expect(hiddenBeneath('ready')).toEqual({ webview: false, failureCard: false });
  });
  it('hides the WebView under the veil and under each card', () => {
    expect(hiddenBeneath('loading').webview).toBe(true);
    expect(hiddenBeneath('failed').webview).toBe(true);
    expect(hiddenBeneath('leave').webview).toBe(true);
  });
  it('hides the failure card only under the leave card', () => {
    expect(hiddenBeneath('failed').failureCard).toBe(false);
    expect(hiddenBeneath('leave').failureCard).toBe(true);
  });
});

describe('hiddenProps', () => {
  it('maps to both platforms', () => {
    expect(hiddenProps(true)).toEqual({ importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true });
    expect(hiddenProps(false)).toEqual({ importantForAccessibility: 'auto', accessibilityElementsHidden: false });
  });
});

describe('cardAnnouncement', () => {
  it('joins title and body', () => {
    expect(cardAnnouncement('Sem conexão', 'Verifique sua internet e tente de novo.')).toBe('Sem conexão. Verifique sua internet e tente de novo.');
  });
  it('is the title alone when there is no body', () => {
    expect(cardAnnouncement('Sem conexão', null)).toBe('Sem conexão');
    expect(cardAnnouncement('Sem conexão', '')).toBe('Sem conexão');
  });
});

describe('veilMotion', () => {
  it('slides a 40% bar and fades when motion is allowed', () => {
    expect(veilMotion(false, 400, 150)).toEqual({ loop: true, fadeMs: 150, barWidth: 160 });
  });
  it('is static and instant with reduce-motion on', () => {
    expect(veilMotion(true, 400, 150)).toEqual({ loop: false, fadeMs: 0, barWidth: 400 });
  });
});
