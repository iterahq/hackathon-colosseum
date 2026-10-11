/**
 * A best-effort per-caller limit for public, unauthenticated endpoints: a sliding window kept in the
 * memory of this isolate. It resets on a cold start and is not shared between instances, so it caps
 * a single abusive source per instance; it is not a quota. The caller is told by its address, which
 * is for throttling only and never for deciding what it may read.
 */
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

const MAX_TRACKED = 5_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly rule: RateLimit) {}

  take(key: string, now = Date.now()): RateVerdict {
    const since = now - this.rule.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
    if (recent.length >= this.rule.limit) {
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + this.rule.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > MAX_TRACKED) this.sweep(since);
    return { allowed: true, remaining: this.rule.limit - recent.length, retryAfterSeconds: 0 };
  }

  private sweep(since: number): void {
    for (const [key, stamps] of this.hits) {
      const kept = stamps.filter((at) => at > since);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
    // Still over the cap after dropping idle keys: forget the oldest entries rather than grow without bound.
    for (const key of this.hits.keys()) {
      if (this.hits.size <= MAX_TRACKED) break;
      this.hits.delete(key);
    }
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
