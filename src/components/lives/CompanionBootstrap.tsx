import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useCompanion } from '@/hooks/useCompanion';
import { useShop } from '@/hooks/useShop';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { LivesBoundary } from './LivesBoundary';

/** On a lesson the warm-ups wait this long, so the lesson content and progress reads get the connections first. */
export const LESSON_WARM_DELAY_MS = 6000;

function Warm() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const onLesson = pathname.startsWith('/lesson/');
  const [released, setReleased] = useState(!onLesson);
  useEffect(() => {
    if (released) return;
    const id = window.setTimeout(() => setReleased(true), LESSON_WARM_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [released]);
  // The first call of a wallet user mints the Tera in the background; polling runs inside the hook.
  const learner = !isGuestAccessToken(session?.access_token) && released;
  useCompanion({ enabled: learner });
  // The shop list is slow to build and both the shop and the profile wait on it: fetched here, they open with it in cache.
  useShop({ enabled: learner });
  return null;
}

/** Calls `companion` and `shop-items` once per session on app load so the asset and the shop list exist before the shop opens. Renders nothing and never blocks. */
export function CompanionBootstrap() {
  return (
    <LivesBoundary>
      <Warm />
    </LivesBoundary>
  );
}
