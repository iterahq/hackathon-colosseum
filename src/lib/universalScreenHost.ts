/**
 * What the web gives a universal screen (`packages/screens`): the adapters of its ports.
 * Imported only by the lazy route hosts.
 */
import type { LogPort, NavigationIntent } from '@iterahq/shell-core';

/** The browser console: monitoring and the e2e suite read the 404 line there. */
export const consoleLog: LogPort = {
  error: (message, detail) => console.error(message, detail),
};

/** A plain link to the home route: the browser follows the anchor, as on the page this replaced. */
export const HOME: NavigationIntent = { href: '/' };
