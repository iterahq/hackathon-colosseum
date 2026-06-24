/**
 * Wire the per-user language preference (itera.users.locale) into the i18n
 * provider. Two directions:
 *
 *  1. HYDRATE (DB → UI): once the signed-in user's profile loads, apply their
 *     saved locale to the provider WITHOUT echoing it back to the DB
 *     (setLocale(l, false)). This makes the user's stored choice the source of
 *     truth on every load/reload, across devices — not just localStorage.
 *
 *  2. PERSIST (UI → DB): register a sink so that any user-initiated locale change
 *     (the profile menu toggle) is written to itera.users.locale via
 *     updateMyLocale. localStorage is still updated by the provider as an
 *     offline/anonymous fallback; the DB write is best-effort and never blocks
 *     the instant UI switch.
 *
 * Mount this ONCE near the app root (inside <I18nProvider> + <AuthProvider>),
 * e.g. in App. componente → hook (useQuery) → service → fetch.
 */
import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/auth/AuthContext';
import { updateMyLocale } from '@/services/profile.service';

export function useLocaleSync(): void {
  const { setLocale, registerPersistSink } = useI18n();
  const { data: profile } = useProfile();
  const { session } = useAuth();
  // Guard so we hydrate from the DB only once per session (otherwise a later
  // user toggle would be reverted by a stale profile re-read).
  const hydratedFor = useRef<string | null>(null);

  // 1. Register the DB persist sink for user-initiated changes.
  useEffect(() => {
    registerPersistSink((l) => {
      // Fire-and-forget; the provider already updated state + localStorage.
      void updateMyLocale(l);
    });
    return () => registerPersistSink(null);
  }, [registerPersistSink]);

  // 2. Hydrate the active locale from the profile once it resolves.
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (!uid) {
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === uid) return;
    if (profile?.locale) {
      setLocale(profile.locale, false); // hydrate — do NOT echo back to the DB
      hydratedFor.current = uid;
    }
  }, [profile?.locale, session?.user?.id, setLocale]);
}
