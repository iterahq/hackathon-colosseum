/**
 * What the shell gives a universal screen (`packages/screens`): the adapters of its ports.
 * The web's are in `src/lib/universalScreenHost.ts`. Pure TypeScript: no React, no React Native.
 */
import { router } from 'expo-router';
import { translatorOf, type LogPort, type Messages, type NavigationIntent, type Translate } from '@iterahq/shell-core';

/** The shell's UI is pt-BR; it has no locale switch. */
export const translate = (messages: { readonly pt: Messages }): Translate => translatorOf(messages.pt);

/** Reaches the Metro log in development (and the console forwarder's reader); a release build drops it. */
export const shellLog: LogPort = {
  error: (message, detail) => console.error(message, detail),
};

/** Home is the WebView route: replace, so "back" does not return to the screen that sent the learner away. */
export const HOME: NavigationIntent = { href: '/', go: () => router.replace('/') };
