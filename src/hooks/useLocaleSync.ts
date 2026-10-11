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
import { useI18n, type Locale } from '@/i18n';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/auth/AuthContext';
import { updateMyLocale } from '@/services/profile.service';

export const PENDING_LOCALE_KEY = 'itera.locale.pending';

function readPending(): Locale | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(PENDING_LOCALE_KEY);
  return v === 'pt' || v === 'en' ? v : null;
}

function writePending(l: Locale | null): void {
  if (typeof localStorage === 'undefined') return;
  if (l) localStorage.setItem(PENDING_LOCALE_KEY, l);
  else localStorage.removeItem(PENDING_LOCALE_KEY);
}

/**
 * A profile row younger than this has never had its locale chosen by the
 * learner: the value in the DB is the column default, not a preference. For
 * such an account the language the browser was already showing wins and is
 * saved, so a wallet sign-up from an English browser does not flip to Portuguese.
 */
export const FRESH_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;

export function isFreshAccount(createdAt: string | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t >= 0 && now - t < FRESH_ACCOUNT_WINDOW_MS;
}

export function useLocaleSync(): void {
  const { locale, setLocale, registerPersistSink } = useI18n();
  const { data: profile } = useProfile();
  const { session } = useAuth();
  // Guard so we hydrate from the DB only once per session (otherwise a later
  // user toggle would be reverted by a stale profile re-read).
  const hydratedFor = useRef<string | null>(null);

  const signedIn = useRef(false);
  signedIn.current = !!session?.user?.id;
  const shownLocale = useRef(locale);
  shownLocale.current = locale;

  // 1. Register the DB persist sink for user-initiated changes. The sink only
  // runs for explicit choices (hydration passes persist=false). Signed out
  // (the sign-in screen toggle), the choice is parked as pending so hydration
  // can apply it after sign-in instead of the stored profile value.
  useEffect(() => {
    registerPersistSink((l) => {
      if (!signedIn.current) {
        writePending(l);
        return;
      }
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
      const pending = readPending();
      writePending(null);
      hydratedFor.current = uid;
      if (pending && pending !== profile.locale) {
        // The choice made while signed out wins and is saved to the profile.
        setLocale(pending, true);
      } else if (!pending && isFreshAccount(session?.user?.created_at) && shownLocale.current !== profile.locale) {
        setLocale(shownLocale.current, true);
      } else {
        setLocale(profile.locale, false); // hydrate — do NOT echo back to the DB
      }
    }
  }, [profile?.locale, session?.user?.id, setLocale]);
}
