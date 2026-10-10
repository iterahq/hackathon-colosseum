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

/** The field of Curve25519 and the `d` of the Edwards curve ed25519 lives on. */
const P = (1n << 255n) - 19n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
/** `y` of the points of order 8 (with `p - y`); together with 0, 1 and p - 1 these are every point of small order. */
const Y_ORDER_8 = 2707385501144840649318225287225658788936804267575313519463743609750303402022n;
const SMALL_ORDER_Y = new Set([0n, 1n, P - 1n, Y_ORDER_8, P - Y_ORDER_8]);

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let power = ((base % modulus) + modulus) % modulus;
  for (let rest = exponent; rest > 0n; rest >>= 1n) {
    if (rest & 1n) result = (result * power) % modulus;
    power = (power * power) % modulus;
  }
  return result;
}

/**
 * True when 32 bytes are a canonical ed25519 public key: a point ON the curve
 * and not one of the eight points of small order. An address that fails this
 * can sign nothing, so it can pay nothing: a System address, a program-derived
 * address, random bytes that miss the curve (about half of them) and the
 * degenerate keys are refused. It cannot tell a key someone holds from a point
 * nobody has the secret of.
 */
export function isEd25519PublicKeyBytes(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  let encoded = 0n;
  for (let index = 31; index >= 0; index -= 1) encoded = (encoded << 8n) | BigInt(bytes[index]);
  const y = encoded & ((1n << 255n) - 1n);
  if (y >= P || SMALL_ORDER_Y.has(y)) return false;
  // x^2 = (y^2 - 1) / (d y^2 + 1): the point exists when that is a square mod p (Euler's criterion).
  const ySquared = (y * y) % P;
  const numerator = (ySquared - 1n + P) % P;
  const denominator = (D * ySquared + 1n) % P;
  const xSquared = (numerator * modPow(denominator, P - 2n, P)) % P;
  return xSquared !== 0n && modPow(xSquared, (P - 1n) / 2n, P) === 1n;
}

/** `isSolanaAddress` and the address is a real ed25519 public key (see `isEd25519PublicKeyBytes`). */
export function isEd25519Address(value: unknown): value is string {
  if (!isSolanaAddress(value)) return false;
  let decoded = 0n;
  for (const char of value) decoded = decoded * 58n + BigInt(ALPHABET.indexOf(char));
  const bytes = new Uint8Array(32);
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(decoded & 0xffn);
    decoded >>= 8n;
  }
  return isEd25519PublicKeyBytes(bytes);
}
