import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DflCallbackPage from '@/pages/auth/DflCallbackPage';
import { I18nProvider } from '@/i18n';
import { DFL_STATE_KEY, createDflState, wrapNext } from '@/auth/dflState';

const exchange = vi.fn();
const auth = { session: null as unknown, loading: false };
const loginWithDfl = vi.fn();
const isGuest = vi.fn((_token: string) => false);

vi.mock('@/auth/embedBridge', () => ({ exchangeDflToken: (t: string) => exchange(t) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/auth/dflFederation', () => ({ loginWithDfl: (n?: string) => loginWithDfl(n) }));
vi.mock('@/services/guestSession.service', () => ({ isGuestAccessToken: (t: string) => isGuest(t) }));
vi.mock('@/components/branded', () => ({ Logo: () => null }));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function mount(strict = false) {
  const tree = (
    <I18nProvider>
      <MemoryRouter initialEntries={['/auth/dfl/callback']}>
        <Routes>
          <Route path="/auth/dfl/callback" element={<DflCallbackPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function setHash(hash: string) {
  window.history.replaceState(null, '', `/auth/dfl/callback${hash}`);
}

const TOKEN = 'tok.en.value';

describe('DflCallbackPage state binding', () => {
  beforeEach(() => {
    exchange.mockReset();
    exchange.mockResolvedValue(true);
    loginWithDfl.mockReset();
    auth.session = null;
    auth.loading = false;
    isGuest.mockReset();
    isGuest.mockReturnValue(false);
    window.localStorage.clear();
  });

  it('(a) matching state: exchanges once with the token and navigates to next', async () => {
    const nonce = createDflState(window.localStorage, Date.now());
    setHash(`#dfl_token=${TOKEN}&next=${encodeURIComponent(wrapNext(nonce, '/program/x'))}`);
    mount();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/program/x'));
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith(TOKEN);
    expect(window.location.hash).toBe('');
  });

  it('(b) no stored state: no exchange, refusal shown, restart starts a fresh sign-in', async () => {
    setHash(`#dfl_token=${TOKEN}&next=${encodeURIComponent(wrapNext('a'.repeat(22), '/x'))}`);
    mount();
    expect(await screen.findByTestId('dfl-callback-unsolicited')).toBeTruthy();
    expect(exchange).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    act(() => screen.getByRole('button', { name: /DFL/ }).click());
    expect(loginWithDfl).toHaveBeenCalledWith('/x');
  });

  it('restart without a readable next goes to "/"', async () => {
    setHash(`#dfl_token=${TOKEN}&next=%2Fprogram%2Fx`);
    mount();
    await screen.findByTestId('dfl-callback-unsolicited');
    act(() => screen.getByRole('button', { name: /DFL/ }).click());
    expect(loginWithDfl).toHaveBeenCalledWith('/');
  });

  it('a guest session is not "signed in": unsolicited shows the refusal', async () => {
    auth.session = { user: { id: 'g' }, access_token: 'guest.token' };
    isGuest.mockReturnValue(true);
    setHash(`#dfl_token=${TOKEN}&next=%2Fx`);
    mount();
    expect(await screen.findByTestId('dfl-callback-unsolicited')).toBeTruthy();
    expect(screen.queryByTestId('where')).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });

  it('a plain next (no nonce) is refused', async () => {
    createDflState(window.localStorage, Date.now());
    setHash(`#dfl_token=${TOKEN}&next=%2Fprogram%2Fx`);
    mount();
    expect(await screen.findByTestId('dfl-callback-unsolicited')).toBeTruthy();
    expect(exchange).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('(c) wrong nonce: no exchange', async () => {
    createDflState(window.localStorage, Date.now());
    setHash(`#dfl_token=${TOKEN}&next=${encodeURIComponent(wrapNext('b'.repeat(22), '/x'))}`);
    mount();
    expect(await screen.findByTestId('dfl-callback-unsolicited')).toBeTruthy();
    expect(exchange).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('(d) expired state: no exchange', async () => {
    const nonce = createDflState(window.localStorage, Date.now() - 61 * 60 * 1000);
    setHash(`#dfl_token=${TOKEN}&next=${encodeURIComponent(wrapNext(nonce, '/x'))}`);
    mount();
    expect(await screen.findByTestId('dfl-callback-unsolicited')).toBeTruthy();
    expect(exchange).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(window.localStorage.getItem(DFL_STATE_KEY)).toBeNull();
  });

  it('(e) already signed in and unsolicited: no exchange, goes home', async () => {
    auth.session = { user: { id: 'u' }, access_token: 'real.token' };
    setHash(`#dfl_token=${TOKEN}&next=%2Fx`);
    mount();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'));
    expect(exchange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dfl-callback-unsolicited')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('waits for the auth loading state before deciding', async () => {
    auth.loading = true;
    setHash(`#dfl_token=${TOKEN}&next=%2Fx`);
    const { rerender } = mount();
    expect(screen.queryByTestId('dfl-callback-unsolicited')).toBeNull();
    expect(screen.getByTestId('dfl-callback-loading')).toBeTruthy();
    auth.loading = false;
    rerender(
      <I18nProvider>
        <MemoryRouter initialEntries={['/auth/dfl/callback']}>
          <Routes>
            <Route path="/auth/dfl/callback" element={<DflCallbackPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(await screen.findByTestId('dfl-callback-unsolicited')).toBeTruthy();
  });

  it('failed exchange with valid state shows the error state', async () => {
    exchange.mockResolvedValue(false);
    const nonce = createDflState(window.localStorage, Date.now());
    setHash(`#dfl_token=${TOKEN}&next=${encodeURIComponent(wrapNext(nonce, '/x'))}`);
    mount();
    expect(await screen.findByTestId('dfl-callback-error')).toBeTruthy();
    expect(screen.queryByTestId('dfl-callback-unsolicited')).toBeNull();
  });

  it('(g) StrictMode double mount with a valid state: exchange once, no refusal', async () => {
    const nonce = createDflState(window.localStorage, Date.now());
    setHash(`#dfl_token=${TOKEN}&next=${encodeURIComponent(wrapNext(nonce, '/program/x'))}`);
    mount(true);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/program/x'));
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dfl-callback-unsolicited')).toBeNull();
  });
});
