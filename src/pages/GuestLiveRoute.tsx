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
 *            Supabase session (ADR-1). This is the "passo do Samuel" the guest
 *            lands directly on.
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { LiveNameGate } from '@/components/live/LiveNameGate';
import { GuestEndCard } from '@/components/live/GuestEndCard';
import { GuestModeProvider, type GuestMode } from '@/guest/GuestModeContext';
import LiveSessionPage from '@/pages/LiveSessionPage';
import {
  guestJoinConfigured,
  isGuestCodeActive,
  readStoredGuestSession,
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

  /* Advisory liveness probe, so a link forwarded after the class ended is
     refused on ARRIVAL rather than after the visitor fills in the form. NOT the
     authority — `POST /v1/live/guest-session` still re-checks `status='live'`
     and is what actually enforces this (a stale `true` here just means the join
     fails a moment later, exactly as before). Skipped for a guest who already
     joined in this browser: they hold a session and the live page handles the
     class ending on its own. */
  const [codeDead, setCodeDead] = useState(false);
  useEffect(() => {
    if (!code || joined) return;
    let alive = true;
    void isGuestCodeActive(code).then((active) => {
      if (alive && !active) setCodeDead(true);
    });
    return () => {
      alive = false;
    };
  }, [code, joined]);

  const leave = useCallback(() => setLeft(true), []);
  const guestMode = useMemo<GuestMode | null>(
    () => (joined ? { ...joined, leave } : null),
    [joined, leave]
  );

  if (!code || !isValidGuestCode(code)) {
    return (
      <GuestNotice testid="guest-invalid-code" title={t('live.guest.invalid.title')} body={t('live.guest.invalid.subtitle')} />
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

  // The class is over (or the code never resolved). Say so before asking for a
  // name — the same message the failed join would have produced, just earlier.
  if (codeDead && !guestMode) {
    return (
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
          <LiveNameGate
            onDone={() => undefined}
            guest={{ code, onJoined: setJoined }}
          />
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

function GuestNotice({ testid, title, body }: { testid: string; title: string; body: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div
        className="max-w-md w-full rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center"
        data-testid={testid}
      >
        <p className="font-display text-lg text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-2">{body}</p>
      </div>
    </div>
  );
}
