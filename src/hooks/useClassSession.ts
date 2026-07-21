/**
 * useClassSession — the real-time synchronicity layer for a live cohort class.
 *
 * ONE Supabase Realtime channel `class:<sessionId>` carries three concerns:
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
  ClassResetSignal,
  ClassTimer,
  UseClassSession,
} from '@/types/liveClass';
import { parseTimerEvent, timerAfterStop } from '@/utils/liveTimer';
import { reconnectDelayMs } from '@/utils/liveReconnect';

export type { ClassPresenceMember, UseClassSession } from '@/types/liveClass';

const ADVANCE_EVENT = 'advance';
const ANSWERED_EVENT = 'answered';
const TIMER_EVENT = 'timer';
const TIMER_STOP_EVENT = 'timer-stop';
const RESET_EVENT = 'reset';

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
  // The latest professor reset — consumers watch this to drop their per-activity
  // answered/expired state so the class can redo it. Cleared on advance.
  const [resetSignal, setResetSignal] = useState<ClassResetSignal | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
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

  // Drop every LIVE trace of one activity so the class can redo it: its answer /
  // timing aggregates, a running or stopped timer, and a bumped reset signal the
  // learner surface watches to clear its own answered/expired state.
  const clearActivityLiveState = useCallback((activityId: string) => {
    const drop = (prev: Record<string, Record<string, unknown>>) => {
      if (!(activityId in prev)) return prev;
      const next = { ...prev };
      delete next[activityId];
      return next;
    };
    setAnswers((prev) => drop(prev) as Record<string, Record<string, boolean>>);
    setElapsed((prev) => drop(prev) as Record<string, Record<string, number>>);
    setTimer((prev) => (prev && prev.activityId === activityId ? null : prev));
    setStoppedFor((prev) => (prev === activityId ? null : prev));
    setResetSignal((prev) => ({ activityId, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

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

      const channel = sb.channel(`class:${sessionId}`, {
        config: { presence: { key: presenceKey }, broadcast: { self: true } },
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
          // broadcast on this public channel can't shove the class back to the lobby.
          if (typeof next === 'string') {
            setCurrentActivityId(next);
            setTimer(null);
            setStoppedFor(null);
            setResetSignal(null);
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
        .on('broadcast', { event: RESET_EVENT }, ({ payload }) => {
          const p = payload as { activity_id?: unknown } | null;
          if (!p || typeof p.activity_id !== 'string') return;
          clearActivityLiveState(p.activity_id);
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

  const resetActivity = useCallback(
    (activityId: string) => {
      // Optimistic local clear first (mirrors clearTimer/broadcast) so the
      // professor's own screen resets even if the channel just blipped.
      clearActivityLiveState(activityId);
      const channel = channelRef.current;
      if (!channel) return;
      void channel.send({
        type: 'broadcast',
        event: RESET_EVENT,
        payload: { activity_id: activityId },
      });
    },
    [clearActivityLiveState]
  );

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
    resetSignal,
    broadcast,
    broadcastAnswer,
    broadcastTimer,
    clearTimer,
    resetActivity,
    setHandRaised,
    refetch,
  };
}
