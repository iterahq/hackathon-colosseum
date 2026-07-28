/**
 * Supabase browser client for the Itera player app.
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time.
 * Points at the **Itera** Supabase project (separate from DFL prod) — ADR-3.
 *
 * Auth session persists in localStorage; RLS is enforced server-side by
 * tenant_id claims injected into the JWT (ADR-103).
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surface a clear error in dev rather than a cryptic network failure later.
  // In CI/build the vars may be absent; the app degrades to mock data paths.
  console.warn(
    '[itera] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — auth + live data disabled.'
  );
}

export const isSupabaseConfigured = Boolean(url && anonKey);

function createIteraClient(supabaseUrl: string, supabaseKey: string) {
  return createClient(supabaseUrl, supabaseKey, {
    // Itera content + IAM live in the `itera` schema (exposed via PostgREST).
    db: { schema: 'itera' },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * The player's client is bound to the `itera` schema, not to `public`. The bare
 * `SupabaseClient` alias defaults its schema parameter to `'public'`, which
 * contradicts what `createClient` returns here — so the type is derived from
 * the factory above instead of being restated (and drifting) by hand.
 */
export type IteraSupabaseClient = ReturnType<typeof createIteraClient>;

/** Lazily-created singleton. Null when env is not configured. */
let _client: IteraSupabaseClient | null = null;

export function getSupabase(): IteraSupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).'
    );
  }
  if (!_client) {
    _client = createIteraClient(url as string, anonKey as string);
  }
  return _client;
}

export const supabase = isSupabaseConfigured
  ? getSupabase()
  : (null as unknown as IteraSupabaseClient);
