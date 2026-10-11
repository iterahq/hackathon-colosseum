import { createHash, createPrivateKey, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { arweaveUrls, buildDataItem, deepHash, encodeTags } from './arweave';

const SEED = Buffer.alloc(32, 7);
const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]), format: 'der', type: 'pkcs8' });
const PUBLIC_KEY = Uint8Array.from(Buffer.from('ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c', 'hex'));
const signer = async (message: Uint8Array) => new Uint8Array(sign(null, message, key));
const text = (value: string) => new TextEncoder().encode(value);

describe('buildDataItem', () => {
  it('builds the item a bundler accepted: same id, same bytes as the reference implementation', async () => {
    const item = await buildDataItem({
      publicKey: PUBLIC_KEY,
      sign: signer,
      tags: [{ name: 'Content-Type', value: 'application/json' }, { name: 'App-Name', value: 'Itera' }],
      data: text('{"hello":"arweave"}'),
    });
    expect(item.id).toBe('Lzk1vh_w5jrDe1oh_jShqO_ao8VpsPUafHQT3NcyZEE');
    expect(item.bytes.length).toBe(182);
    expect(createHash('sha256').update(item.bytes).digest('hex')).toBe('76f033961ee4028a9ec454b76200a29e53a11868ee2226a05cea30286b2cb78e');
  });

  it('gives the same id for the same file, tags and key, and another for one changed byte', async () => {
    const make = (data: string) => buildDataItem({ publicKey: PUBLIC_KEY, sign: signer, tags: [{ name: 'a', value: 'b' }], data: text(data) });
    expect((await make('x')).id).toBe((await make('x')).id);
    expect((await make('x')).id).not.toBe((await make('y')).id);
  });

  it('builds an item with no tag and no data', async () => {
    const item = await buildDataItem({ publicKey: PUBLIC_KEY, sign: signer, tags: [], data: new Uint8Array() });
    expect(item.id).toBe('L4J7z72Ws21BdwRewFM9Cpb-t1m3qS5e_Ht8onMxL6I');
    expect(item.bytes.length).toBe(116);
  });

  it('lays the item out as signature type, signature, owner, no target, no anchor, tags, data', async () => {
    const item = await buildDataItem({ publicKey: PUBLIC_KEY, sign: signer, tags: [{ name: 'k', value: 'v' }], data: text('data') });
    expect([...item.bytes.subarray(0, 2)]).toEqual([2, 0]);
    expect([...item.bytes.subarray(66, 98)]).toEqual([...PUBLIC_KEY]);
    expect([...item.bytes.subarray(98, 100)]).toEqual([0, 0]);
    expect(new DataView(item.bytes.buffer).getBigUint64(100, true)).toBe(1n);
    expect(new TextDecoder().decode(item.bytes.subarray(item.bytes.length - 4))).toBe('data');
  });

  it('refuses an owner that is not a 32-byte key', async () => {
    await expect(buildDataItem({ publicKey: new Uint8Array(31), sign: signer, tags: [], data: new Uint8Array() })).rejects.toThrow();
  });
});

describe('encodeTags and deepHash', () => {
  it('writes tags as one Avro block and nothing for no tags', () => {
    expect([...encodeTags([{ name: 'ab', value: 'c' }])]).toEqual([2, 4, 97, 98, 2, 99, 0]);
    expect(encodeTags([]).length).toBe(0);
  });

  it('commits to the nesting, not only to the bytes', async () => {
    const flat = await deepHash([text('ab')]);
    const split = await deepHash([text('a'), text('b')]);
    expect(flat.length).toBe(48);
    expect(Buffer.from(flat).equals(Buffer.from(split))).toBe(false);
  });

  it('names both gateways for an id', () => {
    expect(arweaveUrls('abc')).toEqual(['https://turbo-gateway.com/abc', 'https://arweave.net/abc']);
  });
});
