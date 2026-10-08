/**
 * What the shell gives a universal screen (`packages/screens`): the adapters of its ports.
 * The web's are in `src/lib/universalScreenHost.ts`. Pure TypeScript: no React, no React Native.
 */
import { router } from 'expo-router';
import { legalHelpLinks, translatorOf, type LogPort, type Messages, type NavigationIntent, type Translate } from '@iterahq/shell-core';
import { createCatalogHost } from './catalogHost';
import { createHomeHost } from './homeHost';
import { nativeBackend } from './nativeBackend';
import { openExternalPage } from './openExternal';
import { createProfileHost } from './profileHost';
import { isNativeScreen } from './routes';

/** The shell's UI is pt-BR; it has no locale switch. */
export const translate = (messages: { readonly pt: Messages }): Translate => translatorOf(messages.pt);

/** Reaches the Metro log in development (and the console forwarder's reader); a release build drops it. */
export const shellLog: LogPort = {
  error: (message, detail) => console.error(message, detail),
};

/** Home is the WebView route: replace, so "back" does not return to the screen that sent the learner away. */
export const HOME: NavigationIntent = { href: '/', go: () => router.replace('/') };

/** A native host is open in development, and in a release build once its row of the route map is `native`. */
const hostOpen = (screen: string): boolean => __DEV__ || isNativeScreen(screen);

/**
 * The native host of `/catalog`, over the strings the route file reads from the screen (a helper of the
 * shell imports no screen). A course opens in the WebView: `/program/:slug` is a page of the web.
 */
const openProgram = (slug: string) => router.push(`/program/${encodeURIComponent(slug)}`);

export const catalogHost = (t: Translate) => createCatalogHost({ backend: nativeBackend, t, locale: 'pt', enabled: hostOpen('catalog'), openProgram });

/** The native host of `/`. The catalog opens on its own path: the WebView's page until that row is native too. */
export const homeHost = (t: Translate) =>
  createHomeHost({ backend: nativeBackend, t, locale: 'pt', enabled: hostOpen('home'), openProgram, openCatalog: () => router.push('/catalog') });

/** The native host of `/profile`. */
export const profileHost = () => createProfileHost({ backend: nativeBackend, enabled: hostOpen('profile') });

/** Privacy, terms and support: pages outside the app, opened by the shell's one opener (`openExternal.ts`). */
export const LEGAL_HELP = legalHelpLinks(openExternalPage);
