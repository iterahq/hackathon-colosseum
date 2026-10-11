import { describe, expect, it } from 'vitest';
import { base58Decode } from '@/services/walletEncoding';
import { CORE_PROGRAM, checkClaim, evidenceFacts, findAttribute, parseCoreAsset, sha256Hex } from '@/lib/chainClaims';

const WALLET = 'CHJBdsVLj3ZUJSRWc2EkxXFfG2nU98dUx5Gam94kGfya';
const OTHER = '11111111111111111111111111111111';
const enc = new TextEncoder();

function borsh(s: string): number[] {
  const b = [...enc.encode(s)];
  return [b.length & 255, (b.length >> 8) & 255, 0, 0, ...b];
}

function asset(owner: string, pairs: [string, string][]): Uint8Array {
  const body = pairs.flatMap(([k, v]) => [...borsh(k), ...borsh(v)]);
  return Uint8Array.from([1, ...base58Decode(owner), 0, 0, 0, ...body, 4, 2, 0, 0, 0]);
}

const HASH = '2acb55a6bc0e259fe9eada8764a80aa4a5199349c675177e5ca6dcbb1a2cc21a';
const account = (data: Uint8Array, owner = CORE_PROGRAM) => ({ owner, data });

describe('findAttribute', () => {
  it('reads the borsh value that follows the key', () => {
    expect(findAttribute(asset(WALLET, [['claim:html-tags', '2acb55a6bc0e259f']]), 'claim:html-tags')).toBe('2acb55a6bc0e259f');
  });
  it('is exact: a longer key does not satisfy a shorter one', () => {
    expect(findAttribute(asset(WALLET, [['claim:html-tags-2', '2acb55a6bc0e259f']]), 'claim:html-tags')).toBeNull();
  });
  it('rejects a non-hex value and a truncated one', () => {
    expect(findAttribute(asset(WALLET, [['claim:a', 'not hex!']]), 'claim:a')).toBeNull();
    expect(findAttribute(Uint8Array.from([...borsh('claim:a'), 16, 0, 0, 0, 50]), 'claim:a')).toBeNull();
  });
});

describe('parseCoreAsset and checkClaim', () => {
  const data = asset(WALLET, [['claim:html-tags', '2acb55a6bc0e259f'], ['claim:css-rules', 'ffffffffffffffff']]);

  it('verifies a claim whose chain value prefixes the evidence hash', () => {
    const read = parseCoreAsset(account(data), WALLET, ['claim:html-tags']);
    expect(read).toEqual({ status: 'ok', claims: { 'claim:html-tags': '2acb55a6bc0e259f' } });
    expect(checkClaim(read, 'claim:html-tags', HASH)).toBe('verified');
  });
  it('flags a prefix mismatch', () => {
    const read = parseCoreAsset(account(data), WALLET, ['claim:css-rules']);
    expect(checkClaim(read, 'claim:css-rules', HASH)).toBe('mismatch');
  });
  it('flags a claim that is not on the asset', () => {
    const read = parseCoreAsset(account(data), WALLET, ['claim:js-app']);
    expect(checkClaim(read, 'claim:js-app', HASH)).toBe('not-found');
  });
  it('refuses an asset owned by another wallet', () => {
    const read = parseCoreAsset(account(data), OTHER, ['claim:html-tags']);
    expect(read.status).toBe('wrong-owner');
    expect(checkClaim(read, 'claim:html-tags', HASH)).toBe('wrong-owner');
  });
  it('refuses an account of another program and a missing account', () => {
    expect(checkClaim(parseCoreAsset(account(data, 'SomeOtherProgram1111111111111111111111111111'), WALLET, []), 'claim:html-tags', HASH)).toBe('wrong-program');
    expect(checkClaim(parseCoreAsset(null, WALLET, []), 'claim:html-tags', HASH)).toBe('asset-missing');
    expect(checkClaim(undefined, 'claim:html-tags', HASH)).toBe('asset-missing');
  });
  it('refuses data too short to hold an owner', () => {
    expect(parseCoreAsset(account(Uint8Array.from([1, 2, 3])), WALLET, []).status).toBe('wrong-owner');
  });
});

describe('evidence helpers', () => {
  it('hashes like SHA-256 hex', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('reads the completion date and activity count, and tolerates garbage', () => {
    expect(evidenceFacts('{"completed_at":"2026-10-11T00:00:00Z","activities":[["a","t"],["b","t"]]}')).toMatchObject({ completedAt: '2026-10-11T00:00:00Z', activityCount: 2 });
    expect(evidenceFacts('nope')).toBeNull();
  });
});

describe('evidenceFacts', () => {
  it('reads a version 1 document', () => {
    expect(evidenceFacts(JSON.stringify({ v: 1, completed_at: '2026-10-11T03:00:00.000Z', activities: [['a', 't'], ['b', 't']] }))).toEqual({ version: 1, completedAt: '2026-10-11T03:00:00.000Z', activityCount: 2, serverVerified: null, answerHashes: 0 });
  });

  it('reads the graded share and the answer hashes of a version 2 document', () => {
    const facts = evidenceFacts(JSON.stringify({ v: 2, verified: '10/12', completed_at: 'x', activities: [['a', 't', 'h1'], ['b', 't', null], ['c', 't', 'h3']] }));
    expect(facts).toMatchObject({ version: 2, serverVerified: '10/12', answerHashes: 2, activityCount: 3 });
    expect(evidenceFacts(JSON.stringify({ v: 2, verified: '<b>all</b>', activities: [] }))?.serverVerified).toBeNull();
    expect(evidenceFacts('not json')).toBeNull();
  });
});
