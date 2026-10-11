import { verifyEd25519 } from './ed25519.ts';
import { latestBlockhash } from './rpc.ts';
import { compileMessage, decodeMessage, type Instruction } from './solana-message.ts';
import { SIGNATURE_BYTES, base58Decode, base58Encode, base64Decode, base64Encode, compactU16 } from './solana-tx.ts';
import { broadcast, signMessage, treasurySigner } from './treasury.ts';

/**
 * Wallet-signed, fee-sponsored transactions. The server builds a message whose
 * fee payer is the treasury and which needs the learner's wallet as a signer;
 * the wallet signs it in the browser (it holds no SOL and pays nothing); the
 * server checks that what came back is the transaction it offered, adds the fee
 * payer's signature and sends it.
 */

export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
/** Assertions some wallets (Phantom) append to what they sign. They move nothing. */
export const LIGHTHOUSE_PROGRAM = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';
const SET_COMPUTE_UNIT_LIMIT = 2;
const SET_COMPUTE_UNIT_PRICE = 3;
/** The most a wallet-added priority fee may charge the fee payer, in micro-lamports per compute unit. */
const MAX_UNIT_PRICE = 50_000n;

export type CosignFailure = 'invalid_transaction' | 'invalid_signature' | 'expired';

export class CosignError extends Error {
  constructor(readonly code: CosignFailure, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export interface CosignOffer {
  /** The message to sign, as the wallet APIs take it. */
  message_base58: string;
  message_base64: string;
  /** Pays the fee. Signs after the wallet did. */
  fee_payer: string;
  /** The wallet that must sign. */
  signer: string;
  last_valid_block_height: number;
}

/** The message for `instructions`, with the treasury as fee payer. `wallet` must be a signer of one of them. */
export async function offerCosigned(wallet: string, instructions: readonly Instruction[]): Promise<CosignOffer> {
  const feePayer = (await treasurySigner()).address;
  if (wallet === feePayer) throw new CosignError('invalid_transaction', 'the wallet is the fee payer');
  if (!instructions.some((instruction) => instruction.accounts.some((account) => account.address === wallet && account.signer))) {
    throw new Error('offerCosigned: the wallet signs none of the instructions');
  }
  const { blockhash, lastValidBlockHeight } = await latestBlockhash();
  const message = compileMessage(feePayer, instructions, blockhash);
  return { message_base58: base58Encode(message), message_base64: base64Encode(message), fee_payer: feePayer, signer: wallet, last_valid_block_height: lastValidBlockHeight };
}

function sameInstruction(found: Instruction, expected: Instruction): boolean {
  return (
    found.programId === expected.programId &&
    found.accounts.length === expected.accounts.length &&
    found.accounts.every((account, index) => account.address === expected.accounts[index].address) &&
    found.data.length === expected.data.length &&
    found.data.every((byte, index) => byte === expected.data[index])
  );
}

/** An instruction the wallet added on its own: harmless only if it cannot spend the fee payer's money. */
function harmlessExtra(instruction: Instruction, feePayer: string): boolean {
  if (instruction.accounts.some((account) => account.address === feePayer)) return false;
  if (instruction.programId === LIGHTHOUSE_PROGRAM) return true;
  if (instruction.programId !== COMPUTE_BUDGET_PROGRAM) return false;
  if (instruction.data[0] === SET_COMPUTE_UNIT_LIMIT) return instruction.data.length === 5;
  if (instruction.data[0] !== SET_COMPUTE_UNIT_PRICE || instruction.data.length !== 9) return false;
  return new DataView(instruction.data.buffer, instruction.data.byteOffset, 9).getBigUint64(1, true) <= MAX_UNIT_PRICE;
}

/**
 * Whether `message` is the transaction we would offer for `expected`: the
 * treasury pays, the only other signer is `wallet`, our instructions are all
 * there in order, and anything else is a harmless wallet addition.
 */
export function checkCosignedMessage(message: Uint8Array, input: { wallet: string; feePayer: string; expected: readonly Instruction[] }): void {
  const decoded = decodeMessage(message);
  if (!decoded) throw new CosignError('invalid_transaction', 'not a legacy message');
  if (decoded.payer !== input.feePayer) throw new CosignError('invalid_transaction', 'fee payer');
  if (decoded.signers.length !== 2 || decoded.signers[1] !== input.wallet) throw new CosignError('invalid_transaction', 'signers');
  let next = 0;
  for (const instruction of decoded.instructions) {
    if (next < input.expected.length && sameInstruction(instruction, input.expected[next])) next += 1;
    else if (!harmlessExtra(instruction, input.feePayer)) throw new CosignError('invalid_transaction', `instruction of ${instruction.programId}`);
  }
  if (next !== input.expected.length) throw new CosignError('invalid_transaction', 'missing instruction');
}

export interface SignedByWallet {
  message: Uint8Array;
  signature: Uint8Array;
}

/** `{ message, signature }` of a request body, both base64. `null` when either is malformed. */
export function parseSignedByWallet(body: Record<string, unknown>): SignedByWallet | null {
  const message = typeof body.message === 'string' && body.message.length <= 2048 ? base64Decode(body.message) : null;
  const signature = typeof body.signature === 'string' ? base64Decode(body.signature) : null;
  return message && signature && signature.length === SIGNATURE_BYTES ? { message, signature } : null;
}

/**
 * Checks the wallet's work and sends it with the fee payer's signature added.
 * Throws `CosignError` when the message is not the one offered or the wallet's
 * signature is not over it; `RpcNodeError` when the node refuses it at
 * simulation; `TransferBroadcastError` once it was handed to the node.
 */
export async function sendCosigned(signed: SignedByWallet, wallet: string, expected: readonly Instruction[], onBroadcast?: (signature: string) => Promise<void>): Promise<string> {
  const feePayer = await treasurySigner();
  checkCosignedMessage(signed.message, { wallet, feePayer: feePayer.address, expected });
  const walletKey = base58Decode(wallet, 32);
  if (!walletKey || !(await verifyEd25519(walletKey, signed.signature, signed.message))) throw new CosignError('invalid_signature');
  const ours = await signMessage(feePayer, signed.message);
  return broadcast(Uint8Array.from([...compactU16(2), ...ours, ...signed.signature, ...signed.message]), onBroadcast);
}

/** Whether the node refused a transaction because its blockhash is too old (the wallet took too long). */
export function isExpiredBlockhash(nodeMessage: string): boolean {
  return /blockhash not found|block height exceeded/i.test(nodeMessage);
}
