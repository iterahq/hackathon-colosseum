import { describe, expect, it } from 'vitest';
import {
  DIRECT_ESCROW_STATE_BYTES,
  ESCROW_ERRORS,
  ESCROW_STATE_BYTES,
  GATED_ESCROW_STATE_BYTES,
  acceptInstruction,
  bountyIdBytes,
  createInstruction,
  escrowPda,
  parseEscrowState,
  refundInstruction,
  releaseInstruction,
  trailHash,
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

  it('never marks a destination of money as a signer; accept needs the claimant beside the attester', () => {
    const accept = acceptInstruction({ programId: PROGRAM, attester: TREASURY, escrow: ESCROW, claimant: CLAIMANT, certification: CERT });
    const release = releaseInstruction({ programId: PROGRAM, approver: TREASURY, escrow: ESCROW, claimant: CLAIMANT });
    const unclaim = unclaimInstruction({ programId: PROGRAM, authority: TREASURY, escrow: ESCROW });
    const refund = refundInstruction({ programId: PROGRAM, authority: TREASURY, escrow: ESCROW, sponsor: TREASURY });
    expect([accept.data[0], release.data[0], unclaim.data[0], refund.data[0]]).toEqual([1, 2, 3, 4]);
    for (const instruction of [accept, release, unclaim, refund]) {
      expect(instruction.accounts.filter((account) => account.signer).map((account) => account.address)).toEqual(instruction === accept ? [TREASURY, CLAIMANT] : [TREASURY]);
      expect(instruction.accounts[1]).toEqual({ address: ESCROW, writable: true });
    }
    expect(accept.accounts.slice(2)).toEqual([{ address: CLAIMANT, signer: true }, { address: CERT }]);
    expect(unclaimInstruction({ programId: PROGRAM, authority: CLAIMANT, escrow: ESCROW }).accounts[0]).toEqual({ address: CLAIMANT, signer: true });
    expect(release.accounts[2]).toEqual({ address: CLAIMANT, writable: true });
  });

  it('reads the account the program wrote', () => {
    expect(parseEscrowState(state(0, false))).toEqual({
      gate: null,
      invitee: null,
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

describe('gated escrows: the terms name the trail and the days', () => {
  const terms = { bountyId: ID, sponsor: TREASURY, approver: TREASURY, collection: COLLECTION, amount: 10_000_000n, expiresAt: 1_800_000_000 };

  it('hashes the program and trail attributes the way the program does', async () => {
    expect(await trailHash('itera-v2', 'Week 1 · HTML')).toBe('ba8491ad9ff1b2e903987756e6e7e652f8e612a05eb10a706783f0cd68a9260d');
  });

  it('puts the gate in the address: other days, another account', async () => {
    const trail = await trailHash('itera-v2', 'Week 1 · HTML');
    const plain = await escrowPda(PROGRAM, terms);
    const oneDay = await escrowPda(PROGRAM, { ...terms, gate: { minDays: 1, trail } });
    const twoDays = await escrowPda(PROGRAM, { ...terms, gate: { minDays: 2, trail } });
    expect(new Set([plain, oneDay, twoDays]).size).toBe(3);
  });

  it('builds create_gated with the gate after the terms', async () => {
    const trail = await trailHash('itera-v2', 'Week 1 · HTML');
    const instruction = createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate: { minDays: 3, trail } });
    expect(instruction.data.length).toBe(66);
    expect(instruction.data[0]).toBe(5);
    expect(instruction.data[33]).toBe(3);
    expect(Buffer.from(instruction.data.slice(34)).toString('hex')).toBe(trail);
    expect(createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms }).data.length).toBe(33);
  });

  it('refuses a gate of zero days or a trail that is not a hash', () => {
    expect(() => createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate: { minDays: 0, trail: 'ab'.repeat(32) } })).toThrow();
    expect(() => createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate: { minDays: 1, trail: 'abcd' } })).toThrow();
  });

  it('asks nobody but the claimant to sign the accept of a gated bounty', () => {
    const gated = acceptInstruction({ programId: PROGRAM, attester: TREASURY, escrow: ESCROW, claimant: CLAIMANT, certification: CERT, gated: true });
    expect(gated.accounts.filter((account) => account.signer).map((account) => account.address)).toEqual([CLAIMANT]);
    const attested = acceptInstruction({ programId: PROGRAM, attester: TREASURY, escrow: ESCROW, claimant: CLAIMANT, certification: CERT });
    expect(attested.accounts.filter((account) => account.signer).map((account) => account.address)).toEqual([TREASURY, CLAIMANT]);
  });

  it('reads the gate of a 228-byte account and none from a 195-byte one', () => {
    const old = state(0, false);
    expect(parseEscrowState(old)?.gate).toBeNull();
    const gated = new Uint8Array(GATED_ESCROW_STATE_BYTES);
    gated.set(old);
    gated[0] = 2;
    gated[195] = 3;
    gated.fill(0xab, 196);
    expect(parseEscrowState(gated)).toMatchObject({ status: 'open', gate: { minDays: 3, trail: 'ab'.repeat(32) } });
    gated[0] = 1;
    expect(parseEscrowState(gated)).toBeNull();
    old[0] = 2;
    expect(parseEscrowState(old)).toBeNull();
  });
});

describe('direct escrows: the terms name the one wallet that may accept', () => {
  const terms = { bountyId: ID, sponsor: TREASURY, approver: TREASURY, collection: COLLECTION, amount: 10_000_000n, expiresAt: 1_800_000_000 };
  const gate = { minDays: 3, trail: 'ab'.repeat(32) };

  it('puts the invitee in the address: another wallet, another account, and never the gated one', async () => {
    const gated = await escrowPda(PROGRAM, { ...terms, gate });
    const forClaimant = await escrowPda(PROGRAM, { ...terms, gate, invitee: CLAIMANT });
    const forCert = await escrowPda(PROGRAM, { ...terms, gate, invitee: CERT });
    expect(new Set([gated, forClaimant, forCert]).size).toBe(3);
    expect(await escrowPda(PROGRAM, { ...terms, gate, invitee: null })).toBe(gated);
    await expect(escrowPda(PROGRAM, { ...terms, invitee: CLAIMANT })).rejects.toThrow();
  });

  it('builds create_direct with the invitee after the gate, on the same accounts as create', () => {
    const instruction = createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate, invitee: CLAIMANT });
    expect(instruction.data.length).toBe(98);
    expect(instruction.data[0]).toBe(6);
    expect(instruction.data[33]).toBe(3);
    expect(Buffer.from(instruction.data.slice(34, 66)).toString('hex')).toBe(gate.trail);
    expect([...instruction.data.slice(66)]).toEqual([...key(CLAIMANT)]);
    expect(instruction.accounts).toEqual(createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate }).accounts);
    expect(createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate }).data).toEqual(createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate, invitee: null }).data);
  });

  it('refuses an invitee that is not an address, or a direct bounty with no gate', () => {
    expect(() => createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, gate, invitee: 'not-a-wallet' })).toThrow();
    expect(() => createInstruction({ programId: PROGRAM, funder: TREASURY, escrow: ESCROW, ...terms, invitee: CLAIMANT })).toThrow();
  });

  it('reads the invitee of a 260-byte account and none from the two older layouts', () => {
    const direct = new Uint8Array(DIRECT_ESCROW_STATE_BYTES);
    direct.set(state(0, false));
    direct[0] = 3;
    direct[195] = 3;
    direct.fill(0xab, 196, 228);
    direct.set(key(CLAIMANT), 228);
    expect(parseEscrowState(direct)).toMatchObject({ status: 'open', gate, invitee: CLAIMANT, claimant: null, sponsor: TREASURY });
    direct[0] = 2;
    expect(parseEscrowState(direct)).toBeNull();
    expect(parseEscrowState(direct.slice(0, GATED_ESCROW_STATE_BYTES))).toMatchObject({ gate, invitee: null });
    expect(parseEscrowState(state(1, true))).toMatchObject({ gate: null, invitee: null, claimant: CLAIMANT });
  });

  it('names the refusal of a wallet that was not invited', () => {
    expect(ESCROW_ERRORS[6020]).toBe('not_invited');
  });
});
