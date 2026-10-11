/**
 * The one door to the lives / shop / companion edge functions. The local mock answers only when
 * `?mockShop=1` is in the URL of a dev server; everything else is the real backend, and a
 * missing or failing function surfaces as an error so every caller fails open.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { mockShopCall } from '@/services/shopMock';

export type ShopFunction = 'companion' | 'lives' | 'shop-items' | 'shop-claim' | 'class-podium' | 'endorse' | 'purchase-intent' | 'purchase-confirm' | 'purchase-submit' | 'wallet-faucet' | 'link-wallet' | 'gifts' | 'referral' | 'crystals' | 'crystals/spend' | 'crystals/equip' | 'bounty-claim' | 'bounty-sponsor' | 'bounty-post' | 'talent-board';

export class ShopCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** The backend's `{ error: <code> }`, e.g. `insufficient_funds`, `tx_not_found`. */
    readonly code: string | null = null,
    /** The backend says the same call may succeed if repeated. */
    readonly retryable = false,
    /** The backend's `detail` field, verbatim (e.g. `payer | destination | amount | memo`). */
    readonly detail: string | null = null,
    /** Present when the backend already broadcast the transaction: confirm with it instead of failing. */
    readonly signature: string | null = null,
    /** The whole JSON body of the error answer, for callers that need a field such as `required_lamports`. */
    readonly body: Record<string, unknown> | null = null
  ) {
    super(message);
  }
}

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

/** The mock exists only in a dev server: a production build never honours `?mockShop=1`. */
export function mockAllowed(): boolean {
  return import.meta.env.DEV === true;
}

export function mockForced(): boolean {
  if (!mockAllowed() || typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('mockShop') === '1') {
    try {
      sessionStorage.setItem('itera.mockShop.forced', '1');
    } catch {
      /* private mode */
    }
    return true;
  }
  try {
    return sessionStorage.getItem('itera.mockShop.forced') === '1';
  } catch {
    return false;
  }
}

async function errorBody(error: unknown): Promise<{ status: number | null; code: string | null; retryable: boolean; detail: string | null; signature: string | null; body: Record<string, unknown> | null }> {
  const context = (error as { context?: Response }).context;
  const status = typeof context?.status === 'number' ? context.status : null;
  try {
    const json = (await context?.clone().json()) as { error?: unknown; retryable?: unknown; detail?: unknown; signature?: unknown } | undefined;
    const detail = typeof json?.detail === 'string' ? json.detail : json?.detail == null ? null : JSON.stringify(json.detail);
    const body = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
    return { status, code: typeof json?.error === 'string' ? json.error : null, retryable: json?.retryable === true, detail, signature: typeof json?.signature === 'string' ? json.signature : null, body };
  } catch {
    return { status, code: null, retryable: false, detail: null, signature: null, body: null };
  }
}

export async function callShop(fn: ShopFunction, { method = 'POST', body = {}, query = {} }: CallOptions = {}): Promise<{ data: unknown; mocked: boolean }> {
  if (mockForced()) return { data: mockShopCall(fn, body, query), mocked: true };
  if (!isSupabaseConfigured) throw new ShopCallError('Supabase not configured.', null);
  const search = new URLSearchParams(query).toString();
  const { data, error } = await getSupabase().functions.invoke(search ? `${fn}?${search}` : fn, method === 'GET' ? { method } : { method, body });
  if (!error) return { data, mocked: false };
  const detail = await errorBody(error);
  const text = detail.code ? `${fn}: ${detail.code}${detail.detail ? ` (detail: ${detail.detail})` : ''}` : error.message;
  throw new ShopCallError(text, detail.status, detail.code, detail.retryable, detail.detail, detail.signature, detail.body);
}
