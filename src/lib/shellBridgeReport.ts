import { BridgeRefusal, isMethod } from '@iterahq/shell-bridge';

/** The operational event the page emits when the mobile shell refuses a bridge call. */
export const BRIDGE_REFUSAL_EVENT = 'shell_bridge_refusal';

/** The part of the page that is not a method of the protocol: a message that came in, or the handshake. */
export type ReportScope = 'incoming' | 'hello';

/**
 * The only free text the shell puts in a refusal that may leave the page: the NAME of the claim that
 * `tokenShapeProblem` (apps/mobile/src/nativeSession.ts) found wrong, in the shell's own wording
 * `bad payload: <name>`. Every other detail can quote a payload fragment, a URL or an origin: dropped.
 */
export const CLAIM_NAMES = ['accessToken', 'sub', 'aud', 'iss', 'guest'] as const;
const CLAIM_DETAIL = new RegExp(`^bad payload: (${CLAIM_NAMES.join('|')})$`);

export function claimOf(detail: unknown): string | undefined {
  if (typeof detail !== 'string') return undefined;
  return CLAIM_DETAIL.exec(detail)?.[1];
}

/**
 * A call the page itself gave up on because it started the handshake over (`renewable().renew()`).
 * It is local, not a refusal of the shell: the reporter skips it.
 */
export class BridgeSuperseded extends Error {
  readonly reason = 'superseded';
  constructor() {
    super('superseded');
    this.name = 'BridgeSuperseded';
  }
}

/** The default sink loads the telemetry package only when a record is made: it is not part of the first download. */
function trackEventLater(name: string, attributes: Record<string, string>): void {
  void import('@devfellowship/observability').then((m) => m.trackEvent(name, attributes)).catch(() => undefined);
}

export interface BridgeReporterOptions {
  /** Where a record goes. Default: the app's observability event (`trackEvent`). */
  sink?: (name: string, attributes: Record<string, string>) => void;
  /** True only when the page runs inside the shell (surface `shell`). Anywhere else nothing is recorded. */
  active: () => boolean;
}

export interface BridgeReporter {
  /** Records `(method, reason)` once for the life of the page. `detail` is reduced to an allow-listed claim name or dropped. */
  refusal(method: string, reason: string, detail?: string): void;
  /** Same, for a rejected call: a `BridgeRefusal` keeps its reason, any other error is `unexpected` (its message is never read). */
  failure(method: string, error: unknown): void;
}

/**
 * Records a bridge refusal or error ONCE per (method, reason, claim) for the life of the page (the SPA
 * never reloads, so this is presence, not frequency). The record carries
 * the method, the reason code and, for the shell's own claim check, the name of the failing claim:
 * never a token, a URL or the refusal's free text. Never throws: reporting must not break the page.
 */
export function createBridgeReporter(options: BridgeReporterOptions): BridgeReporter {
  const sink = options.sink ?? trackEventLater;
  const seen = new Set<string>();
  const refusal = (method: string, reason: string, detail?: string): void => {
    try {
      if (!options.active()) return;
      const claim = claimOf(detail);
      const key = `${method}|${reason}|${claim ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      const record: Record<string, string> = { method, reason };
      if (claim) record.claim = claim;
      sink(BRIDGE_REFUSAL_EVENT, record);
    } catch {
      // reporting must never break the page
    }
  };
  return {
    refusal: (method, reason, detail) => refusal(safeMethod(method), reason, detail),
    failure(method, error) {
      if (error instanceof BridgeSuperseded || (error as { name?: unknown } | null)?.name === 'BridgeSuperseded') return;
      if (error instanceof BridgeRefusal) refusal(safeMethod(method), error.reason, error.detail);
      else refusal(safeMethod(method), 'unexpected');
    },
  };
}

/** A method name is ours or `other`: a refused call to an unknown method must not put its argument in a record. */
function safeMethod(method: string): string {
  return method === 'incoming' || method === 'hello' || isMethod(method) ? method : 'other';
}
