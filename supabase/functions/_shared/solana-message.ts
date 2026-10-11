import { base58Decode, base58Encode, compactU16, MEMO_PROGRAM } from './solana-tx.ts';

export interface AccountMeta {
  address: string;
  signer?: boolean;
  writable?: boolean;
}

export interface Instruction {
  programId: string;
  accounts: AccountMeta[];
  data: Uint8Array;
}

function key(address: string): Uint8Array {
  const bytes = base58Decode(address, 32);
  if (!bytes) throw new Error('not a Solana address');
  return bytes;
}

/**
 * A legacy (unversioned) transaction message for any list of instructions.
 * `payer` pays the fee and is the first account. Accounts are ordered as the
 * runtime requires: writable signers, read-only signers, writable, read-only.
 */
export function compileMessage(payer: string, instructions: readonly Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, { signer: boolean; writable: boolean }>([[payer, { signer: true, writable: true }]]);
  const touch = (address: string, signer: boolean, writable: boolean) => {
    const known = metas.get(address);
    metas.set(address, { signer: (known?.signer ?? false) || signer, writable: (known?.writable ?? false) || writable });
  };
  for (const instruction of instructions) {
    for (const account of instruction.accounts) touch(account.address, account.signer === true, account.writable === true);
    touch(instruction.programId, false, false);
  }
  const rank = (meta: { signer: boolean; writable: boolean }) => (meta.signer ? 0 : 2) + (meta.writable ? 0 : 1);
  const ordered = [...metas.entries()].map(([address, meta], index) => ({ address, meta, index })).sort((a, b) => rank(a.meta) - rank(b.meta) || a.index - b.index);
  const indexOf = new Map(ordered.map((entry, index) => [entry.address, index]));
  const count = (test: (meta: { signer: boolean; writable: boolean }) => boolean) => ordered.filter((entry) => test(entry.meta)).length;

  const bytes: number[] = [count((meta) => meta.signer), count((meta) => meta.signer && !meta.writable), count((meta) => !meta.signer && !meta.writable)];
  bytes.push(...compactU16(ordered.length));
  for (const entry of ordered) bytes.push(...key(entry.address));
  bytes.push(...key(recentBlockhash));
  bytes.push(...compactU16(instructions.length));
  for (const instruction of instructions) {
    bytes.push(indexOf.get(instruction.programId) as number);
    bytes.push(...compactU16(instruction.accounts.length), ...instruction.accounts.map((account) => indexOf.get(account.address) as number));
    bytes.push(...compactU16(instruction.data.length), ...instruction.data);
  }
  return Uint8Array.from(bytes);
}

/** How many signatures a compiled message needs. */
export function requiredSignatures(message: Uint8Array): number {
  return message[0];
}

/** A memo. The Memo program checks that every address in `signers` signed the transaction. */
export function memoInstruction(text: string, signers: readonly string[] = []): Instruction {
  const data = new TextEncoder().encode(text);
  if (data.length === 0 || data.length > 256) throw new Error('memo must be 1..256 bytes');
  return { programId: MEMO_PROGRAM, accounts: signers.map((address) => ({ address, signer: true })), data };
}

export interface DecodedMessage {
  payer: string;
  /** The accounts that must sign, in signature order (the payer first). */
  signers: string[];
  recentBlockhash: string;
  instructions: Instruction[];
}

/** Reads a legacy transaction message back into its instructions. `null` when the bytes are not one (or are a versioned message). */
export function decodeMessage(message: Uint8Array): DecodedMessage | null {
  let offset = 0;
  const take = (length: number): Uint8Array | null => {
    if (length < 0 || offset + length > message.length) return null;
    offset += length;
    return message.subarray(offset - length, offset);
  };
  const compact = (): number | null => {
    let value = 0;
    for (let shift = 0; shift <= 14; shift += 7) {
      const byte = take(1)?.[0];
      if (byte === undefined) return null;
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
    }
    return null;
  };
  const header = take(3);
  if (!header || header[0] >= 0x80 || header[0] === 0) return null;
  const [signatures, readonlySigned, readonlyUnsigned] = header;
  const keyCount = compact();
  if (keyCount === null || keyCount < signatures || signatures < readonlySigned || keyCount - signatures < readonlyUnsigned) return null;
  const keys: string[] = [];
  for (let index = 0; index < keyCount; index += 1) {
    const bytes = take(32);
    if (!bytes) return null;
    keys.push(base58Encode(bytes));
  }
  const blockhash = take(32);
  const count = compact();
  if (!blockhash || count === null) return null;
  const meta = (index: number): AccountMeta => ({
    address: keys[index],
    signer: index < signatures,
    writable: index < signatures ? index < signatures - readonlySigned : index < keyCount - readonlyUnsigned,
  });
  const instructions: Instruction[] = [];
  for (let index = 0; index < count; index += 1) {
    const program = take(1)?.[0];
    const accountCount = compact();
    const accountIndexes = accountCount === null ? null : take(accountCount);
    const dataLength = compact();
    const data = dataLength === null ? null : take(dataLength);
    if (program === undefined || program >= keyCount || !accountIndexes || !data || [...accountIndexes].some((account) => account >= keyCount)) return null;
    instructions.push({ programId: keys[program], accounts: [...accountIndexes].map(meta), data: Uint8Array.from(data) });
  }
  if (offset !== message.length) return null;
  return { payer: keys[0], signers: keys.slice(0, signatures), recentBlockhash: base58Encode(blockhash), instructions };
}

const P = (1n << 255n) - 19n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;

function modPow(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let power = ((base % P) + P) % P;
  for (let rest = exponent; rest > 0n; rest >>= 1n) {
    if (rest & 1n) result = (result * power) % P;
    power = (power * power) % P;
  }
  return result;
}

/**
 * Whether 32 bytes decompress to a point of the ed25519 curve, by the same rule
 * the runtime uses for program-derived addresses: `(y^2 - 1) / (d y^2 + 1)` is a square.
 */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  let y = 0n;
  for (let index = 31; index >= 0; index -= 1) y = (y << 8n) | BigInt(index === 31 ? bytes[index] & 0x7f : bytes[index]);
  y %= P;
  const yy = (y * y) % P;
  const u = (yy - 1n + P) % P;
  const v = (D * yy + 1n) % P;
  if (u === 0n) return true;
  if (v === 0n) return false;
  const ratio = (u * modPow(v, P - 2n)) % P;
  return modPow(ratio, (P - 1n) / 2n) === 1n;
}

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

/** The program-derived address of `seeds` and the bump that takes it off the curve. */
export async function findProgramAddress(seeds: readonly Uint8Array[], programId: string): Promise<{ address: string; bump: number }> {
  const program = key(programId);
  for (let bump = 255; bump >= 0; bump -= 1) {
    const input = Uint8Array.from([...seeds.flatMap((seed) => [...seed]), bump, ...program, ...PDA_MARKER]);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
    if (!isOnCurve(hash)) return { address: base58Encode(hash), bump };
  }
  throw new Error('no program-derived address for these seeds');
}
