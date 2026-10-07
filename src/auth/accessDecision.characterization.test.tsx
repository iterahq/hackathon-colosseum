import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { RequireSubscription } from './RequireSubscription';

/**
 * Characterization of the access decision: EVERY combination of the inputs read by the subscription
 * gate and by `useAccessLevel`, with what each one answers. The expectations live in the committed
 * snapshot beside this file and were recorded on the code BEFORE the ladders were merged; they must
 * not change with the refactor. A line where the two answers disagree is a finding, kept as it is.
 *
 * Inputs that neither ladder reads and so are not enumerated: the guest session (the guest is a REAL
 * session and `RequireAuth` diverts it before the gate runs), the route, the locale.
 */
const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));
const auth = vi.hoisted(() => ({ session: null as unknown, loading: false, configured: true, signOut: async () => undefined }));
const entitlement = vi.hoisted(() => ({
  data: undefined as { active: boolean } | undefined,
  isPending: false,
  isError: false,
  fetchStatus: 'idle' as 'idle' | 'fetching' | 'paused',
  failureCount: 0,
  failureReason: null as Error | null,
  refetch: vi.fn(),
}));
const membership = vi.hoisted(() => ({ data: undefined as { tenantId: string; role: string }[] | undefined, isPending: false }));

vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => entitlement }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => membership }));

type EntState = 'pending' | 'pending-unreachable' | 'paid' | 'unpaid' | 'failed-no-data' | 'failed-after-paid' | 'failed-after-unpaid';
type MemState = 'pending' | 'learner' | 'admin';

const CONFIGURED = [true, false];
const AUTH_LOADING = [false, true];
const SESSION = ['none', 'user'] as const;
const ENT: EntState[] = ['pending', 'pending-unreachable', 'paid', 'unpaid', 'failed-no-data', 'failed-after-paid', 'failed-after-unpaid'];
const MEM: MemState[] = ['pending', 'learner', 'admin'];
const SURFACES: ShellSurface[] = ['web', 'pending', 'shell'];
const GRACE = [false, true];
const MODES = ['block', 'preview'] as const;

function setEntitlement(state: EntState) {
  const failed = state.startsWith('failed');
  entitlement.isPending = state.startsWith('pending');
  entitlement.isError = failed;
  entitlement.data = state === 'paid' || state === 'failed-after-paid' ? { active: true } : state === 'unpaid' || state === 'failed-after-unpaid' ? { active: false } : undefined;
  entitlement.fetchStatus = state === 'pending-unreachable' ? 'paused' : 'idle';
  entitlement.failureCount = 0;
  entitlement.failureReason = null;
}

function setMembership(state: MemState) {
  membership.isPending = state === 'pending';
  membership.data = state === 'pending' ? undefined : [{ tenantId: 'T', role: state === 'admin' ? 'owner' : 'learner' }];
}

function gateOutcome(graceOnError: boolean, mode: 'block' | 'preview'): string {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { container, unmount } = render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RequireSubscription graceOnError={graceOnError} mode={mode}><div data-testid="page" /></RequireSubscription>} />
          <Route path="/subscribe" element={<div data-testid="subscribe" />} />
          <Route path="/login" element={<div data-testid="login" />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
  const id = (testId: string) => container.querySelector(`[data-testid="${testId}"]`) !== null;
  let outcome: string;
  if (id('page')) outcome = warn.mock.calls.length > 0 ? 'children+warn' : 'children';
  else if (id('login')) outcome = 'redirect:/login';
  else if (id('subscribe')) outcome = 'redirect:/subscribe';
  else if (id('shell-access-unverified')) outcome = 'shell-unverified';
  else if (id('shell-settling')) outcome = 'shell-settling';
  else if (container.querySelector('h1') !== null) outcome = 'shell-no-access';
  else if (container.textContent?.includes('Loading')) outcome = 'loader';
  else outcome = `UNKNOWN:${container.innerHTML}`;
  unmount();
  warn.mockRestore();
  return outcome;
}

function hookOutcome(): string {
  const { result, unmount } = renderHook(() => useAccessLevel());
  unmount();
  return `${result.current.level}/err=${result.current.entitlementError}`;
}

describe('access decision, every combination', () => {
  beforeEach(() => {
    auth.configured = true;
    auth.loading = false;
    auth.session = null;
  });
  afterEach(cleanup);

  it('the gate and useAccessLevel answer as recorded', async () => {
    const lines: string[] = [];
    for (const configured of CONFIGURED)
      for (const loading of AUTH_LOADING)
        for (const session of SESSION)
          for (const ent of ENT)
            for (const mem of MEM)
              for (const shell of SURFACES) {
                auth.configured = configured;
                auth.loading = loading;
                auth.session = session === 'user' ? { user: { id: 'u1' } } : null;
                setEntitlement(ent);
                setMembership(mem);
                surface.value = shell;
                const key = `configured=${configured} authLoading=${loading} session=${session} ent=${ent} mem=${mem} surface=${shell}`;
                const hook = hookOutcome();
                for (const grace of GRACE)
                  for (const mode of MODES) {
                    lines.push(`${key} grace=${grace} mode=${mode} => gate=${gateOutcome(grace, mode)} hook=${hook}`);
                  }
              }
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./accessDecision.characterization.snap.txt');
  }, 120_000);
});
