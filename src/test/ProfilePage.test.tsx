import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import ProfilePage from '@/pages/ProfilePage';
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <QueryClientProvider client={client}>
        <I18nProvider>
          <ProfilePage />
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyProfile).mockResolvedValue({
      displayName: 'Ana',
      avatarUrl: 'https://photos.example/ana.png',
      email: 'ana@example.com',
      locale: 'pt',
    });
  });

  it('hydrates the form from the loaded profile', async () => {
    renderPage();
    const name = await screen.findByTestId('profile-name-input');
    expect(name).toHaveValue('Ana');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByTestId('profile-avatar-preview')).toHaveAttribute(
      'src',
      'https://photos.example/ana.png'
    );
    expect(screen.getByTestId('profile-photo-input')).toHaveValue('https://photos.example/ana.png');
  });

  it('saves a picked preset icon + edited name', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    const options = screen.getAllByTestId('profile-avatar-option');
    expect(options.length).toBeGreaterThan(10);
    fireEvent.click(options[2]);
    expect(options[2].getAttribute('data-selected')).toBe('true');
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Ana Clara' } });
    fireEvent.click(screen.getByTestId('profile-save'));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledTimes(1));
    expect(updateMyProfile).toHaveBeenCalledWith({
      displayName: 'Ana Clara',
      avatarUrl: expect.stringMatching(/^\/avatars\/.+\.svg$/),
    });
    await screen.findByTestId('profile-saved');
  });

  it('rejects a non-https photo URL and blocks save', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    fireEvent.change(screen.getByTestId('profile-photo-input'), {
      target: { value: 'javascript:alert(1)' },
    });
    expect(screen.getByTestId('profile-photo-invalid')).toBeInTheDocument();
    expect(screen.getByTestId('profile-save')).toBeDisabled();
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it('re-sets the photo from a valid https URL', async () => {
    renderPage();
    await screen.findByTestId('profile-name-input');
    fireEvent.change(screen.getByTestId('profile-photo-input'), {
      target: { value: 'https://cdn.example/nova-foto.jpg' },
    });
    expect(screen.getByTestId('profile-avatar-preview')).toHaveAttribute(
      'src',
      'https://cdn.example/nova-foto.jpg'
    );
    fireEvent.click(screen.getByTestId('profile-save'));
    await waitFor(() =>
      expect(updateMyProfile).toHaveBeenCalledWith({
        displayName: 'Ana',
        avatarUrl: 'https://cdn.example/nova-foto.jpg',
      })
    );
  });

  it('shows the error state with retry when the profile fails to load', async () => {
    vi.mocked(getMyProfile).mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByTestId('profile-error');
    expect(screen.queryByTestId('profile-save')).not.toBeInTheDocument();
  });
});
