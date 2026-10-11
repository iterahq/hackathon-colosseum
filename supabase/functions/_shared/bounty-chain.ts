import {
  acceptInstruction,
  createInstruction,
  parseEscrowState,
  refundInstruction,
  releaseInstruction,
  unclaimInstruction,
  ESCROW_ERRORS,
  type EscrowState,
} from './bounty-program.ts';
import { compileMessage, memoInstruction, type Instruction } from './solana-message.ts';
import { ESCROW_STATE_BYTES } from './bounty-program.ts';
import { RpcNodeError, rpc } from './rpc.ts';
import { sendMessage, treasurySigner } from './treasury.ts';

/** The escrow program refused: `code` is its own reason (`ESCROW_ERRORS`). */
export class EscrowProgramError extends Error {
  constructor(readonly code: string) {
    super(`escrow program: ${code}`);
  }
}

interface AccountInfo {
  data: [string, string];
  owner: string;
}

/** A bounty's escrow account as the program holds it. `null` when it does not exist or is not the program's. */
export async function readEscrow(programId: string, address: string): Promise<EscrowState | null> {
  const { value } = await rpc<{ value: AccountInfo | null }>('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
  if (!value || value.owner !== programId) return null;
  return parseEscrowState(Uint8Array.from(atob(value.data[0]), (char) => char.charCodeAt(0)));
}

/** Many escrow accounts in one call, by address. An address that holds no escrow of the program is absent. */
export async function readEscrows(programId: string, addresses: string[]): Promise<Map<string, EscrowState>> {
  const found = new Map<string, EscrowState>();
  if (addresses.length === 0) return found;
  const { value } = await rpc<{ value: Array<AccountInfo | null> }>('getMultipleAccounts', [addresses.slice(0, 100), { encoding: 'base64', commitment: 'confirmed' }]);
  value.forEach((info, index) => {
    if (!info || info.owner !== programId) return;
    const state = parseEscrowState(Uint8Array.from(atob(info.data[0]), (char) => char.charCodeAt(0)));
    if (state) found.set(addresses[index], state);
  });
  return found;
}

/** The program's own reason when the node refused a transaction at simulation, `null` for any other failure. */
export function refusal(error: unknown): EscrowProgramError | null {
  if (!(error instanceof RpcNodeError)) return null;
  const match = /custom program error: 0x([0-9a-f]+)/i.exec(error.nodeMessage);
  const code = match ? ESCROW_ERRORS[Number.parseInt(match[1], 16)] : undefined;
  return code ? new EscrowProgramError(code) : null;
}

/**
 * Sends instructions signed by this server's key (the treasury: Itera's
 * attester, and the approver of Itera's own bounties), with a memo naming the
 * bounty step. A refusal by the program at simulation surfaces as
 * `EscrowProgramError` and nothing is sent.
 */
export async function sendAsApprover(instructions: Instruction[], memo: string, onBroadcast?: (signature: string) => Promise<void>): Promise<string> {
  const signer = await treasurySigner();
  try {
    return await sendMessage(signer, (recentBlockhash) => compileMessage(signer.address, [...instructions, memoInstruction(memo)], recentBlockhash), onBroadcast);
  } catch (error) {
    throw refusal(error) ?? error;
  }
}

export interface EscrowTerms {
  programId: string;
  escrow: string;
  /** Signs `release`, and so decides when the reward is paid: the treasury for Itera's own bounties, the sponsor's wallet otherwise. */
  approver: string;
  /** The key this server signs with (Itera's attester). It co-signs `accept` and may `unclaim`; it is the approver only of Itera's own bounties. */
  attester: string;
  sponsor: string;
  collection: string;
  bountyId: string;
  amount: bigint;
  expiresAt: number;
}

export function createFor(terms: EscrowTerms, funder: string): Instruction {
  return createInstruction({ ...terms, funder });
}

/** Whether the account on chain is the bounty we posted: same terms, our approver, and money still in it. */
export function matchesTerms(state: EscrowState | null, terms: EscrowTerms): boolean {
  return (
    state !== null &&
    state.id === terms.bountyId &&
    state.approver === terms.approver &&
    state.sponsor === terms.sponsor &&
    state.collection === terms.collection &&
    state.amount >= terms.amount &&
    state.expiresAt >= terms.expiresAt
  );
}

type Party = { programId: string; approver: string; attester: string; escrow: string };

/**
 * The instructions that take the escrow account from where it is to "held by
 * `claimant`", for the claimant to sign. A claim our tables already let go of
 * and the chain still shows is released first, in the same transaction.
 */
export function acceptPlan(state: EscrowState, party: Party, claimant: string, certification: string): Instruction[] | 'closed' {
  if (state.status === 'paid' || state.status === 'refunded') return 'closed';
  const reopen = state.status === 'claimed' ? [unclaimInstruction({ programId: party.programId, authority: party.attester, escrow: party.escrow })] : [];
  return [...reopen, acceptInstruction({ programId: party.programId, attester: party.attester, escrow: party.escrow, claimant, certification })];
}

/**
 * The instructions that pay `claimant`. `done` when the account already says it
 * paid them; `closed` when it cannot: it paid someone else, was refunded, or
 * does not name this claimant (only their own signature can put them there).
 */
export function releasePlan(state: EscrowState, party: Party, claimant: string): Instruction[] | 'done' | 'closed' {
  if (state.status === 'paid') return state.claimant === claimant ? 'done' : 'closed';
  if (state.status !== 'claimed' || state.claimant !== claimant) return 'closed';
  return [releaseInstruction({ programId: party.programId, approver: party.approver, escrow: party.escrow, claimant })];
}

/** The instructions that return the money to the sponsor, signed by this server's key. */
export function refundPlan(state: EscrowState, party: Party): Instruction[] | 'done' | 'closed' {
  if (state.status === 'refunded') return 'done';
  if (state.status === 'paid') return 'closed';
  const reopen = state.status === 'claimed' ? [unclaimInstruction({ programId: party.programId, authority: party.attester, escrow: party.escrow })] : [];
  return [...reopen, refundInstruction({ programId: party.programId, authority: party.attester, escrow: party.escrow, sponsor: state.sponsor })];
}

/** The rent the node asks for an escrow account, which whoever funds a bounty pays on top of the reward. */
export async function escrowRentLamports(): Promise<bigint> {
  return BigInt(await rpc<number>('getMinimumBalanceForRentExemption', [ESCROW_STATE_BYTES]));
}
