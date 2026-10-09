const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** True for a base58 string that decodes to exactly 32 bytes (a Solana public key). */
export function isSolanaAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  let decoded = 0n;
  for (const char of value) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return false;
    decoded = decoded * 58n + BigInt(digit);
  }
  let leadingZeros = 0;
  while (value[leadingZeros] === '1') leadingZeros += 1;
  const significantBytes = decoded === 0n ? 0 : Math.ceil(decoded.toString(16).length / 2);
  return leadingZeros + significantBytes === 32;
}
