import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { OfflineBanner } from './OfflineBanner';

const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    render(<I18nProvider><OfflineBanner /></I18nProvider>);
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });

  it('appears when the browser goes offline and leaves when it is back', () => {
    render(<I18nProvider><OfflineBanner /></I18nProvider>);
    act(() => setOnline(false));
    expect(screen.getByTestId('offline-banner')).toHaveTextContent('Sem conexão');
    act(() => setOnline(true));
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });
});
