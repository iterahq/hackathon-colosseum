/**
 * The two small readings of a JWT that `nativeSession.ts` (the claims gate) and `backendProbe.ts` (the role of the anon key)
 * share: the payload as an object, and the shape of a UUID. Shape only: nothing here checks a signature.
 *
 * Pure TypeScript: no React Native import.
 */
import { base64DecodedLength, decodeBase64Into } from '@iterahq/shell-bridge';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The payload (second part) of a JWT as an object, or null when there is none, it is not base64url, or it is not a JSON object.
 * The bytes are read one character each: a name with an accent comes out wrong, but the JSON structure and every ASCII claim are
 * exact, and only ASCII claims are compared by the callers.
 */
export function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1] ?? '';
  if (part === '' || part.length % 4 === 1) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  try {
    const bytes = new Uint8Array(base64DecodedLength(b64));
    decodeBase64Into(b64, bytes, 0);
    let text = '';
    for (const b of bytes) text += String.fromCharCode(b);
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
