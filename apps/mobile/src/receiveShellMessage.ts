/**
 * What the shell does with one WebView message (PLAN ADR-5, ADR-8 rule 1c, R-12): one pure function that
 * decides, and `app/[...path].tsx` only performs the effect of the answer. The order is the contract:
 *
 *  1. The origin and size gate (`messageSize`): a frame off the app origin, or a non-string, stops here,
 *     unparsed and counted nowhere, so it can never use up a window of the page.
 *  2. The raw window (`admitRaw`): bounds what is parsed at all.
 *  3. The console shape, in development only (`readConsoleShape`); in production it is not even read.
 *  4. The bridge envelope (`readBridgeEnvelope`), only when the console shape did not match.
 *  5. The page budget (`admitMessage`), charged only for what a parser accepted.
 *
 * The frame origin is proved once, in step 1. The two readers are then given the checked URL and origin and
 * do not repeat it (the check inside `parseEnvelope`, in the pinned bridge copy, is unchanged).
 *
 * Every answer carries the next buckets; the caller stores them whatever the kind.
 *
 * Pure TypeScript: no React Native import.
 */
import { readBridgeEnvelope, type BridgeMessage } from './bridgeMessage';
import { readConsoleShape, type ConsoleMessage } from './consoleMessage';
import { admitMessage, admitRaw, messageSize, type MessageBucket, type RawBucket } from './messageWindow';
import { originOf } from './origin';

export interface ShellMessageInput {
  /** The `nativeEvent` of the WebView message: `data` (the posted string) and `url` (the frame that posted it). */
  event: { data: unknown; url: unknown };
  /** The next buckets are computed from these; they are not changed. */
  raw: RawBucket;
  page: MessageBucket;
  origin: string;
  platform: string;
  /** Development build: the only place the console shape is read. */
  dev: boolean;
  now: number;
}

export type ShellMessageAnswer =
  | { kind: 'drop'; raw: RawBucket; page: MessageBucket }
  | { kind: 'console'; message: ConsoleMessage; raw: RawBucket; page: MessageBucket }
  | { kind: 'bridge'; message: BridgeMessage; raw: RawBucket; page: MessageBucket };

export function receiveShellMessage({ event, raw, page, origin, platform, dev, now }: ShellMessageInput): ShellMessageAnswer {
  const appOrigin = originOf(origin);
  const size = appOrigin === null ? null : messageSize(event, appOrigin);
  if (appOrigin === null || size === null) return { kind: 'drop', raw, page };
  const rawWindow = admitRaw(raw, now, size);
  if (!rawWindow.admitted) return { kind: 'drop', raw: rawWindow.bucket, page };
  // `messageSize` proved a string `data` and a string `url` on the app origin.
  const url = event.url as string;
  const consoleMessage = dev ? readConsoleShape(event.data) : null;
  const bridgeMessage = consoleMessage === null ? readBridgeEnvelope(event.data, url, appOrigin, platform) : null;
  if (consoleMessage === null && bridgeMessage === null) return { kind: 'drop', raw: rawWindow.bucket, page };
  const pageWindow = admitMessage(page, now);
  if (!pageWindow.admitted) return { kind: 'drop', raw: rawWindow.bucket, page: pageWindow.bucket };
  if (consoleMessage !== null) return { kind: 'console', message: consoleMessage, raw: rawWindow.bucket, page: pageWindow.bucket };
  return { kind: 'bridge', message: bridgeMessage as BridgeMessage, raw: rawWindow.bucket, page: pageWindow.bucket };
}
