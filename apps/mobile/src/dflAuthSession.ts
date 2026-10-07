/**
 * The decisions around "Entrar com DFL" in an installed build (PLAN ADR-10, row R-20). The route file calls
 * `WebBrowser.openAuthSessionAsync`; everything that decides is here, pure and tested.
 *
 * The URL that comes back carries `#dfl_token=…`, a bearer token: nothing here logs it, stores it or keeps it.
 *
 * Pure TypeScript: no React Native import.
 */
import { DFL_CALLBACK_PATH, dflCallbackUrl, originOf } from './origin';

/**
 * Installed builds use the system auth session. Expo Go (`storeClient`) cannot receive the return link
 * (it cannot claim `https://app.iterahq.dev`), so it keeps the in-WebView handoff of `DEV_TOP_FRAME_ORIGINS`.
 */
export const authSessionEnabled = (executionEnvironment: string | null | undefined): boolean => executionEnvironment !== 'storeClient';

/** The result of `openAuthSessionAsync`, reduced to what is read: the type and, on success, the returned URL. */
export interface AuthSessionResult {
  type: string;
  url?: unknown;
}

/**
 * The URL the WebView loads after the session, or null. Only a `success` whose URL is https, on EXACTLY the app
 * origin (no userinfo, no other host, port or trailing dot), path EXACTLY `/auth/dfl/callback`. The URL is
 * returned unchanged, fragment included; cancel, dismiss, a locked session or anything else is dropped.
 */
export function acceptAuthSessionReturn(result: AuthSessionResult, appOrigin: string): string | null {
  if (result.type !== 'success' || typeof result.url !== 'string') return null;
  const url = result.url;
  const callback = dflCallbackUrl(appOrigin);
  if (callback === null || url !== url.trim() || !/^https:\/\//i.test(url) || originOf(url) !== originOf(appOrigin)) return null;
  const rest = url.slice(url.indexOf('//') + 2).replace(/^[^/?#]*/, '');
  const path = /^[^?#]*/.exec(rest)?.[0] ?? '';
  return path === DFL_CALLBACK_PATH ? url : null;
}

/** An open session older than this is taken as dead (Android: the promise settles only when the app returns to `active`). */
export const SESSION_STALE_MS = 120_000;
/** Shown for a tap refused while a session is genuinely open. */
export const AUTH_BUSY_NOTICE = 'Login com DFL em andamento';
/** Shown when the system auth sheet could not open or failed (a cancel is not a failure). */
export const AUTH_FAILED_NOTICE = 'Não foi possível entrar com DFL';

export interface SessionGuard {
  /** A ticket when the session may open, null when one is genuinely open (a tap refused). A session older than `staleMs` is released first. */
  tryEnter: () => number | null;
  /** Releases the session of `ticket`; false (nothing released) when a newer session has taken over. */
  leave: (ticket: number) => boolean;
}

/** One auth session at a time: a second tap while one is open does nothing, and a session that never settled cannot block taps forever. */
export function createSessionGuard(now: () => number = Date.now, staleMs = SESSION_STALE_MS): SessionGuard {
  let current: { ticket: number; at: number } | null = null;
  let last = 0;
  return {
    tryEnter: () => {
      if (current !== null && now() - current.at <= staleMs) return null;
      last += 1;
      current = { ticket: last, at: now() };
      return last;
    },
    leave: (ticket) => {
      if (current === null || current.ticket !== ticket) return false;
      current = null;
      return true;
    },
  };
}

export type ReturnSource = 'router' | 'session';

export interface ReturnLatch {
  /** A session opens: the marker of an earlier one is dropped. */
  begin: () => void;
  /** The session is over: a marker left by the router is dropped; one left by the session waits for the router's copy (up to the TTL). */
  end: () => void;
  /**
   * The return link reached the shell from `source`; the caller has already checked that it is the callback URL
   * (`acceptAuthSessionReturn`). On Android it arrives twice, in either order: Expo Router receives the App Link and
   * `openAuthSessionAsync` resolves from the same `Linking` event. The two copies are NOT compared (the router decodes its
   * copy, so they differ as strings): during a session, or within the marker window after the session loaded it, a callback
   * arrival from the other source is the same return. The first arrival answers `load`; the second answers `duplicate` and
   * consumes the marker. A callback arrival outside a session (a link opened from outside) is `load` and leaves no marker.
   * The latch never holds the URL or a digest of it.
   */
  arrive: (source: ReturnSource) => 'load' | 'duplicate';
}

export const RETURN_MARKER_TTL_MS = 5000;

/** One-shot, in-memory marker of "the return link was already loaded by `by`". Cleared when consumed, when the session ends (router-set), after `ttlMs`, and when the next session begins. */
export function createReturnLatch(now: () => number, ttlMs = RETURN_MARKER_TTL_MS): ReturnLatch {
  let active = false;
  let marker: { at: number; by: ReturnSource } | null = null;
  return {
    begin: () => {
      active = true;
      marker = null;
    },
    end: () => {
      active = false;
      if (marker?.by === 'router') marker = null;
    },
    arrive: (source) => {
      if (marker !== null && now() - marker.at > ttlMs) marker = null;
      if (marker !== null && marker.by !== source) {
        marker = null;
        return 'duplicate';
      }
      if (source === 'router' && !active && marker === null) return 'load';
      marker = { at: now(), by: source };
      return 'load';
    },
  };
}
