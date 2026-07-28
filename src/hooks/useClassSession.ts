/**
 * useClassSession — the real-time synchronicity layer for a live cohort class.
 *
 * TWO PRIVATE Supabase Realtime topics, both gated by realtime.messages RLS:
 *   `class:<sessionId>`      — participants read + send (migration 0022).
 *   `class:<sessionId>:ctrl` — participants read, only class STAFF send
 *                              (migration 0023). Every instructor-driven event
 *                              (advance, timer, stage) rides here, so a learner
 *                              can no longer forge one.
 * Between them they carry three concerns:
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
import { gatherStageContent, parseStageStatus } from '@/utils/stageAnswerContent';
import { CODE_SNAPSHOT_EVENT } from '@/services/codeSnapshot.service';

export type { ClassPresenceMember, UseClassSession } from '@/types/liveClass';

const ADVANCE_EVENT = 'advance';
const ANSWERED_EVENT = 'answered';
const TIMER_EVENT = 'timer';
const TIMER_STOP_EVENT = 'timer-stop';
// "Pull to stage" (ADR-3/4): request → student replies → instructor gates → all
// render. The request rides the CONTROL topic, so only staff can ask for a
// learner's work; the reply rides the shared topic, where it discloses nothing
// the resulting stage-show would not publish to the class anyway. The nonce +
// target echo below reject STALE/MISMATCHED replies.
const STAGE_REQUEST_EVENT = 'stage-request';
const STAGE_ANSWER_EVENT = 'stage-answer';
const STAGE_SHOW_EVENT = 'stage-show';
const STAGE_CLEAR_EVENT = 'stage-clear';
// After a pull resolves, the staged learner keeps streaming its work while it
// edits (live stage). It re-emits stage-update on every autosave; the instructor
// forwards those as fresh stage-show. Same trust model as the one-shot pull —
// gated on the resolved (userId + activityId) target, not a fresh nonce.
const STAGE_UPDATE_EVENT = 'stage-update';
// The pull is peer-to-peer: only a client that is ONLINE can answer it. A learner
// who closed the tab / lost the network never replies, so give up after a grace
// window and tell the professor — an endless spinner reads as a broken feature.
const STAGE_REPLY_TIMEOUT_MS = 6000;

export function useClassSession(
  sessionId: string | undefined,
  identity?: Identity
): UseClassSession {
  const [session, setSession] = useState<ClassSession | null>(null);
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [status, setStatus] = useState<ClassSession['status'] | null>(null);
  const [roster, setRoster] = useState<ClassPresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  // Presence lives on the SHARED topic only, so it must re-track as soon as THAT
  // one is up — a control-topic outage can't be allowed to make a learner
  // invisible in the professor's roster.
  const [sharedConnected, setSharedConnected] = useState(false);
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
  // Instructor-side UX for the in-flight pull: who we're waiting on, and who we
  // gave up on (see STAGE_REPLY_TIMEOUT_MS).
  const [stagePendingUserId, setStagePendingUserId] = useState<string | null>(null);
  const [stageUnreachableUserId, setStageUnreachableUserId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // The staff-write topic (migration 0023) — every instructor-driven send.
  const ctrlRef = useRef<RealtimeChannel | null>(null);
  // The instructor's in-flight pull: the nonce armed by requestStage + which
  // learner it targeted. A stage-answer is only gated to stage-show when BOTH
  // the userId matches the target AND the nonce echoes back (rejects stale replies).
  const pendingStageRef = useRef<{ nonce: string; targetUserId: string } | null>(null);
  const stageTimeoutRef = useRef<number | null>(null);
  // Instructor side: the learner currently ON the live stage (after a pull
  // resolved). Kept so their streamed stage-update pushes keep being forwarded
  // as stage-show until the pull is cleared or the class advances.
  const liveStageRef = useRef<{ targetUserId: string; activityId: string } | null>(null);
  // Learner side: the activity this client is itself staged for (its own work is
  // on the class stage). Drives the autosave→stage-update stream below.
  const stagedSelfRef = useRef<string | null>(null);
  // Learner side: the activity this client actually answered a pull for. A
  // stage-show is peer-forgeable, so self-streaming only arms when we replied to
  // a real stage-request first — a bare forged stage-show can't make us stream.
  const answeredStageRef = useRef<string | null>(null);
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
  // track() (identity refresh, reconnect) — not just the explicit toggle. Same
  // for the activity the learner has started working on.
  const handRaisedRef = useRef(false);
  const workingOnRef = useRef<string | null>(null);

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
      working_on: workingOnRef.current,
      at: new Date().toISOString(),
    });
  }, []);

  // `answered` is the one event a learner still sends, so it is self-attested:
  // the scoreboard it feeds is DECORATION and itera.class_answers (RLS: a learner
  // writes only its own row) stays the durable truth. Recording is MONOTONE — a
  // hit never flips to a miss and a time is never rewritten — so a forged event
  // can't sabotage a peer.
  const recordAnswer = useCallback(
    (activityId: string, userId: string, correct: boolean, elapsedMs?: number) => {
      setAnswers((prev) => {
        if (prev[activityId]?.[userId] === true && !correct) return prev;
        return { ...prev, [activityId]: { ...(prev[activityId] ?? {}), [userId]: correct } };
      });
      if (!correct || typeof elapsedMs !== 'number') return;
      setElapsed((prev) => {
        if (typeof prev[activityId]?.[userId] === 'number') return prev;
        return { ...prev, [activityId]: { ...(prev[activityId] ?? {}), [userId]: elapsedMs } };
      });
    },
    []
  );

  // Clears the "waiting for the peer's reply" timer without touching the nonce
  // gate — used by every path that ends a pull (reply, clear, advance, unmount).
  const clearStageTimeout = useCallback(() => {
    if (stageTimeoutRef.current === null) return;
    clearTimeout(stageTimeoutRef.current);
    stageTimeoutRef.current = null;
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
    let currentCtrl: RealtimeChannel | null = null;

    const teardown = (ch: RealtimeChannel | null): Promise<unknown> => {
      if (!ch) return Promise.resolve();
      if (channelRef.current === ch) channelRef.current = null;
      if (ctrlRef.current === ch) ctrlRef.current = null;
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
      const oldCtrl = currentCtrl;
      current = null;
      currentCtrl = null;
      // Await the removal: realtime-js dedupes channels by topic, so connecting
      // before the errored instance is fully gone can hand back the SAME (non-
      // closed) instance whose `subscribe()` would silently no-op.
      void Promise.all([teardown(old), teardown(oldCtrl)]).then(() => {
        if (!disposed) connect();
      });
    };

    const connect = () => {
      if (disposed) return;
      let mainJoined = false;
      let ctrlJoined = false;
      // The backoff resets only when BOTH topics are up: a ctrl that keeps
      // failing would otherwise rebuild the HEALTHY main channel every second
      // (roster flicker + a session refetch per client) instead of backing off.
      const syncJoinState = () => {
        setSharedConnected(mainJoined);
        setConnected(mainJoined && ctrlJoined);
        if (!(mainJoined && ctrlJoined)) return;
        attempt = 0;
        setReconnecting(false);
      };
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
      // Instructor-driven events ride the staff-write topic (migration 0023).
      // Everyone joins it to LISTEN; only class staff may send on it, so advance
      // / timer / stage-pull can no longer be forged by a cohort member.
      const ctrl = sb.channel(`class:${sessionId}:ctrl`, {
        config: { private: true, broadcast: { self: true } },
      });
      current = channel;
      currentCtrl = ctrl;
      // Published BEFORE the subscribe chains: the SUBSCRIBED callback calls
      // trackPresence(), which reads channelRef.
      channelRef.current = channel;
      ctrlRef.current = ctrl;

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
            workingOn: typeof meta.working_on === 'string' ? meta.working_on : null,
          });
        }
        setRoster(members);
      };

      ctrl
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
            liveStageRef.current = null;
            stagedSelfRef.current = null;
            answeredStageRef.current = null;
            clearStageTimeout();
            setStagePendingUserId(null);
            setStageUnreachableUserId(null);
          }
        })
        .on('broadcast', { event: TIMER_EVENT }, ({ payload }) => {
          const next = parseTimerEvent(payload);
          if (next) {
            setTimer(next);
            setStoppedFor((prev) => (prev === next.activityId ? null : prev));
          }
        })
        .on('broadcast', { event: TIMER_STOP_EVENT }, ({ payload }) => {
          setTimer((prev) => timerAfterStop(prev, payload));
          const p = payload as { activity_id?: unknown } | null;
          if (p && typeof p.activity_id === 'string') setStoppedFor(p.activity_id);
        })
        // stage-request (instructor → all): the TARGETED learner replies with its
        // OWN work for the current activity — finished OR in progress OR an
        // explicit empty state (ADR-4 revised). The learner is still the only one
        // who can answer for itself; what changed is that "no answer yet" is now
        // a real reply instead of silence.
        .on('broadcast', { event: STAGE_REQUEST_EVENT }, ({ payload }) => {
          const p = payload as
            | { activityId?: string; targetUserId?: string; nonce?: string }
            | null;
          const id = identityRef.current;
          const sid = sessionIdRef.current;
          if (!p?.activityId || !p.targetUserId || !p.nonce || !id || !sid) return;
          if (p.targetUserId !== id.userId || p.activityId !== currentActivityIdRef.current) return;
          const gathered = gatherStageContent(sid, p.activityId);
          answeredStageRef.current = p.activityId;
          void channel.send({
            type: 'broadcast',
            event: STAGE_ANSWER_EVENT,
            payload: {
              activityId: p.activityId,
              userId: id.userId,
              nonce: p.nonce,
              kind: gathered.kind,
              content: gathered.content,
              status: gathered.status,
              author: { userId: id.userId, name: id.name, avatarUrl: id.avatarUrl ?? null },
            },
          });
        })
        // stage-show (instructor → all): the ONLY source clients render the stage
        // from — honored only for the current activity.
        .on('broadcast', { event: STAGE_SHOW_EVENT }, ({ payload }) => {
          const p = payload as
            | {
                activityId?: string;
                kind?: string;
                content?: string;
                status?: unknown;
                author?: { userId?: string; name?: string; avatarUrl?: string | null };
              }
            | null;
          if (!p?.activityId || typeof p.kind !== 'string' || typeof p.content !== 'string') return;
          if (p.activityId !== currentActivityIdRef.current) return;
          const a = p.author;
          if (!a?.userId || typeof a.name !== 'string') return;
          setStagedAnswer({
            activityId: p.activityId,
            kind: p.kind,
            content: p.content,
            status: parseStageStatus(p.status),
            author: { userId: a.userId, name: a.name, avatarUrl: a.avatarUrl ?? null },
          });
          // If MY work is the one on stage, start streaming edits; if someone
          // else took the stage, stop (I'm no longer the live source). Only arm
          // when I actually answered a pull for this activity — a forged
          // stage-show naming me can't turn me into a silent live source.
          const me = identityRef.current?.userId;
          stagedSelfRef.current =
            me && a.userId === me && answeredStageRef.current === p.activityId ? p.activityId : null;
        })
        .on('broadcast', { event: STAGE_CLEAR_EVENT }, () => {
          setStagedAnswer(null);
          pendingStageRef.current = null;
          liveStageRef.current = null;
          stagedSelfRef.current = null;
          answeredStageRef.current = null;
          clearStageTimeout();
          setStagePendingUserId(null);
          setStageUnreachableUserId(null);
        })
        .subscribe((s) => {
          if (disposed || currentCtrl !== ctrl) return;
          ctrlJoined = s === 'SUBSCRIBED';
          syncJoinState();
          if (ctrlJoined || !(s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT')) return;
          if (everJoined) setReconnecting(true);
          scheduleRetry();
        });

      channel
        // stage-answer → THE GATE: only the instructor honors it, and only when the
        // reply's userId + nonce match the in-flight pull. It then re-broadcasts
        // stage-show on the control topic, so a learner can NEVER stage arbitrary
        // content on the class.
        .on('broadcast', { event: STAGE_ANSWER_EVENT }, ({ payload }) => {
          const pending = pendingStageRef.current;
          const p = payload as
            | {
                activityId?: string;
                userId?: string;
                nonce?: string;
                kind?: string;
                content?: string;
                status?: unknown;
                author?: unknown;
              }
            | null;
          if (!pending || !p?.userId || !p.nonce || !p.activityId) return;
          if (p.userId !== pending.targetUserId || p.nonce !== pending.nonce) return;
          if (p.activityId !== currentActivityIdRef.current) return;
          pendingStageRef.current = null;
          liveStageRef.current = { targetUserId: p.userId, activityId: p.activityId };
          clearStageTimeout();
          setStagePendingUserId(null);
          setStageUnreachableUserId(null);
          void ctrl.send({
            type: 'broadcast',
            event: STAGE_SHOW_EVENT,
            payload: {
              activityId: p.activityId,
              kind: p.kind,
              content: p.content,
              status: parseStageStatus(p.status),
              author: p.author,
            },
          });
        })
        // stage-update (staged learner → all): the learner on stage re-sends its
        // work as it edits. Only the instructor honors it, and only for the target
        // it already resolved a pull to — then forwards it as a fresh stage-show.
        .on('broadcast', { event: STAGE_UPDATE_EVENT }, ({ payload }) => {
          const live = liveStageRef.current;
          const p = payload as
            | {
                activityId?: string;
                userId?: string;
                kind?: string;
                content?: string;
                status?: unknown;
                author?: unknown;
              }
            | null;
          if (!live || !p?.userId || !p.activityId) return;
          if (p.userId !== live.targetUserId || p.activityId !== live.activityId) return;
          if (p.activityId !== currentActivityIdRef.current) return;
          void ctrl.send({
            type: 'broadcast',
            event: STAGE_SHOW_EVENT,
            payload: {
              activityId: p.activityId,
              kind: p.kind,
              content: p.content,
              status: parseStageStatus(p.status),
              author: p.author,
            },
          });
        })
        // answered (learner → all) — the only learner-sent event left; recorded
        // monotonically, see recordAnswer.
        .on('broadcast', { event: ANSWERED_EVENT }, ({ payload }) => {
          const p = payload as {
            activity_id?: string;
            user_id?: string;
            correct?: boolean;
            elapsed_ms?: number;
          } | null;
          if (!p?.activity_id || !p.user_id) return;
          recordAnswer(p.activity_id, p.user_id, p.correct === true, p.elapsed_ms);
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
          mainJoined = isJoined;
          syncJoinState();
          if (isJoined) {
            everJoined = true;
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
      const oldCtrl = currentCtrl;
      current = null;
      currentCtrl = null;
      teardown(old);
      teardown(oldCtrl);
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
    if (!sharedConnected || !identity) return;
    trackPresence();
    // Track on the primitive identity fields, not the object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sharedConnected,
    identity?.userId,
    identity?.name,
    identity?.avatarUrl,
    identity?.isInstructor,
  ]);

  const setHandRaised = useCallback(
    (raised: boolean) => {
      handRaisedRef.current = raised;
      trackPresence();
    },
    [trackPresence]
  );

  // Learner side: announce (via presence) that there IS local work for this
  // activity, so the professor's picker can show "em andamento" before pulling.
  // Guarded on a real change — the code snack autosaves every 600ms and we do
  // NOT want a presence re-track per keystroke burst.
  const setWorkingOn = useCallback(
    (activityId: string | null) => {
      if (workingOnRef.current === activityId) return;
      workingOnRef.current = activityId;
      trackPresence();
    },
    [trackPresence]
  );

  // Instructor pulls a learner's work to the stage: arm a nonce for the target
  // and broadcast stage-request. The matching stage-answer (gated in the channel
  // handler) is what flips the class to stage-show.
  const requestStage = useCallback(
    (targetUserId: string) => {
      const ctrl = ctrlRef.current;
      const activityId = currentActivityIdRef.current;
      if (!ctrl || !activityId || !targetUserId) return;
      const nonce =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingStageRef.current = { nonce, targetUserId };
      setStagePendingUserId(targetUserId);
      setStageUnreachableUserId(null);
      clearStageTimeout();
      // Nobody can answer for an offline learner (the snapshot lives in THEIR
      // localStorage), so a silent request would spin forever. Give up loudly.
      stageTimeoutRef.current = window.setTimeout(() => {
        stageTimeoutRef.current = null;
        // Only abandon the pull we armed — a newer request already took over.
        if (pendingStageRef.current?.nonce !== nonce) return;
        pendingStageRef.current = null;
        setStagePendingUserId(null);
        setStageUnreachableUserId(targetUserId);
      }, STAGE_REPLY_TIMEOUT_MS);
      void ctrl.send({
        type: 'broadcast',
        event: STAGE_REQUEST_EVENT,
        payload: { activityId, targetUserId, nonce },
      });
    },
    [clearStageTimeout]
  );

  const clearStage = useCallback(() => {
    const ctrl = ctrlRef.current;
    pendingStageRef.current = null;
    liveStageRef.current = null;
    stagedSelfRef.current = null;
    answeredStageRef.current = null;
    clearStageTimeout();
    setStagePendingUserId(null);
    setStageUnreachableUserId(null);
    setStagedAnswer(null);
    if (!ctrl) return;
    void ctrl.send({ type: 'broadcast', event: STAGE_CLEAR_EVENT, payload: {} });
  }, [clearStageTimeout]);

  // A pull left in flight when the page unmounts must not fire into a dead tree.
  useEffect(() => clearStageTimeout, [clearStageTimeout]);

  // Live stage: while THIS learner's work is on stage, re-broadcast it on every
  // autosave so the class mirror tracks the edits in real time (no polling — the
  // snapshot service already fires this on its debounced save).
  useEffect(() => {
    const onSnapshot = (e: Event) => {
      const staged = stagedSelfRef.current;
      const sid = sessionIdRef.current;
      const id = identityRef.current;
      const channel = channelRef.current;
      if (!staged || !sid || !id || !channel) return;
      if (staged !== currentActivityIdRef.current) return;
      const detailActivity = (e as CustomEvent<{ activityId?: string }>).detail?.activityId;
      if (detailActivity && detailActivity !== staged) return;
      const gathered = gatherStageContent(sid, staged);
      void channel.send({
        type: 'broadcast',
        event: STAGE_UPDATE_EVENT,
        payload: {
          activityId: staged,
          userId: id.userId,
          kind: gathered.kind,
          content: gathered.content,
          status: gathered.status,
          author: { userId: id.userId, name: id.name, avatarUrl: id.avatarUrl ?? null },
        },
      });
    };
    window.addEventListener(CODE_SNAPSHOT_EVENT, onSnapshot);
    return () => window.removeEventListener(CODE_SNAPSHOT_EVENT, onSnapshot);
  }, []);

  const broadcast = useCallback(
    (activityId: string) => {
      const ctrl = ctrlRef.current;
      // Optimistic local update for the professor's own screen.
      setCurrentActivityId(activityId);
      setTimer(null);
      setStoppedFor(null);
      if (!ctrl) return;
      void ctrl.send({
        type: 'broadcast',
        event: ADVANCE_EVENT,
        payload: { current_activity_id: activityId },
      });
    },
    []
  );

  const broadcastTimer = useCallback((activityId: string, durationSeconds: number) => {
    const ctrl = ctrlRef.current;
    const deadline = Date.now() + durationSeconds * 1000;
    // Optimistic local update first (mirrors clearTimer/broadcast) so the
    // professor's own screen reflects the timer even if the channel just blipped.
    setTimer({ activityId, deadline });
    setStoppedFor((prev) => (prev === activityId ? null : prev));
    if (!ctrl) return;
    void ctrl.send({
      type: 'broadcast',
      event: TIMER_EVENT,
      payload: { activity_id: activityId, deadline },
    });
  }, []);

  const clearTimer = useCallback((activityId: string) => {
    const ctrl = ctrlRef.current;
    setTimer((prev) => (prev && prev.activityId === activityId ? null : prev));
    setStoppedFor(activityId);
    if (!ctrl) return;
    void ctrl.send({
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
      recordAnswer(activityId, userId, correct, elapsedMs);
      void channel.send({
        type: 'broadcast',
        event: ANSWERED_EVENT,
        payload: { activity_id: activityId, user_id: userId, correct, elapsed_ms: elapsedMs },
      });
    },
    [recordAnswer]
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
    stagePendingUserId,
    stageUnreachableUserId,
    broadcast,
    broadcastAnswer,
    broadcastTimer,
    clearTimer,
    setHandRaised,
    setWorkingOn,
    requestStage,
    clearStage,
    refetch,
  };
}
