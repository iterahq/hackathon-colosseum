import { describe, expect, it } from 'vitest';
import { compileMessage, findProgramAddress, isOnCurve, memoInstruction, requiredSignatures } from './solana-message';
import { MEMO_PROGRAM, SYSTEM_PROGRAM, base58Decode, buildTransferMessage, transferData } from './solana-tx';

const PAYER = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const RECIPIENT = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const BLOCKHASH = 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b';
const PROGRAM = 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
const seed = new TextEncoder().encode('bounty');

describe('compileMessage', () => {
  it('builds the same bytes as the hand-written transfer message', () => {
    const transfer = {
      programId: SYSTEM_PROGRAM,
      accounts: [
        { address: PAYER, signer: true, writable: true },
        { address: RECIPIENT, writable: true },
      ],
      data: transferData(1_000_000n),
    };
    const message = compileMessage(PAYER, [transfer, memoInstruction('itera-bounty:x:payout')], BLOCKHASH);
    expect([...message]).toEqual([...buildTransferMessage({ payer: PAYER, recipient: RECIPIENT, lamports: 1_000_000n, memo: 'itera-bounty:x:payout', recentBlockhash: BLOCKHASH })]);
    expect(requiredSignatures(message)).toBe(1);
  });

  it('orders writable accounts before read-only ones and merges repeated accounts', () => {
    const message = compileMessage(
      PAYER,
      [
        { programId: PROGRAM, accounts: [{ address: PAYER, signer: true }, { address: BLOCKHASH }, { address: RECIPIENT, writable: true }], data: Uint8Array.of(1) },
        { programId: PROGRAM, accounts: [{ address: PAYER, signer: true }, { address: RECIPIENT }], data: Uint8Array.of(2) },
      ],
      BLOCKHASH,
    );
    expect([...message.slice(0, 4)]).toEqual([1, 0, 2, 4]);
    const keyAt = (index: number) => [...message.slice(4 + index * 32, 36 + index * 32)];
    expect(keyAt(0)).toEqual([...(base58Decode(PAYER, 32) as Uint8Array)]);
    expect(keyAt(1)).toEqual([...(base58Decode(RECIPIENT, 32) as Uint8Array)]);
    expect(keyAt(2)).toEqual([...(base58Decode(BLOCKHASH, 32) as Uint8Array)]);
    expect(keyAt(3)).toEqual([...(base58Decode(PROGRAM, 32) as Uint8Array)]);
  });

  it('refuses a memo that does not fit', () => {
    expect(() => memoInstruction('')).toThrow();
    expect(() => memoInstruction('x'.repeat(257))).toThrow();
    expect(memoInstruction('ok').programId).toBe(MEMO_PROGRAM);
  });
});

describe('program-derived addresses', () => {
  it('tells curve points from the rest', () => {
    expect(isOnCurve(base58Decode(PAYER, 32) as Uint8Array)).toBe(true);
    expect(isOnCurve(base58Decode('CHJxRB4JDpwUXaGqD5NmZ5KZSZ95vmW4fELpPjmkKtzj', 32) as Uint8Array)).toBe(false);
    expect(isOnCurve(new Uint8Array(31))).toBe(false);
  });

  it.each([
    ['87279dd4a5604e43a020372f2a8cd87e', 'CHJxRB4JDpwUXaGqD5NmZ5KZSZ95vmW4fELpPjmkKtzj', 255],
    ['11111111111141118111111111111111', 'CJ3De7aUkbxhwyijb7PexxjFNmqPgpvT3TprDufPbyGS', 255],
    ['00000000000000000000000000000000', '3NZRrJPFrXXCp2Xr97XfQwt3BMsqiZwocHUbLWg6TAvA', 255],
    ['ee46ba3c55b64315a227a41f77aa0151', 'CvphnmfyQZzvdDKChkYCuN27QeiqQvxuwZfgeMmMRwxW', 255],
  ])('matches the Solana CLI for seed %s', async (id, address, bump) => {
    expect(await findProgramAddress([seed, hex(id)], PROGRAM)).toEqual({ address, bump });
  });

  it('walks down the bump when the first hash is on the curve', async () => {
    expect(await findProgramAddress([new TextEncoder().encode('hello')], 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toEqual({
      address: '4HB6s1bAiAPk8kxSatGd3U7bKArXXSoDfemfu23UZBdw',
      bump: 254,
    });
  });
});
