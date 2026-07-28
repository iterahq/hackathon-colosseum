/**
 * The ONE way a spec in `e2e/` is allowed to opt out of running.
 *
 * `test.skip()` scattered by hand is what made this suite green-while-empty.
 * Everything here funnels through a capability name so that (1) the tier is
 * declared once, in `capabilities.ts`, (2) the reason is machine-parsable, and
 * (3) the skip-census reporter can count it. See `capabilities.ts` for the rule.
 *
 * Note the deliberate asymmetry: a `required` capability being absent does NOT
 * throw here. It still skips the test — so the report keeps showing exactly
 * which tests did not run — while `preflight.spec.ts` fails ONCE with the full
 * list. One crisp failure beats N scattered ones.
 */
import { test } from '@playwright/test';
import { CAPABILITIES, isPresent, type Capability, type CapabilityName, type Tier } from './capabilities';

const capability = (name: CapabilityName): Capability => CAPABILITIES[name];

/** Stable prefix the reporter parses out of the skip reason. */
export const TIER_PREFIX = /^\[(required|optional|blocked)\]/;

function annotate(tier: Tier | 'blocked') {
  try {
    test.info().annotations.push({ type: 'capability-tier', description: tier });
  } catch {
    // `test.info()` is unavailable in some hook contexts — the reason prefix
    // below is the reporter's fallback, so this is never load-bearing.
  }
}

/**
 * Skip unless every named capability is present.
 *
 * Callable from a test body, `beforeAll` or `beforeEach`. Awaits substrate
 * probes (memoised per process, so repeated calls are free).
 */
export async function requireCapabilities(...names: CapabilityName[]): Promise<void> {
  const missing: CapabilityName[] = [];
  for (const name of names) {
    if (!(await isPresent(name))) missing.push(name);
  }
  if (missing.length === 0) return;

  const worstTier: Tier = missing.some((n) => capability(n).tier === 'required') ? 'required' : 'optional';
  const detail = missing
    .map((n) => `${n} (${(capability(n).env ?? []).join(' + ') || 'substrate probe'})`)
    .join('; ');

  annotate(worstTier);
  test.skip(
    true,
    `[${worstTier}] capability absent: ${detail}. ` +
      (worstTier === 'required'
        ? 'CI is supposed to provide this — see the preflight failure for the fix.'
        : 'Optional substrate; this kind/flow is UNVERIFIED, not passing.')
  );
}

/**
 * Skip for a reason that is not a capability — a genuinely blocked dependency
 * or an in-run precondition. Still counted and printed; never silent.
 */
export function skipBlocked(reason: string): never {
  annotate('blocked');
  test.skip(true, `[blocked] ${reason}`);
  // `test.skip(true, …)` throws; this line only satisfies the `never` return.
  throw new Error('unreachable');
}
