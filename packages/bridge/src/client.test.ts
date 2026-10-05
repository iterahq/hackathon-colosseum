import { describe, expect, it } from 'vitest';
import { createBridgeClient, type IncomingMessage } from './client';
import { createShellRouter } from './shell';
import { ORIGIN, PAGE } from './wire.testkit';

describe('the handshake timeout (divergence from upstream, see PROVENANCE.md)', () => {
  it('a HelloAck that arrives after the timeout is ignored: the page stays in web mode', async () => {
    const router = createShellRouter({ origin: ORIGIN, shellVersion: '0.1.0', handlers: { 'shell.version': () => ({ shellVersion: '0.1.0', protocol: 1 }) } });
    const listeners = new Set<(m: IncomingMessage) => void>();
    const self = {};
    const sent: string[] = [];
    const client = createBridgeClient({
      transport: { send: (raw) => void sent.push(raw), listen: (h) => (listeners.add(h), () => listeners.delete(h)), self },
      origin: ORIGIN,
      webVersion: 't',
      timeoutMs: 20,
    });
    expect(await client.handshake()).toMatchObject({ kind: 'web', reason: 'timeout' });

    const out = await router.receive(sent[0], PAGE);
    for (const l of listeners) l({ data: out.reply, origin: ORIGIN, source: self });

    expect(client.mode()).toMatchObject({ kind: 'web', reason: 'timeout' });
    expect(client.has('shell.version')).toBe(false);
    await expect(client.call('shell.version', {})).rejects.toBeDefined();
  });
});
