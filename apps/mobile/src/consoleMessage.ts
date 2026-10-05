/**
 * The single parser of a WebView message (PLAN ADR-5 and ADR-8 rule 1c) and the builder of the
 * forwarder script. Nothing else in the shell reads `nativeEvent`.
 *
 * `parseConsoleMessage` accepts only the forwarder's `{type:'console', level, text}` shape from a
 * frame whose URL is on the app origin; anything else is dropped (returns null). The text is
 * redacted again and cut, so a page that skips the forwarder still cannot push a token or a
 * megabyte into the shell's log.
 *
 * Pure TypeScript: no React Native import.
 */
import { CONSOLE_FORWARDER_SOURCE } from './consoleForwarder.injected';
import { originOf } from './origin';

export type ConsoleLevel = 'error' | 'uncaught' | 'rejection';

export interface ConsoleMessage {
  type: 'console';
  level: ConsoleLevel;
  text: string;
}

export const MAX_MESSAGE_CHARS = 4096;
export const MAX_TEXT_CHARS = 500;

const LEVELS: readonly string[] = ['error', 'uncaught', 'rejection'];
const SECRET = /((?:access|refresh|dfl)_token["']?\s*[:=]\s*["']?)[^&\s"',}#]+/gi;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;

const API_KEY = /(api[_-]?key["']?\s*[:=]\s*["']?)[^&\s"',}#]+/gi;
const OPAQUE_KEY = /sb_(?:publishable|secret)_[\w-]+/g;
const BEARER = /(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

export const redactSecrets = (text: string): string =>
  text
    .replace(SECRET, '$1[redacted]')
    .replace(API_KEY, '$1[redacted]')
    .replace(BEARER, '$1[redacted]')
    .replace(JWT, '[redacted]')
    .replace(OPAQUE_KEY, '[redacted]')
    .replace(EMAIL, '[email]');

/** `event` is the `nativeEvent` of the WebView message: `data` (the posted string) and `url` (the frame that posted it). */
export function parseConsoleMessage(event: { data: unknown; url: unknown }, origin: string): ConsoleMessage | null {
  const appOrigin = originOf(origin);
  if (appOrigin === null || typeof event.url !== 'string' || originOf(event.url) !== appOrigin) return null;
  if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(event.data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { type, level, text } = value as Record<string, unknown>;
  if (type !== 'console' || typeof level !== 'string' || !LEVELS.includes(level) || typeof text !== 'string') return null;
  return { type: 'console', level: level as ConsoleLevel, text: redactSecrets(text).slice(0, MAX_TEXT_CHARS) };
}

/** The forwarder script for one app origin (a JSON string literal, so nothing in the origin can end the literal). */
export function buildConsoleForwarder(origin: string): string {
  const appOrigin = originOf(origin);
  if (appOrigin === null) throw new Error(`console forwarder needs an http(s) origin: ${origin}`);
  return CONSOLE_FORWARDER_SOURCE.replace('__APP_ORIGIN__', () => JSON.stringify(appOrigin));
}

export const MAX_MESSAGES_PER_SECOND = 10;

export interface MessageBucket {
  start: number;
  count: number;
}

/** Native-side limit (a one-second bucket), independent of the page's own: a page that calls the bridge directly still cannot flood the shell. */
export function admitMessage(bucket: MessageBucket, now: number): { bucket: MessageBucket; admitted: boolean } {
  const current = now - bucket.start >= 1000 ? { start: now, count: 0 } : bucket;
  if (current.count >= MAX_MESSAGES_PER_SECOND) return { bucket: current, admitted: false };
  return { bucket: { start: current.start, count: current.count + 1 }, admitted: true };
}
