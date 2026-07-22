/**
 * useClassSession — the real-time synchronicity layer for a live cohort class.
 *
 * ONE PRIVATE Supabase Realtime channel `class:<sessionId>` (gated by
 * realtime.messages RLS, migration 0022 — only session participants may join /
 * send) carries three concerns:
 *   1. broadcast  — the FAST path. The professor broadcasts `{ current_activity_id }`
 *      on advance; every student re-points instantly (no DB round-trip).
 *   2. postgres_changes — the DURABLE / reconnect truth. We also subscribe to the
 *      itera.class_sessions row so a late-joiner / reconnecting client converges to
 *      the authoritative pointer + status even if it missed the broadcast.
 *   3. presence  — the live roster (who's in the room right now).
 *
 * The hook is shared by students (read + presence) and the professor (who ALSO
 * calls `broadcast()` on advance). It never writes the DB — the professor page
 * persists via liveClass.service.advanceClassSession (durable) THEN broadcast()
 * (fast). Result writes stay elsewhere (LessonPlayer / progress.service).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getClassSession, mapSession, type ClassSession } from '@/services/liveClass.service';
import type {
  ClassIdentity as Identity,
  ClassPresenceMember,
  ClassTimer,
  StagedAnswer,
  UseClassSession,
} from '@/types/liveClass';
import { parseTimerEvent, timerAfterStop } from '@/utils/liveTimer';
import { reconnectDelayMs } from '@/utils/liveReconnect';
import { gatherStageContent } from '@/utils/stageAnswerContent';

export type { ClassPresenceMember, UseClassSession } from '@/types/liveClass';

const ADVANCE_EVENT = 'advance';
const ANSWERED_EVENT = 'answered';
const TIMER_EVENT = 'timer';
const TIMER_STOP_EVENT = 'timer-stop';
// Peer-to-peer "pull to stage" (ADR-3/4): request → student replies → instructor
// gates → all render. Same accepted trust model as ADVANCE/ANSWERED on this
// public per-session channel (a cohort member could spoof); the nonce + target
// echo below only reject STALE/MISMATCHED replies, not a determined spoofer.
const STAGE_REQUEST_EVENT = 'stage-request';
const STAGE_ANSWER_EVENT = 'stage-answer';
const STAGE_SHOW_EVENT = 'stage-show';
const STAGE_CLEAR_EVENT = 'stage-clear';

export function useClassSession(
  sessionId: string | undefined,
  identity?: Identity
): UseClassSession {
  const [session, setSession] = useState<ClassSession | null>(null);
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [status, setStatus] = useState<ClassSession['status'] | null>(null);
  const [roster, setRoster] = useState<ClassPresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  // True while a previously-joined channel is down and being rebuilt (drives
  // the "reconnecting…" banner). Never true before the FIRST successful join.
  const [reconnecting, setReconnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, Record<string, boolean>>>({});
  const [elapsed, setElapsed] = useState<Record<string, Record<string, number>>>({});
  const [timer, setTimer] = useState<ClassTimer | null>(null);
  // The activity whose timer was just STOPPED by the professor — cue to reveal
  // the correct answer to everyone. Cleared on advance.
  const [stoppedFor, setStoppedFor] = useState<string | null>(null);
  const [stagedAnswer, setStagedAnswer] = useState<StagedAnswer | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // The instructor's in-flight pull: the nonce armed by requestStage + which
  // learner it targeted. A stage-answer is only gated to stage-show when BOTH
  // the userId matches the target AND the nonce echoes back (rejects stale replies).
  const pendingStageRef = useRef<{ nonce: string; targetUserId: string } | null>(null);
  // Read inside broadcast handlers so a stage-show is only honored for the CURRENT
  // activity — without making the channel effect depend on currentActivityId.
  const currentActivityIdRef = useRef<string | null>(null);
  currentActivityIdRef.current = currentActivityId;
  const sessionIdRef = useRef<string | undefined>(sessionId);
  sessionIdRef.current = sessionId;
  // Latest identity, read inside the channel effect / track without making the
  // channel re-subscribe when identity resolves late (which reused a still-
  // joined channel → `.on()`-after-`subscribe()` crash — see the effect below).
  const identityRef = useRef<Identity | undefined>(identity);
  identityRef.current = identity;
  // Presence is re-tracked wholesale, so the hand state must ride along on every
  // track() (identity refresh, reconnect) — not just the explicit toggle.
  const handRaisedRef = useRef(false);

  const trackPresence = useCallback(() => {
    const channel = channelRef.current;
    const id = identityRef.current;
    if (!channel || !id) return;
    void channel.track({
      user_id: id.userId,
      name: id.name,
      avatar_url: id.avatarUrl ?? null,
      is_instructor: id.isInstructor === true,
      hand_raised: handRaisedRef.current,
      at: new Date().toISOString(),
    });
  }, []);

  const applySession = useCallback((s: ClassSession | null) => {
    if (!s) return;
    setSession(s);
    setCurrentActivityId(s.currentActivityId);
    setStatus(s.status);
  }, []);

  const refetch = useCallback(() => {
    if (!sessionId) return;
    void getClassSession(sessionId).then(applySession);
  }, [sessionId, applySession]);

  // Initial durable read.
  useEffect(() => {
    let alive = true;
    if (!sessionId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getClassSession(sessionId).then((s) => {
      if (!alive) return;
      applySession(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, applySession]);

  // Realtime channel: broadcast (fast) + postgres_changes (durable) + presence.
  // Self-healing: a dropped/errored channel (mobile network blip, missed
  // heartbeat) is torn down and REBUILT from scratch with backoff — never
  // resubscribed in place (`.on()` after `subscribe()` throws).
  useEffect(() => {
    if (!sessionId || !isSupabaseConfigured) return;
    const sb = getSupabase();
    let disposed = false;
    let everJoined = false;
    let attempt = 0;
    let retryTimer: number | null = null;
    let current: RealtimeChannel | null = null;

    const teardown = (ch: RealtimeChannel | null): Promise<unknown> => {
      if (!ch) return Promise.resolve();
      if (channelRef.current === ch) channelRef.current = null;
      return sb.removeChannel(ch).catch(() => undefined);
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer !== null) return;
      const delay = reconnectDelayMs(attempt);
      attempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        reconnectNow();
      }, delay);
    };

    const reconnectNow = () => {
      if (disposed) return;
      const old = current;
      current = null;
      // Await the removal: realtime-js dedupes channels by topic, so connecting
      // before the errored instance is fully gone can hand back the SAME (non-
      // closed) instance whose `subscribe()` would silently no-op.
      void teardown(old).then(() => {
        if (!disposed) connect();
      });
    };

    const connect = () => {
      if (disposed) return;
      const presenceKey =
        identityRef.current?.userId ?? `anon-${Math.random().toString(36).slice(2, 10)}`;

      // Private channel: joining/sending is gated by realtime.messages RLS
      // (migration 0022) so only session participants can broadcast/track. Make
      // sure the realtime socket carries the user's JWT before the private join;
      // supabase-js sets it on init, but this closes the first-load race (a
      // failed join just retries via scheduleRetry once auth lands).
      void sb.realtime.setAuth();
      const channel = sb.channel(`class:${sessionId}`, {
        config: { private: true, presence: { key: presenceKey }, broadcast: { self: true } },
      });
      current = channel;

      // Rebuild the roster from the full presence state. Wired to sync/join/leave
      // (not just sync) so a LATE joiner — whose initial `sync` can land before the
      // server relays the already-present members — still converges once presence
      // settles; a stable member (e.g. the professor) never re-tracks to re-trigger it.
      const syncRoster = () => {
        const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const members: ClassPresenceMember[] = [];
        const seen = new Set<string>();
        for (const key of Object.keys(state)) {
          // Re-tracking (hand raise/lower) APPENDS a new meta — the newest is last.
          const meta = state[key]?.at(-1) ?? {};
          const uid = typeof meta.user_id === 'string' ? meta.user_id : key;
          if (seen.has(uid)) continue;
          seen.add(uid);
          members.push({
            userId: uid,
            name: typeof meta.name === 'string' ? meta.name : uid.slice(0, 8),
            avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
            isInstructor: meta.is_instructor === true,
            handRaised: meta.hand_raised === true,
          });
        }
        setRoster(members);
      };

      channel
        .on('broadcast', { event: ADVANCE_EVENT }, ({ payload }) => {
          const next = (payload as { current_activity_id?: string | null })?.current_activity_id;
          // Only a real activity id is honored from the broadcast fast-path. A
          // `null` (return-to-reception) is NOT accepted here — it can only come
          // from the durable session row (postgres_changes / refetch), so a spoofed
          // broadcast (now limited to session participants) can't shove the class
          // back to the lobby.
          if (typeof next === 'string') {
            setCurrentActivityId(next);
            setTimer(null);
            setStoppedFor(null);
            setStagedAnswer(null);
            pendingStageRef.current = null;
          }
        })
        .on('broadcast', { event: ANSWERED_EVENT }, ({ payload }) => {
          const p = payload as {
            activity_id?: string;
            user_id?: string;
            correct?: boolean;
            elapsed_ms?: number;
          } | null;
          if (!p?.activity_id || !p.user_id) return;
          setAnswers((prev) => ({
            ...prev,
            [p.activity_id!]: { ...(prev[p.activity_id!] ?? {}), [p.user_id!]: p.correct === true },
          }));
          if (typeof p.elapsed_ms === 'number') {
            setElapsed((prev) => ({
              ...prev,
              [p.activity_id!]: { ...(prev[p.activity_id!] ?? {}), [p.user_id!]: p.elapsed_ms! },
            }));
          }
        })
        .on('broadcast', { event: TIMER_EVENT }, ({ payload }) => {
          const next = parseTimerEvent(payload);
          if (next) setTimer(next);
        })
        .on('broadcast', { event: TIMER_STOP_EVENT }, ({ payload }) => {
          setTimer((prev) => timerAfterStop(prev, payload));
          const p = payload as { activity_id?: unknown } | null;
          if (p && typeof p.activity_id === 'string') setStoppedFor(p.activity_id);
        })
        // stage-request (instructor → all): the TARGETED learner replies with its
        // OWN answer for the current activity — only if it actually has one.
        .on('broadcast', { event: STAGE_REQUEST_EVENT }, ({ payload }) => {
          const p = payload as
            | { activityId?: string; targetUserId?: string; nonce?: string }
            | null;
          const id = identityRef.current;
          const sid = sessionIdRef.current;
          if (!p?.activityId || !p.targetUserId || !p.nonce || !id || !sid) return;
          if (p.targetUserId !== id.userId || p.activityId !== currentActivityIdRef.current) return;
          const gathered = gatherStageContent(sid, p.activityId);
          if (!gathered) return;
          void channel.send({
            type: 'broadcast',
            event: STAGE_ANSWER_EVENT,
            payload: {
              activityId: p.activityId,
              userId: id.userId,
              nonce: p.nonce,
              kind: gathered.kind,
              content: gathered.content,
              author: { userId: id.userId, name: id.name, avatarUrl: id.avatarUrl ?? null },
            },
          });
        })
        // stage-answer → THE GATE: only the instructor honors it, and only when the
        // reply's userId + nonce match the in-flight pull. It then re-broadcasts
        // stage-show so a learner can NEVER stage arbitrary content on the class.
        .on('broadcast', { event: STAGE_ANSWER_EVENT }, ({ payload }) => {
          const pending = pendingStageRef.current;
          const p = payload as
            | { activityId?: string; userId?: string; nonce?: string; kind?: string; content?: string; author?: unknown }
            | null;
          if (!pending || !p?.userId || !p.nonce || !p.activityId) return;
          if (p.userId !== pending.targetUserId || p.nonce !== pending.nonce) return;
          if (p.activityId !== currentActivityIdRef.current) return;
          pendingStageRef.current = null;
          void channel.send({
            type: 'broadcast',
            event: STAGE_SHOW_EVENT,
            payload: {
              activityId: p.activityId,
              kind: p.kind,
              content: p.content,
              author: p.author,
            },
          });
        })
        // stage-show (instructor → all): the ONLY source clients render the stage
        // from — honored only for the current activity.
        .on('broadcast', { event: STAGE_SHOW_EVENT }, ({ payload }) => {
          const p = payload as
            | { activityId?: string; kind?: string; content?: string; author?: { userId?: string; name?: string; avatarUrl?: string | null } }
            | null;
          if (!p?.activityId || typeof p.kind !== 'string' || typeof p.content !== 'string') return;
          if (p.activityId !== currentActivityIdRef.current) return;
          const a = p.author;
          if (!a?.userId || typeof a.name !== 'string') return;
          setStagedAnswer({
            activityId: p.activityId,
            kind: p.kind,
            content: p.content,
            author: { userId: a.userId, name: a.name, avatarUrl: a.avatarUrl ?? null },
          });
        })
        .on('broadcast', { event: STAGE_CLEAR_EVENT }, () => {
          setStagedAnswer(null);
          pendingStageRef.current = null;
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'itera', table: 'class_sessions', filter: `id=eq.${sessionId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (row && row.id) applySession(mapSession(row));
          }
        )
        .on('presence', { event: 'sync' }, syncRoster)
        .on('presence', { event: 'join' }, syncRoster)
        .on('presence', { event: 'leave' }, syncRoster)
        .subscribe((s) => {
          // A replaced channel keeps firing status callbacks while its teardown
          // drains — only the CURRENT channel may drive state / retries.
          if (disposed || current !== channel) return;
          const isJoined = s === 'SUBSCRIBED';
          setConnected(isJoined);
          if (isJoined) {
            everJoined = true;
            attempt = 0;
            setReconnecting(false);
            // Belt-and-suspenders: re-read presence shortly after joining, in case
            // the initial `sync` landed before the existing members were relayed.
            // Guarded so a drop right after joining can't wipe the roster from a
            // stale channel's drained presence state.
            const lateSync = () => {
              if (!disposed && current === channel) syncRoster();
            };
            setTimeout(lateSync, 400);
            setTimeout(lateSync, 1500);
            // Realtime does NOT replay postgres_changes after a socket blip, so a
            // client that reconnects (or joins late) can miss an advance — including
            // leaving the reception. Re-read the durable row on every (re)subscribe
            // so it always converges instead of getting stranded in the lobby.
            void getClassSession(sessionId).then(applySession);
            trackPresence();
            return;
          }
          if (s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
            if (everJoined) setReconnecting(true);
            scheduleRetry();
          }
        });

      channelRef.current = channel;
    };

    // Back to the foreground (phone unlock / tab switch) with a retry pending →
    // reconnect NOW instead of waiting out the backoff.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || retryTimer === null) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      reconnectNow();
    };
    document.addEventListener('visibilitychange', onVisible);

    connect();
    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      const old = current;
      current = null;
      teardown(old);
    };
    // Subscribe ONCE per session (per channel INSTANCE — reconnects build a NEW
    // instance). `class:<id>` is a SHARED broadcast/presence topic (can't be
    // uniquified like the badge channel), and realtime-js dedupes by topic +
    // removeChannel() is async — so re-running this effect (e.g. when identity
    // resolves after sessionId) would reuse the still-joined channel and
    // `.on('postgres_changes'|'presence', …)` would THROW ("after `subscribe()`").
    // Identity is read via identityRef and tracked in the effect below, so it
    // never needs to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Track (or re-track) presence identity once the channel is connected and
  // identity is known — without tearing down / re-subscribing the channel.
  useEffect(() => {
    if (!connected || !identity) return;
    trackPresence();
    // Track on the primitive identity fields, not the object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, identity?.userId, identity?.name, identity?.avatarUrl, identity?.isInstructor]);

  const setHandRaised = useCallback(
    (raised: boolean) => {
      handRaisedRef.current = raised;
      trackPresence();
    },
    [trackPresence]
  );

  // Instructor pulls a learner's answer to the stage: arm a nonce for the target
  // and broadcast stage-request. The matching stage-answer (gated in the channel
  // handler) is what flips the class to stage-show.
  const requestStage = useCallback((targetUserId: string) => {
    const channel = channelRef.current;
    const activityId = currentActivityIdRef.current;
    if (!channel || !activityId || !targetUserId) return;
    const nonce =
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    pendingStageRef.current = { nonce, targetUserId };
    void channel.send({
      type: 'broadcast',
      event: STAGE_REQUEST_EVENT,
      payload: { activityId, targetUserId, nonce },
    });
  }, []);

  const clearStage = useCallback(() => {
    const channel = channelRef.current;
    pendingStageRef.current = null;
    setStagedAnswer(null);
    if (!channel) return;
    void channel.send({ type: 'broadcast', event: STAGE_CLEAR_EVENT, payload: {} });
  }, []);

  const broadcast = useCallback(
    (activityId: string) => {
      const channel = channelRef.current;
      // Optimistic local update for the professor's own screen.
      setCurrentActivityId(activityId);
      setTimer(null);
      setStoppedFor(null);
      if (!channel) return;
      void channel.send({
        type: 'broadcast',
        event: ADVANCE_EVENT,
        payload: { current_activity_id: activityId },
      });
    },
    []
  );

  const broadcastTimer = useCallback((activityId: string, durationSeconds: number) => {
    const channel = channelRef.current;
    const deadline = Date.now() + durationSeconds * 1000;
    // Optimistic local update first (mirrors clearTimer/broadcast) so the
    // professor's own screen reflects the timer even if the channel just blipped.
    setTimer({ activityId, deadline });
    if (!channel) return;
    void channel.send({
      type: 'broadcast',
      event: TIMER_EVENT,
      payload: { activity_id: activityId, deadline },
    });
  }, []);

  const clearTimer = useCallback((activityId: string) => {
    const channel = channelRef.current;
    setTimer((prev) => (prev && prev.activityId === activityId ? null : prev));
    setStoppedFor(activityId);
    if (!channel) return;
    void channel.send({
      type: 'broadcast',
      event: TIMER_STOP_EVENT,
      payload: { activity_id: activityId },
    });
  }, []);

  const broadcastAnswer = useCallback(
    (activityId: string, correct: boolean, elapsedMs?: number) => {
      const channel = channelRef.current;
      const userId = identityRef.current?.userId;
      if (!channel || !userId) return;
      setAnswers((prev) => ({
        ...prev,
        [activityId]: { ...(prev[activityId] ?? {}), [userId]: correct },
      }));
      if (typeof elapsedMs === 'number') {
        setElapsed((prev) => ({
          ...prev,
          [activityId]: { ...(prev[activityId] ?? {}), [userId]: elapsedMs },
        }));
      }
      void channel.send({
        type: 'broadcast',
        event: ANSWERED_EVENT,
        payload: { activity_id: activityId, user_id: userId, correct, elapsed_ms: elapsedMs },
      });
    },
    []
  );

  return {
    session,
    currentActivityId,
    status,
    roster,
    connected,
    reconnecting,
    loading,
    answers,
    elapsed,
    timer,
    stoppedFor,
    stagedAnswer,
    broadcast,
    broadcastAnswer,
    broadcastTimer,
    clearTimer,
    setHandRaised,
    requestStage,
    clearStage,
    refetch,
  };
}
