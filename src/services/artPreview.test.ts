import { describe, expect, it, vi } from 'vitest';
import type { ShopItem } from '@/types/shop';

vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
const { certificationPreviewUrl, companionPreviewUrl, cosmeticOf } = await import('./artPreview');

const item = (key: string, kind: ShopItem['kind'], art: Record<string, unknown> = {}): ShopItem => ({ key, kind, title: key, description: '', priceUsdCents: 0, priceLamports: 0, priceLabel: '', art, owned: false, equipped: false, ownedRefs: [] });

describe('artPreview', () => {
  it('builds the certification try-on url and leaves empty cosmetics out', () => {
    const url = new URL(certificationPreviewUrl({ trail: 'HTML', days: 3, total: 5, ink: 'emerald', frame: null, lang: 'pt' }) ?? '');
    expect(url.pathname).toBe('/functions/v1/credential-meta/preview.svg');
    expect(Object.fromEntries(url.searchParams)).toEqual({ type: 'certification', trail: 'HTML', days: '3', total: '5', tier: 'bronze', ink: 'emerald', lang: 'pt' });
  });

  it('asks for the gold tier on a finished certification', () => {
    expect(certificationPreviewUrl({ trail: 'CSS', days: 5, total: 5, frame: 'gold-leaf', lang: 'en' })).toContain('tier=gold');
  });

  it('builds the companion try-on url with "none" for a bare Tera', () => {
    expect(companionPreviewUrl({ avatar: 'base_lider' })).toContain('type=companion&avatar=base_lider&outfit=none&lives=5&level=1');
  });

  it('reads the cosmetic from the art block, or from the key', () => {
    expect(cosmeticOf(item('ink_emerald', 'ink', { ink: 'emerald' }))).toEqual({ ink: 'emerald', frame: null });
    expect(cosmeticOf(item('frame_gold_leaf', 'frame'))).toEqual({ ink: null, frame: 'gold-leaf' });
    expect(cosmeticOf(item('outfit_crown', 'outfit'))).toEqual({ ink: null, frame: null });
  });
});
