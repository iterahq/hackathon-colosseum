import { nativeSideReplied, onNativeReply, startShellBridge } from './shellBridge';

/**
 * Where this page runs, decided by evidence from the bridge (PLAN ADR-4, ADR-9; row W-7):
 *   - `web`     a browser tab. With no shell channel the client settles at `no_shell` inside
 *               `handshake()`, so the very first read answers `web`: no listener, no timer.
 *   - `pending` a channel exists and the native side has said nothing yet.
 *   - `shell`   the native side replied to our `hello` (`isNativeReply` in `shellReply.ts`): a
 *               parsed envelope of kind `result` or `refusal` with the hello's id — a `HelloAck`,
 *               a refusal, another protocol version, a malformed ack. Sticky. An echo of the
 *               page's own `hello`, or a string that only contains the tag, is not a reply.
 * Only SILENCE settles `web` when a channel exists: `hello` is sent twice (at 0 and at
 * `HELLO_RESEND_MS`), and after `SURFACE_WINDOW_MS` without a word the page is taken for a
 * third-party in-app browser that merely carries the same global. A late answer still wins.
 */
export type ShellSurface = 'pending' | 'web' | 'shell';

export const SURFACE_WINDOW_MS = 1500;

let noChannel = false;
let silent = false;
let armed = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of [...listeners]) fn();
}

function arm(): void {
  if (armed) return;
  armed = true;
  onNativeReply(notify);
  setTimeout(() => {
    if (nativeSideReplied()) return;
    silent = true;
    notify();
  }, SURFACE_WINDOW_MS);
}

export function readShellSurface(): ShellSurface {
  if (noChannel) return 'web';
  if (nativeSideReplied()) return 'shell';
  const client = startShellBridge();
  const mode = client ? client.mode() : null;
  if (!mode || (mode.kind === 'web' && (mode.reason === 'no_shell' || mode.reason === 'opaque_origin'))) {
    noChannel = true;
    return 'web';
  }
  if (mode.kind === 'shell') return 'shell';
  arm();
  return silent ? 'web' : 'pending';
}

const noop = () => undefined;

/** Notifies when the surface changes. In a browser tab it subscribes to nothing. */
export function subscribeShellSurface(onChange: () => void): () => void {
  const now = readShellSurface();
  if (noChannel || now === 'shell') return noop;
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
