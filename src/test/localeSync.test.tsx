import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider, useI18n, DEFAULT_LOCALE, localeFromLanguages } from '@/i18n';

/**
 * i18n provider contract for the per-user (DB-backed) language preference:
 *  - a first visit follows the browser language (pt-* reads Portuguese, anything else English),
 *  - a user-initiated setLocale persists via the registered sink,
 *  - a hydrate (setLocale(l, false)) does NOT echo back to the sink (so loading
 *    the stored profile locale never re-writes it).
 */

beforeEach(() => {
  localStorage.clear();
});

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useI18n>) => void }) {
  const api = useI18n();
  onReady(api);
  return (
    <div>
      <span data-testid="locale">{api.locale}</span>
      <button data-testid="to-en" onClick={() => api.setLocale('en')}>
        en
      </button>
      <button data-testid="hydrate-en" onClick={() => api.setLocale('en', false)}>
        hydrate-en
      </button>
    </div>
  );
}

describe('i18n locale preference (DB-backed sink)', () => {
  it('follows the browser language with no stored preference', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get');
    languages.mockReturnValue(['en-US', 'en']);
    const { unmount } = render(
      <I18nProvider>
        <Probe onReady={() => {}} />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
    unmount();
    localStorage.clear();
    languages.mockReturnValue(['pt-BR', 'pt']);
    render(
      <I18nProvider>
        <Probe onReady={() => {}} />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale').textContent).toBe('pt');
    languages.mockRestore();
    expect(DEFAULT_LOCALE).toBe('pt');
  });

  it('writes the browser-detected locale to storage once, so content readers outside React agree', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    render(
      <I18nProvider>
        <Probe onReady={() => {}} />
      </I18nProvider>
    );
    expect(localStorage.getItem('itera.locale')).toBe('en');
    languages.mockRestore();
  });

  it('maps browser languages to the two locales', () => {
    expect(localeFromLanguages(['pt-BR'])).toBe('pt');
    expect(localeFromLanguages(['PT'])).toBe('pt');
    expect(localeFromLanguages(['en-US', 'pt-BR'])).toBe('en');
    expect(localeFromLanguages(['es-AR'])).toBe('en');
    expect(localeFromLanguages([])).toBeNull();
    expect(localeFromLanguages(undefined)).toBeNull();
  });

  it('honours a stored choice over the browser language', () => {
    localStorage.setItem('itera.locale', 'pt');
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    render(
      <I18nProvider>
        <Probe onReady={() => {}} />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale').textContent).toBe('pt');
    languages.mockRestore();
  });

  it('persists a user-initiated change through the registered sink + localStorage', () => {
    const sink = vi.fn();
    let api: ReturnType<typeof useI18n> | null = null;
    render(
      <I18nProvider>
        <Probe
          onReady={(a) => {
            api = a;
          }}
        />
      </I18nProvider>
    );
    act(() => api!.registerPersistSink(sink));
    fireEvent.click(screen.getByTestId('to-en'));
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(sink).toHaveBeenCalledWith('en');
    expect(localStorage.getItem('itera.locale')).toBe('en');
  });

  it('hydrate (persist=false) updates the UI but does NOT echo to the sink', () => {
    const sink = vi.fn();
    let api: ReturnType<typeof useI18n> | null = null;
    render(
      <I18nProvider>
        <Probe
          onReady={(a) => {
            api = a;
          }}
        />
      </I18nProvider>
    );
    act(() => api!.registerPersistSink(sink));
    fireEvent.click(screen.getByTestId('hydrate-en'));
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(sink).not.toHaveBeenCalled();
  });
});
