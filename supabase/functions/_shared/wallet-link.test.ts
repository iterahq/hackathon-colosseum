import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signatureCandidates, verifyEd25519, verifyWalletSignature } from './ed25519';
import { base58Encode, base64Decode, base64Encode } from './solana-tx';
import { CHALLENGE_TTL_MS, buildLinkMessage, challengeVerdict, newNonce, pickWallet } from './wallet-link';

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  return { privateKey, raw, address: base58Encode(raw) };
}

const utf8 = (text: string) => new TextEncoder().encode(text);
const signText = (text: string, signer: ReturnType<typeof wallet>) => new Uint8Array(sign(null, utf8(text), signer.privateKey));

const USER = '3f2a9c1e-7b64-4d0a-9e51-1c2d3e4f5a6b';
const issuedAt = new Date('2026-10-10T12:00:00.000Z');
const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);

describe('pickWallet', () => {
  it('keeps the sign-in wallet ahead of a linked one', () => {
    expect(pickWallet('identityWallet', 'linkedWallet')).toEqual({ wallet: 'identityWallet', source: 'identity' });
    expect(pickWallet('identityWallet', null)).toEqual({ wallet: 'identityWallet', source: 'identity' });
  });

  it('falls back to the linked wallet, then to none', () => {
    expect(pickWallet(null, 'linkedWallet')).toEqual({ wallet: 'linkedWallet', source: 'linked' });
    expect(pickWallet(null, null)).toEqual({ wallet: null, source: null });
  });
});

describe('buildLinkMessage', () => {
  const owner = wallet();
  const message = buildLinkMessage({ address: owner.address, userId: USER, nonce: 'a1b2', issuedAt, expiresAt });

  it('is one readable statement with the wallet, a short account id, the nonce and both times', () => {
    expect(message.split('\n')).toEqual([
      'Itera — link this wallet to your account',
      `Wallet: ${owner.address}`,
      'Account: 3f2a9c1e',
      'Nonce: a1b2',
      'Issued At: 2026-10-10T12:00:00.000Z',
      'Expires At: 2026-10-10T12:05:00.000Z',
    ]);
  });

  it('never carries the whole account id', () => {
    expect(message).not.toContain(USER);
  });

  it('draws a fresh 128-bit nonce each time', () => {
    const nonces = new Set(Array.from({ length: 50 }, newNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('challengeVerdict', () => {
  const now = new Date('2026-10-10T12:01:00.000Z');

  it('accepts an unused challenge inside its window', () => {
    expect(challengeVerdict({ used_at: null, expires_at: expiresAt.toISOString() }, now)).toBe('ok');
  });

  it('reports a missing row (unknown, or issued to another learner) as not found', () => {
    expect(challengeVerdict(null, now)).toBe('challenge_not_found');
  });

  it('reports a used or old challenge as expired', () => {
    expect(challengeVerdict({ used_at: now.toISOString(), expires_at: expiresAt.toISOString() }, now)).toBe('challenge_expired');
    expect(challengeVerdict({ used_at: null, expires_at: now.toISOString() }, now)).toBe('challenge_expired');
    expect(challengeVerdict({ used_at: null, expires_at: issuedAt.toISOString() }, now)).toBe('challenge_expired');
  });
});

describe('wallet signature over a challenge', () => {
  const owner = wallet();
  const messageA = buildLinkMessage({ address: owner.address, userId: USER, nonce: newNonce(), issuedAt, expiresAt });
  const messageB = buildLinkMessage({ address: owner.address, userId: USER, nonce: newNonce(), issuedAt, expiresAt });
  const signatureA = signText(messageA, owner);

  it('verifies as base58, base64 and base64url', async () => {
    const base64 = base64Encode(signatureA);
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    for (const text of [base58Encode(signatureA), base64, base64url]) {
      expect(await verifyWalletSignature(owner.address, text, utf8(messageA))).toBe(true);
    }
  });

  it('does not verify challenge B with the signature of challenge A', async () => {
    expect(await verifyWalletSignature(owner.address, base58Encode(signatureA), utf8(messageB))).toBe(false);
  });

  it('does not verify for another wallet, a changed message or a changed signature', async () => {
    const other = wallet();
    expect(await verifyWalletSignature(other.address, base58Encode(signatureA), utf8(messageA))).toBe(false);
    expect(await verifyWalletSignature(owner.address, base58Encode(signText(messageA, other)), utf8(messageA))).toBe(false);
    expect(await verifyWalletSignature(owner.address, base58Encode(signatureA), utf8(`${messageA} `))).toBe(false);
    const flipped = Uint8Array.from(signatureA);
    flipped[10] ^= 1;
    expect(await verifyWalletSignature(owner.address, base58Encode(flipped), utf8(messageA))).toBe(false);
  });

  it('refuses malformed input without throwing', async () => {
    expect(await verifyWalletSignature(owner.address, '', utf8(messageA))).toBe(false);
    expect(await verifyWalletSignature(owner.address, 42, utf8(messageA))).toBe(false);
    expect(await verifyWalletSignature(owner.address, 'A'.repeat(500), utf8(messageA))).toBe(false);
    expect(await verifyWalletSignature(owner.address, base58Encode(signatureA.subarray(0, 63)), utf8(messageA))).toBe(false);
    expect(await verifyWalletSignature('not-an-address', base58Encode(signatureA), utf8(messageA))).toBe(false);
    expect(await verifyEd25519(owner.raw.subarray(0, 31), signatureA, utf8(messageA))).toBe(false);
    expect(await verifyEd25519(new Uint8Array(32), new Uint8Array(64), utf8(messageA))).toBe(false);
  });

  it('keeps both readings of a text that is valid in two alphabets', () => {
    const ambiguous = 'A'.repeat(86);
    expect(base64Decode(ambiguous)).toHaveLength(64);
    expect(signatureCandidates(ambiguous).every((bytes) => bytes.length === 64)).toBe(true);
    expect(signatureCandidates(base58Encode(signatureA))).toContainEqual(signatureA);
    expect(signatureCandidates(base64Encode(signatureA))).toContainEqual(signatureA);
  });
});
