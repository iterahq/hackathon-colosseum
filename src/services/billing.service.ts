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
  // back-compat but not sent (the /plg endpoint ignores it).
  const body = {
    success_url: req.successUrl ?? fallback.successUrl,
    cancel_url: req.cancelUrl ?? fallback.cancelUrl,
  };

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
