import { ENVELOPE_TAG, MAX_MESSAGE_BYTES, REFUSAL_REASONS } from '@iterahq/shell-bridge';

function parseObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The id of a `hello` this page is about to send, or null for any other message. */
export function helloIdOf(raw: string): string | null {
  const o = parseObject(raw);
  return o && o.tag === ENVELOPE_TAG && o.kind === 'hello' && typeof o.id === 'string' ? o.id : null;
}

/**
 * Is this string a reply of the native shell to a `hello` of this page? It must parse as JSON
 * (at most MAX_MESSAGE_BYTES, checked before the parse) into an object whose TOP-LEVEL `tag` is the
 * bridge tag and whose `kind` is one only the shell sends, `result` or `refusal`, and whose `id` is
 * the id of a `hello` this page sent. One exception: a shell that could not read the hello at all
 * cannot name its id, so a `refusal` with `id: null` and a reason of the protocol counts too.
 * The page's own `hello` (kind `hello`) echoed or wrapped by a host app, a string that merely
 * contains the tag, and a reply to an id this page never sent are NOT replies.
 */
export function isNativeReply(data: unknown, helloIds: ReadonlySet<string>): boolean {
  const o = parseObject(data);
  if (!o || o.tag !== ENVELOPE_TAG) return false;
  if (o.kind !== 'result' && o.kind !== 'refusal') return false;
  if (typeof o.id === 'string') return helloIds.has(o.id);
  return o.kind === 'refusal' && o.id === null && typeof o.reason === 'string' && (REFUSAL_REASONS as readonly string[]).includes(o.reason);
}
