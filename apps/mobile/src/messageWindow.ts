/**
 * The two windows in front of the page's messages (PLAN ADR-5, R-12), and the size gate that opens them.
 * Both windows are pure and in one style: they take a bucket and return the next one, and the caller
 * stores it (`receiveShellMessage.ts` returns both).
 *
 * - The raw window (`admitRaw`) bounds what reaches `JSON.parse` at all: count and characters per second.
 * - The page window (`admitMessage`) is the page's budget and counts only what a parser accepted.
 *
 * Pure TypeScript: no React Native import.
 */
import { originOf } from './origin';

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

/**
 * The length of a message from a frame the WebView reports on the app origin, or null for any other
 * frame or a non-string. No parse: it is what `receiveShellMessage` reads BEFORE either parser, so that a frame
 * of another origin costs nothing and is counted nowhere, and a frame that passes the origin gate is
 * counted (`admitRaw`) before any JSON of it is parsed.
 */
export function messageSize(event: { data: unknown; url: unknown }, origin: string): number | null {
  const appOrigin = originOf(origin);
  if (appOrigin === null || typeof event.url !== 'string' || originOf(event.url) !== appOrigin) return null;
  return typeof event.data === 'string' ? event.data.length : null;
}

export const MAX_RAW_MESSAGES_PER_SECOND = 40;
export const MAX_RAW_CHARS_PER_SECOND = 256 * 1024;

export interface RawBucket {
  start: number;
  count: number;
  chars: number;
}

/**
 * The window in front of the parsers: at most `MAX_RAW_MESSAGES_PER_SECOND` messages and
 * `MAX_RAW_CHARS_PER_SECOND` characters per second reach `JSON.parse`. Generous on purpose: the budget of
 * the page is `admitMessage`, which counts only what a parser accepted, so garbage cannot use it up.
 * This one bounds the parsing itself, for a WebView that reports every frame as the page (Android without
 * `WebMessageListener`). It returns the next bucket; the input is not changed.
 */
export function admitRaw(bucket: RawBucket, now: number, chars: number): { bucket: RawBucket; admitted: boolean } {
  const current = now - bucket.start >= 1000 ? { start: now, count: 0, chars: 0 } : bucket;
  if (current.count >= MAX_RAW_MESSAGES_PER_SECOND || current.chars + chars > MAX_RAW_CHARS_PER_SECOND) return { bucket: current, admitted: false };
  return { bucket: { start: current.start, count: current.count + 1, chars: current.chars + chars }, admitted: true };
}
