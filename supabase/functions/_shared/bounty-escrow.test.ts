import { describe, expect, it } from 'vitest';
import { addressOfSeed, escrowSeed } from './bounty-escrow';
import { verifyEd25519 } from './ed25519';
import { base58Decode, base58Encode } from './solana-tx';
import { signerFromSeed } from './treasury';

const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
const ROOT = hex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');

describe('bounty escrow key', () => {
  it('reads the address of an ed25519 seed (RFC 8032 test 1)', async () => {
    expect(await addressOfSeed(ROOT)).toBe(base58Encode(hex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')));
  });

  it('derives one stable key per bounty', async () => {
    const first = await escrowSeed(ROOT, '11111111-1111-4111-8111-111111111111');
    const again = await escrowSeed(ROOT, '11111111-1111-4111-8111-111111111111');
    const other = await escrowSeed(ROOT, '22222222-2222-4222-8222-222222222222');
    expect(first).toHaveLength(32);
    expect(await addressOfSeed(first)).toBe(await addressOfSeed(again));
    expect(await addressOfSeed(first)).not.toBe(await addressOfSeed(other));
    expect(await addressOfSeed(first)).not.toBe(await addressOfSeed(ROOT));
  });

  it('depends on the root seed', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const otherRoot = Uint8Array.from(ROOT, (byte, index) => (index === 0 ? byte ^ 1 : byte));
    expect(await addressOfSeed(await escrowSeed(ROOT, id))).not.toBe(await addressOfSeed(await escrowSeed(otherRoot, id)));
  });

  it('signs as the address it reports', async () => {
    const seed = await escrowSeed(ROOT, '11111111-1111-4111-8111-111111111111');
    const address = await addressOfSeed(seed);
    const signer = await signerFromSeed(seed, address);
    const message = new TextEncoder().encode('drain');
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', signer.key, message));
    expect(await verifyEd25519(base58Decode(address, 32) as Uint8Array, signature, message)).toBe(true);
  });
});
