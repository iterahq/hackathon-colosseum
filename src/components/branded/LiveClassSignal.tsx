/**
 * App-wide "a class went live" signal (loop-2 fix #6).
 *
 * Discovery of a live class used to rely SOLELY on <LiveClassBadge> rendering on
 * the (subscription-gated) home — a student on any other route would miss a class
 * going live. This mounts near the router root and watches the
 * `useActiveLiveClass()` null→live transition, firing a single toast ("Uma aula
 * ao vivo começou — Entrar") that deep-links into `/live/:sessionId`.
 *
 * Gating: `useActiveLiveClass` already returns null unless the feature is enabled
 * for the user's tenant, so this signal is automatically scoped to enabled
 * tenants — no extra gate needed here.
 *
 * De-dupe: the transition is decided by `computeLiveSignal` (pure, unit-tested)
 * so the toast fires ONCE per session id — never on every poll/re-render, and
 * never when the user is already on the live route.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useActiveLiveClass } from '@/hooks/useLiveClass';
import { useShellSurface } from '@/hooks/useShellSurface';
import { useI18n } from '@/i18n';
import { toast } from '@/components/ui/sonner';

/**
 * Decide whether a live-class toast should fire, given the currently-active
 * session id, the last id we already signaled, and whether the user is already
 * on a `/live/*` route. Pure so the once-per-transition rule is unit-testable.
 *
 * - No active session → never fire; retain the last signaled id (so a class that
 *   reappears with the SAME id after a blip is not re-announced).
 * - Active session that differs from the last signaled id → fire, UNLESS the user
 *   is already viewing a live route (they don't need to be told to enter).
 *   Either way we advance `nextSignaledId` so the same session never re-toasts.
 */
export function computeLiveSignal({
  activeId,
  signaledId,
  onLiveRoute,
}: {
  activeId: string | null;
  signaledId: string | null;
  onLiveRoute: boolean;
}): { fire: boolean; nextSignaledId: string | null } {
  if (!activeId) return { fire: false, nextSignaledId: signaledId };
  const isNew = activeId !== signaledId;
  return { fire: isNew && !onLiveRoute, nextSignaledId: activeId };
}

export function LiveClassSignal() {
  const { data: active } = useActiveLiveClass();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const surface = useShellSurface();
  const signaledRef = useRef<string | null>(null);

  const activeId = active?.id ?? null;

  useEffect(() => {
    if (surface === 'pending') return;
    const onLiveRoute = location.pathname.startsWith('/live/');
    const { fire, nextSignaledId } = computeLiveSignal({
      activeId,
      signaledId: signaledRef.current,
      onLiveRoute,
    });
    signaledRef.current = nextSignaledId;
    if (fire && activeId) {
      if (surface === 'shell') {
        toast(t('live.signal.title'), {
          description: t('shell.liveUnavailable.body', { host: window.location.host }),
          duration: 12_000,
        });
      } else {
        toast(t('live.signal.title'), {
          description: t('live.signal.body'),
          duration: 12_000,
          action: {
            label: t('live.signal.cta'),
            onClick: () => navigate(`/live/${activeId}`),
          },
        });
      }
    }
  }, [activeId, location.pathname, navigate, surface, t]);

  return null;
}
