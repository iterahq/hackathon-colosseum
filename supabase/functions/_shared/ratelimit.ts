/**
 * A per-caller limit for public endpoints: a fixed window counted in the database (`itera.rate_take`,
 * migration 0210), because a Supabase edge function may run every request in a fresh isolate, where
 * an in-memory counter never moves. One upsert per call. The caller is told by its address, which is
 * for throttling only and never for deciding what it may read. When the counter cannot be reached the
 * request is allowed and the failure logged: a throttle must not take the endpoint down.
 */
import type { IteraClient } from './db.ts';

export interface RateLimit {
  /** Requests allowed per window from one address. */
  limit: number;
  windowMs: number;
}

export interface RateVerdict {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window frees a slot, when refused. */
  retryAfterSeconds: number;
}

const OPEN: RateVerdict = { allowed: true, remaining: -1, retryAfterSeconds: 0 };

/** One row from `itera.rate_take`, in the shape the function returns. */
export function verdictOf(row: unknown): RateVerdict {
  const r = (Array.isArray(row) ? row[0] : row) as { allowed?: unknown; remaining?: unknown; retry_after_seconds?: unknown } | null;
  if (!r || typeof r.allowed !== 'boolean') return OPEN;
  return {
    allowed: r.allowed,
    remaining: typeof r.remaining === 'number' ? r.remaining : 0,
    retryAfterSeconds: typeof r.retry_after_seconds === 'number' ? r.retry_after_seconds : 0,
  };
}

/** Takes one slot of `rule` for `address` on `scope` (the function name). Never throws. */
export async function takeRate(db: IteraClient, scope: string, address: string, rule: RateLimit): Promise<RateVerdict> {
  try {
    const { data, error } = await db.rpc('rate_take', { p_key: `${scope}:${address}`, p_limit: rule.limit, p_window_ms: rule.windowMs });
    if (error) throw new Error(error.message);
    return verdictOf(data);
  } catch (error) {
    console.error(`rate limit unavailable for ${scope}`, error instanceof Error ? error.message : error);
    return OPEN;
  }
}

/** The address of the caller as the platform saw it. Throttling only: a spoofed value just throttles the spoofer. */
export function callerAddress(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip');
  return forwarded && forwarded.length <= 64 ? forwarded : 'unknown';
}

/** The 429 answer, with the standard header. */
export function tooMany(verdict: RateVerdict, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'rate_limited', retry_after_seconds: verdict.retryAfterSeconds }), {
    status: 429,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(verdict.retryAfterSeconds), 'X-Content-Type-Options': 'nosniff' },
  });
}
