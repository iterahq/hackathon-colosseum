/**
 * Itera auth context — wraps Supabase Auth (password + federated providers).
 *
 * - Password auth works E2E (the foundation gate).
 * - Federated IdP (DFL OIDC / Azure / Keycloak) is wired via signInWithOAuth.
 *   Google login has been removed — DFL federation is the primary IdP.
 * - On a session, the user's Itera-local identity lives in itera.users; the
 *   tenant_id + role claims ride in the JWT for RLS (ADR-103).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { resetIteraUserIdCache } from '@/services/iteraUser';
import type { SolanaSignInProvider } from '@/types/solanaWallet';
import { clearIteraStorage } from '@/utils/storageScope';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'azure' | 'keycloak') => Promise<{ error: string | null }>;
  /** Sign in with Solana through the given injected wallet, or `window.solana` when none is given. */
  signInWithSolana: (wallet?: SolanaSignInProvider) => Promise<{ error: string | null; noWallet?: boolean }>;
  /** Creates an e-mail account; the code names what went wrong (`user_already_exists`, `weak_password`, `email_address_invalid`…). */
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null; code: string | null }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUidRef = useRef<string | null>(null);

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
      const uid = newSession?.user?.id ?? null;
      // The itera.users id is memoized for the whole module life. On a shared
      // machine the tab is never reloaded between students, so without this the
      // next sign-in would keep writing progress and XP under the previous one.
      // Keyed on the uid, not the event: a token refresh must not cost an RPC.
      if (uid !== lastUidRef.current) {
        // A real SWITCH also has to drop the previous learner's scoped storage,
        // before the incoming id resolves. Merely observing a restored session
        // on boot is not a switch: clearing there would throw away the work the
        // learner expects back after a reload.
        const switched = lastUidRef.current !== null;
        lastUidRef.current = uid;
        resetIteraUserIdCache();
        if (switched) clearIteraStorage();
      }
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
      async signInWithOAuth(provider) {
        if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
        const { error } = await getSupabase().auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin + '/' },
        });
        return { error: error?.message ?? null };
      },
      async signInWithSolana(wallet) {
        if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
        // The injected provider (Phantom, Solflare, Backpack) is the only wallet
        // surface: no adapter dependency, and Supabase verifies the signature.
        if (!wallet && !('solana' in window)) return { error: 'No Solana wallet found', noWallet: true };
        try {
          const { error } = await getSupabase().auth.signInWithWeb3({
            chain: 'solana',
            statement: 'Sign in to Itera',
            ...(wallet ? { wallet } : {}),
          });
          return { error: error?.message ?? null };
        } catch (e) {
          // A rejected signature request throws from the wallet, not from Supabase.
          return { error: e instanceof Error ? e.message : 'Wallet sign-in failed' };
        }
      },
      async signUpWithPassword(email, password) {
        if (!isSupabaseConfigured) return { error: 'Supabase not configured', code: null };
        const { error } = await getSupabase().auth.signUp({ email, password });
        return { error: error?.message ?? null, code: (error as { code?: string } | null)?.code ?? null };
      },
      async signOut() {
        if (!isSupabaseConfigured) return;
        clearIteraStorage();
        resetIteraUserIdCache();
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
