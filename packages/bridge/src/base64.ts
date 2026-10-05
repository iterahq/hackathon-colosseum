/**
 * Strict base64 (RFC 4648, standard alphabet, padded), in pure TypeScript.
 *
 * Why not `atob` / `btoa`: the same file runs in the browser, in Node (tests)
 * and in Hermes (the shell), and `atob` is lenient: it skips whitespace and
 * accepts a missing pad. The shell must refuse a malformed chunk, not repair
 * it, so the decoder here accepts exactly the canonical form.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/** The canonical form: groups of 4, the alphabet only, `=` pad at the end only. */
export const BASE64_CANONICAL = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** The decoded length of a canonical base64 string, with no decode. */
export function base64DecodedLength(s: string): number {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return (s.length / 4) * 3 - pad;
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < n ? bytes[i + 1] : 0;
    const b2 = i + 2 < n ? bytes[i + 2] : 0;
    out += ALPHABET[b0 >> 2] + ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < n ? ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < n ? ALPHABET[b2 & 63] : '=';
  }
  return out;
}

/** Decode into `target` at `offset`. Throws on a non-canonical string or an overflow of `target`. Returns the bytes written. */
export function decodeBase64Into(s: string, target: Uint8Array, offset: number): number {
  if (!BASE64_CANONICAL.test(s)) throw new Error('not canonical base64');
  const len = base64DecodedLength(s);
  if (offset < 0 || offset + len > target.length) throw new Error('chunk overflows the file');
  let o = offset;
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (s[i + k] === '=' ? 0 : LOOKUP[s.charCodeAt(i + k)]));
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    target[o++] = (n >> 16) & 255;
    if (s[i + 2] !== '=') target[o++] = (n >> 8) & 255;
    if (s[i + 3] !== '=') target[o++] = n & 255;
  }
  return o - offset;
}
