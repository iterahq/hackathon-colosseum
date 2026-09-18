import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
const { AlreadySubscribedError } = vi.hoisted(() => ({
  AlreadySubscribedError: class AlreadySubscribedError extends Error {},
}));
vi.mock('@/services/billing.service', () => ({
  AlreadySubscribedError,
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

const entitlement = vi.hoisted(() => ({ data: null as { active: boolean } | null }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => entitlement }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/subscribe']}>
        <I18nProvider>
          <Routes>
            <Route path="/subscribe" element={<SubscribePage />} />
            <Route path="/" element={<div data-testid="home" />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
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
      mode: 'test',
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
    // The learner reads their own language, not the API's English diagnostics.
    expect(err).toHaveTextContent('Não foi possível iniciar a assinatura. Tente novamente.');
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('shows the sandbox notice only while the server reports test mode', async () => {
    renderPage();
    expect(await screen.findByTestId('subscribe-sandbox-notice')).toBeInTheDocument();
  });

  it('hides the sandbox notice when the server reports live mode', async () => {
    getPricing.mockResolvedValue({
      locale: 'pt',
      currency: 'brl',
      unitAmount: 10000,
      interval: 'month',
      mode: 'live',
    });

    renderPage();
    await screen.findByTestId('subscribe-price-amount');
    expect(screen.queryByTestId('subscribe-sandbox-notice')).not.toBeInTheDocument();
  });

  it('hides the sandbox notice when the mode is unknown', async () => {
    getPricing.mockResolvedValue(null);

    renderPage();
    await waitFor(() => expect(getPricing).toHaveBeenCalled());
    expect(screen.queryByTestId('subscribe-sandbox-notice')).not.toBeInTheDocument();
  });
});

describe('SubscribePage — never a second purchase', () => {
  beforeEach(() => {
    createCheckout.mockReset();
    getPricing.mockReset();
    getPricing.mockResolvedValue({
      locale: 'pt', currency: 'brl', unitAmount: 10000, interval: 'month', mode: 'live',
    });
    entitlement.data = null;
  });

  it('sends anyone the paywall already lets through back inside', () => {
    // /signup with an email that already has an account lands here too.
    entitlement.data = { active: true };
    renderPage();
    expect(screen.getByTestId('home')).toBeTruthy();
    expect(screen.queryByTestId('subscribe-button')).toBeNull();
  });

  it('turns a 409 from the API into a pointer to the profile, not a generic failure', async () => {
    createCheckout.mockRejectedValue(new AlreadySubscribedError());
    renderPage();
    fireEvent.click(screen.getByTestId('subscribe-button'));
    await waitFor(() => expect(screen.getByTestId('subscribe-go-profile')).toBeTruthy());
  });
});
