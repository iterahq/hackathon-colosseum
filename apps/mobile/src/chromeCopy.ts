/**
 * Every string the native chrome shows or speaks, in Portuguese and English: the cards (titles, bodies, buttons), the `Alert` notices and
 * the accessibility labels. One module, so the two languages cannot drift apart (`Record<ChromeLocale, ChromeStrings>` makes a missing
 * key a type error). The product is Brazilian: Portuguese is the default; English only when the phone's first language is English.
 *
 * Brand grammar (brand guide): in Portuguese the PRODUCT is masculine ("o Itera", "no Itera", "do Itera"); in English it takes no article.
 *
 * Pure TypeScript: no React Native import. The route reads the device language (`chromeLocale` takes what it read) and calls `setChromeLocale` once.
 */
export type ChromeLocale = 'pt' | 'en';

export interface ChromeStrings {
  veilLabel: string;
  tryAgain: string;
  openInBrowser: string;
  offlineTitle: string;
  offlineBody: string;
  failureTitle: string;
  failureBody: string;
  updateTitle: string;
  /** `{current}` and `{min}` are replaced with the shell version and the minimum one. */
  updateBody: string;
  updateDetail: string;
  updateButton: string;
  leaveTitle: string;
  leaveBody: string;
  leaveStay: string;
  leaveLeave: string;
  leaveHint: string;
  blocked: string;
  openFailed: string;
  authBusy: string;
  authFailed: string;
}

export const CHROME_COPY: Record<ChromeLocale, ChromeStrings> = {
  pt: {
    veilLabel: 'Carregando',
    tryAgain: 'Tentar de novo',
    openInBrowser: 'Abrir no navegador',
    offlineTitle: 'Sem conexão',
    offlineBody: 'Verifique sua internet e tente de novo.',
    failureTitle: 'Não foi possível abrir o Itera',
    failureBody: 'Tente de novo ou abra no navegador.',
    updateTitle: 'Atualize o app',
    updateBody: 'Esta versão ({current}) é antiga demais para o Itera atual. Instale a versão {min} ou mais nova.',
    updateDetail: 'Uma atualização é necessária. Fale com quem te passou o app.',
    updateButton: 'Atualizar agora',
    leaveTitle: 'Sair do Itera?',
    leaveBody: 'Você volta para a tela inicial do celular. Seu progresso fica salvo.',
    leaveStay: 'Continuar no app',
    leaveLeave: 'Sair',
    leaveHint: 'Fecha o app',
    blocked: 'Indisponível no app',
    openFailed: 'Não foi possível abrir',
    authBusy: 'Login com DFL em andamento',
    authFailed: 'Não foi possível entrar com DFL',
  },
  en: {
    veilLabel: 'Loading',
    tryAgain: 'Try again',
    openInBrowser: 'Open in browser',
    offlineTitle: 'No connection',
    offlineBody: 'Check your internet and try again.',
    failureTitle: 'Could not open Itera',
    failureBody: 'Try again or open it in the browser.',
    updateTitle: 'Update the app',
    updateBody: 'This version ({current}) is too old for the current Itera. Install version {min} or newer.',
    updateDetail: 'An update is required. Talk to whoever gave you the app.',
    updateButton: 'Update now',
    leaveTitle: 'Leave Itera?',
    leaveBody: 'You go back to your phone’s home screen. Your progress is saved.',
    leaveStay: 'Stay in the app',
    leaveLeave: 'Leave',
    leaveHint: 'Closes the app',
    blocked: 'Not available in the app',
    openFailed: 'Could not open',
    authBusy: 'DFL sign-in in progress',
    authFailed: 'Could not sign in with DFL',
  },
};

/**
 * `en` only when the device's FIRST language is English, `pt` for everything else (another language, an empty list, a malformed tag).
 * Accepts BCP 47 (`en-US`) and the underscore form Android prints (`en_US`); the case does not matter.
 */
export function chromeLocale(deviceLocales: readonly (string | null | undefined)[]): ChromeLocale {
  const first = deviceLocales.find((tag): tag is string => typeof tag === 'string' && tag.trim() !== '');
  if (first === undefined) return 'pt';
  const language = first.trim().split(/[-_]/)[0]?.toLowerCase();
  return language === 'en' ? 'en' : 'pt';
}

let active: ChromeLocale = 'pt';

/** Set once at launch, from `chromeLocale(<what the device reports>)`. */
export function setChromeLocale(locale: ChromeLocale): void {
  active = locale;
}

export const activeChromeLocale = (): ChromeLocale => active;

/** The strings of `locale`, or of the device language the route set. Read at use time, never at import time. */
export const chromeStrings = (locale: ChromeLocale = active): ChromeStrings => CHROME_COPY[locale];

/** Fills `{name}` slots; a slot with no value is left as written. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (slot, name: string) => values[name] ?? slot);
}
