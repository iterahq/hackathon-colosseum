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

function refusal(error: unknown): EscrowProgramError | null {
  if (!(error instanceof RpcNodeError)) return null;
  const match = /custom program error: 0x([0-9a-f]+)/i.exec(error.nodeMessage);
  const code = match ? ESCROW_ERRORS[Number.parseInt(match[1], 16)] : undefined;
  return code ? new EscrowProgramError(code) : null;
}

/**
 * Sends instructions signed by the approver (the treasury key), with a memo
 * naming the bounty step. A refusal by the program at simulation surfaces as
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
  approver: string;
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

type Party = { programId: string; approver: string; escrow: string };

/**
 * The instructions that take the escrow account from where it is to "held by
 * `claimant`". A claim our tables already let go of (rejected, withdrawn, out
 * of time) is released on chain first, in the same transaction.
 */
export function acceptPlan(state: EscrowState, party: Party, claimant: string, certification: string): Instruction[] | 'held' | 'closed' {
  if (state.status === 'paid' || state.status === 'refunded') return 'closed';
  if (state.status === 'claimed' && state.claimant === claimant) return 'held';
  return [...(state.status === 'claimed' ? [unclaimInstruction(party)] : []), acceptInstruction({ ...party, claimant, certification })];
}

/** The instructions that pay `claimant`. `done` when the account already says it paid them; `closed` when it can no longer. */
export function releasePlan(state: EscrowState, party: Party, claimant: string, certification: string): Instruction[] | 'done' | 'closed' {
  if (state.status === 'paid') return state.claimant === claimant ? 'done' : 'closed';
  if (state.status === 'refunded') return 'closed';
  const accept = acceptPlan(state, party, claimant, certification);
  return [...(Array.isArray(accept) ? accept : []), releaseInstruction({ ...party, claimant })];
}

/** The instructions that return the money to the sponsor. */
export function refundPlan(state: EscrowState, party: Party): Instruction[] | 'done' | 'closed' {
  if (state.status === 'refunded') return 'done';
  if (state.status === 'paid') return 'closed';
  return [...(state.status === 'claimed' ? [unclaimInstruction(party)] : []), refundInstruction({ programId: party.programId, authority: party.approver, escrow: party.escrow, sponsor: state.sponsor })];
}
