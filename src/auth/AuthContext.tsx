/**
 * Itera auth context — wraps Supabase Auth (password + federated providers).
 *
 * - Password auth works E2E (the foundation gate).
 * - Federated IdP (DFL OIDC / social) is wired via signInWithOAuth; minimal/stubbed
 *   for the foundation (ADR-103 — DFL is ONE IdP among several).
 * - On a session, the user's Itera-local identity lives in itera.users; the
 *   tenant_id + role claims ride in the JWT for RLS (ADR-103).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'google' | 'azure' | 'keycloak') => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      async signInWithPassword(email, password) {
        if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signUpWithPassword(email, password) {
        if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
        const { error } = await getSupabase().auth.signUp({ email, password });
        return { error: error?.message ?? null };
      },
      async signInWithOAuth(provider) {
        if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
        const { error } = await getSupabase().auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin + '/' },
        });
        return { error: error?.message ?? null };
      },
      async signOut() {
        if (!isSupabaseConfigured) return;
        await getSupabase().auth.signOut();
        setSession(null);
      },
    }),
    [session, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
