import { type BridgeClient, type BridgeClientOptions, type IncomingMessage, createBridgeClient } from './client';
import { type ShellOutcome, type ShellRouter, type ShellRouterOptions, createShellRouter } from './shell';
import { originOf } from './protocol';

export const ORIGIN = 'https://app.iterahq.dev';
export const PAGE = `${ORIGIN}/lesson/42`;

export interface Wired {
  client: BridgeClient;
  router: ShellRouter | null;
  self: object;
  shellOutcomes: ShellOutcome[];
  sent: string[];
  toShell(raw: string, frameUrl?: string): Promise<ShellOutcome>;
  flush(): Promise<void>;
}

export interface WireOptions {
  /** The shell router options; `null` is a shell that answers nothing (the weekend shell, contract 0.1.0). */
  shell?: Partial<ShellRouterOptions> | null;
  client?: Partial<BridgeClientOptions>;
}

/**
 * An in-memory WebView: the web client and the shell router wired as the host wires them.
 * The reply reaches the page as `window.postMessage(reply, configuredOrigin)` does.
 */
export function wire(opts: WireOptions = {}): Wired {
  const self = { name: 'top window' };
  const listeners = new Set<(m: IncomingMessage) => void>();
  const shellOutcomes: ShellOutcome[] = [];
  const sent: string[] = [];
  const inflight: Promise<unknown>[] = [];
  const router =
    opts.shell === null
      ? null
      : createShellRouter({ origin: ORIGIN, shellVersion: '0.2.0', handlers: {}, ...(opts.shell ?? {}) });

  const toShell = async (raw: string, url = PAGE) => {
    if (!router) throw new Error('no shell');
    const out = await router.receive(raw, url);
    shellOutcomes.push(out);
    if (out.reply && originOf(PAGE) === router.origin) for (const l of listeners) l({ data: out.reply, origin: ORIGIN, source: self });
    return out;
  };

  const transport = {
    send(raw: string) {
      sent.push(raw);
      if (router) inflight.push(toShell(raw));
    },
    listen(h: (m: IncomingMessage) => void) {
      listeners.add(h);
      return () => listeners.delete(h);
    },
    self,
  };

  const client = createBridgeClient({ transport, origin: ORIGIN, webVersion: 'test', timeoutMs: 50, ...(opts.client ?? {}) });

  return {
    client,
    router,
    self,
    shellOutcomes,
    sent,
    toShell,
    async flush() {
      for (let i = 0; i < 5; i++) {
        await Promise.all(inflight.splice(0));
        await new Promise((r) => setTimeout(r, 0));
      }
    },
  };
}
