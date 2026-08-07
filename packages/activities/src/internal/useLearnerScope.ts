/**
 * The learner half of the shuffle seed, resolved from the host context.
 *
 * See `./shuffle.ts` for why this is injected rather than read: the app's
 * `learnerScope()` reached into `localStorage` for the Itera user id, which is
 * host session state and would have silently collapsed to one shared
 * permutation in any other app.
 *
 * `identity.userId` is documented as "telemetry correlation only, never
 * authorization" — a shuffle seed is exactly that: it decides what the learner
 * SEES, never what they may do.
 */
import { useMemo } from 'react';
import { useActivityHost } from '../context.js';
import { resolveLearnerScope } from './shuffle.js';

export function useLearnerScope(): string {
  const { identity } = useActivityHost();
  const userId = identity?.userId ?? null;
  return useMemo(() => resolveLearnerScope(userId), [userId]);
}
