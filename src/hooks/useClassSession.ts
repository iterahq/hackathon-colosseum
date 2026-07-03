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

export interface ClassPresenceMember {
  userId: string;
  name: string;
  isInstructor: boolean;
}

export interface UseClassSession {
  session: ClassSession | null;
  currentActivityId: string | null;
  status: ClassSession['status'] | null;
  roster: ClassPresenceMember[];
  connected: boolean;
  loading: boolean;
  /** Fast-path advance: broadcast the new pointer to all joined clients. */
  broadcast: (activityId: string) => void;
  /** Force a re-read of the durable session row (e.g. after a professor action). */
  refetch: () => void;
}

interface Identity {
  userId: string;
  name: string;
  isInstructor?: boolean;
}

const ADVANCE_EVENT = 'advance';

export function useClassSession(
  sessionId: string | undefined,
  identity?: Identity
): UseClassSession {
  const [session, setSession] = useState<ClassSession | null>(null);
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [status, setStatus] = useState<ClassSession['status'] | null>(null);
  const [roster, setRoster] = useState<ClassPresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Latest identity, read inside the channel effect / track without making the
  // channel re-subscribe when identity resolves late (which reused a still-
  // joined channel → `.on()`-after-`subscribe()` crash — see the effect below).
  const identityRef = useRef<Identity | undefined>(identity);
  identityRef.current = identity;

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
  useEffect(() => {
    if (!sessionId || !isSupabaseConfigured) return;
    const sb = getSupabase();
    const presenceKey =
      identityRef.current?.userId ?? `anon-${Math.random().toString(36).slice(2, 10)}`;

    const channel = sb.channel(`class:${sessionId}`, {
      config: { presence: { key: presenceKey }, broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: ADVANCE_EVENT }, ({ payload }) => {
        const next = (payload as { current_activity_id?: string | null })?.current_activity_id;
        if (typeof next === 'string' || next === null) setCurrentActivityId(next ?? null);
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'itera', table: 'class_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (row && row.id) applySession(mapSession(row));
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const members: ClassPresenceMember[] = [];
        const seen = new Set<string>();
        for (const key of Object.keys(state)) {
          const meta = state[key]?.[0] ?? {};
          const uid = typeof meta.user_id === 'string' ? meta.user_id : key;
          if (seen.has(uid)) continue;
          seen.add(uid);
          members.push({
            userId: uid,
            name: typeof meta.name === 'string' ? meta.name : uid.slice(0, 8),
            isInstructor: meta.is_instructor === true,
          });
        }
        setRoster(members);
      })
      .subscribe((s) => {
        const isJoined = s === 'SUBSCRIBED';
        setConnected(isJoined);
        const id = identityRef.current;
        if (isJoined && id) {
          void channel.track({
            user_id: id.userId,
            name: id.name,
            is_instructor: id.isInstructor === true,
            at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void sb.removeChannel(channel);
    };
    // Subscribe ONCE per session. `class:<id>` is a SHARED broadcast/presence
    // topic (can't be uniquified like the badge channel), and realtime-js
    // dedupes by topic + removeChannel() is async — so re-running this effect
    // (e.g. when identity resolves after sessionId) would reuse the still-
    // joined channel and `.on('postgres_changes'|'presence', …)` would THROW
    // ("after `subscribe()`"). Identity is read via identityRef and tracked in
    // the effect below, so it never needs to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Track (or re-track) presence identity once the channel is connected and
  // identity is known — without tearing down / re-subscribing the channel.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !connected || !identity) return;
    void channel.track({
      user_id: identity.userId,
      name: identity.name,
      is_instructor: identity.isInstructor === true,
      at: new Date().toISOString(),
    });
    // Track on the primitive identity fields, not the object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, identity?.userId, identity?.name, identity?.isInstructor]);

  const broadcast = useCallback(
    (activityId: string) => {
      const channel = channelRef.current;
      // Optimistic local update for the professor's own screen.
      setCurrentActivityId(activityId);
      if (!channel) return;
      void channel.send({
        type: 'broadcast',
        event: ADVANCE_EVENT,
        payload: { current_activity_id: activityId },
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
    loading,
    broadcast,
    refetch,
  };
}
