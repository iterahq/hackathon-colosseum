import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import AuthPage from './AuthPage';

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: null, loading: false, signInWithPassword: vi.fn(), configured: true }),
}));
vi.mock('@/auth/dflFederation', () => ({ loginWithDfl: vi.fn() }));

describe('AuthPage hit areas', () => {
  it('keeps the submit and DFL buttons at least 44 px tall', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <AuthPage />
        </I18nProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('submit-login').className).toContain('min-h-11');
    expect(screen.getByTestId('oauth-dfl').className).toContain('min-h-11');
  });
});
