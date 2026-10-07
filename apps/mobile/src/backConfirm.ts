/**
 * The back-confirm card of store builds (PLAN ADR-8 "Consequence", row R-2). On Android, a back press
 * with no page history left would close the app without a word; in a store or development build it
 * opens a card first. In Expo Go it never does: there the same press returns to the Expo Go home,
 * which is the way out of a test session. Pure TypeScript: no React Native import.
 *
 * A deep link opens a route pushed over the one that was open. At the root of that page the press is
 * not the app's last one: it is left to the navigator (expo-router's own `hardwareBackPress` listener,
 * registered before any route's, pops the stack when `canGoBack()` is true), so no card opens.
 * The failure card is a root of the PAGE, not of the app: from it the press never goes into page history,
 * and with a route beneath (`canPop`) it pops to that route; with nothing beneath it opens the card.
 */
import { shouldHandleBack, type ChromePhase } from './shellChromeState';

export type BackAction = 'history' | 'confirm' | 'dismiss' | 'leave';

export interface BackInput {
  canGoBack: boolean;
  phase: ChromePhase;
  confirmOpen: boolean;
  confirmEnabled: boolean;
  /** False for a route that sits beneath another one (a deep link over an open route). Its listener still runs. */
  focused: boolean;
  /** The navigator has a route beneath this one (`router.canGoBack()`), read at press time. False for the first route and for a cold-start deep link. */
  canPop: boolean;
}

/**
 * What one hardware back press does. An open card takes the press (it closes). Otherwise the page
 * goes back while it can, never from the failure card (as before R-2: that card is a root). At the
 * root, a route beneath leaves the press to the navigator (it pops; no card); with nothing beneath the card
 * opens when it is enabled, and when it is not, the press is left to the system.
 * A route that is not the visible one leaves every press: `BackHandler` calls each mounted route, newest
 * first, until one takes it, so a hidden WebView would otherwise go back where nobody sees it.
 */
export function decideBack({ canGoBack, phase, confirmOpen, confirmEnabled, focused, canPop }: BackInput): BackAction {
  if (!focused) return 'leave';
  if (confirmOpen) return 'dismiss';
  if (shouldHandleBack(canGoBack, phase)) return 'history';
  if (canPop) return 'leave';
  return confirmEnabled ? 'confirm' : 'leave';
}

export type BackEffect = 'webview-back' | 'open-confirm' | 'close-confirm' | 'none';

/** What the route does for a `BackAction`, and the value its `hardwareBackPress` listener returns: true takes the press, false leaves it to the navigator or the system. */
export function backEffect(action: BackAction): { effect: BackEffect; handled: boolean } {
  switch (action) {
    case 'history':
      return { effect: 'webview-back', handled: true };
    case 'confirm':
      return { effect: 'open-confirm', handled: true };
    case 'dismiss':
      return { effect: 'close-confirm', handled: true };
    case 'leave':
      return { effect: 'none', handled: false };
  }
}

/** `expo-constants` reports 'storeClient' for Expo Go; every other environment is an installed app. */
export const backConfirmEnabled = (executionEnvironment: string | null | undefined): boolean => executionEnvironment !== 'storeClient';

export const BACK_CONFIRM_COPY = {
  title: 'Sair do Itera?',
  body: 'Você volta para a tela inicial do celular. Seu progresso fica salvo.',
  stay: 'Continuar no app',
  leave: 'Sair',
} as const;
