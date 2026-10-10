import { describe, expect, it, vi } from 'vitest';
import type { PassportPageData } from '@/types/achievements';

const page = (over: Partial<PassportPageData>) => ({ trailId: 't', locked: false, daysDone: 2, credentialId: 'row-1', ...over }) as PassportPageData;

describe('pageArtSrc', () => {
  it('uses the backend art only for a started page with a stored row', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.resetModules();
    const { pageArtSrc } = await import('@/components/passport/pageVariant');
    expect(pageArtSrc(page({}), 'pt')).toContain('/credential-meta/row-1/image.svg?lang=pt');
    expect(pageArtSrc(page({ credentialId: null }), 'pt')).toBeNull();
    expect(pageArtSrc(page({ daysDone: 0 }), 'pt')).toBeNull();
    expect(pageArtSrc(page({ locked: true }), 'pt')).toBeNull();
  });
});
