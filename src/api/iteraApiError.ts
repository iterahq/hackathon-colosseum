/**
 * The error envelope every itera-api route answers a non-2xx with:
 * `{ error: { code, message } }`.
 */

function redactTokens(raw: string): string {
  return (
    raw
      .replace(
        /("(?:dfl_token|access_token|refresh_token|token)"\s*:\s*")[^"]*/g,
        '$1[redacted]'
      )
      // The echo is not always JSON: a proxy error page or a header dump carries
      // the same JWT in prose, so match the token's own shape as a last net.
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
  );
}

/**
 * A non-2xx itera-api response. `message` keeps the legacy
 * `itera-api <status>: <body>` format so pre-existing callers that surface
 * `err.message` are unchanged; BYOC reads `code` instead, because it has to tell
 * a REFUSED seed (the learner just retypes) apart from a dead generator (the
 * activity degrades).
 */
export class IteraApiError extends Error {
  /** The server's learner-facing text. BYOC renders it, so it is redacted too. */
  readonly serverMessage: string;

  constructor(
    readonly status: number,
    readonly code: string,
    serverMessage: string,
    raw: string
  ) {
    // A validation error can echo the request back, and the request carries the
    // learner's JWT as `dfl_token` — this message reaches logs and, on the shared
    // judge path, the screen. Redact before it travels.
    super(`itera-api ${status}: ${redactTokens(raw).slice(0, 300)}`);
    this.name = 'IteraApiError';
    this.serverMessage = redactTokens(serverMessage);
  }
}

/** Build an `IteraApiError` from a raw response body, tolerating non-JSON. */
export function parseIteraApiError(status: number, raw: string): IteraApiError {
  try {
    const body = JSON.parse(raw) as { error?: { code?: string; message?: string } };
    return new IteraApiError(status, body.error?.code ?? 'unknown', body.error?.message ?? '', raw);
  } catch {
    return new IteraApiError(status, 'unknown', '', raw);
  }
}
