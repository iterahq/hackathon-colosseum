const LAMPORTS_PER_SOL = 1_000_000_000n;

/** `1500000000` -> `1.5 SOL`; the fraction is never rounded. */
export function formatSol(lamports: number | bigint): string {
  const total = BigInt(lamports);
  const fraction = (total % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return `${total / LAMPORTS_PER_SOL}${fraction ? `.${fraction}` : ''} SOL`;
}

/** Rows of a hex dump: the offset, then up to `width` bytes in hex. */
export function hexRows(bytes: Uint8Array, limit = 256, width = 16): Array<{ offset: string; bytes: string }> {
  const rows: Array<{ offset: string; bytes: string }> = [];
  const end = Math.min(bytes.length, limit);
  for (let start = 0; start < end; start += width) {
    const row = [...bytes.subarray(start, Math.min(start + width, end))].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    rows.push({ offset: start.toString(16).padStart(4, '0'), bytes: row });
  }
  return rows;
}
