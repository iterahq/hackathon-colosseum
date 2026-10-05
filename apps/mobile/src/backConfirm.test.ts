import { describe, expect, it } from 'vitest';
import { BACK_CONFIRM_COPY, backConfirmEnabled, decideBack, type BackInput } from './backConfirm';

const base: BackInput = { canGoBack: false, phase: 'ready', confirmOpen: false, confirmEnabled: true, focused: true };
const press = (over: Partial<BackInput>) => decideBack({ ...base, ...over });

describe('decideBack', () => {
  it('goes back in the page while the page can', () => {
    expect(press({ canGoBack: true })).toBe('history');
    expect(press({ canGoBack: true, phase: 'loading' })).toBe('history');
  });

  it('opens the card at the root of an installed app', () => {
    expect(press({})).toBe('confirm');
    expect(press({ phase: 'loading' })).toBe('confirm');
  });

  it('opens the card from the failure card even when the page has history', () => {
    expect(press({ phase: 'failed', canGoBack: true })).toBe('confirm');
  });

  it('leaves the press to the system when the card is off (Expo Go)', () => {
    expect(press({ confirmEnabled: false })).toBe('leave');
    expect(press({ confirmEnabled: false, phase: 'failed', canGoBack: true })).toBe('leave');
  });

  it('a route beneath the visible one leaves every press: its hidden page never goes back, and it opens or closes no card', () => {
    expect(press({ focused: false, canGoBack: true })).toBe('leave');
    expect(press({ focused: false, canGoBack: true, confirmEnabled: false })).toBe('leave');
    expect(press({ focused: false })).toBe('leave');
    expect(press({ focused: false, confirmOpen: true })).toBe('leave');
  });

  it('still goes back in the page with the card off', () => {
    expect(press({ confirmEnabled: false, canGoBack: true })).toBe('history');
  });

  it('closes an open card first, whatever the page state', () => {
    expect(press({ confirmOpen: true })).toBe('dismiss');
    expect(press({ confirmOpen: true, canGoBack: true })).toBe('dismiss');
    expect(press({ confirmOpen: true, phase: 'failed' })).toBe('dismiss');
  });
});

describe('backConfirmEnabled', () => {
  it('is off in Expo Go and on everywhere else', () => {
    expect(backConfirmEnabled('storeClient')).toBe(false);
    expect(backConfirmEnabled('standalone')).toBe(true);
    expect(backConfirmEnabled('bare')).toBe(true);
    expect(backConfirmEnabled(undefined)).toBe(true);
  });
});

describe('BACK_CONFIRM_COPY', () => {
  it('is Portuguese, non-empty, and names the way out', () => {
    for (const text of Object.values(BACK_CONFIRM_COPY)) expect(text.trim().length).toBeGreaterThan(0);
    expect(BACK_CONFIRM_COPY.title).toMatch(/Sair/);
    expect(BACK_CONFIRM_COPY.leave).toBe('Sair');
  });
});
