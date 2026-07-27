/**
 * The BYOC step-1 state machine: does this learner already have a generation, and
 * if not, turn their seed into one.
 *
 * On mount it READS before it writes — the generation is idempotent server-side,
 * so a reload must land back on the same question rather than re-rolling it. The
 * same reason makes `reset()` re-read instead of jumping straight back to the
 * form: after a dropped response the seed may well have generated anyway, and the
 * idempotent POST would silently ignore the learner's second, different seed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';
import { generateByoc, readByoc } from '@/api/iteraByoc';
import { IteraApiError } from '@/api/iteraApiError';
import type { ByocGeneration } from '@/types/byoc';

export type ByocPhase = 'loading' | 'seed' | 'generating' | 'ready' | 'fallback' | 'unavailable';

export interface ByocState {
  phase: ByocPhase;
  generation: ByocGeneration | null;
  /** The server's learner-facing refusal text when a seed is off-limits. */
  seedError: string | null;
  submitSeed: (seed: string) => void;
  /** Leave the dead end and let the learner try another seed. */
  reset: () => void;
}

export function useByoc({
  activityId,
  token,
  ready = true,
  fallback,
}: {
  activityId: string;
  token: string;
  /** False while auth is still settling — generating now would 401 on an empty token. */
  ready?: boolean;
  /** Authored tree to fall back to when generation fails (ADR-7). */
  fallback?: GeneratedChoiceTree;
}): ByocState {
  const [phase, setPhase] = useState<ByocPhase>('loading');
  const [generation, setGeneration] = useState<ByocGeneration | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const runRef = useRef(0);
  // Supabase rotates the access token on its own schedule. Keyed on the token
  // VALUE, a rotation would restart this effect, drop `generation` and remount
  // the tree — wiping an answer the learner had already typed. What the effect
  // actually waits for is a token EXISTING, so gate on that and read the current
  // one at call time.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const hasToken = Boolean(token);

  useEffect(() => {
    const run = ++runRef.current;
    setGeneration(null);
    setSeedError(null);
    if (!ready) {
      setPhase('loading');
      return;
    }
    if (!hasToken) {
      setPhase('seed');
      return;
    }
    setPhase('loading');
    readByoc(activityId, tokenRef.current)
      .then((row) => {
        if (runRef.current !== run) return;
        setGeneration(row);
        setPhase(row ? 'ready' : 'seed');
      })
      // A failed READ is not a dead end — the learner can still generate.
      .catch(() => {
        if (runRef.current === run) setPhase('seed');
      });
  }, [activityId, hasToken, ready, attempt]);

  const submitSeed = useCallback(
    (seed: string) => {
      const run = runRef.current;
      setSeedError(null);
      setPhase('generating');
      generateByoc(activityId, seed, tokenRef.current)
        .then((row) => {
          if (runRef.current !== run) return;
          setGeneration(row);
          setPhase('ready');
        })
        .catch((e: unknown) => {
          if (runRef.current !== run) return;
          // A refused seed is a normal, expected turn in the conversation: say so
          // in the server's own welcoming words and let them type another one.
          if (e instanceof IteraApiError && e.code === 'seed_not_allowed') {
            setSeedError(e.serverMessage);
            setPhase('seed');
            return;
          }
          // Anything else is OUR failure, not theirs: an authored fallback keeps
          // the lesson moving instead of stranding the learner on an error.
          setPhase(fallback ? 'fallback' : 'unavailable');
        });
    },
    [activityId, fallback]
  );

  const reset = useCallback(() => setAttempt((n) => n + 1), []);

  return { phase, generation, seedError, submitSeed, reset };
}
