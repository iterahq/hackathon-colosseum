import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider, useI18n, DEFAULT_LOCALE } from '@/i18n';

/**
 * i18n provider contract for the per-user (DB-backed) language preference:
 *  - the default locale is pt (NOT navigator-driven),
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
  it('defaults to pt with no stored preference', () => {
    render(
      <I18nProvider>
        <Probe onReady={() => {}} />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale').textContent).toBe('pt');
    expect(DEFAULT_LOCALE).toBe('pt');
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
