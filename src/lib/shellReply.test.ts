import { describe, expect, it } from 'vitest';
import { encode, refusalEnvelope, ENVELOPE_TAG, MAX_MESSAGE_BYTES } from '@iterahq/shell-bridge';
import { helloIdOf, isNativeReply } from './shellReply';

const ID = 'w0001abcdefgh';
const ids = new Set([ID]);
const hello = JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'hello', id: ID, payload: { webVersion: 'x', protocols: [1] } });
const ack = (id: string) => JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id, payload: { protocol: 1, session: 's', shellVersion: '0.3.0', capabilities: [] } });

describe('helloIdOf', () => {
  it('reads the id of a hello and of nothing else', () => {
    expect(helloIdOf(hello)).toBe(ID);
    expect(helloIdOf(JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'call', id: 'w0002abcdefgh', session: 's', method: 'keepAwake', payload: {} }))).toBeNull();
    expect(helloIdOf('not json')).toBeNull();
  });
});

describe('isNativeReply', () => {
  it.each([
    ['a HelloAck to our hello', ack(ID)],
    ['a malformed ack to our hello', JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: ID, payload: {} })],
    ['a refusal of our hello', encode(refusalEnvelope(ID, 'handler_failed'))],
    ['a version_mismatch refusal of our hello', encode(refusalEnvelope(ID, 'version_mismatch'))],
    ['a reply of another protocol version to our hello', JSON.stringify({ tag: ENVELOPE_TAG, v: 99, kind: 'result', id: ID, payload: {} })],
    ['a refusal that could not name the id', encode(refusalEnvelope(null, 'malformed'))],
  ])('%s is a reply', (_what, data) => {
    expect(isNativeReply(data, ids)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["the page's own hello, echoed", hello],
    ['the hello wrapped by a host app', JSON.stringify({ type: 'x', data: hello })],
    ['a wrapper that carries the tag at top level but no kind', JSON.stringify({ tag: ENVELOPE_TAG, data: hello })],
    ['a tagged string that is not JSON', `${ENVELOPE_TAG} ready`],
    ['truncated JSON with the tag', `{"tag":"${ENVELOPE_TAG}"`],
    ['a result with an id this page never sent', ack('w0009zzzzzzzz')],
    ['a refusal with an id this page never sent', encode(refusalEnvelope('w0009zzzzzzzz', 'handler_failed'))],
    ['an id-less result', JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'result', id: null, payload: {} })],
    ['an id-less refusal with an unknown reason', JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'refusal', id: null, reason: 'whatever' })],
    ['a call', JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'call', id: ID, session: 's', method: 'keepAwake', payload: {} })],
    ['an ask', JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'ask', id: 'n0001abcdefgh', session: 's', method: 'auth.session', payload: { forceRefresh: false } })],
    ['another tag', JSON.stringify({ tag: 'other-bridge', v: 1, kind: 'result', id: ID, payload: {} })],
    ['an array', JSON.stringify([{ tag: ENVELOPE_TAG, kind: 'result', id: ID }])],
    ['an object, not a string', { tag: ENVELOPE_TAG, kind: 'result', id: ID }],
    ['a reply above the size cap', ack(ID).replace('"s"', `"${'s'.repeat(MAX_MESSAGE_BYTES)}"`)],
  ])('%s is not a reply', (_what, data) => {
    expect(isNativeReply(data, ids)).toBe(false);
  });
});
