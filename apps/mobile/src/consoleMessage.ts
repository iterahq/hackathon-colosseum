/**
 * The parser of the console forwarder's message (PLAN ADR-5 and ADR-8 rule 1c), the redaction rule, and the builder
 * of the forwarder script. `receiveShellMessage.ts` is the one function that hands a `nativeEvent` to it.
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
// The one-time code of a reset link (`/auth/reset?code=…`): a credential until it is exchanged.
const AUTH_CODE = /([?&#]code=)[^&\s"',}#]+/gi;
// Also a token that something cut short: a header and part of the claims is not a credential, but the claims name the user.
const JWT = /eyJ[\w-]{4,}(?:\.[\w-]*){0,2}/g;

const API_KEY = /(api[_-]?key["']?\s*[:=]\s*["']?)[^&\s"',}#]+/gi;
const OPAQUE_KEY = /sb_(?:publishable|secret)_[\w-]+/g;
const BEARER = /(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * THE redaction rule, in order. `redactSecrets` applies it here, and `buildConsoleForwarder` writes the same
 * list into the forwarder script (source, flags and replacement), so a new secret shape is added once, here.
 */
const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  [SECRET, '$1[redacted]'],
  [AUTH_CODE, '$1[redacted]'],
  [API_KEY, '$1[redacted]'],
  [BEARER, '$1[redacted]'],
  [JWT, '[redacted]'],
  [OPAQUE_KEY, '[redacted]'],
  [EMAIL, '[email]'],
];

export const redactSecrets = (text: string): string => REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);

/** `event` is the `nativeEvent` of the WebView message: `data` (the posted string) and `url` (the frame that posted it). */
export function parseConsoleMessage(event: { data: unknown; url: unknown }, origin: string): ConsoleMessage | null {
  const appOrigin = originOf(origin);
  if (appOrigin === null || typeof event.url !== 'string' || originOf(event.url) !== appOrigin) return null;
  return readConsoleShape(event.data);
}

/**
 * The shape check alone, for a caller that has already proved the frame is on the app origin
 * (`receiveShellMessage`, by `messageSize`). `parseConsoleMessage` is this plus the origin check.
 */
export function readConsoleShape(data: unknown): ConsoleMessage | null {
  if (typeof data !== 'string' || data.length > MAX_MESSAGE_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
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
  const rules = JSON.stringify(REDACTIONS.map(([pattern, replacement]) => [pattern.source, pattern.flags, replacement]));
  return CONSOLE_FORWARDER_SOURCE.replace('__APP_ORIGIN__', () => JSON.stringify(appOrigin)).replace('__REDACTION_RULES__', () => rules);
}
