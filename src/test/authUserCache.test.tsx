import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider } from '@/auth/AuthContext';

/**
 * The itera.users id is memoized per module, and the Educar+ machines are
 * shared: one tab, many students, no reload in between. If the cache survived a
 * sign-in the next student's progress and XP would be written under the previous
 * student's id — so pin that an identity change clears it and a token refresh
 * does not.
 */

const reset = vi.fn();
const listeners: ((event: string, session: Session | null) => void)[] = [];

vi.mock('@/services/iteraUser', () => ({
  resetIteraUserIdCache: () => reset(),
  getIteraUserId: async () => null,
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

function session(id: string, token: string) {
  return { access_token: token, user: { id } } as unknown as Session;
}

function emit(event: string, s: Session | null) {
  listeners.forEach((cb) => cb(event, s));
}

beforeEach(() => {
  reset.mockClear();
  listeners.length = 0;
});

describe('AuthProvider user-id cache', () => {
  it('clears the cache when a different student signs in', async () => {
    render(
      <AuthProvider>
        <div />
      </AuthProvider>
    );
    await waitFor(() => expect(listeners).toHaveLength(1));

    emit('SIGNED_IN', session('student-a', 'tok-a'));
    reset.mockClear();

    emit('SIGNED_OUT', null);
    emit('SIGNED_IN', session('student-b', 'tok-b'));
    expect(reset).toHaveBeenCalled();
  });

  it('leaves the cache alone on a token refresh', async () => {
    render(
      <AuthProvider>
        <div />
      </AuthProvider>
    );
    await waitFor(() => expect(listeners).toHaveLength(1));

    emit('SIGNED_IN', session('student-a', 'tok-a'));
    reset.mockClear();

    emit('TOKEN_REFRESHED', session('student-a', 'tok-a-rotated'));
    expect(reset).not.toHaveBeenCalled();
  });
});
