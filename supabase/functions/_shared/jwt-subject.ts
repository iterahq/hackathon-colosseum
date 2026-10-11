const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64UrlDecode(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  return atob(padded);
}

/**
 * The `sub` claim of a JWT, read WITHOUT verifying it. Only good for starting a lookup early;
 * the result of that lookup may be used only once the auth server confirmed the same user id.
 */
export function unverifiedSubject(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { sub?: unknown };
    return typeof payload.sub === 'string' && UUID.test(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}
