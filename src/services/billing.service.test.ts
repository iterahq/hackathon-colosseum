import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureAttribution, clearAttribution } from '@/lib/attribution';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
  }),
}));

const { createCheckout, createBillingPortalSession } = await import('./billing.service');

function stubFetch() {
  const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    json: async () => ({ checkout_url: 'https://stripe/x', session_id: 's', tenant_id: 't' }),
  }));
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

function sentBody(fetchSpy: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const init = fetchSpy.mock.calls[0][1];
  return JSON.parse(init?.body as string);
}

describe('createCheckout attribution', () => {
  beforeEach(() => clearAttribution());
  afterEach(() => vi.unstubAllGlobals());

  it('forwards the first touch to itera-api', async () => {
    captureAttribution('https://app.iterahq.dev/catalog?utm_source=youtube', null);
    const fetchSpy = stubFetch();
    await createCheckout();
    expect(sentBody(fetchSpy).attribution).toMatchObject({ utm_source: 'youtube' });
  });

  it('omits the field entirely when nothing was attributed', async () => {
    const fetchSpy = stubFetch();
    await createCheckout();
    expect(sentBody(fetchSpy)).not.toHaveProperty('attribution');
  });
});


describe('createBillingPortalSession', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pede o portal ao itera-api e devolve a URL que ele mandou', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ portal_url: 'https://billing.stripe.com/p/s1' }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(createBillingPortalSession('pt')).resolves.toBe(
      'https://billing.stripe.com/p/s1'
    );

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/plg/portal');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ locale: 'pt' });
    // O destino do retorno é do servidor: mandar um daqui abriria um redirect
    // aberto a partir de uma superfície autenticada de cobrança.
    expect(body).not.toHaveProperty('return_url');
  });

  it('um 200 sem URL não vira navegação — vira erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    );
    await expect(createBillingPortalSession('pt')).rejects.toThrow(/did not include a URL/);
  });

  it('erro do servidor chega legível pra UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'no billing customer for this user yet' } }),
      }))
    );
    await expect(createBillingPortalSession('pt')).rejects.toThrow(/no billing customer/);
  });
});
