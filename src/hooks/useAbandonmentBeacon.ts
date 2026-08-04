/**
 * DOM half of the abandoned-attempt beacon. The RULE is pure and lives in
 * `src/utils/abandonment.ts`; the WRITE is `src/services/progress.service.ts`.
 * This hook only decides WHEN to ask, and by WHICH transport.
 *
 * Plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI), Fase 1,
 * approved by Tainan TG 2026-08-04.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TWO TRIGGERS, AND WHY THERE ARE ONLY TWO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1. **The activity's render surface goes away** — the key changes, or the
 *     component unmounts (the learner closed the lesson, navigated within the
 *     app, or stepped off an unsettled activity). Reported as `left_activity`.
 *     The document is still alive here, so a normal async write works.
 *
 *  2. **`pagehide`** — the page is being torn down or frozen. Reported as
 *     `page_teardown`.
 *
 * `visibilitychange → hidden` is deliberately NOT a trigger, and the omission is
 * a decision rather than an oversight. Every tab switch and every phone-screen
 * lock fires it, the learner comes straight back the overwhelming majority of
 * the time, and an abandonment recorded for someone who returned twenty seconds
 * later is a FALSE statement about that learner. `pagehide` is the signal that
 * actually means "this page is going away", and on the platforms where it is
 * unreliable (older iOS Safari) the cost is a MISSED abandonment — which is the
 * error direction `abandonment.ts` explicitly chooses.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚚 DELIVERY UNDER TEARDOWN — WHY NOT `sendBeacon`, AND WHAT FAILS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * During `pagehide` a normal `fetch` may never complete: the browser is free to
 * discard the document mid-flight. The usual answer is `navigator.sendBeacon`,
 * and it does not work here, for a reason that is structural rather than
 * stylistic:
 *
 *   `sendBeacon` cannot set request HEADERS. Every write in this app goes to
 *   PostgREST, which authenticates on `Authorization: Bearer <user JWT>` plus
 *   `apikey`. There is no query-string form of those, so a beacon could only
 *   reach an UNAUTHENTICATED ingest endpoint — which does not exist in this
 *   project (this repo deliberately has no edge functions; see CLAUDE.md
 *   *Edge Functions*), and creating one would mean an anonymous, RLS-free write
 *   path into learner data, i.e. paying for telemetry with the security model.
 *   `fetch(..., {keepalive: true})` is no better: supabase-js does not expose
 *   per-request init, so it would mean forking the client's transport.
 *
 * So the teardown path uses the mechanism this repo already proved: **the
 * durable outbox**. `enqueueWrite` is a `localStorage.setItem`, which is
 * SYNCHRONOUS and completes before the document can be discarded — the one kind
 * of I/O that is actually reliable at `pagehide`. The next drain (app mount, or
 * the `online` event — `useAnswerOutbox`) performs the authenticated write with
 * the learner's real session.
 *
 * ⚠️ ON THE TEARDOWN PATH WE DO NOT ALSO TRY A DIRECT WRITE, and that is
 * deliberate: an in-flight direct write is exactly what would let an abandonment
 * land in the database for a page that then came back from bfcache and settled
 * an answer on the same origin — see `revokeQueuedAbandonment` for why that
 * collision costs the learner's real sequence. Queue-only keeps the abandonment
 * revocable right up to the moment it is written.
 *
 * ⚠️ WHAT IS STILL LOST, STATED RATHER THAN GLOSSED:
 *   · `localStorage` unavailable (private mode, exhausted quota) — the queue
 *     write silently no-ops, exactly as it already does for a learner's ANSWER.
 *     The abandonment is gone. There is no lower layer to fall back to.
 *   · The learner never opens the app again on that device — the entry sits in
 *     that browser's `localStorage` forever and is never written.
 *   · The queue is capped at `MAX_QUEUED_WRITES` and evicts OLDEST-first, so a
 *     very long offline stretch can push an old abandonment out. Answers and
 *     abandonments occupy separate targets, so an abandonment can never evict
 *     the answer for the same activity.
 * All three are bounded, none is silent-by-design, and all three are strictly
 * better than today, where 100% of abandonments are lost 100% of the time.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔁 IDEMPOTENCY — THE BEACON IS ALLOWED TO DOUBLE-FIRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Closing a tab can fire `pagehide` AND then unmount. Both call `fire()`. The
 * guard is a set of ORIGIN KEYS (`attemptOriginKey`), which is the same
 * identity the outbox target and the database unique index use — so a double
 * fire is stopped in-process, and if it somehow were not, it would be stopped by
 * the queue's per-target dedup, and if it somehow were not, it would be stopped
 * by `uq_activity_traces_attempt`. Three layers, one key.
 */
import { useCallback, useEffect, useRef } from 'react';
import { enqueueWrite, revokeQueuedAbandonment } from '@/utils/answerOutbox';
import { writeOrQueue } from '@/hooks/useAnswerOutbox';
import {
  abandonmentVerdict,
  attemptOriginKey,
  type AbandonmentReason,
  type AbandonmentVerdict,
} from '@/utils/abandonment';
import type { DurationSample } from '@/utils/activityDuration';
import type { RecordedAction, TraceSpecSnapshot } from '@/utils/learningTrace';
import type { PedagogicalContext } from '@/utils/pedagogicalContext';

/**
 * What the surface must hand over for an abandonment to be recordable.
 *
 * ⚠️ `specSnapshot` and `pedagogicalContext` are built BY THE SURFACE, from the
 * activity it just rendered — never looked up at write time. Same rule as the
 * settled path, and here it binds harder, because the teardown path's write can
 * happen on the learner's NEXT SESSION, potentially days later.
 */
export interface AbandonmentTarget {
  activityId: string;
  /** The trace origin — the instant this activity opened for this learner. */
  startedAt: number;
  /** Pull the dwell as of now. Same reader the settled path uses. */
  read: () => DurationSample | null;
  /** The learner is re-reading something already completed. */
  reviewing?: boolean;
  /** The sequence handed up so far, when the family emits one. */
  actions?: readonly RecordedAction[] | null;
  specSnapshot?: TraceSpecSnapshot | null;
  pedagogicalContext?: PedagogicalContext | null;
}

export interface AbandonmentBeacon {
  /**
   * Tell the beacon this activity was ANSWERED. Call it at the SETTLE, not at
   * the write — for a graded kind the write happens on the footer's
   * "Continuar", and leaving between the two is not abandonment.
   *
   * Also revokes any abandonment already queued for this activity; see
   * `revokeQueuedAbandonment` for the race that closes.
   */
  markSettled: (activityId: string) => void;
  /**
   * Fire manually. Exists for tests and for a surface that knows it is going
   * away before React does. Returns the verdict so a caller can assert on it.
   */
  fire: (reason: AbandonmentReason) => AbandonmentVerdict;
}

export function useAbandonmentBeacon(target: AbandonmentTarget | null): AbandonmentBeacon {
  // The live target, refreshed every render. A ref rather than a dependency so
  // that the listeners below are attached ONCE: re-subscribing `pagehide` on
  // every render of a player that re-renders on every keystroke is how a
  // teardown listener ends up missing at the one moment it matters.
  const targetRef = useRef<AbandonmentTarget | null>(target);
  targetRef.current = target;

  // Origins already accounted for. Keyed by `activityId@startedAt`, never by
  // activity alone: a learner who abandons an activity, comes back and opens it
  // again gets a NEW origin, and that second visit is a second observation.
  const settledRef = useRef<Set<string>>(new Set());
  const recordedRef = useRef<Set<string>>(new Set());

  /**
   * Fire for a SPECIFIC target.
   *
   * ⚠️ The target is a parameter rather than a read of `targetRef`, and that is
   * a correctness fix rather than a preference. React runs an effect's cleanup
   * AFTER the render that changed its key, so at the moment the "activity 7 left
   * the screen" cleanup runs, `targetRef.current` already describes ACTIVITY 8.
   * Reading the ref there attributed the abandonment to the wrong activity AND
   * the wrong origin — a row that is not merely imprecise but false, and false
   * about the one field the unique index deduplicates on.
   */
  const fireFor = useCallback(
    (t: AbandonmentTarget | null, reason: AbandonmentReason): AbandonmentVerdict => {
    if (!t) return 'not_opened';
    const key = attemptOriginKey(t.activityId, t.startedAt);

    const duration = t.read();
    const verdict = abandonmentVerdict({
      startedAt: t.startedAt,
      duration,
      settled: settledRef.current.has(key),
      alreadyRecorded: recordedRef.current.has(key),
      reviewing: t.reviewing === true,
    });
    if (verdict !== 'record') return verdict;

    // Mark BEFORE dispatching. If the write throws, the abandonment is still
    // considered accounted for: a second attempt would be a duplicate at every
    // layer anyway, and the outbox already owns retrying.
    recordedRef.current.add(key);

    const entry = {
      kind: 'abandonment' as const,
      activityId: t.activityId,
      startedAt: t.startedAt,
      leftAt: Date.now(),
      duration,
      reason,
      actions: t.actions ? [...t.actions] : undefined,
      specSnapshot: t.specSnapshot ?? undefined,
      pedagogicalContext: t.pedagogicalContext ?? undefined,
    };

    if (reason === 'page_teardown') {
      // Synchronous localStorage only — see the module header. No direct write,
      // on purpose: it must stay revocable until the moment it is written.
      enqueueWrite(entry);
    } else {
      // The document is alive; take the normal path (direct write, queue on
      // failure) so the common case lands immediately.
      void writeOrQueue(entry);
    }
    return verdict;
    },
    []
  );

  /** Fire for whatever is on screen RIGHT NOW — the `pagehide` case. */
  const fire = useCallback(
    (reason: AbandonmentReason) => fireFor(targetRef.current, reason),
    [fireFor]
  );

  const markSettled = useCallback((activityId: string) => {
    const t = targetRef.current;
    if (t && t.activityId === activityId) {
      settledRef.current.add(attemptOriginKey(activityId, t.startedAt));
    }
    // Unconditional: an entry queued by a `pagehide` that was later restored
    // from bfcache must not survive the learner answering, and by then the
    // origin may already have been re-armed.
    revokeQueuedAbandonment(activityId);
  }, []);

  // Trigger 1 — the render surface goes away. The cleanup runs on key change AND
  // on unmount, which is exactly the set of moments "this activity is no longer
  // on screen for this learner" is true.
  const key = target ? attemptOriginKey(target.activityId, target.startedAt) : null;
  useEffect(() => {
    if (key === null || !target) return;
    // `target` is captured from THE RENDER THAT ARMED THIS KEY, deliberately.
    // See `fireFor`: by the time this cleanup runs, the ref describes the NEXT
    // activity. Depending on `target` instead would re-run — and therefore
    // fire — on every single render, since it is a fresh object each time.
    return () => {
      fireFor(target, 'left_activity');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fireFor]);

  // Trigger 2 — the page goes away. Attached once, reading the live target
  // through the ref.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPageHide = () => {
      fire('page_teardown');
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [fire]);

  return { markSettled, fire };
}
