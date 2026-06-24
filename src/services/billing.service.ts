/**
 * Itera billing data layer (self-serve subscribe / PLG).
 *
 * Padrão do projeto: componente → hook → service → fetch. No React here.
 *
 * This service triggers a Stripe Checkout by calling the EXISTING itera-api
 * billing endpoint — it does NOT reinvent billing:
 *
 *     POST ${VITE_ITERA_API_URL}/billing/checkout
 *       body:  { seats, email?, success_url?, cancel_url? }
 *       resp:  { checkout_url, session_id }
 *
 * The Stripe Checkout Session is created SERVER-SIDE by itera-api against the
 * Stripe **SANDBOX** (TEST mode, ADR-2). The frontend NEVER holds a Stripe key
 * — it only triggers the session and redirects the browser to the returned
 * hosted Checkout URL. Live cutover is gated separately on the Itera CNPJ.
 *
 * Auth: we forward the signed-in learner's Supabase access_token as the Bearer
 * credential (same JWT the player uses everywhere). The frontend MUST NOT carry
 * a per-tenant API key.
 *
 * ⚠️ KNOWN SERVER GAP (drift — flagged in the PR): itera-api's `/billing/checkout`
 * currently authenticates with the per-tenant API KEY (`requireTenantKey`), not
 * a learner JWT. So a self-serve learner JWT will be rejected (401) until a
 * learner-authenticated self-serve checkout path lands server-side. This client
 * is written to the documented contract and degrades gracefully (surfaces the
 * error to the UI) so it activates the moment the server accepts a learner JWT.
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

  const body = {
    seats: Math.max(1, Math.floor(req.seats ?? 1)),
    success_url: req.successUrl ?? fallback.successUrl,
    cancel_url: req.cancelUrl ?? fallback.cancelUrl,
  };

  let res: Response;
  try {
    res = await fetch(`${ITERA_API_URL}/billing/checkout`, {
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
