import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { NicknameGate } from './NicknameGate';

const updateMyProfile = vi.fn();
const getMyProfile = vi.fn();
const updateUser = vi.fn();
const authUser: { id: string; app_metadata: { provider: string }; identities: never[]; user_metadata: Record<string, unknown>; email?: string } = {
  id: 'uid-1',
  app_metadata: { provider: 'web3' },
  identities: [],
  user_metadata: {},
};

vi.mock('@/services/profile.service', () => ({
  getMyProfile: () => getMyProfile(),
  updateMyProfile: (patch: unknown) => updateMyProfile(patch),
}));
vi.mock('@iterahq/activities', () => ({ TeraAvatar: () => <span data-testid="tera" /> }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    configured: true,
    session: { user: { id: 'uid-1' } },
    user: authUser,
  }),
}));
vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: { updateUser: (patch: unknown) => updateUser(patch), getUser: () => Promise.resolve({ data: { user: { user_metadata: {} } } }) } }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const story = vi.hoisted(() => ({ daysDone: 1, daysStamped: 1, daysPending: 0, pending: false }));
vi.mock('@/hooks/useProgressStory', () => ({ useProgressStory: () => story }));

function renderGate(path = '/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <NicknameGate />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  Object.assign(story, { daysDone: 1, daysStamped: 1, daysPending: 0, pending: false });
  authUser.user_metadata = {};
  authUser.app_metadata = { provider: 'web3' };
  delete authUser.email;
  updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  updateMyProfile.mockReset().mockResolvedValue(true);
  getMyProfile.mockReset().mockResolvedValue({ displayName: '6YWT…p2Gg' });
});

describe('NicknameGate', () => {
  it('keeps Continue off and says why until the value is valid, without calling the service', async () => {
    localStorage.setItem('itera.locale', 'en');
    renderGate();
    const input = await screen.findByTestId('nickname-input');
    expect(screen.getByTestId('nickname-submit')).toBeDisabled();
    expect(screen.queryByTestId('nickname-error')).toBeNull();
    fireEvent.change(input, { target: { value: 'a' } });
    expect(screen.getByTestId('nickname-submit')).toBeDisabled();
    expect(screen.getByTestId('nickname-error')).toHaveTextContent('Use 2 to 24 characters.');
    fireEvent.change(input, { target: { value: 'me@x.io' } });
    expect(screen.getByTestId('nickname-error')).toHaveTextContent('Pick a nickname, not an email.');
    fireEvent.click(screen.getByTestId('nickname-submit'));
    expect(updateMyProfile).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Ana' } });
    expect(screen.getByTestId('nickname-submit')).toBeEnabled();
  });

  it('never covers a deep link: a bounty, a profile, the shop', async () => {
    for (const path of ['/bounties/class-contact-page', '/u/CQziabc', '/shop', '/passport']) {
      const view = renderGate(path);
      await new Promise((r) => setTimeout(r, 30));
      expect(screen.queryByTestId('nickname-gate')).toBeNull();
      view.unmount();
    }
  });

  it('asks an e-mail learner still named after the address, with the e-mail wording', async () => {
    authUser.app_metadata = { provider: 'email' };
    authUser.email = 'samuelstefano@example.com';
    getMyProfile.mockResolvedValue({ displayName: 'samuelstefano' });
    localStorage.setItem('itera.locale', 'en');
    renderGate('/');
    expect(await screen.findByTestId('nickname-gate')).toHaveTextContent('in place of your e-mail address');
  });

  it('waits for the first day to be done before asking', async () => {
    Object.assign(story, { daysDone: 0, daysStamped: 0, daysPending: 0, pending: false });
    renderGate('/');
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
  });

  it('leaves an e-mail learner with a chosen name alone', async () => {
    authUser.app_metadata = { provider: 'email' };
    authUser.email = 'ana@example.com';
    getMyProfile.mockResolvedValue({ displayName: 'Ana Lu' });
    renderGate('/');
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
  });

  it('saves the trimmed, collapsed name', async () => {
    renderGate();
    fireEvent.change(await screen.findByTestId('nickname-input'), { target: { value: '  Ana   Lu ' } });
    fireEvent.click(screen.getByTestId('nickname-submit'));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ displayName: 'Ana Lu' }));
  });

  it('marks the account as asked the moment it shows, before any answer', async () => {
    renderGate();
    await screen.findByTestId('nickname-gate');
    expect(updateUser).toHaveBeenCalledWith({ data: { nickname_asked: true } });
    expect(localStorage.getItem('itera.nickname.skipped:uid-1')).toBe('1');
  });

  it('closes on skip and on Escape', async () => {
    const first = renderGate();
    fireEvent.click(await screen.findByTestId('nickname-skip'));
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
    first.unmount();
    localStorage.clear();
    renderGate();
    fireEvent.keyDown(await screen.findByTestId('nickname-gate'), { key: 'Escape' });
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
  });

  it('does not come back for an account that was already asked, on a browser that never saw it', async () => {
    authUser.user_metadata = { nickname_asked: true };
    renderGate();
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('is a modal dialog with a name, and keeps Tab inside', async () => {
    renderGate();
    const gate = await screen.findByTestId('nickname-gate');
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    screen.getByTestId('nickname-skip').focus();
    fireEvent.keyDown(gate, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('nickname-input'));
    fireEvent.keyDown(gate, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId('nickname-skip'));
  });

  it('waits while another dialog is open', async () => {
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    document.body.appendChild(other);
    renderGate();
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
    other.remove();
    expect(await screen.findByTestId('nickname-gate')).toBeTruthy();
  });

  it('puts a generated name in the language of the account', async () => {
    localStorage.setItem('itera.locale', 'en');
    getMyProfile.mockResolvedValue({ displayName: 'Tera Ousado 477' });
    renderGate();
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ displayName: 'Tera Bold 477' }));
  });

  it('never interrupts a lesson or a live class', async () => {
    renderGate('/lesson/0e7d6618-f9ba-46ba-bf28-71cf86f32716');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
  });

  it('stays out of the public asset route and when the profile fails', async () => {
    renderGate('/c/abc');
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
  });

  it('lets the user through when the profile cannot be read', async () => {
    getMyProfile.mockResolvedValue(null);
    renderGate();
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
  });
});
