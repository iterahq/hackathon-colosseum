/**
 * A bounty's escrow account as the escrow program wrote it (`programs/bounty-escrow/src/lib.rs`),
 * decoded from its raw bytes in the browser. Three layouts, fixed offsets: 195 bytes (tag 1), for a gated bounty 228 bytes (tag 2) and, for a direct bounty, 260 bytes (tag 3).
 */
import { base58Encode } from '@/lib/chain/base58';

export const ESCROW_PROGRAM = 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq';
export const ESCROW_STATE_BYTES = 195;
export const GATED_ESCROW_STATE_BYTES = 228;
export const DIRECT_ESCROW_STATE_BYTES = 260;
export const ESCROW_STATUSES = ['open', 'claimed', 'paid', 'refunded'] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

/** Field, first byte, length: the table the "Verify it yourself" page prints. */
export const ESCROW_LAYOUT = [
  { field: 'tag', offset: 0, length: 1 },
  { field: 'bump', offset: 1, length: 1 },
  { field: 'status', offset: 2, length: 1 },
  { field: 'bounty id', offset: 3, length: 16 },
  { field: 'sponsor', offset: 19, length: 32 },
  { field: 'approver', offset: 51, length: 32 },
  { field: 'collection', offset: 83, length: 32 },
  { field: 'amount', offset: 115, length: 8 },
  { field: 'expires at', offset: 123, length: 8 },
  { field: 'claimant', offset: 131, length: 32 },
  { field: 'certification', offset: 163, length: 32 },
] as const;

/** The fields a gated account adds after the 195 common bytes. */
export const GATED_ESCROW_LAYOUT = [
  ...ESCROW_LAYOUT,
  { field: 'min days', offset: 195, length: 1 },
  { field: 'trail', offset: 196, length: 32 },
] as const;

/** The fields a direct account adds after the 228 gated bytes: the one wallet the program lets accept. */
export const DIRECT_ESCROW_LAYOUT = [...GATED_ESCROW_LAYOUT, { field: 'invitee', offset: 228, length: 32 }] as const;

export interface EscrowGate {
  minDays: number;
  /** sha256(program attribute, line feed, trail attribute), hex. */
  trail: string;
}

export interface EscrowAccount {
  gate: EscrowGate | null;
  /** Direct bounty only: the single wallet the program accepts as claimant. */
  invitee: string | null;
  status: EscrowStatus;
  bountyId: string;
  sponsor: string;
  approver: string;
  collection: string;
  lamports: bigint;
  expiresAt: number;
  claimant: string | null;
  certification: string | null;
}

const NO_KEY = '11111111111111111111111111111111';

export function parseEscrowAccount(data: Uint8Array): EscrowAccount | null {
  const direct = data.length === DIRECT_ESCROW_STATE_BYTES && data[0] === 3;
  const gated = direct || (data.length === GATED_ESCROW_STATE_BYTES && data[0] === 2);
  if (!gated && (data.length !== ESCROW_STATE_BYTES || data[0] !== 1)) return null;
  if (data[2] >= ESCROW_STATUSES.length) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const keyAt = (offset: number) => base58Encode(data.subarray(offset, offset + 32));
  const optional = (offset: number) => (keyAt(offset) === NO_KEY ? null : keyAt(offset));
  const id = [...data.subarray(3, 19)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    invitee: direct ? keyAt(228) : null,
    gate: gated ? { minDays: data[195], trail: [...data.subarray(196, 228)].map((byte) => byte.toString(16).padStart(2, '0')).join('') } : null,
    status: ESCROW_STATUSES[data[2]],
    bountyId: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`,
    sponsor: keyAt(19),
    approver: keyAt(51),
    collection: keyAt(83),
    lamports: view.getBigUint64(115, true),
    expiresAt: Number(view.getBigInt64(123, true)),
    claimant: optional(131),
    certification: optional(163),
  };
}
