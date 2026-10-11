/**
 * An upgradeable program's two accounts (BPF upgradeable loader), decoded in the browser: where its
 * code lives, when it was last deployed, and which key may replace it.
 */
import { base58Encode } from '@/lib/chain/base58';

export const UPGRADEABLE_LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';
/** Bytes before the program's code in its data account: tag u32, slot u64, option byte, authority key. */
export const PROGRAM_DATA_HEADER_BYTES = 45;

/** The data account a program account points at. `null` when the bytes are not a program account. */
export function programDataAddress(programAccount: Uint8Array): string | null {
  if (programAccount.length !== 36 || new DataView(programAccount.buffer, programAccount.byteOffset, 4).getUint32(0, true) !== 2) return null;
  return base58Encode(programAccount.subarray(4, 36));
}

export interface ProgramDataHeader {
  lastDeployedSlot: number;
  /** The key that may replace the program. `null`: nobody can, the program is final. */
  upgradeAuthority: string | null;
}

export function parseProgramDataHeader(data: Uint8Array): ProgramDataHeader | null {
  if (data.length < PROGRAM_DATA_HEADER_BYTES) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 3) return null;
  return { lastDeployedSlot: Number(view.getBigUint64(4, true)), upgradeAuthority: data[12] === 1 ? base58Encode(data.subarray(13, 45)) : null };
}
