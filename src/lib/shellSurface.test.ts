// @vitest-environment-options { "url": "https://app.iterahq.test/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShellRouter, encode, refusalEnvelope, ENVELOPE_TAG } from '@iterahq/shell-bridge';

type ShellWindow = Window & { ReactNativeWebView?: { postMessage(raw: string): void } };
type Answer = (raw: string, attempt: number) => Promise<string | null> | string | null;

/** A shell channel on this window. `answer` is the native side: what it sends back for each message, if anything. */
function installChannel(answer: Answer) {
  const sent: string[] = [];
  (window as ShellWindow).ReactNativeWebView = {
    postMessage(raw: string) {
      sent.push(raw);
      void Promise.resolve(answer(raw, sent.length)).then((reply) => {
        if (reply !== null) window.dispatchEvent(new MessageEvent('message', { data: reply, origin: window.location.origin, source: window }));
      });
    },
  };
  return sent;
}

/** The real shell router: `hello` gets a `HelloAck`, a repeated id gets `replayed_id`. */
function realShell(): Answer {
  const origin = window.location.origin;
  const router = createShellRouter({ origin, shellVersion: '0.3.0', handlers: { 'shell.version': () => ({ shellVersion: '0.3.0', protocol: 1 }) } });
  return async (raw) => (await router.receive(raw, `${origin}/login`)).reply;
}

const idOf = (raw: string) => (JSON.parse(raw) as { id: string }).id;
const settle = () => new Promise((r) => setTimeout(r, 10));

describe('shellSurface', () => {
  let load: () => Promise<typeof import('./shellSurface')>;
  beforeEach(() => {
    vi.resetModules();
    load = () => import('./shellSurface');
  });
  afterEach(() => {
    delete (window as ShellWindow).ReactNativeWebView;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('in a browser tab', () => {
    it('is `web` on the very first read, synchronously', async () => {
      const { readShellSurface } = await load();
      expect(readShellSurface()).toBe('web');
    });

    it('listens to nothing, posts nothing, starts no timer and never notifies a subscriber', async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const post = vi.spyOn(window, 'postMessage');
      const timers = vi.spyOn(globalThis, 'setTimeout');
      const { readShellSurface, subscribeShellSurface } = await load();
      const onChange = vi.fn();
      const unsubscribe = subscribeShellSurface(onChange);
      expect(readShellSurface()).toBe('web');
      expect(add).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
      expect(timers).not.toHaveBeenCalled();
      timers.mockRestore();
      await settle();
      expect(onChange).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('is not a user-agent test', async () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148 IteraShell/0.3.0');
      const { readShellSurface } = await load();
      expect(readShellSurface()).toBe('web');
    });
  });

  describe('a channel that answers: any reply proves a shell', () => {
    it.each<[string, Answer, string]>([
      ['HelloAck', (raw, n) => realShellOnce(raw, n), 'shell'],
      ['a refusal of the hello', (raw) => encode(refusalEnvelope(idOf(raw), 'handler_failed')), 'web'],
      ['a version_mismatch refusal', (raw) => encode(refusalEnvelope(idOf(raw), 'version_mismatch')), 'web'],
      ['a reply of another protocol version', (raw) => JSON.stringify({ tag: ENVELOPE_TAG, v: 99, kind: 'result', id: idOf(raw), payload: {} }), 'web'],
      ['a malformed ack', (raw) => JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: idOf(raw), payload: { nope: true } }), 'web'],
      ['a refusal that could not name the id', () => encode(refusalEnvelope(null, 'malformed')), 'pending'],
    ])('%s -> surface `shell` (the client itself settles at `%s`)', async (_what, answer, clientKind) => {
      installChannel(answer);
      const { readShellSurface, subscribeShellSurface } = await load();
      const { startShellBridge } = await import('./shellBridge');
      expect(readShellSurface()).toBe('pending');
      const onChange = vi.fn();
      subscribeShellSurface(onChange);
      await settle();
      expect(readShellSurface()).toBe('shell');
      expect(onChange).toHaveBeenCalledOnce();
      expect(startShellBridge()?.mode().kind).toBe(clientKind);
    });

    it('stays `shell` for the life of the page', async () => {
      installChannel(realShell());
      const { readShellSurface } = await load();
      const { startShellBridge } = await import('./shellBridge');
      readShellSurface();
      await settle();
      startShellBridge()?.dispose();
      delete (window as ShellWindow).ReactNativeWebView;
      expect(readShellSurface()).toBe('shell');
    });

    it('does not notify a subscriber that left before the reply', async () => {
      installChannel(realShell());
      const { subscribeShellSurface } = await load();
      const onChange = vi.fn();
      subscribeShellSurface(onChange)();
      await settle();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('a message of another origin or another window is not a reply', async () => {
      installChannel(() => null);
      const { readShellSurface } = await load();
      expect(readShellSurface()).toBe('pending');
      const ack = JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: 'w0001aaaaaaaa', payload: {} });
      window.dispatchEvent(new MessageEvent('message', { data: ack, origin: 'https://evil.example', source: window }));
      window.dispatchEvent(new MessageEvent('message', { data: ack, origin: window.location.origin, source: null }));
      window.dispatchEvent(new MessageEvent('message', { data: 'DFL_SET_TOKEN', origin: window.location.origin, source: window }));
      await settle();
      expect(readShellSurface()).toBe('pending');
    });
  });

  describe('a channel that sends something back which is not a reply: silence, so `web`', () => {
    const WRONG = 'w0009zzzzzzzz';
    it.each<[string, Answer]>([
      ["the page's own hello, echoed", (raw) => raw],
      ['the hello wrapped by the host app', (raw) => JSON.stringify({ type: 'x', data: raw })],
      ['a tagged string that is not JSON', () => `${ENVELOPE_TAG} ready`],
      ['a result with an id this page never sent', () => JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: WRONG, payload: {} })],
    ])('%s -> `pending` for the window, then `web`', async (_what, answer) => {
      vi.useFakeTimers();
      installChannel(answer);
      const { readShellSurface, subscribeShellSurface, SURFACE_WINDOW_MS } = await load();
      const onChange = vi.fn();
      subscribeShellSurface(onChange);
      await vi.advanceTimersByTimeAsync(SURFACE_WINDOW_MS - 1);
      expect(readShellSurface()).toBe('pending');
      await vi.advanceTimersByTimeAsync(2);
      expect(readShellSurface()).toBe('web');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(readShellSurface()).toBe('web');
      expect(onChange).toHaveBeenCalledOnce();
    });

    it('junk that arrives after the page settled `web` leaves it `web`', async () => {
      vi.useFakeTimers();
      const sent = installChannel(() => null);
      const { readShellSurface, subscribeShellSurface, SURFACE_WINDOW_MS } = await load();
      const onChange = vi.fn();
      subscribeShellSurface(onChange);
      await vi.advanceTimersByTimeAsync(SURFACE_WINDOW_MS + 100);
      expect(readShellSurface()).toBe('web');
      const post = (data: string) => window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source: window }));
      post(sent[0]);
      post(JSON.stringify({ type: 'x', data: sent[0] }));
      post(`${ENVELOPE_TAG} ready`);
      post(JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: WRONG, payload: {} }));
      await vi.advanceTimersByTimeAsync(50);
      expect(readShellSurface()).toBe('web');
      expect(onChange).toHaveBeenCalledOnce();
    });
  });

  describe('the hello is sent twice inside the window', () => {
    it('a first hello that the shell never got is repeated with the same id, and the second one is acked', async () => {
      vi.useFakeTimers();
      const shell = realShell();
      const sent = installChannel((raw, n) => (n === 1 ? null : shell(raw, n)));
      const { readShellSurface } = await load();
      const { HELLO_RESEND_MS, startShellBridge } = await import('./shellBridge');
      expect(readShellSurface()).toBe('pending');
      await vi.advanceTimersByTimeAsync(HELLO_RESEND_MS - 1);
      expect(sent).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(20);
      expect(sent).toHaveLength(2);
      expect(sent[1]).toBe(sent[0]);
      expect(readShellSurface()).toBe('shell');
      expect(startShellBridge()?.mode().kind).toBe('shell');
    });

    it('a shell that took the first hello and lost its ack answers the repeat with a refusal: still `shell`, one session', async () => {
      vi.useFakeTimers();
      const shell = realShell();
      const sent = installChannel(async (raw, n) => {
        const reply = await shell(raw, n);
        return n === 1 ? null : reply;
      });
      const { readShellSurface } = await load();
      const { HELLO_RESEND_MS } = await import('./shellBridge');
      readShellSurface();
      await vi.advanceTimersByTimeAsync(HELLO_RESEND_MS + 20);
      expect(sent).toHaveLength(2);
      expect(readShellSurface()).toBe('shell');
    });

    it('is not repeated once the shell answered', async () => {
      vi.useFakeTimers();
      const sent = installChannel(realShell());
      const { readShellSurface } = await load();
      const { HELLO_RESEND_MS } = await import('./shellBridge');
      readShellSurface();
      await vi.advanceTimersByTimeAsync(HELLO_RESEND_MS * 3);
      expect(sent.filter((raw) => raw.includes('"hello"'))).toHaveLength(1);
    });
  });

  describe('a channel that stays silent (a third-party in-app browser with the same global)', () => {
    it('is `pending` for the window, then `web`, and notifies once', async () => {
      vi.useFakeTimers();
      const sent = installChannel(() => null);
      const { readShellSurface, subscribeShellSurface, SURFACE_WINDOW_MS } = await load();
      const onChange = vi.fn();
      subscribeShellSurface(onChange);
      expect(SURFACE_WINDOW_MS).toBe(1500);
      await vi.advanceTimersByTimeAsync(SURFACE_WINDOW_MS - 1);
      expect(readShellSurface()).toBe('pending');
      expect(sent).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(2);
      expect(readShellSurface()).toBe('web');
      expect(onChange).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(readShellSurface()).toBe('web');
      expect(onChange).toHaveBeenCalledOnce();
    });

    it('a reply that comes after the window still turns the page to `shell`', async () => {
      vi.useFakeTimers();
      let release: (reply: string) => void = () => undefined;
      const sent = installChannel((_raw, n) => (n === 1 ? new Promise<string>((r) => (release = r)) : null));
      const { readShellSurface, subscribeShellSurface, SURFACE_WINDOW_MS } = await load();
      const onChange = vi.fn();
      subscribeShellSurface(onChange);
      await vi.advanceTimersByTimeAsync(SURFACE_WINDOW_MS + 500);
      expect(readShellSurface()).toBe('web');
      release(encode(refusalEnvelope(idOf(sent[0]), 'handler_failed')));
      await vi.advanceTimersByTimeAsync(5);
      expect(readShellSurface()).toBe('shell');
      expect(onChange).toHaveBeenCalledTimes(2);
    });
  });
});

let ackShell: Answer | null = null;
function realShellOnce(raw: string, n: number) {
  if (n === 1) ackShell = realShell();
  return (ackShell as Answer)(raw, n);
}
