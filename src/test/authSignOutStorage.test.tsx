import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '@/auth/AuthContext';

/**
 * Signing out on a shared lab machine used to drop a single flag, leaving the
 * learner's code snapshots and live answers on disk for whoever sat down next.
 * Pin that sign-out — and an in-tab account switch — wipe the `itera.` namespace.
 */

const listeners: ((event: string, session: Session | null) => void)[] = [];
const signOutSpy = vi.fn(async () => ({ error: null }));

vi.mock('@/services/iteraUser', () => ({
  resetIteraUserIdCache: () => {},
  getIteraUserId: async () => null,
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signOut: () => signOutSpy(),
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

function session(id: string) {
  return { access_token: 'tok-' + id, user: { id } } as unknown as Session;
}

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return null;
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

function seedLearnerWork() {
  localStorage.setItem('itera.scope.user', 'aluno-a');
  localStorage.setItem('itera.code.snapshot:aluno-a:act-1', 'trabalho da A');
  localStorage.setItem('itera.live.answers:aluno-a:sess-1', '{}');
  localStorage.setItem('itera_dfl_session', '1');
  localStorage.setItem('sb-projeto-auth-token', 'keep-me');
}

beforeEach(() => {
  listeners.length = 0;
  signOutSpy.mockClear();
  localStorage.clear();
});

describe('sign-out on a shared machine', () => {
  it('wipes every itera. key, not just the DFL flag', async () => {
    mount();
    await waitFor(() => expect(listeners).toHaveLength(1));
    seedLearnerWork();

    await act(async () => {
      await auth.signOut();
    });

    expect(signOutSpy).toHaveBeenCalled();
    expect(localStorage.getItem('itera.scope.user')).toBeNull();
    expect(localStorage.getItem('itera.code.snapshot:aluno-a:act-1')).toBeNull();
    expect(localStorage.getItem('itera.live.answers:aluno-a:sess-1')).toBeNull();
    expect(localStorage.getItem('itera_dfl_session')).toBeNull();
    expect(localStorage.getItem('sb-projeto-auth-token')).toBe('keep-me');
  });

  it('wipes it on an in-tab account switch too', async () => {
    mount();
    await waitFor(() => expect(listeners).toHaveLength(1));

    act(() => listeners.forEach((cb) => cb('SIGNED_IN', session('student-a'))));
    seedLearnerWork();
    act(() => listeners.forEach((cb) => cb('SIGNED_IN', session('student-b'))));

    expect(localStorage.getItem('itera.code.snapshot:aluno-a:act-1')).toBeNull();
    expect(localStorage.getItem('itera.scope.user')).toBeNull();
  });

  it('keeps the restored work on a plain reload — that is not a switch', async () => {
    mount();
    await waitFor(() => expect(listeners).toHaveLength(1));
    seedLearnerWork();

    act(() => listeners.forEach((cb) => cb('INITIAL_SESSION', session('student-a'))));

    expect(localStorage.getItem('itera.code.snapshot:aluno-a:act-1')).toBe('trabalho da A');
    expect(localStorage.getItem('itera.scope.user')).toBe('aluno-a');
  });
});
