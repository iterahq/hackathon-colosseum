// A post-login `from`/`next` target is client-controlled and, in the DFL path,
// is forwarded as the federate redirect — so it must be a same-origin in-app
// path or it becomes an open redirect. Reject protocol-relative ("//host") and
// backslash-smuggled ("/\host", "\/host") forms that browsers normalize to a
// cross-origin URL; only a bare absolute path ("/...") is allowed.
export function safeInternalPath(raw: string | null | undefined, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  return /^\/(?![/\\])/.test(raw) ? raw : fallback;
}
