import type { ParsedTransaction } from './purchase-verify.ts';
import { MEMO_PROGRAM, SIGNATURE_BYTES, SYSTEM_PROGRAM, base58Bytes, base58Encode, base64Decode } from './solana-tx.ts';

const KEY_BYTES = 32;
const MEMO_V1_PROGRAM = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EZVfJf9bBYHJ';
const MEMO_PROGRAMS = new Set([MEMO_PROGRAM, MEMO_V1_PROGRAM]);
/** The largest packet a Solana node accepts. */
export const MAX_TRANSACTION_BYTES = 1232;
const SYSTEM_TRANSFER = 2;
const VERSIONED_FLAG = 0x80;

export interface SignedTransaction {
  /** The wire bytes, exactly as they are broadcast. */
  bytes: Uint8Array;
  signatures: Uint8Array[];
  /** What every signer signed. */
  message: Uint8Array;
  requiredSignatures: number;
  accountKeys: string[];
  instructions: Array<{ programId: string; accounts: string[]; data: Uint8Array }>;
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  get done(): boolean {
    return this.offset === this.bytes.length;
  }

  byte(): number {
    if (this.offset >= this.bytes.length) throw new RangeError('truncated');
    return this.bytes[this.offset++];
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new RangeError('truncated');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  compactU16(): number {
    let value = 0;
    for (let shift = 0; shift <= 14; shift += 7) {
      const byte = this.byte();
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
    }
    throw new RangeError('compact-u16 too long');
  }
}

/** A legacy wire transaction, read strictly: every byte accounted for, every index in range. */
export function parseSignedTransaction(bytes: Uint8Array): SignedTransaction | null {
  if (bytes.length === 0 || bytes.length > MAX_TRANSACTION_BYTES) return null;
  try {
    const reader = new Reader(bytes);
    const signatureCount = reader.compactU16();
    if (signatureCount === 0) return null;
    const signatures = Array.from({ length: signatureCount }, () => reader.take(SIGNATURE_BYTES));

    const messageStart = reader.position;
    const requiredSignatures = reader.byte();
    if (requiredSignatures & VERSIONED_FLAG) return null;
    reader.take(2);
    const keyCount = reader.compactU16();
    if (requiredSignatures !== signatureCount || keyCount < requiredSignatures) return null;
    const accountKeys = Array.from({ length: keyCount }, () => base58Encode(reader.take(KEY_BYTES)));
    reader.take(KEY_BYTES);

    const instructionCount = reader.compactU16();
    const instructions = [];
    for (let index = 0; index < instructionCount; index += 1) {
      const programIndex = reader.byte();
      const accountIndexes = [...reader.take(reader.compactU16())];
      const data = reader.take(reader.compactU16());
      if (programIndex >= keyCount || accountIndexes.some((account) => account >= keyCount)) return null;
      instructions.push({ programId: accountKeys[programIndex], accounts: accountIndexes.map((account) => accountKeys[account]), data });
    }
    if (!reader.done) return null;
    return { bytes, signatures, message: bytes.subarray(messageStart), requiredSignatures, accountKeys, instructions };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** A signed transaction given as base64 or base58 text. `null` when it is neither or is not a transaction. */
export function decodeSignedTransaction(text: unknown): SignedTransaction | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TRANSACTION_BYTES * 2) return null;
  for (const bytes of [base64Decode(text), base58Bytes(text)]) {
    const transaction = bytes && parseSignedTransaction(bytes);
    if (transaction) return transaction;
  }
  return null;
}

/** The transaction id: its first signature, the fee payer's. */
export function transactionSignature(transaction: SignedTransaction): string {
  return base58Encode(transaction.signatures[0]);
}

function parsedInstruction(instruction: SignedTransaction['instructions'][number]): { program?: string; parsed?: unknown } {
  if (instruction.programId === SYSTEM_PROGRAM && instruction.data.length === 12 && instruction.accounts.length >= 2) {
    const view = new DataView(instruction.data.buffer, instruction.data.byteOffset, instruction.data.byteLength);
    if (view.getUint32(0, true) === SYSTEM_TRANSFER) {
      return {
        program: 'system',
        parsed: {
          type: 'transfer',
          info: { source: instruction.accounts[0], destination: instruction.accounts[1], lamports: view.getBigUint64(4, true).toString() },
        },
      };
    }
  }
  if (MEMO_PROGRAMS.has(instruction.programId)) {
    try {
      return { program: 'spl-memo', parsed: new TextDecoder('utf-8', { fatal: true }).decode(instruction.data) };
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * The transaction as the node would report it once it landed without error, so a
 * signed transaction is judged by `verifyPayment` before it is broadcast.
 */
export function asParsedTransaction(transaction: SignedTransaction): ParsedTransaction {
  return {
    meta: { err: null },
    transaction: {
      message: {
        accountKeys: transaction.accountKeys.map((pubkey, index) => ({ pubkey, signer: index < transaction.requiredSignatures })),
        instructions: transaction.instructions.map(parsedInstruction),
      },
    },
  };
}
