import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { NicknameGate } from './NicknameGate';

const updateMyProfile = vi.fn();
const getMyProfile = vi.fn();

vi.mock('@/services/profile.service', () => ({
  getMyProfile: () => getMyProfile(),
  updateMyProfile: (patch: unknown) => updateMyProfile(patch),
}));
vi.mock('@iterahq/activities', () => ({ TeraAvatar: () => <span data-testid="tera" /> }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    configured: true,
    session: { user: { id: 'uid-1' } },
    user: { id: 'uid-1', app_metadata: { provider: 'web3' }, identities: [] },
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

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
  updateMyProfile.mockReset().mockResolvedValue(true);
  getMyProfile.mockReset().mockResolvedValue({ displayName: '6YWT…p2Gg' });
});

describe('NicknameGate', () => {
  it('rejects invalid values without calling the service', async () => {
    renderGate();
    const input = await screen.findByTestId('nickname-input');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.click(screen.getByTestId('nickname-submit'));
    expect(screen.getByTestId('nickname-error')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'me@x.io' } });
    fireEvent.click(screen.getByTestId('nickname-submit'));
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it('saves the trimmed, collapsed name', async () => {
    renderGate();
    fireEvent.change(await screen.findByTestId('nickname-input'), { target: { value: '  Ana   Lu ' } });
    fireEvent.click(screen.getByTestId('nickname-submit'));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ displayName: 'Ana Lu' }));
  });

  it('remembers a skip per auth uid', async () => {
    renderGate();
    fireEvent.click(await screen.findByTestId('nickname-skip'));
    expect(screen.queryByTestId('nickname-gate')).toBeNull();
    expect(localStorage.getItem('itera.nickname.skipped:uid-1')).toBe('1');
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
