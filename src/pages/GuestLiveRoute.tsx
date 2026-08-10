/**
 * `/g/:code` — the guest surface (plan 20260728-itera-guest-link-aula-sincrona).
 *
 * Mounted OUTSIDE `RequireAuth` in App.tsx. That is the structural gate ADR-3
 * asks for: a link-invited visitor never renders an auth guard, so there is no
 * "the guard had a bug" path into the authenticated app. This component is a
 * three-state machine and nothing else:
 *
 *   gate   → the SAME `LiveNameGate` the cohort uses, in guest mode. Submitting
 *            calls `POST /v1/live/guest-session` and applies the returned
 *            Supabase session (ADR-1).
 *   live   → the SAME `LiveSessionPage`, wrapped in `GuestModeProvider` (ADR-3 —
 *            no forked page; ~24 live components and the whole sync layer stay
 *            shared).
 *   ended  → `GuestEndCard` with the `/signup` CTA. v1 does NOT convert or
 *            migrate the guest's data (ADR-7) — the card is the funnel.
 *
 * On reload the guest's JWT is still in localStorage (supabase-js persists it)
 * and the code→session mapping is remembered alongside it, so a refresh mid-class
 * goes straight back to `live` instead of minting a SECOND guest user for the
 * same person (which would split them across two roster/podium rows).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { LiveNameGate } from '@/components/live/LiveNameGate';
import { GuestEndCard } from '@/components/live/GuestEndCard';
import { GuestNotice } from '@/components/live/GuestNotice';
import { GuestModeProvider, type GuestMode } from '@/guest/GuestModeContext';
import LiveSessionPage from '@/pages/LiveSessionPage';
import {
  guestJoinConfigured,
  isGuestCodeActive,
  readStoredGuestSession,
  storeGuestSession,
  type GuestSession,
} from '@/services/guestSession.service';
import { isValidGuestCode } from '@/utils/guestCode';

export default function GuestLiveRoute() {
  const { code } = useParams<{ code: string }>();
  const { t } = useI18n();
  const [joined, setJoined] = useState<GuestSession | null>(() =>
    code ? readStoredGuestSession(code) : null
  );
  const [left, setLeft] = useState(false);
  const [codeDead, setCodeDead] = useState(false);
  const joinedHere = useRef(false);

  /* Re-stamp this class as the one the browser is in. `findStoredGuestCode` reads
     that stamp to decide where to send a guest who lands on an authenticated
     route; without a refresh here an entry from an earlier class keeps winning,
     which is how a guest ended up on a URL for someone else's class. */
  useEffect(() => {
    if (joined) storeGuestSession(joined);
  }, [joined]);

  /* Advisory liveness probe, so a link forwarded after the class ended is refused
     on ARRIVAL rather than after the visitor fills in the form. NOT the authority
     — `POST /v1/live/guest-session` re-checks `status='live'` and is what actually
     enforces it. It runs for a RETURNING guest too: their stored session outlives
     the class, so skipping it mounted the live page on a class that had ended
     hours earlier, and the page errored instead of saying it was over.
     Acting on a `false` is safe because `isGuestCodeActive` fails OPEN — only an
     explicit `active: false` from itera-api reaches here — and because a join
     that succeeded in this mount outranks a probe answered before it. */
  useEffect(() => {
    if (!code) return;
    let alive = true;
    void isGuestCodeActive(code).then((active) => {
      if (alive && !active && !joinedHere.current) setCodeDead(true);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  const onJoined = useCallback((session: GuestSession) => {
    joinedHere.current = true;
    setJoined(session);
  }, []);
  const leave = useCallback(() => setLeft(true), []);
  const guestMode = useMemo<GuestMode | null>(
    () => (joined ? { ...joined, leave } : null),
    [joined, leave]
  );

  if (!code || !isValidGuestCode(code)) {
    return (
      <GuestNotice
        testid="guest-invalid-code"
        title={t('live.guest.invalid.title')}
        body={t('live.guest.invalid.subtitle')}
      />
    );
  }

  // The surface is dormant on a build without itera-api / Supabase configured —
  // say so instead of showing a form that can only ever fail.
  if (!guestJoinConfigured()) {
    return (
      <GuestNotice
        testid="guest-not-configured"
        title={t('live.guest.unavailable.title')}
        body={t('live.guest.unavailable.subtitle')}
      />
    );
  }

  if (left) return <GuestEndCard onBack={() => setLeft(false)} />;

  // A guest who was IN this class gets the end card: "acabou" is the honest
  // screen and it carries the signup CTA. No `onBack` — nothing live to return
  // to. Someone who never joined gets the plainer notice, before any form.
  if (codeDead) {
    return guestMode ? (
      <GuestEndCard />
    ) : (
      <GuestNotice
        testid="guest-code-expired"
        title={t('live.guest.expired.title')}
        body={t('live.guest.expired.subtitle')}
      />
    );
  }

  if (!guestMode) {
    return (
      <div className="min-h-screen bg-background px-4 py-14" data-testid="guest-gate">
        <div className="max-w-md mx-auto">
          <p className="font-mono text-[11px] uppercase tracking-wider text-clay text-center">
            {t('live.eyebrow')}
          </p>
          <LiveNameGate onDone={() => undefined} guest={{ code, onJoined }} />
        </div>
      </div>
    );
  }

  return (
    <GuestModeProvider value={guestMode}>
      <LiveSessionPage />
    </GuestModeProvider>
  );
}
