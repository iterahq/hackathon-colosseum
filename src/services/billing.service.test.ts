import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureAttribution, clearAttribution } from '@/lib/attribution';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
  }),
}));

const { createCheckout } = await import('./billing.service');

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
