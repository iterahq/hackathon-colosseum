import type { WebAuthSessionLike, WebAuthSnapshotLike } from '@iterahq/shell-bridge';

/** The part of a supabase-js `Session` that `src/lib/shellAuthSession.ts` reads. Nothing else of the session is touched. */
export interface ShellSessionInput {
  access_token: string;
  /** Epoch SECONDS. */
  expires_at?: number;
  user: { id: string };
}

/** The part of `supabase.auth` used to answer the shell. The refresh itself stays inside supabase-js. */
export interface ShellSessionAuth {
  getSession(): Promise<{ data: { session: ShellSessionInput | null } }>;
  refreshSession(): Promise<{ data: { session: ShellSessionInput | null }; error: unknown }>;
}

/** What the shell may know of a session, plus the user it belongs to (kept on the page, never sent). */
export interface ShellSessionHeld {
  userId: string;
  snapshot: WebAuthSnapshotLike;
}

export interface ShellSessionSource extends WebAuthSessionLike {
  /** Tell the source what the app's auth state now is. Emits sign-in, refresh or sign-out to the shell. */
  take(session: ShellSessionInput | null): void;
}
