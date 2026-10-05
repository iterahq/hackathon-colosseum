/**
 * The back-confirm card of store builds (PLAN ADR-8 "Consequence", row R-2). On Android, a back press
 * with no page history left would close the app without a word; in a store or development build it
 * opens a card first. In Expo Go it never does: there the same press returns to the Expo Go home,
 * which is the way out of a test session. Pure TypeScript: no React Native import.
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
}

/**
 * What one hardware back press does. An open card takes the press (it closes). Otherwise the page
 * goes back while it can, never from the failure card (as before R-2: that card is a root). At the
 * root the card opens when it is enabled; when it is not, the press is left to the system.
 * A route that is not the visible one leaves every press: `BackHandler` calls each mounted route, newest
 * first, until one takes it, so a hidden WebView would otherwise go back where nobody sees it.
 */
export function decideBack({ canGoBack, phase, confirmOpen, confirmEnabled, focused }: BackInput): BackAction {
  if (!focused) return 'leave';
  if (confirmOpen) return 'dismiss';
  if (shouldHandleBack(canGoBack, phase)) return 'history';
  return confirmEnabled ? 'confirm' : 'leave';
}

/** `expo-constants` reports 'storeClient' for Expo Go; every other environment is an installed app. */
export const backConfirmEnabled = (executionEnvironment: string | null | undefined): boolean => executionEnvironment !== 'storeClient';

export const BACK_CONFIRM_COPY = {
  title: 'Sair do Itera?',
  body: 'Você volta para a tela inicial do celular. Seu progresso fica salvo.',
  stay: 'Continuar no app',
  leave: 'Sair',
} as const;
