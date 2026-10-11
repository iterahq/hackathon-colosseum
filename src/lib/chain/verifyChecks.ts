import { sha256Hex } from '@/lib/chain/base58';
import { PROGRAM_DATA_HEADER_BYTES } from '@/lib/chain/programData';

export interface EscrowIdl {
  address: string;
  metadata: { binary_sha256: string; built_by: string; source: string; binary: string; framework: string };
  instructions: Array<{ name: string; accounts: Array<{ name: string; signer?: boolean; docs?: string }>; checks: string }>;
}

export const SOURCE_PATH = '/verify/bounty-escrow.rs';
export const IDL_PATH = '/verify/bounty-escrow.idl.json';
export const BINARY_PATH = '/verify/itera_bounty_escrow.so';

/**
 * The sha256 of the three files above as Itera's authority key (the program's upgrade authority) wrote them in a
 * memo on Solana devnet. The site cannot edit that transaction: a file served here that no longer hashes to its
 * line was changed after the record. `scripts/hackathon/publish-program-hashes.mjs` writes a new one.
 */
export const PUBLISHED_RECORD = {
  signature: '2gWPWR8wQbpC1PCugL7Hd1kP87aKmMzwFGKc8ueBvFnkiJpWjRn1T31mwqi6CL7sSD3krUv6rg8dBn2VZC6KN6gz',
  signer: 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B',
  date: '2026-10-11',
  files: [
    { path: BINARY_PATH, label: 'so', sha256: '17c346404f60ba1f6d76d889aa1b25ccd5333ae661dc1b2f383d1e76fb5787f9' },
    { path: SOURCE_PATH, label: 'rs', sha256: '331b75855d34a84cae7cfe44218d475bef7ee3c47bc980f592140c016fa579b1' },
    { path: IDL_PATH, label: 'idl', sha256: 'bc4794e4078bfb160bb2bd6e6e026b7a0dcb780d61b53760ade511619f885c09' },
  ],
} as const;

export interface InstructionRow {
  name: string;
  signers: string[];
  checks: string;
}

export function instructionRows(idl: EscrowIdl): InstructionRow[] {
  return idl.instructions.map((instruction) => ({
    name: instruction.name,
    signers: instruction.accounts.filter((account) => account.signer).map((account) => account.name),
    checks: instruction.checks,
  }));
}

/** The table row in the reader's language: the program's own words stay for what has no message. */
export function localizeRow(row: InstructionRow, messages: Record<string, string>): InstructionRow {
  return {
    name: messages[`verify.source.name.${row.name}`] ?? row.name,
    signers: [messages[`verify.source.signers.${row.name}`] ?? row.signers.join(', ')],
    checks: messages[`verify.source.checks.${row.name}`] ?? row.checks,
  };
}

/** From the line that declares `fn <name>(` to the next line that is exactly `}`. */
export function functionSource(source: string, name: string): string | null {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.includes(`fn ${name}(`));
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && line === '}');
  return end === -1 ? null : lines.slice(start, end + 1).join('\n');
}

export const acceptFunctionSource = (source: string): string | null => functionSource(source, 'accept');

export interface BinaryCheck {
  onChain: string;
  file: string;
  published: string;
  match: boolean;
  bytes: number;
}

/** The program's code sits right after the 45-byte header of its data account, followed by zero padding. */
export async function compareBinary(dataAccount: Uint8Array, binary: Uint8Array, publishedHash: string): Promise<BinaryCheck> {
  const [onChain, file] = await Promise.all([sha256Hex(dataAccount.subarray(PROGRAM_DATA_HEADER_BYTES, PROGRAM_DATA_HEADER_BYTES + binary.length)), sha256Hex(binary)]);
  return { onChain, file, published: publishedHash, match: onChain === file && file === publishedHash, bytes: binary.length };
}

export type EvidenceVerdict = 'match' | 'no-match' | 'not-on-chain';

/** The chain stores a short prefix of the hash (16, 12 or 8 hex characters). */
export function evidenceVerdict(onChainValue: string | null, recomputed: string): EvidenceVerdict {
  if (!onChainValue) return 'not-on-chain';
  return recomputed.startsWith(onChainValue.toLowerCase()) ? 'match' : 'no-match';
}

export const evidenceShellLine = (functionsBase: string, wallet: string, claim: string): string =>
  `curl -s "${functionsBase}/functions/v1/learner-profile/${wallet}/evidence/${claim}" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | jq -j .evidence | sha256sum`;
