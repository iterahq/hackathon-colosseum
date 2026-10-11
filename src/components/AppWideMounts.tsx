import { useLocation } from 'react-router-dom';
import { LiveClassSignal } from '@/components/branded/LiveClassSignal';
import { FOCUS_BUILD } from '@/config/focus';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { useLocaleSync } from '@/hooks/useLocaleSync';
import { isGuestRoutePath } from '@/guest/guestRoute';

/**
 * Side-effect-only component: hydrates the active locale from the user's saved
 * profile (itera.users.locale) on load and persists user-initiated language
 * changes back to the DB. Must live inside I18nProvider + AuthProvider +
 * QueryClientProvider (it reads the profile via React Query). Renders nothing.
 */
function LocaleSync() {
  useLocaleSync();
  return null;
}

/**
 * The two app-wide mounts, plus the ONE route where they must not exist.
 *
 * `LocaleSync` WRITES `itera.users.locale` and `LiveClassSignal` READS the user's
 * memberships to decide whether to toast "a class went live" (with a deep link
 * into the authenticated `/live/:id`). A link-invited guest has zero memberships
 * and no business writing a locale preference — and a toast offering them an
 * authenticated deep-link is precisely the leak ADR-3 closes by putting the guest
 * on its own route. So on `/g/*` neither mounts at all.
 *
 * Deliberately NOT conditional inside each component: keeping the decision here,
 * keyed on the route, makes it one assertion to test and impossible to
 * half-apply.
 */
export function AppWideMounts() {
  const { pathname } = useLocation();
  // The offline line is for everyone, the guest included: it reads nothing and writes nothing.
  if (isGuestRoutePath(pathname)) return <OfflineBanner />;
  return (
    <>
      <OfflineBanner />
      <LocaleSync />
      {!FOCUS_BUILD && <LiveClassSignal />}
    </>
  );
}
