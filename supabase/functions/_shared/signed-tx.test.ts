import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyEd25519 } from './ed25519';
import { verifyPayment, type PaymentExpectation } from './purchase-verify';
import { asParsedTransaction, decodeSignedTransaction, parseSignedTransaction, transactionSignature } from './signed-tx';
import { base58Decode, base58Encode, base64Encode, buildTransferMessage, compactU16, serializeTransaction, transferData } from './solana-tx';

const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const BLOCKHASH = '4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG';
const MEMO = '0b0e1f7a-58e5-4f0c-9d55-7a1f6f1e2c3d';
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const SYSTEM = '11111111111111111111111111111111';
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const PRICE = 1_100_000n;

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  return { privateKey, raw, address: base58Encode(raw) };
}

const payer = wallet();
const expected: PaymentExpectation = { wallet: payer.address, treasury: TREASURY, lamports: PRICE, memo: MEMO };
const key = (address: string) => [...(base58Decode(address, 32) as Uint8Array)];

function signed(message: Uint8Array, signer = payer): Uint8Array {
  return serializeTransaction(message, new Uint8Array(sign(null, message, signer.privateKey)));
}

const message = buildTransferMessage({ payer: payer.address, recipient: TREASURY, lamports: PRICE, memo: MEMO, recentBlockhash: BLOCKHASH });

/** What a wallet that adds a priority fee signs: two compute-budget instructions ahead of the transfer and the memo. */
function messageWithPriorityFee(): Uint8Array {
  const transfer = transferData(PRICE);
  const memo = new TextEncoder().encode(MEMO);
  const limit = [2, 0x40, 0x0d, 0x03, 0x00];
  const price = [3, 0x10, 0x27, 0, 0, 0, 0, 0, 0];
  return Uint8Array.from([
    1, 0, 3,
    ...compactU16(5),
    ...key(payer.address), ...key(TREASURY), ...key(SYSTEM), ...key(MEMO_PROGRAM), ...key(COMPUTE_BUDGET),
    ...key(BLOCKHASH),
    ...compactU16(4),
    4, 0, limit.length, ...limit,
    4, 0, price.length, ...price,
    2, 2, 0, 1, transfer.length, ...transfer,
    3, 0, memo.length, ...memo,
  ]);
}

describe('decodeSignedTransaction', () => {
  it('reads the server-built transaction from base64 and from base58', () => {
    const wire = signed(message);
    for (const text of [base64Encode(wire), base58Encode(wire), base64Encode(wire).replace(/=+$/, '')]) {
      const transaction = decodeSignedTransaction(text);
      expect(transaction?.accountKeys[0]).toBe(payer.address);
      expect(transaction?.message).toEqual(message);
      expect(transaction?.bytes).toEqual(wire);
      expect(transaction?.requiredSignatures).toBe(1);
      expect(transaction?.instructions).toHaveLength(2);
    }
  });

  it('gives the first signature as the transaction id', () => {
    const wire = signed(message);
    const transaction = decodeSignedTransaction(base64Encode(wire));
    expect(transactionSignature(transaction!)).toBe(base58Encode(wire.subarray(1, 65)));
  });

  it('refuses what is not a whole legacy transaction', () => {
    const wire = signed(message);
    expect(decodeSignedTransaction('')).toBeNull();
    expect(decodeSignedTransaction(42)).toBeNull();
    expect(decodeSignedTransaction('not a transaction !!')).toBeNull();
    expect(decodeSignedTransaction(base64Encode(message))).toBeNull();
    expect(decodeSignedTransaction(base64Encode(wire.subarray(0, wire.length - 1)))).toBeNull();
    expect(decodeSignedTransaction(base64Encode(Uint8Array.from([...wire, 0])))).toBeNull();
    expect(decodeSignedTransaction('A'.repeat(4000))).toBeNull();
  });

  it('refuses a versioned message, a signature count that disagrees and an index out of range', () => {
    const versioned = Uint8Array.from([1, ...new Uint8Array(64), 0x80, ...message]);
    expect(parseSignedTransaction(versioned)).toBeNull();

    const twoSlots = Uint8Array.from([2, ...new Uint8Array(128), ...message]);
    expect(parseSignedTransaction(twoSlots)).toBeNull();

    const badProgram = Uint8Array.from(message);
    badProgram[3 + 1 + 4 * 32 + 32 + 1] = 9;
    expect(parseSignedTransaction(serializeTransaction(badProgram))).toBeNull();
  });
});

describe('a signed transaction judged before it is broadcast', () => {
  const verdictOf = (wire: Uint8Array) => verifyPayment(asParsedTransaction(decodeSignedTransaction(base64Encode(wire))!), expected);

  it('accepts the transaction the server built', () => {
    expect(verdictOf(signed(message))).toEqual({ ok: true, paidLamports: PRICE });
  });

  it('tolerates compute-budget instructions added by the wallet', () => {
    expect(verdictOf(signed(messageWithPriorityFee()))).toEqual({ ok: true, paidLamports: PRICE });
  });

  it('refuses another payer, destination, amount or memo', () => {
    const other = wallet();
    const build = (overrides: Partial<Parameters<typeof buildTransferMessage>[0]>) =>
      buildTransferMessage({ payer: payer.address, recipient: TREASURY, lamports: PRICE, memo: MEMO, recentBlockhash: BLOCKHASH, ...overrides });
    expect(verdictOf(signed(build({ payer: other.address }), other))).toMatchObject({ error: 'payment_mismatch', detail: 'payer' });
    expect(verdictOf(signed(build({ recipient: other.address })))).toMatchObject({ error: 'payment_mismatch', detail: 'destination' });
    expect(verdictOf(signed(build({ lamports: PRICE - 1n })))).toMatchObject({ error: 'payment_mismatch', detail: 'amount' });
    expect(verdictOf(signed(build({ memo: 'another-intent' })))).toMatchObject({ error: 'payment_mismatch', detail: 'memo' });
  });

  it('does not read a transfer out of other System instructions or a memo out of invalid UTF-8', () => {
    const parsed = asParsedTransaction(decodeSignedTransaction(base64Encode(signed(messageWithPriorityFee())))!);
    expect(parsed.transaction.message.instructions.map((instruction) => instruction.program)).toEqual([undefined, undefined, 'system', 'spl-memo']);

    const allocate = Uint8Array.from(message);
    const transferOffset = 3 + 1 + 4 * 32 + 32 + 1 + 1 + 1 + 2 + 1;
    allocate[transferOffset] = 8;
    expect(verdictOf(signed(allocate))).toMatchObject({ error: 'payment_mismatch', detail: 'payer' });

    const badMemo = Uint8Array.from(message);
    badMemo[badMemo.length - 1] = 0xff;
    expect(verdictOf(signed(badMemo))).toMatchObject({ error: 'payment_mismatch', detail: 'memo' });
  });
});

describe('the fee payer signature', () => {
  it('verifies for the signed message and for nothing else', async () => {
    const transaction = decodeSignedTransaction(base64Encode(signed(message)))!;
    expect(await verifyEd25519(payer.raw, transaction.signatures[0], transaction.message)).toBe(true);

    const tampered = Uint8Array.from(transaction.bytes);
    tampered[tampered.length - 1] ^= 1;
    const changed = parseSignedTransaction(tampered)!;
    expect(await verifyEd25519(payer.raw, changed.signatures[0], changed.message)).toBe(false);

    const stranger = decodeSignedTransaction(base64Encode(signed(message, wallet())))!;
    expect(await verifyEd25519(payer.raw, stranger.signatures[0], stranger.message)).toBe(false);

    const unsigned = parseSignedTransaction(serializeTransaction(message))!;
    expect(await verifyEd25519(payer.raw, unsigned.signatures[0], unsigned.message)).toBe(false);
  });
});
