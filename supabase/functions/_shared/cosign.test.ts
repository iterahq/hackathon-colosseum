import { describe, expect, it } from 'vitest';
import { acceptInstruction, unclaimInstruction } from './bounty-program';
import { COMPUTE_BUDGET_PROGRAM, CosignError, LIGHTHOUSE_PROGRAM, checkCosignedMessage, isExpiredBlockhash, parseSignedByWallet } from './cosign';
import { compileMessage, decodeMessage, memoInstruction, type Instruction } from './solana-message';
import { SYSTEM_PROGRAM, base64Encode, transferData } from './solana-tx';

const PROGRAM = 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
const ESCROW = 'CHJxRB4JDpwUXaGqD5NmZ5KZSZ95vmW4fELpPjmkKtzj';
const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const LEARNER = '95SAp7c7fHSurHmR2H42oopwHfkr2c4aV5wwYsyQpMAc';
const CERT = 'Aqhq7VqZTmEGqGNtFSG3ywVELZx8T3DmoeTenrTAoNQj';
const STRANGER = 'EANhMJvJo2dKjEosCmExDvrzxn5LhT8R51nanJpcaXu5';
const BLOCKHASH = '4FkL85hUkteCR8oiAEm6Y6pUKKnamMw4iwvZcYfNeEpQ';

const accept = acceptInstruction({ programId: PROGRAM, attester: TREASURY, escrow: ESCROW, claimant: LEARNER, certification: CERT });
const memo = memoInstruction('itera-bounty:87279dd4-a560-4e43-a020-372f2a8cd87e:accept');
const expected = [accept, memo];
const message = (instructions: Instruction[], payer = TREASURY) => compileMessage(payer, instructions, BLOCKHASH);
const check = (bytes: Uint8Array) => checkCosignedMessage(bytes, { wallet: LEARNER, feePayer: TREASURY, expected });
const refusedAs = (bytes: Uint8Array) => {
  try {
    check(bytes);
    return 'accepted';
  } catch (error) {
    return error instanceof CosignError ? error.code : 'threw';
  }
};
const unitPrice = (microLamports: bigint): Instruction => {
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, microLamports, true);
  return { programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
};

describe('decodeMessage', () => {
  it('reads back what compileMessage wrote', () => {
    const decoded = decodeMessage(message(expected));
    expect(decoded?.payer).toBe(TREASURY);
    expect(decoded?.signers).toEqual([TREASURY, LEARNER]);
    expect(decoded?.recentBlockhash).toBe(BLOCKHASH);
    expect(decoded?.instructions.map((instruction) => instruction.programId)).toEqual([PROGRAM, memo.programId]);
    expect(decoded?.instructions[0].accounts).toEqual([
      { address: TREASURY, signer: true, writable: true },
      { address: ESCROW, signer: false, writable: true },
      { address: LEARNER, signer: true, writable: false },
      { address: CERT, signer: false, writable: false },
    ]);
    expect([...(decoded?.instructions[0].data ?? [])]).toEqual([1]);
  });

  it('refuses truncated bytes, trailing bytes and versioned messages', () => {
    const bytes = message(expected);
    expect(decodeMessage(bytes.subarray(0, bytes.length - 1))).toBeNull();
    expect(decodeMessage(Uint8Array.from([...bytes, 0]))).toBeNull();
    expect(decodeMessage(Uint8Array.from([0x80, ...bytes]))).toBeNull();
    expect(decodeMessage(new Uint8Array())).toBeNull();
  });
});

describe('checkCosignedMessage', () => {
  it('accepts the message we offered', () => {
    expect(refusedAs(message(expected))).toBe('accepted');
  });

  it('accepts what a wallet may add: a compute limit, a capped priority fee, a Lighthouse assertion', () => {
    const limit: Instruction = { programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data: Uint8Array.of(2, 64, 13, 3, 0) };
    const assertion: Instruction = { programId: LIGHTHOUSE_PROGRAM, accounts: [{ address: LEARNER }], data: Uint8Array.of(9, 1, 2) };
    expect(refusedAs(message([limit, unitPrice(50_000n), ...expected, assertion]))).toBe('accepted');
  });

  it('refuses a priority fee that would drain the fee payer', () => {
    expect(refusedAs(message([unitPrice(50_001n), ...expected]))).toBe('invalid_transaction');
    expect(refusedAs(message([unitPrice(10_000_000_000n), ...expected]))).toBe('invalid_transaction');
  });

  it('refuses a transfer out of the fee payer slipped beside our instructions', () => {
    const steal: Instruction = { programId: SYSTEM_PROGRAM, accounts: [{ address: TREASURY, signer: true, writable: true }, { address: LEARNER, writable: true }], data: transferData(1_000_000n) };
    expect(refusedAs(message([...expected, steal]))).toBe('invalid_transaction');
  });

  it('refuses an added instruction that names the fee payer, whatever its program', () => {
    const assertion: Instruction = { programId: LIGHTHOUSE_PROGRAM, accounts: [{ address: TREASURY, writable: true }], data: Uint8Array.of(1) };
    expect(refusedAs(message([...expected, assertion]))).toBe('invalid_transaction');
  });

  it('refuses another instruction of the escrow program signed with our key', () => {
    const reopen = unclaimInstruction({ programId: PROGRAM, authority: TREASURY, escrow: STRANGER });
    expect(refusedAs(message([...expected, reopen]))).toBe('invalid_transaction');
  });

  it('refuses a message that drops or changes one of ours', () => {
    expect(refusedAs(message([accept]))).toBe('invalid_transaction');
    expect(refusedAs(message([memo, accept]))).toBe('invalid_transaction');
    const other = acceptInstruction({ programId: PROGRAM, attester: TREASURY, escrow: STRANGER, claimant: LEARNER, certification: CERT });
    expect(refusedAs(message([other, memo]))).toBe('invalid_transaction');
  });

  it('refuses another fee payer, another signer, a third signer', () => {
    expect(refusedAs(message(expected, LEARNER))).toBe('invalid_transaction');
    const asStranger = acceptInstruction({ programId: PROGRAM, attester: TREASURY, escrow: ESCROW, claimant: STRANGER, certification: CERT });
    expect(refusedAs(message([asStranger, memo]))).toBe('invalid_transaction');
    expect(refusedAs(message([...expected, memoInstruction('x', [STRANGER])]))).toBe('invalid_transaction');
  });

  it('refuses bytes that are not a message', () => {
    expect(refusedAs(Uint8Array.of(1, 2, 3))).toBe('invalid_transaction');
  });
});

describe('parseSignedByWallet', () => {
  it('takes a base64 message and a 64-byte signature', () => {
    const parsed = parseSignedByWallet({ message: base64Encode(message(expected)), signature: base64Encode(new Uint8Array(64).fill(7)) });
    expect(parsed?.signature.length).toBe(64);
    expect(parsed?.message.length).toBe(message(expected).length);
  });

  it('refuses a short signature, a missing field, an oversized message', () => {
    expect(parseSignedByWallet({ message: base64Encode(message(expected)), signature: base64Encode(new Uint8Array(63)) })).toBeNull();
    expect(parseSignedByWallet({ signature: base64Encode(new Uint8Array(64)) })).toBeNull();
    expect(parseSignedByWallet({ message: 'A'.repeat(2049), signature: base64Encode(new Uint8Array(64)) })).toBeNull();
  });
});

describe('isExpiredBlockhash', () => {
  it('recognises the node saying the blockhash is too old', () => {
    expect(isExpiredBlockhash('Transaction simulation failed: Blockhash not found')).toBe(true);
    expect(isExpiredBlockhash('custom program error: 0x1775')).toBe(false);
  });
});
