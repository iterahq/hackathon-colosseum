import { describe, expect, it } from 'vitest';
import { backConfirmCopy, backConfirmEnabled, backEffect, decideBack, type BackInput } from './backConfirm';

const base: BackInput = { canGoBack: false, phase: 'ready', confirmOpen: false, confirmEnabled: true, focused: true, canPop: false };
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

describe('decideBack with a route beneath (canPop)', () => {
  it('at the page root leaves the press to the navigator: no card, card enabled or not', () => {
    expect(press({ canPop: true })).toBe('leave');
    expect(press({ canPop: true, phase: 'loading' })).toBe('leave');
    expect(press({ canPop: true, confirmEnabled: false })).toBe('leave');
  });

  it('from the failure card pops to the route beneath, never into page history', () => {
    expect(press({ canPop: true, phase: 'failed' })).toBe('leave');
    expect(press({ canPop: true, phase: 'failed', canGoBack: true })).toBe('leave');
  });

  it('page history still goes first', () => {
    expect(press({ canPop: true, canGoBack: true })).toBe('history');
  });

  it('an open card still closes first', () => {
    expect(press({ canPop: true, confirmOpen: true })).toBe('dismiss');
    expect(press({ canPop: true, confirmOpen: true, canGoBack: true })).toBe('dismiss');
  });

  it('an unfocused route leaves the press', () => {
    expect(press({ canPop: true, focused: false })).toBe('leave');
    expect(press({ canPop: false, focused: false, confirmOpen: true })).toBe('leave');
  });

  it('with nothing beneath (first route, cold-start deep link) the card rule is unchanged', () => {
    expect(press({ canPop: false })).toBe('confirm');
    expect(press({ canPop: false, phase: 'failed' })).toBe('confirm');
    expect(press({ canPop: false, confirmEnabled: false })).toBe('leave');
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

describe('backConfirmCopy', () => {
  it('is Portuguese by default, non-empty, and names the way out', () => {
    const copy = backConfirmCopy();
    for (const text of Object.values(copy)) expect(text.trim().length).toBeGreaterThan(0);
    expect(copy.title).toBe('Sair do Itera?');
    expect(copy.leave).toBe('Sair');
    expect(copy.stay).toBe('Continuar no app');
    expect(copy.leaveHint).toBe('Fecha o app');
  });
  it('is English on request, with no article before the product', () => {
    expect(backConfirmCopy('en')).toEqual({
      title: 'Leave Itera?',
      body: 'You go back to your phone\u2019s home screen. Your progress is saved.',
      stay: 'Stay in the app',
      leave: 'Leave',
      leaveHint: 'Closes the app',
    });
  });
});

describe('backEffect: what the route does with the answer, and what its listener returns', () => {
  it.each([
    ['history', 'webview-back', true],
    ['confirm', 'open-confirm', true],
    ['dismiss', 'close-confirm', true],
    ['leave', 'none', false],
  ] as const)('%s -> %s, handled %s', (action, effect, handled) => {
    expect(backEffect(action)).toEqual({ effect, handled });
  });

  it('only leave hands the press back to the navigator or the system', () => {
    const base: BackInput = { canGoBack: false, phase: 'ready', confirmOpen: false, confirmEnabled: true, focused: true, canPop: false };
    expect(backEffect(decideBack({ ...base, focused: false })).handled).toBe(false);
    expect(backEffect(decideBack({ ...base, canPop: true })).handled).toBe(false);
    expect(backEffect(decideBack({ ...base, confirmEnabled: false })).handled).toBe(false);
    expect(backEffect(decideBack(base)).handled).toBe(true);
    expect(backEffect(decideBack({ ...base, canGoBack: true })).effect).toBe('webview-back');
  });
});
