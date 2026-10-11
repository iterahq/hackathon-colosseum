import { findProgramAddress, type Instruction } from './solana-message.ts';
import { SYSTEM_PROGRAM, base58Decode, base58Encode } from './solana-tx.ts';

/** The escrow program's instructions and account layout (`programs/bounty-escrow/src/lib.rs`). */
export const ESCROW_STATE_BYTES = 195;
/** A gated bounty: the same 195 bytes, then the days and the trail its terms ask for. */
export const GATED_ESCROW_STATE_BYTES = 228;
/** A direct bounty: the same 228 bytes, then the one wallet that may accept it. */
export const DIRECT_ESCROW_STATE_BYTES = 260;
const SEED = new TextEncoder().encode('bounty');
const STATUSES = ['open', 'claimed', 'paid', 'refunded'] as const;
const NO_KEY = '11111111111111111111111111111111';

export type EscrowStatus = (typeof STATUSES)[number];

/** What a gated bounty's terms ask of a certification: the program reads both from the asset account. */
export interface EscrowGate {
  minDays: number;
  /** `trailHash` of the certification's `program` and `trail` attributes, hex. */
  trail: string;
}

export interface EscrowState {
  /** `null`: a bounty created before gated escrows. Its accept is co-signed by an attester, who vouches for the days. */
  gate: EscrowGate | null;
  /** The only wallet the program lets accept (a direct bounty). `null`: any wallet whose certification passes the gate. */
  invitee: string | null;
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
  6014: 'claimant_must_sign',
  6015: 'certification_not_frozen',
  6016: 'certification_without_stamps',
  6017: 'certification_of_another_trail',
  6018: 'not_enough_stamped_days',
  6019: 'invalid_requirement',
  6020: 'not_invited',
};

const hexOf = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const bytesOfHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));

/** The trail a gated bounty names: sha256 of the certification's `program` attribute, a line feed, its `trail` attribute. */
export async function trailHash(program: string, trail: string): Promise<string> {
  return hexOf(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${program}\n${trail}`))));
}

function gateBytes(gate: EscrowGate): Uint8Array {
  const trail = bytesOfHex(gate.trail);
  if (!Number.isInteger(gate.minDays) || gate.minDays < 1 || gate.minDays > 255 || trail.length !== 32) throw new Error('not a gate');
  return Uint8Array.of(gate.minDays, ...trail);
}

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

export interface EscrowSeedTerms {
  bountyId: string;
  sponsor: string;
  approver: string;
  collection: string;
  amount: bigint;
  expiresAt: number;
  gate?: EscrowGate | null;
  /** A direct bounty: the address commits to the invited wallet too. Needs a gate. */
  invitee?: string | null;
}

function u64le(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, value), true);
  return bytes;
}

/**
 * The escrow account of a bounty. The address commits to the bounty id and to
 * every term, so an account at this address can only have been created with
 * these terms: nobody can occupy it with others.
 */
export async function escrowPda(programId: string, terms: EscrowSeedTerms): Promise<string> {
  const key = (address: string) => {
    const bytes = base58Decode(address, 32);
    if (!bytes) throw new Error('not a Solana address');
    return bytes;
  };
  const seeds = [SEED, bountyIdBytes(terms.bountyId), key(terms.sponsor), key(terms.approver), key(terms.collection), u64le(terms.amount), u64le(BigInt(terms.expiresAt))];
  if (terms.gate) {
    const gate = gateBytes(terms.gate);
    seeds.push(gate.slice(0, 1), gate.slice(1));
  }
  if (terms.invitee) {
    if (!terms.gate) throw new Error('a direct bounty needs a gate');
    seeds.push(key(terms.invitee));
  }
  return (await findProgramAddress(seeds, programId)).address;
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
  gate?: EscrowGate | null;
  invitee?: string | null;
}): Instruction {
  const gate = input.gate ? gateBytes(input.gate) : null;
  const invitee = input.invitee ? base58Decode(input.invitee, 32) : null;
  if (input.invitee && (!invitee || !gate)) throw new Error('not a direct bounty');
  const data = new Uint8Array(invitee ? 98 : gate ? 66 : 33);
  data[0] = invitee ? 6 : gate ? 5 : 0;
  if (gate) data.set(gate, 33);
  if (invitee) data.set(invitee, 66);
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

/**
 * The claimant signs: the program records nobody who did not ask for it.
 * On a bounty with no gate `attester` co-signs (the bounty's approver, or
 * Itera's attester key). On a `gated` one (a direct bounty is gated too) the
 * program reads the days itself and the first account is not read: nobody
 * co-signs. On a direct bounty the program also refuses any claimant but the
 * invitee its account names (`not_invited`).
 */
export function acceptInstruction(input: { programId: string; attester: string; escrow: string; claimant: string; certification: string; gated?: boolean }): Instruction {
  return {
    programId: input.programId,
    accounts: [{ address: input.attester, signer: !input.gated }, { address: input.escrow, writable: true }, { address: input.claimant, signer: true }, { address: input.certification }],
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

/** Reopens a held bounty. `authority`: the recorded claimant (giving up), the approver, or Itera's attester key. */
export function unclaimInstruction(input: { programId: string; authority: string; escrow: string }): Instruction {
  return { programId: input.programId, accounts: [{ address: input.authority, signer: true }, { address: input.escrow, writable: true }], data: Uint8Array.of(3) };
}

/** `authority`: the approver or the sponsor; once the bounty is past its expiry, any signer. */
export function refundInstruction(input: { programId: string; authority: string; escrow: string; sponsor: string }): Instruction {
  return {
    programId: input.programId,
    accounts: [{ address: input.authority, signer: true }, { address: input.escrow, writable: true }, { address: input.sponsor, writable: true }],
    data: Uint8Array.of(4),
  };
}

/** The escrow account as the program wrote it. `null` when the bytes are not one. */
export function parseEscrowState(data: Uint8Array): EscrowState | null {
  const direct = data.length === DIRECT_ESCROW_STATE_BYTES && data[0] === 3;
  const gated = direct || (data.length === GATED_ESCROW_STATE_BYTES && data[0] === 2);
  if (!(gated || (data.length === ESCROW_STATE_BYTES && data[0] === 1)) || data[2] >= STATUSES.length) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const keyAt = (offset: number) => base58Encode(data.slice(offset, offset + 32));
  const optional = (offset: number) => (keyAt(offset) === NO_KEY ? null : keyAt(offset));
  return {
    gate: gated ? { minDays: data[195], trail: hexOf(data.slice(196, 228)) } : null,
    invitee: direct ? keyAt(228) : null,
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
