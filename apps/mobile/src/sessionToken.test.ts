import { randomFillSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NATIVE_ID } from '@iterahq/shell-bridge';
import { askIdSource, sessionTokenSource } from './sessionToken';

const fill = (bytes: Uint8Array) => randomFillSync(bytes);

describe('sessionTokenSource', () => {
  it('gives s + 64 hex characters, read from the supplied source only', () => {
    let asked = 0;
    const token = sessionTokenSource((bytes) => {
      asked += bytes.length;
      return bytes.fill(0xab);
    })();
    expect(token).toBe(`s${'ab'.repeat(32)}`);
    expect(asked).toBe(32);
  });

  it('gives a new token on every call', () => {
    const next = sessionTokenSource(fill);
    const seen = new Set(Array.from({ length: 200 }, () => next()));
    expect(seen.size).toBe(200);
    for (const token of seen) expect(token).toMatch(/^s[0-9a-f]{64}$/);
  });

  it('throws when the source writes nothing: no handshake on a constant token', () => {
    expect(() => sessionTokenSource(() => undefined)()).toThrow('no bytes');
  });
});

describe('askIdSource', () => {
  it('gives an id of the form the web client accepts for an ask', () => {
    const id = askIdSource(fill)();
    expect(id).toMatch(/^n[0-9a-f]{32}$/);
    expect(NATIVE_ID.test(id)).toBe(true);
  });
});
