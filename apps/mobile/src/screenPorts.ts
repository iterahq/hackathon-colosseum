/**
 * What the shell gives a universal screen (`packages/screens`): the adapters of its ports.
 * The web's are in `src/lib/universalScreenHost.ts`. Pure TypeScript: no React, no React Native.
 */
import { router } from 'expo-router';
import { translatorOf, type LogPort, type Messages, type NavigationIntent, type Translate } from '@iterahq/shell-core';
import { createCatalogHost } from './catalogHost';
import { nativeBackend } from './nativeBackend';
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
export const catalogHost = (t: Translate) =>
  createCatalogHost({
    backend: nativeBackend,
    t,
    locale: 'pt',
    enabled: hostOpen('catalog'),
    openProgram: (slug) => router.push(`/program/${encodeURIComponent(slug)}`),
  });
