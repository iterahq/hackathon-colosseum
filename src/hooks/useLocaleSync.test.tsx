import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider, useI18n } from '@/i18n';
import { useLocaleSync } from './useLocaleSync';

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; created_at?: string } } | null,
  profile: undefined as { locale: 'pt' | 'en' } | undefined,
  updateMyLocale: vi.fn(async () => true),
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: mocks.profile }) }));
vi.mock('@/services/profile.service', () => ({ updateMyLocale: mocks.updateMyLocale }));

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;
const render = () =>
  renderHook(
    () => {
      useLocaleSync();
      return useI18n();
    },
    { wrapper },
  );

describe('useLocaleSync', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.session = null;
    mocks.profile = undefined;
    mocks.updateMyLocale.mockClear();
  });

  it('keeps the language picked while signed out and saves it to the profile', () => {
    const hook = render();
    act(() => hook.result.current.setLocale('en'));
    expect(localStorage.getItem('itera.locale.pending')).toBe('en');
    expect(mocks.updateMyLocale).not.toHaveBeenCalled();

    mocks.session = { user: { id: 'u1' } };
    mocks.profile = { locale: 'pt' };
    hook.rerender();

    expect(hook.result.current.locale).toBe('en');
    expect(mocks.updateMyLocale).toHaveBeenCalledTimes(1);
    expect(mocks.updateMyLocale).toHaveBeenCalledWith('en');
    expect(localStorage.getItem('itera.locale.pending')).toBeNull();
  });

  it('uses the profile locale without writing when nothing is pending', () => {
    mocks.session = { user: { id: 'u1' } };
    mocks.profile = { locale: 'en' };
    const hook = render();
    expect(hook.result.current.locale).toBe('en');
    expect(mocks.updateMyLocale).not.toHaveBeenCalled();
  });

  it('keeps the language the browser showed for a brand-new account and saves it', () => {
    localStorage.setItem('itera.locale', 'en');
    mocks.session = { user: { id: 'u1', created_at: new Date(Date.now() - 5_000).toISOString() } };
    mocks.profile = { locale: 'pt' };
    const hook = render();
    expect(hook.result.current.locale).toBe('en');
    expect(mocks.updateMyLocale).toHaveBeenCalledTimes(1);
    expect(mocks.updateMyLocale).toHaveBeenCalledWith('en');
  });

  it('hydrates an established account from the profile even when the browser differs', () => {
    localStorage.setItem('itera.locale', 'en');
    mocks.session = { user: { id: 'u1', created_at: '2026-01-01T00:00:00Z' } };
    mocks.profile = { locale: 'pt' };
    const hook = render();
    expect(hook.result.current.locale).toBe('pt');
    expect(mocks.updateMyLocale).not.toHaveBeenCalled();
  });

  it('only clears a pending choice equal to the profile value', () => {
    localStorage.setItem('itera.locale.pending', 'en');
    mocks.session = { user: { id: 'u1' } };
    mocks.profile = { locale: 'en' };
    const hook = render();
    expect(hook.result.current.locale).toBe('en');
    expect(mocks.updateMyLocale).not.toHaveBeenCalled();
    expect(localStorage.getItem('itera.locale.pending')).toBeNull();
  });

  it('persists a toggle while signed in and a later profile re-read does not revert it', () => {
    mocks.session = { user: { id: 'u1' } };
    mocks.profile = { locale: 'pt' };
    const hook = render();
    act(() => hook.result.current.toggleLocale());
    expect(hook.result.current.locale).toBe('en');
    expect(mocks.updateMyLocale).toHaveBeenCalledWith('en');
    expect(localStorage.getItem('itera.locale.pending')).toBeNull();

    mocks.profile = { locale: 'pt' };
    hook.rerender();
    expect(hook.result.current.locale).toBe('en');
  });

  it('never treats hydration (persist=false) as a pending choice', () => {
    const hook = render();
    act(() => hook.result.current.setLocale('en', false));
    expect(localStorage.getItem('itera.locale.pending')).toBeNull();
  });

  it('keeps <html lang> in step with the locale', () => {
    const hook = render();
    expect(document.documentElement.lang).toBe('pt-BR');
    act(() => hook.result.current.setLocale('en', false));
    expect(document.documentElement.lang).toBe('en');
  });
});
