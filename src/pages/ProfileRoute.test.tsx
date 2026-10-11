import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { LEGAL_AND_HELP_URLS } from '@iterahq/shell-core';
import ProfileRoute from './ProfileRoute';
import { getMyProfile, updateMyProfile } from '@/services/profile.service';

vi.mock('@/services/profile.service', () => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, configured: true, user: { id: 'u1' } }),
}));

vi.mock('@/components/branded', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

const personalization = vi.hoisted(() => ({ values: {}, ready: true, mayAsk: false, save: vi.fn().mockResolvedValue(undefined), dismiss: () => {} }));

vi.mock('@/personalization/personalizationPort', () => ({ usePersonalization: () => personalization }));

vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => 'shell' }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <QueryClientProvider client={client}>
        <I18nProvider>
          <ProfileRoute />
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ProfileRoute (web host of the universal profile screen)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    personalization.ready = true;
    vi.mocked(updateMyProfile).mockResolvedValue(true);
    personalization.save.mockResolvedValue(undefined);
    vi.mocked(getMyProfile).mockResolvedValue({
      displayName: 'Ana',
      avatarUrl: 'https://photos.example/ana.png',
      dflAvatarUrl: 'https://learn.example/ana-learn.png',
      email: 'ana@example.com',
      locale: 'pt',
    });
  });

  it('hydrates the form from the loaded profile', async () => {
    renderPage();
    const name = await screen.findByTestId('profile-name-input');
    // The name input renders as soon as the query resolves (isPending → false),
    // but the draft is populated by a post-commit hydration effect in
    // useProfileScreen. Wait for that effect to land instead of asserting the
    // value synchronously — otherwise the assertion races the effect and is
    // flaky under load (empty value). The avatar preview src is driven by the
    // same hydration state, so once the name is hydrated the rest is settled.
    await waitFor(() => expect(name).toHaveValue('Ana'));
    expect(screen.getByTestId('profile-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByTestId('profile-form').querySelector('img[data-avatar="tera_normal"]')).toBeInTheDocument();
  });

  it('offers no photo upload, no Learn photo and no preset icons', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    expect(screen.queryByTestId('profile-photo-upload')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-photo-file')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-use-learn-photo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-avatar-option')).not.toBeInTheDocument();
  });

  it('shows the "Meu Tera" picker with the default face marked and three tabs', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    const options = screen.getAllByTestId('avatar-option');
    expect(options[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('saves the edited name without touching the photo column', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    await waitFor(() => expect(screen.getByTestId('profile-name-input')).toHaveValue('Ana'));
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Ana Clara' } });
    fireEvent.click(screen.getByTestId('profile-save'));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ displayName: 'Ana Clara', avatarUrl: 'https://photos.example/ana.png' }));
  });

  it('shows the error state with retry when the profile fails to load', async () => {
    vi.mocked(getMyProfile).mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByTestId('profile-error');
    expect(screen.queryByTestId('profile-save')).not.toBeInTheDocument();
  });
  it('retries the read from the error state', async () => {
    vi.mocked(getMyProfile).mockRejectedValueOnce(new Error('boom'));
    renderPage();
    const error = await screen.findByTestId('profile-error');
    fireEvent.click(within(error).getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByTestId('profile-name-input');
    expect(getMyProfile).toHaveBeenCalledTimes(2);
  });

  it('saves with Enter in the name field, as the old form did', async () => {
    renderPage();
    const name = await screen.findByTestId('profile-name-input');
    await waitFor(() => expect(name).toHaveValue('Ana'));
    fireEvent.change(name, { target: { value: 'Ana Clara' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ displayName: 'Ana Clara', avatarUrl: 'https://photos.example/ana.png' }));
  });

  it('does not save a name shorter than two characters', async () => {
    renderPage();
    const name = await screen.findByTestId('profile-name-input');
    await waitFor(() => expect(name).toHaveValue('Ana'));
    fireEvent.change(name, { target: { value: ' A ' } });
    expect(screen.getByTestId('profile-save')).toBeDisabled();
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('profile-save'));
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it('shows the save error when the write is refused', async () => {
    vi.mocked(updateMyProfile).mockResolvedValueOnce(false);
    renderPage();
    const name = await screen.findByTestId('profile-name-input');
    await waitFor(() => expect(name).toHaveValue('Ana'));
    fireEvent.click(screen.getByTestId('profile-save'));
    await screen.findByTestId('profile-save-error');
    expect(screen.queryByTestId('profile-saved')).not.toBeInTheDocument();
  });

  it('draws no legal and help rows while the pages do not exist', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    expect(screen.queryByTestId('profile-legal-help')).not.toBeInTheDocument();
    expect(document.querySelector(`a[href^="${new URL(LEGAL_AND_HELP_URLS.privacy).origin}"]`)).toBeNull();
  });

  it('says nothing is "coming soon" and offers no account deletion', async () => {
    const { container } = renderPage();
    await screen.findByTestId('profile-name-input');
    expect(container.textContent).not.toMatch(/em breve|coming soon|excluir|apagar conta|delete/i);
  });

  it('never asks for the cast of the exercises (a relative or a friend) on this build', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    expect(screen.queryByTestId('personalization-section')).toBeNull();
    expect(screen.queryByTestId('profile-legal-help')).toBeNull();
  });
});
