import { useAuth } from '@/auth/AuthContext';
import { useCompanion } from '@/hooks/useCompanion';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { LivesBoundary } from './LivesBoundary';

function Warm() {
  const { session } = useAuth();
  // The first call of a wallet user mints the Tera in the background; polling runs inside the hook.
  useCompanion({ enabled: !isGuestAccessToken(session?.access_token) });
  return null;
}

/** Calls `companion` once per session on app load so the asset exists before the shop opens. Renders nothing and never blocks. */
export function CompanionBootstrap() {
  return (
    <LivesBoundary>
      <Warm />
    </LivesBoundary>
  );
}
