/**
 * The one door to the lives / shop / companion edge functions. A function that is not deployed
 * (404) falls back to the local mock in dev and preview only; production never mocks, so a missing
 * backend surfaces as an error and every caller fails open.
 */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { mockShopCall } from '@/services/shopMock';

export type ShopFunction = 'companion' | 'lives' | 'shop-items' | 'purchase-intent' | 'purchase-confirm' | 'wallet-faucet';

export class ShopCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null
  ) {
    super(message);
  }
}

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Dev server, a non-production build, or a preview served from this machine. */
export function mockAllowed(): boolean {
  if (import.meta.env.DEV || import.meta.env.MODE !== 'production') return true;
  return typeof window !== 'undefined' && LOCAL_HOSTS.has(window.location.hostname);
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

async function errorBody(error: unknown): Promise<{ status: number | null; code: string | null; message: string | null }> {
  const context = (error as { context?: Response }).context;
  const status = typeof context?.status === 'number' ? context.status : null;
  try {
    const json = (await context?.clone().json()) as { error?: unknown; code?: unknown; message?: unknown } | undefined;
    const text = typeof json?.error === 'string' ? json.error : typeof json?.message === 'string' ? json.message : null;
    return { status, code: typeof json?.code === 'string' ? json.code : null, message: text };
  } catch {
    return { status, code: null, message: null };
  }
}

export async function callShop(fn: ShopFunction, { method = 'POST', body = {}, query = {} }: CallOptions = {}): Promise<{ data: unknown; mocked: boolean }> {
  if (mockForced()) return { data: mockShopCall(fn, body, query), mocked: true };
  if (!isSupabaseConfigured) throw new ShopCallError('Supabase not configured.', null);
  const search = new URLSearchParams(query).toString();
  const { data, error } = await getSupabase().functions.invoke(search ? `${fn}?${search}` : fn, method === 'GET' ? { method } : { method, body });
  if (!error) return { data, mocked: false };
  const detail = await errorBody(error);
  if (detail.status === 404 && mockAllowed()) return { data: mockShopCall(fn, body, query), mocked: true };
  throw new ShopCallError(detail.message ?? error.message, detail.status, detail.code);
}
