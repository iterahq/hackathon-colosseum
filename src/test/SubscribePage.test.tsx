import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import SubscribePage from '@/pages/SubscribePage';

/**
 * PR2 — self-serve subscribe surface. Verifies the component renders and that
 * clicking the subscribe button calls the (mocked) checkout service and redirects
 * the browser to the returned Stripe (SANDBOX) Checkout URL.
 */

// Mock the billing service — we do NOT hit itera-api in unit tests.
const createCheckout = vi.fn();
const getPricing = vi.fn();
vi.mock('@/services/billing.service', () => ({
  createCheckout: (...args: unknown[]) => createCheckout(...args),
  getPricing: (...args: unknown[]) => getPricing(...args),
  // Keep the real formatter (pure Intl) so we can assert displayed currency.
  formatPrice: (
    pricing: { currency: string; unitAmount: number },
    displayLocale: string
  ) =>
    new Intl.NumberFormat(displayLocale === 'en' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: pricing.currency.toUpperCase(),
    }).format(pricing.unitAmount / 100),
}));

// AppHeader pulls in auth/membership/branding hooks; stub it to keep this a
// focused unit test of the subscribe surface.
vi.mock('@/components/branded', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/subscribe']}>
      <I18nProvider>
        <SubscribePage />
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('SubscribePage (self-serve subscribe)', () => {
  beforeEach(() => {
    createCheckout.mockReset();
    getPricing.mockReset();
    // Default: pt/BRL pricing (the app default locale). Tests that need en
    // override this. Returns null-safe so the button always renders.
    getPricing.mockResolvedValue({
      locale: 'pt',
      currency: 'brl',
      unitAmount: 10000,
      interval: 'month',
    });
    // jsdom: window.location.assign is not implemented — stub it.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: vi.fn(), origin: 'https://app.iterahq.dev' },
    });
  });

  it('renders the subscribe card and CTA button', () => {
    renderPage();
    expect(screen.getByTestId('subscribe-card')).toBeInTheDocument();
    expect(screen.getByTestId('subscribe-button')).toBeInTheDocument();
  });

  it('displays the BRL price (R$100) for the default pt locale', async () => {
    renderPage();
    const amount = await screen.findByTestId('subscribe-price-amount');
    // pt-BR currency formatting: "R$ 100,00".
    expect(amount.textContent ?? '').toContain('R$');
    expect(amount.textContent ?? '').toContain('100');
    expect(getPricing).toHaveBeenCalledWith('pt');
  });

  it('calls createCheckout (with the active locale) and redirects on click', async () => {
    createCheckout.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      sessionId: 'cs_test_123',
    });

    renderPage();
    fireEvent.click(screen.getByTestId('subscribe-button'));

    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(1));
    // The active language is forwarded as a price-selection fallback.
    expect(createCheckout).toHaveBeenCalledWith({ seats: 1, locale: 'pt' });
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        'https://checkout.stripe.com/c/pay/cs_test_123'
      )
    );
  });

  it('surfaces an error message when checkout creation fails', async () => {
    createCheckout.mockRejectedValue(new Error('Checkout could not be created (HTTP 401).'));

    renderPage();
    fireEvent.click(screen.getByTestId('subscribe-button'));

    const err = await screen.findByTestId('subscribe-error');
    expect(err).toHaveTextContent('Checkout could not be created (HTTP 401).');
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
