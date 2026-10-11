import { describe, expect, it } from 'vitest';
import {
  ESCROW_STATE_BYTES,
  acceptInstruction,
  bountyIdBytes,
  createInstruction,
  escrowPda,
  parseEscrowState,
  refundInstruction,
  releaseInstruction,
  unclaimInstruction,
} from './bounty-program';
import { SYSTEM_PROGRAM, base58Decode } from './solana-tx';

const PROGRAM = 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
const ID = '87279dd4-a560-4e43-a020-372f2a8cd87e';
const ESCROW = 'CHJxRB4JDpwUXaGqD5NmZ5KZSZ95vmW4fELpPjmkKtzj';
const TREASURY = 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA';
const COLLECTION = 'Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b';
const CLAIMANT = '95SAp7c7fHSurHmR2H42oopwHfkr2c4aV5wwYsyQpMAc';
const CERT = 'Aqhq7VqZTmEGqGNtFSG3ywVELZx8T3DmoeTenrTAoNQj';
const key = (address: string) => base58Decode(address, 32) as Uint8Array;

function state(status: number, claimed: boolean): Uint8Array {
  const data = new Uint8Array(ESCROW_STATE_BYTES);
  data[0] = 1;
  data[1] = 255;
  data[2] = status;
  data.set(bountyIdBytes(ID), 3);
  data.set(key(TREASURY), 19);
  data.set(key(TREASURY), 51);
  data.set(key(COLLECTION), 83);
  const view = new DataView(data.buffer);
  view.setBigUint64(115, 50_000_000n, true);
  view.setBigInt64(123, 1_800_000_000n, true);
  if (claimed) {
    data.set(key(CLAIMANT), 131);
    data.set(key(CERT), 163);
  }
  return data;
}

describe('escrow program client', () => {
  const terms = { bountyId: ID, sponsor: TREASURY, approver: TREASURY, collection: COLLECTION, amount: 50_000_000n, expiresAt: 1_800_000_000 };

  it('derives the escrow account from the bounty id and its terms (same address as the Solana CLI)', async () => {
    expect(await escrowPda(PROGRAM, terms)).toBe('HQHpzHkzEKZs16gqrqB7zPtGj5imL7EJffpFrDFiGXXM');
    expect(() => bountyIdBytes('not-a-uuid')).toThrow();
  });

  it.each([
    ['another refund destination', { sponsor: CLAIMANT }],
    ['another approver', { approver: CLAIMANT }],
    ['another collection', { collection: CLAIMANT }],
    ['another amount', { amount: 1n }],
    ['another expiry', { expiresAt: 1_800_000_001 }],
    ['another bounty', { bountyId: '11111111-1111-4111-8111-111111111111' }],
  ])('gives %s a different address, so foreign terms cannot occupy this one', async (_, change) => {
    expect(await escrowPda(PROGRAM, { ...terms, ...change })).not.toBe(await escrowPda(PROGRAM, terms));
  });

  it('encodes create as tag, id, amount and expiry', () => {
    const instruction = createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, sponsor: TREASURY, approver: TREASURY, collection: COLLECTION, bountyId: ID, amount: 50_000_000n, expiresAt: 1_800_000_000 });
    expect(instruction.data).toHaveLength(33);
    expect(instruction.data[0]).toBe(0);
    expect([...instruction.data.slice(1, 17)]).toEqual([...bountyIdBytes(ID)]);
    const view = new DataView(instruction.data.buffer);
    expect(view.getBigUint64(17, true)).toBe(50_000_000n);
    expect(view.getBigInt64(25, true)).toBe(1_800_000_000n);
    expect(instruction.accounts.map((account) => account.address)).toEqual([TREASURY, ESCROW, TREASURY, TREASURY, COLLECTION, SYSTEM_PROGRAM]);
    expect(instruction.accounts[0]).toMatchObject({ signer: true, writable: true });
  });

  it('never marks a destination as a signer and only the approver signs', () => {
    const accept = acceptInstruction({ programId: PROGRAM, approver: TREASURY, escrow: ESCROW, claimant: CLAIMANT, certification: CERT });
    const release = releaseInstruction({ programId: PROGRAM, approver: TREASURY, escrow: ESCROW, claimant: CLAIMANT });
    const unclaim = unclaimInstruction({ programId: PROGRAM, approver: TREASURY, escrow: ESCROW });
    const refund = refundInstruction({ programId: PROGRAM, authority: TREASURY, escrow: ESCROW, sponsor: TREASURY });
    expect([accept.data[0], release.data[0], unclaim.data[0], refund.data[0]]).toEqual([1, 2, 3, 4]);
    for (const instruction of [accept, release, unclaim, refund]) {
      expect(instruction.accounts.filter((account) => account.signer).map((account) => account.address)).toEqual([TREASURY]);
      expect(instruction.accounts[1]).toEqual({ address: ESCROW, writable: true });
    }
    expect(accept.accounts.slice(2)).toEqual([{ address: CLAIMANT }, { address: CERT }]);
    expect(release.accounts[2]).toEqual({ address: CLAIMANT, writable: true });
  });

  it('reads the account the program wrote', () => {
    expect(parseEscrowState(state(0, false))).toEqual({
      status: 'open',
      id: ID,
      sponsor: TREASURY,
      approver: TREASURY,
      collection: COLLECTION,
      amount: 50_000_000n,
      expiresAt: 1_800_000_000,
      claimant: null,
      certification: null,
    });
    expect(parseEscrowState(state(1, true))).toMatchObject({ status: 'claimed', claimant: CLAIMANT, certification: CERT });
    expect(parseEscrowState(state(2, true))?.status).toBe('paid');
    expect(parseEscrowState(state(3, false))?.status).toBe('refunded');
  });

  it('refuses bytes that are not an escrow account', () => {
    expect(parseEscrowState(new Uint8Array(10))).toBeNull();
    expect(parseEscrowState(new Uint8Array(ESCROW_STATE_BYTES))).toBeNull();
    expect(parseEscrowState(state(9, false))).toBeNull();
  });
});
