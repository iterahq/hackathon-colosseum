import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { TeraLoader } from './TeraLoader';

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderLoader(props: Parameters<typeof TeraLoader>[0] = {}) {
  return render(
    <I18nProvider>
      <TeraLoader {...props} />
    </I18nProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('TeraLoader', () => {
  it('renders a polite status with the given label', () => {
    stubReducedMotion(false);
    renderLoader({ label: 'Getting ready' });
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Getting ready');
    expect(screen.getAllByTestId('tera-loader-dashes')).toHaveLength(1);
  });

  it('shows a static 3-of-5 when reduced motion is preferred', () => {
    stubReducedMotion(true);
    renderLoader();
    const dashes = screen.getByTestId('tera-loader-dashes').querySelectorAll('[data-on="true"]');
    expect(dashes).toHaveLength(3);
    expect(screen.getByRole('status').dataset.reducedMotion).toBe('true');
  });

  it('has no dashes in the sm variant and keeps hidden text', () => {
    stubReducedMotion(false);
    renderLoader({ size: 'sm', label: 'Loading' });
    expect(screen.queryByTestId('tera-loader-dashes')).toBeNull();
    expect(screen.getByText('Loading').className).toContain('sr-only');
  });
});
