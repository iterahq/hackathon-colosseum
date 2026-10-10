/** Byte layouts of the Token-2022 instructions the crystal mint uses. Pure: no key, no network. */

export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const CRYSTAL_NAME = 'Cristal de Fênix';
export const CRYSTAL_SYMBOL = 'FENIX';
export const CRYSTAL_DECIMALS = 0;
export const CRYSTAL_MINT_CONFIG_KEY = 'crystal_mint';

const KEY_BYTES = 32;
/** A mint padded to the account length, plus the account-type byte every extended account carries. */
const EXTENDED_BASE_BYTES = 165 + 1;
const TLV_HEADER_BYTES = 4;
/** NonTransferable (no data), PermanentDelegate (one key), MetadataPointer (authority + address). */
const FIXED_EXTENSION_BYTES = [0, KEY_BYTES, 2 * KEY_BYTES];
/** sha256("spl_token_metadata_interface:initialize_account")[0..8] */
const METADATA_INITIALIZE = [210, 225, 30, 162, 88, 184, 77, 141];

function u64(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('crystals: amount out of range');
  const bytes: number[] = [];
  let rest = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    bytes.push(Number(rest & 0xffn));
    rest >>= 8n;
  }
  return bytes;
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function borshString(text: string): number[] {
  const bytes = new TextEncoder().encode(text);
  return [...u32(bytes.length), ...bytes];
}

function key(bytes: Uint8Array): number[] {
  if (bytes.length !== KEY_BYTES) throw new Error('crystals: a key is 32 bytes');
  return [...bytes];
}

/** The size the mint account is created with: the fixed extensions, before the metadata is written. */
export const MINT_ACCOUNT_BYTES = EXTENDED_BASE_BYTES + FIXED_EXTENSION_BYTES.reduce((sum, bytes) => sum + TLV_HEADER_BYTES + bytes, 0);

/** The size the mint account reaches once the token program has appended the metadata; rent is paid for this. */
export function mintBytesWithMetadata(metadata: { name: string; symbol: string; uri: string }): number {
  const encoded = 2 * KEY_BYTES + borshString(metadata.name).length + borshString(metadata.symbol).length + borshString(metadata.uri).length + 4;
  return MINT_ACCOUNT_BYTES + TLV_HEADER_BYTES + encoded;
}

export function createAccountData(lamports: number, space: number, owner: Uint8Array): Uint8Array {
  return Uint8Array.from([...u32(0), ...u64(lamports), ...u64(space), ...key(owner)]);
}

export const initializeNonTransferableMintData = (): Uint8Array => Uint8Array.from([32]);

export const initializePermanentDelegateData = (delegate: Uint8Array): Uint8Array => Uint8Array.from([35, ...key(delegate)]);

export const initializeMetadataPointerData = (authority: Uint8Array, metadataAddress: Uint8Array): Uint8Array =>
  Uint8Array.from([39, 0, ...key(authority), ...key(metadataAddress)]);

/** `InitializeMint2` with no freeze authority. */
export const initializeMintData = (decimals: number, mintAuthority: Uint8Array): Uint8Array => Uint8Array.from([20, decimals, ...key(mintAuthority), 0]);

export const initializeMetadataData = (metadata: { name: string; symbol: string; uri: string }): Uint8Array =>
  Uint8Array.from([...METADATA_INITIALIZE, ...borshString(metadata.name), ...borshString(metadata.symbol), ...borshString(metadata.uri)]);

/** Associated token program, `CreateIdempotent`: no error when the account is already there. */
export const createTokenAccountData = (): Uint8Array => Uint8Array.from([1]);

export const mintToData = (amount: number): Uint8Array => Uint8Array.from([7, ...u64(amount)]);

export const burnData = (amount: number): Uint8Array => Uint8Array.from([8, ...u64(amount)]);
