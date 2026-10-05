import { describe, expect, it } from 'vitest';
import { ENVELOPE_TAG, MAX_MESSAGE_BYTES, encode, parseEnvelope, type Envelope } from './protocol';
import { createShellRouter, deliveryScript } from './shell';
import { ORIGIN, PAGE } from './wire.testkit';

const router = () =>
  createShellRouter({ origin: ORIGIN, shellVersion: '0.2.0', handlers: { 'shell.version': () => ({ shellVersion: '0.2.0', protocol: 1 }) }, newSession: () => 'sess-1' });

const hello = (id: string): string =>
  encode({ tag: ENVELOPE_TAG, v: 1, kind: 'hello', id, payload: { webVersion: 't', protocols: [1] } } as Envelope);
const call = (id: string, method: string, payload: unknown = {}, session = 'sess-1'): string =>
  encode({ tag: ENVELOPE_TAG, v: 1, kind: 'call', id, session, method, payload } as Envelope);

async function shaken() {
  const r = router();
  await r.receive(hello('wAAAAAAAA1'), PAGE);
  return r;
}

describe('the shell router: one handshake, one capability', () => {
  it('answers a hello with the session, the shell version and exactly the registered capabilities', async () => {
    const out = await router().receive(hello('wAAAAAAAA1'), PAGE);
    expect(out.refused).toBeNull();
    const reply = parseEnvelope(out.reply);
    expect(reply).toMatchObject({ ok: true, envelope: { kind: 'result', payload: { protocol: 1, session: 'sess-1', shellVersion: '0.2.0', capabilities: ['shell.version'] } } });
  });

  it('shell.version round-trips after the handshake', async () => {
    const out = await (await shaken()).receive(call('wBBBBBBBB1', 'shell.version'), PAGE);
    expect(parseEnvelope(out.reply)).toMatchObject({ ok: true, envelope: { kind: 'result', payload: { shellVersion: '0.2.0', protocol: 1 } } });
  });

  it.each([
    ['auth.session', { signedOut: true }],
    ['link.open', { url: 'https://example.com' }],
    ['haptics', { style: 'light' }],
    ['keepAwake', { on: true }],
    ['file.save', { url: 'https://example.com/a', filename: 'a.pdf' }],
  ])('%s is a method of the protocol that this shell does not offer: capability_absent', async (method, payload) => {
    const out = await (await shaken()).receive(call('wCCCCCCCC1', method, payload), PAGE);
    expect(out.refused).toBe('capability_absent');
  });
});

describe('the shell router refuses', () => {
  it.each([
    ['another origin', 'https://evil.example/lesson/1'],
    ['a look-alike host', 'https://app.iterahq.dev.evil.example/'],
    ['another port', 'https://app.iterahq.dev:8443/'],
    ['plain http', 'http://app.iterahq.dev/'],
    ['file://', 'file:///a.html'],
    ['about:blank', 'about:blank'],
    ['a missing URL', undefined],
  ])('a frame on %s, with no reply at all', async (_what, url) => {
    const out = await router().receive(hello('wAAAAAAAA1'), url);
    expect(out.reply).toBeNull();
    expect(['foreign_origin', 'opaque_origin']).toContain(out.refused);
  });

  it('an oversized message before parsing it', async () => {
    const out = await router().receive(`{"tag":"${ENVELOPE_TAG}","pad":"${'x'.repeat(MAX_MESSAGE_BYTES)}"}`, PAGE);
    expect(out.refused).toBe('oversized');
  });

  it.each([
    ['a non-string', { tag: ENVELOPE_TAG }, 'malformed'],
    ['not JSON', '{nope', 'malformed'],
    ['a foreign tag', '{"tag":"other","v":1}', 'malformed'],
    ['an unsupported version', JSON.stringify({ tag: ENVELOPE_TAG, v: 9, kind: 'hello', id: 'wAAAAAAAA1', payload: { webVersion: 't', protocols: [9] } }), 'version_mismatch'],
    ['a forged id', hello('not-a-web-id'), 'bad_id'],
    ['a result from the web', JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: 'wAAAAAAAA1', payload: {} }), 'malformed'],
    ['an ask from the web', JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'ask', id: 'wAAAAAAAA1', session: 's', method: 'auth.session', payload: {} }), 'malformed'],
  ])('%s', async (_what, raw, reason) => {
    expect((await router().receive(raw, PAGE)).refused).toBe(reason);
  });

  it('a replayed id', async () => {
    const r = router();
    await r.receive(hello('wAAAAAAAA1'), PAGE);
    expect((await r.receive(hello('wAAAAAAAA1'), PAGE)).refused).toBe('replayed_id');
  });

  it('a call before the handshake, and after reset()', async () => {
    const r = router();
    expect((await r.receive(call('wBBBBBBBB1', 'shell.version'), PAGE)).refused).toBe('no_handshake');
    await r.receive(hello('wAAAAAAAA1'), PAGE);
    r.reset();
    expect((await r.receive(call('wBBBBBBBB2', 'shell.version'), PAGE)).refused).toBe('no_handshake');
  });

  it('a call with another session, an unknown method and an unknown field', async () => {
    const r = await shaken();
    expect((await r.receive(call('wBBBBBBBB1', 'shell.version', {}, 'other'), PAGE)).refused).toBe('bad_session');
    expect((await r.receive(call('wBBBBBBBB2', 'nav.push', {}), PAGE)).refused).toBe('unknown_method');
    expect((await r.receive(call('wBBBBBBBB3', 'shell.version', { extra: 1 }), PAGE)).refused).toBe('bad_payload');
  });

  it('a handler that throws, with a JWT redacted from the detail', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnbmF0dXJl';
    const r = createShellRouter({ origin: ORIGIN, shellVersion: '0.2.0', handlers: { 'shell.version': () => { throw new Error(`boom ${jwt}`); } }, newSession: () => 'sess-1' });
    await r.receive(hello('wAAAAAAAA1'), PAGE);
    const out = await r.receive(call('wBBBBBBBB1', 'shell.version'), PAGE);
    expect(out.refused).toBe('handler_failed');
    expect(out.reply).not.toContain(jwt);
  });
});

describe('deliveryScript', () => {
  it('posts to the configured origin only, with the reply as a JSON string literal', () => {
    const script = deliveryScript('{"a":"</script>"}', ORIGIN);
    expect(script).toContain(`,${JSON.stringify(ORIGIN)})`);
    expect(script.endsWith('true;')).toBe(true);
  });
});
