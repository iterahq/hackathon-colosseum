/**
 * Itera billing data layer (self-serve subscribe / PLG).
 *
 * Padrão do projeto: componente → hook → service → fetch. No React here.
 *
 * This service triggers a Stripe Checkout by calling the itera-api **PLG**
 * self-serve endpoint — it does NOT reinvent billing:
 *
 *     POST ${VITE_ITERA_API_URL}/plg/checkout
 *       headers: Authorization: Bearer <Itera user access_token>
 *       body:    { success_url?, cancel_url? }
 *       resp:    { checkout_url, session_id, tenant_id }
 *
 * The Stripe Checkout Session is created SERVER-SIDE by itera-api against the
 * Stripe **SANDBOX** (TEST mode, ADR-2). The frontend NEVER holds a Stripe key
 * — it only triggers the session and redirects the browser to the returned
 * hosted Checkout URL. Live cutover is gated separately on the Itera CNPJ.
 *
 * Auth: we forward the signed-in learner's Supabase access_token as the Bearer
 * credential (same JWT the player uses everywhere). `/plg/checkout` verifies the
 * Itera USER JWT (ADR-5) and resolves the caller's personal tenant — NO
 * per-tenant API key. (This replaced the earlier `/billing/checkout` call, which
 * is tenant-key-authenticated and rejected a learner JWT with 401; the PLG path
 * landed in itera-api alongside this change — plan
 * 20260624-itera-plg-subscribe-flow.)
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

/** itera-api base URL — overridable at build time; defaults to prod. */
const ITERA_API_URL =
  (import.meta.env.VITE_ITERA_API_URL as string | undefined) || 'https://api.iterahq.dev';

export interface CheckoutRequest {
  /** Seat quantity (self-serve = 1 by default). itera-api floors to >= 1. */
  seats?: number;
  /** Where Stripe returns the learner on success. Defaults to the surface below. */
  successUrl?: string;
  /** Where Stripe returns the learner on cancel. Defaults to the surface below. */
  cancelUrl?: string;
  /**
   * Active UI language — FALLBACK only for price/currency selection. The user's
   * stored profile locale (itera.users.locale) is the server-side source of
   * truth; this is used only when the profile locale is unset.
   */
  locale?: string;
}

/** Resolved seat price for the active language (for display before checkout). */
export interface SeatPricing {
  /** Normalized language: 'pt' | 'en'. */
  locale: string;
  /** ISO currency of the price: 'brl' | 'usd'. */
  currency: string;
  /** Amount in minor units (cents). */
  unitAmount: number;
  /** Billing interval (always 'month' here). */
  interval: string;
  /**
   * Which Stripe account this price was read from: 'test' (sandbox, no real
   * charge) or 'live' (real money). Comes from the server, never from a build
   * flag — a bundle built before the cutover would otherwise keep promising
   * "no real charge" while the API charges for real.
   */
  mode: 'test' | 'live' | 'unknown';
}

export interface CheckoutResponse {
  /** Hosted Stripe Checkout URL to redirect the browser to. */
  checkoutUrl: string;
  /** Stripe Checkout Session id (for return-page reconciliation/telemetry). */
  sessionId: string;
}

/** Build the default post-checkout return URLs from the current app origin. */
export function defaultReturnUrls(origin: string): { successUrl: string; cancelUrl: string } {
  const base = origin.replace(/\/+$/, '');
  return {
    successUrl: `${base}/subscribe/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/subscribe/return?status=cancel`,
  };
}

/**
 * Create a Stripe Checkout Session (SANDBOX) via itera-api and return the hosted
 * Checkout URL. Throws a human-readable Error on any failure so the UI can show
 * it (the component is responsible for rendering the message).
 */
export async function createCheckout(req: CheckoutRequest = {}): Promise<CheckoutResponse> {
  if (!isSupabaseConfigured) {
    throw new Error('Billing is not available (Supabase not configured).');
  }

  // Forward the learner's Supabase JWT — the player's natural auth credential.
  const { data: sessionData } = await getSupabase().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('You must be signed in to subscribe.');
  }

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.iterahq.dev';
  const fallback = defaultReturnUrls(origin);

  // PLG checkout is single-seat server-side; `seats` is accepted on the type for
  // back-compat but not sent (the /plg endpoint ignores it). `locale` is sent as
  // a FALLBACK for price/currency selection (the profile locale wins server-side).
  const body: Record<string, unknown> = {
    success_url: req.successUrl ?? fallback.successUrl,
    cancel_url: req.cancelUrl ?? fallback.cancelUrl,
  };
  if (req.locale) body.locale = req.locale;

  let res: Response;
  try {
    res = await fetch(`${ITERA_API_URL}/plg/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Could not reach the billing service: ${(err as Error).message}`);
  }

  if (!res.ok) {
    // Surface the server's structured error message when present.
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) detail = j.error.message;
    } catch {
      /* non-JSON body — keep the status line */
    }
    throw new Error(`Checkout could not be created (${detail}).`);
  }

  let parsed: { checkout_url?: string; session_id?: string };
  try {
    parsed = (await res.json()) as { checkout_url?: string; session_id?: string };
  } catch {
    throw new Error('Checkout response could not be parsed.');
  }
  if (!parsed.checkout_url) {
    throw new Error('Checkout response did not include a redirect URL.');
  }
  return { checkoutUrl: parsed.checkout_url, sessionId: parsed.session_id ?? '' };
}

/**
 * Resolve the seat price for a language so the subscribe UI can show the right
 * currency/amount BEFORE redirecting to Checkout (pt → BRL R$100, en → USD $20).
 * Calls the itera-api `GET /plg/pricing?locale=` (auth-gated, user JWT). Returns
 * null on any failure so the UI degrades gracefully (the button still works —
 * the server picks the price authoritatively at checkout time).
 */
export async function getPricing(locale: string): Promise<SeatPricing | null> {
  if (!isSupabaseConfigured) return null;
  const { data: sessionData } = await getSupabase().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;

  let res: Response;
  try {
    res = await fetch(`${ITERA_API_URL}/plg/pricing?locale=${encodeURIComponent(locale)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const j = (await res.json()) as {
      locale?: string;
      currency?: string;
      unit_amount?: number;
      interval?: string;
      mode?: string;
    };
    if (typeof j.unit_amount !== 'number' || !j.currency) return null;
    return {
      locale: j.locale ?? locale,
      currency: j.currency,
      unitAmount: j.unit_amount,
      interval: j.interval ?? 'month',
      mode: j.mode === 'test' || j.mode === 'live' ? j.mode : 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Format a seat price for display in the active locale. Uses Intl so BRL renders
 * as "R$ 100,00" and USD as "$20.00" with the right separators.
 */
export function formatPrice(pricing: SeatPricing, displayLocale: string): string {
  const intlLocale = displayLocale === 'en' ? 'en-US' : 'pt-BR';
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: pricing.currency.toUpperCase(),
    }).format(pricing.unitAmount / 100);
  } catch {
    // Fallback: plain amount + currency code.
    return `${(pricing.unitAmount / 100).toFixed(2)} ${pricing.currency.toUpperCase()}`;
  }
}
