/**
 * How the shell opens a page outside the WebView, as pure decisions (the route and the cards perform the calls).
 *
 * "Abrir no navegador" (the failure card) opens the app's own page. On Android an installed build is the verified handler of
 * `https://app.iterahq.dev` links (`intentFilters` with `autoVerify`, `app.json`), so `Linking.openURL` can hand the intent straight
 * back to the app: Android opens a Custom Tab (`WebBrowser.openBrowserAsync`) instead, which is a browser by construction.
 * iOS keeps `Linking.openURL`.
 *
 * A failed open is never silent: `createOpenReporter` shows ONE short `Alert` (`openFailed` of `chromeCopy.ts`, or the notice the caller
 * names), at most one per `NOTICE_GAP_MS` like the blocked-navigation notice. Neither the URL nor the error text is shown or kept.
 *
 * Pure TypeScript: no React Native import.
 */
import { noticeDue } from './shellChromeState';

export type BrowserMethod = 'custom-tab' | 'linking';

/** The way to open the app's page in a browser on `os` (`Platform.OS`). */
export function browserMethod(os: string): BrowserMethod {
  return os === 'android' ? 'custom-tab' : 'linking';
}

/**
 * A public page outside the app, opened from a native screen (the legal and help rows of the profile). It goes
 * through the ONE opener of the shell: the route file that owns the reporter and the platform modules provides
 * it (`provideExternalOpener`), with the same method per platform and the same failure notice as "Abrir no
 * navegador". Https only. Before a route provided it there is no way out, and nothing happens.
 */
let externalOpener: ((url: string) => void) | null = null;

export function provideExternalOpener(open: (url: string) => void): void {
  externalOpener = open;
}

export function openExternalPage(url: string): void {
  if (url.startsWith('https://')) externalOpener?.(url);
}

export interface OpenReporter {
  /** Run `open`; when it throws or rejects, report `notice` (rate-limited). Never rejects. */
  attempt: (open: () => Promise<unknown>, notice?: string) => Promise<void>;
  /** Report a failure the caller already caught (the auth session), rate-limited. */
  fail: (notice?: string) => void;
}

/** One reporter per surface: its own clock for the rate limit. `show` is `Alert.alert`; `now` is `Date.now`. */
export function createOpenReporter(show: (notice: string) => void, now: () => number, defaultNotice: string | (() => string)): OpenReporter {
  let last: number | null = null;
  const fail = (notice: string = typeof defaultNotice === 'function' ? defaultNotice() : defaultNotice) => {
    if (!noticeDue(last, now())) return;
    last = now();
    show(notice);
  };
  return {
    fail,
    attempt: async (open, notice) => {
      try {
        await open();
      } catch {
        fail(notice);
      }
    },
  };
}
