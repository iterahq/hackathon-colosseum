export interface RetryOutcome<T> {
  ok: boolean;
  value?: T;
  /** How many times the work ran. */
  attempts: number;
  /** The message of every failed run, oldest first. */
  errors: string[];
}

export interface RetryOptions {
  attempts: number;
  /** Pause before run `n + 1`, given that run `n` (1-based) failed. */
  pauseMs: (failedAttempt: number) => number;
  /** Checked before each further run: `false` stops retrying (a spent time budget). */
  mayRetry?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs idempotent work until it succeeds or the attempts are spent. Never
 * throws: the caller gets every error message, so a run that only succeeded on
 * the second try still leaves a trace.
 */
export async function withRetries<T>(work: (attempt: number) => Promise<T>, options: RetryOptions): Promise<RetryOutcome<T>> {
  const errors: string[] = [];
  const sleep = options.sleep ?? wait;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { ok: true, value: await work(attempt), attempts: attempt, errors };
    } catch (error) {
      errors.push(String(error instanceof Error ? error.message : error).slice(0, 300));
      if (attempt >= options.attempts || options.mayRetry?.() === false) return { ok: false, attempts: attempt, errors };
      await sleep(options.pauseMs(attempt));
    }
  }
}
