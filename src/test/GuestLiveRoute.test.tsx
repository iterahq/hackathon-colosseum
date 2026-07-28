import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';

/**
 * `/g/:code` — the structural gate (plan 20260728-…, ADR-3).
 *
 * The state machine is: name gate → the SHARED LiveSessionPage in guest mode →
 * the guest end-card. What matters is what is NOT reachable: no auth guard is
 * rendered anywhere in this subtree, and the exit lands on a `/signup` CTA rather
 * than on `/` (which is RequireAuth + RequireSubscription — a login wall).
 */

const mocks = vi.hoisted(() => ({
  configured: true,
  createGuestSession: vi.fn(),
  stored: null as unknown,
  codeActive: true,
}));

vi.mock('@/services/guestSession.service', () => ({
  guestJoinConfigured: () => mocks.configured,
  readStoredGuestSession: () => mocks.stored,
  createGuestSession: mocks.createGuestSession,
  storeGuestSession: vi.fn(),
  clearStoredGuestSession: vi.fn(),
  // Advisory liveness probe. Defaults to "still live" so these cases exercise
  // the normal path; the expired-link case overrides it.
  isGuestCodeActive: () => Promise.resolve(mocks.codeActive),
}));

// The live page itself is exercised by its own tests; here we only care that the
// guest route hands it guest mode and that its `leave` exit reaches the end-card.
vi.mock('@/pages/LiveSessionPage', async () => {
  const { useGuestMode } = await import('@/guest/GuestModeContext');
  // Named (and capitalised) so eslint's rules-of-hooks sees a component rather
  // than an anonymous arrow calling a hook.
  function MockLiveSessionPage() {
    const guest = useGuestMode();
    return (
      <div data-testid="live-session-page" data-session={guest?.sessionId} data-code={guest?.code}>
        <button data-testid="fake-close" onClick={() => guest?.leave()}>
          close
        </button>
      </div>
    );
  }
  return { default: MockLiveSessionPage };
});

import GuestLiveRoute from '@/pages/GuestLiveRoute';

const joined = {
  code: 'ABCD2345',
  sessionId: 'sess-1',
  iteraUserId: 'iu-1',
  displayName: 'Ana',
  avatarUrl: null,
};

function renderRoute(path = '/g/ABCD2345') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/g/:code" element={<GuestLiveRoute />} />
            <Route path="/signup" element={<div data-testid="signup-page" />} />
            <Route path="/" element={<div data-testid="authenticated-home" />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe('GuestLiveRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured = true;
    mocks.stored = null;
    mocks.codeActive = true;
    mocks.createGuestSession.mockResolvedValue(joined);
  });

  it('lands directly on the name+avatar step — no login, no auth guard', () => {
    renderRoute();
    expect(screen.getByTestId('guest-gate')).toBeInTheDocument();
    expect(screen.getByTestId('live-name-gate').getAttribute('data-mode')).toBe('guest');
    expect(screen.queryByTestId('live-session-page')).toBeNull();
  });

  it('joins and then renders the SHARED live page in guest mode', async () => {
    renderRoute();
    fireEvent.change(screen.getByTestId('live-name-input'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByTestId('live-name-gate-submit'));

    await waitFor(() => expect(screen.getByTestId('live-session-page')).toBeInTheDocument());
    const page = screen.getByTestId('live-session-page');
    // The session id came from the SERVER's code resolution, not from the URL.
    expect(page.getAttribute('data-session')).toBe('sess-1');
    expect(page.getAttribute('data-code')).toBe('ABCD2345');
  });

  it('skips the gate on reload when this browser already joined this code', () => {
    mocks.stored = joined;
    renderRoute();
    expect(screen.getByTestId('live-session-page')).toBeInTheDocument();
    expect(screen.queryByTestId('guest-gate')).toBeNull();
    expect(mocks.createGuestSession).not.toHaveBeenCalled();
  });

  it('exits to the guest end-card with a /signup CTA — never to the authenticated app', () => {
    mocks.stored = joined;
    renderRoute();
    fireEvent.click(screen.getByTestId('fake-close'));

    expect(screen.getByTestId('guest-end-card')).toBeInTheDocument();
    expect(screen.queryByTestId('authenticated-home')).toBeNull();
    // ADR-7: v1 converts through a plain CTA, it does not migrate data.
    expect(screen.getByTestId('guest-end-signup').getAttribute('href')).toBe('/signup');
  });

  it('lets the guest go back into the class from the end-card', () => {
    mocks.stored = joined;
    renderRoute();
    fireEvent.click(screen.getByTestId('fake-close'));
    fireEvent.click(screen.getByTestId('guest-end-back'));
    expect(screen.getByTestId('live-session-page')).toBeInTheDocument();
  });

  it('rejects a malformed code before any network call', () => {
    renderRoute('/g/a');
    expect(screen.getByTestId('guest-invalid-code')).toBeInTheDocument();
    expect(screen.queryByTestId('live-name-gate')).toBeNull();
  });

  it('says so plainly when the guest surface is not configured for this build', () => {
    mocks.configured = false;
    renderRoute();
    expect(screen.getByTestId('guest-not-configured')).toBeInTheDocument();
    expect(screen.queryByTestId('live-name-gate')).toBeNull();
  });

  it('refuses a link forwarded after the class ended, BEFORE asking for a name', async () => {
    mocks.codeActive = false;
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('guest-code-expired')).toBeInTheDocument());
    // The whole point: no form to fill in for a class that is over.
    expect(screen.queryByTestId('live-name-gate')).toBeNull();
    expect(mocks.createGuestSession).not.toHaveBeenCalled();
  });

  it('still shows the gate when the probe cannot tell (fails open)', async () => {
    // isGuestCodeActive resolves true on network/endpoint failure, so a
    // legitimate guest is never locked out of a class that is actually running.
    mocks.codeActive = true;
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('live-name-gate')).toBeInTheDocument());
    expect(screen.queryByTestId('guest-code-expired')).toBeNull();
  });

  it('does not re-probe for a guest who already joined in this browser', async () => {
    // They hold a session; the live page handles the class ending on its own.
    mocks.stored = joined;
    mocks.codeActive = false;
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('live-session-page')).toBeInTheDocument());
    expect(screen.queryByTestId('guest-code-expired')).toBeNull();
  });
});
