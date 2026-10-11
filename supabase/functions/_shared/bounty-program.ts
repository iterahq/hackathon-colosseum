import { findProgramAddress, type Instruction } from './solana-message.ts';
import { SYSTEM_PROGRAM, base58Encode } from './solana-tx.ts';

/** The escrow program's instructions and account layout (`programs/bounty-escrow/src/lib.rs`). */
export const ESCROW_STATE_BYTES = 195;
const SEED = new TextEncoder().encode('bounty');
const STATUSES = ['open', 'claimed', 'paid', 'refunded'] as const;
const NO_KEY = '11111111111111111111111111111111';

export type EscrowStatus = (typeof STATUSES)[number];

export interface EscrowState {
  status: EscrowStatus;
  id: string;
  sponsor: string;
  approver: string;
  collection: string;
  amount: bigint;
  expiresAt: number;
  claimant: string | null;
  certification: string | null;
}

/** What the program answers when it refuses, by custom error code. */
export const ESCROW_ERRORS: Record<number, string> = {
  6000: 'wrong_escrow_account',
  6001: 'already_exists',
  6002: 'invalid_amount',
  6003: 'invalid_expiry',
  6004: 'not_approver',
  6005: 'not_open',
  6006: 'not_claimed',
  6007: 'expired',
  6008: 'not_a_certification',
  6009: 'certification_not_owned_by_claimant',
  6010: 'certification_of_another_collection',
  6011: 'wrong_claimant',
  6012: 'wrong_sponsor',
  6013: 'not_authorized',
};

/** The 16 bytes of a uuid: the seed of its escrow account. */
export function bountyIdBytes(bountyId: string): Uint8Array {
  const hex = bountyId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('bounty id must be a uuid');
  return Uint8Array.from(hex.match(/../g) as string[], (byte) => Number.parseInt(byte, 16));
}

function uuidOf(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function escrowPda(programId: string, bountyId: string): Promise<string> {
  return (await findProgramAddress([SEED, bountyIdBytes(bountyId)], programId)).address;
}

export function createInstruction(input: {
  programId: string;
  funder: string;
  escrow: string;
  sponsor: string;
  approver: string;
  collection: string;
  bountyId: string;
  amount: bigint;
  expiresAt: number;
}): Instruction {
  const data = new Uint8Array(33);
  data[0] = 0;
  data.set(bountyIdBytes(input.bountyId), 1);
  const view = new DataView(data.buffer);
  view.setBigUint64(17, input.amount, true);
  view.setBigInt64(25, BigInt(input.expiresAt), true);
  return {
    programId: input.programId,
    accounts: [
      { address: input.funder, signer: true, writable: true },
      { address: input.escrow, writable: true },
      { address: input.sponsor },
      { address: input.approver },
      { address: input.collection },
      { address: SYSTEM_PROGRAM },
    ],
    data,
  };
}

export function acceptInstruction(input: { programId: string; approver: string; escrow: string; claimant: string; certification: string }): Instruction {
  return {
    programId: input.programId,
    accounts: [{ address: input.approver, signer: true }, { address: input.escrow, writable: true }, { address: input.claimant }, { address: input.certification }],
    data: Uint8Array.of(1),
  };
}

export function releaseInstruction(input: { programId: string; approver: string; escrow: string; claimant: string }): Instruction {
  return {
    programId: input.programId,
    accounts: [{ address: input.approver, signer: true }, { address: input.escrow, writable: true }, { address: input.claimant, writable: true }],
    data: Uint8Array.of(2),
  };
}

export function unclaimInstruction(input: { programId: string; approver: string; escrow: string }): Instruction {
  return { programId: input.programId, accounts: [{ address: input.approver, signer: true }, { address: input.escrow, writable: true }], data: Uint8Array.of(3) };
}

export function refundInstruction(input: { programId: string; authority: string; escrow: string; sponsor: string }): Instruction {
  return {
    programId: input.programId,
    accounts: [{ address: input.authority, signer: true }, { address: input.escrow, writable: true }, { address: input.sponsor, writable: true }],
    data: Uint8Array.of(4),
  };
}

/** The escrow account as the program wrote it. `null` when the bytes are not one. */
export function parseEscrowState(data: Uint8Array): EscrowState | null {
  if (data.length !== ESCROW_STATE_BYTES || data[0] !== 1 || data[2] >= STATUSES.length) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const keyAt = (offset: number) => base58Encode(data.slice(offset, offset + 32));
  const optional = (offset: number) => (keyAt(offset) === NO_KEY ? null : keyAt(offset));
  return {
    status: STATUSES[data[2]],
    id: uuidOf(data.slice(3, 19)),
    sponsor: keyAt(19),
    approver: keyAt(51),
    collection: keyAt(83),
    amount: view.getBigUint64(115, true),
    expiresAt: Number(view.getBigInt64(123, true)),
    claimant: optional(131),
    certification: optional(163),
  };
}
