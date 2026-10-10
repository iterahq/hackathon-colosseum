import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeraOutfit } from './TeraOutfit';

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const layers = (part: 'back' | 'front') => Array.from(screen.getByTestId('tera-outfit').querySelectorAll<HTMLImageElement>(`img[data-outfit-layer="${part}"]`));
const shown = (part: 'back' | 'front') => layers(part).filter((img) => img.className.includes('opacity-100'));

afterEach(() => vi.unstubAllGlobals());

describe('TeraOutfit', () => {
  it('draws Tera bare when nothing is equipped or the key is unknown', () => {
    stubReducedMotion(true);
    const { rerender } = render(<TeraOutfit mood="neutral" outfit={null} />);
    expect(screen.getByTestId('tera-outfit').dataset.outfit).toBe('none');
    expect(layers('front')).toHaveLength(0);
    rerender(<TeraOutfit mood="neutral" outfit="ink_emerald" />);
    expect(layers('front')).toHaveLength(0);
    expect(layers('back')).toHaveLength(0);
  });

  it('shows the front cut for the current face and keeps the other cuts hidden', () => {
    stubReducedMotion(true);
    const { rerender } = render(<TeraOutfit mood="neutral" outfit="outfit_crown" />);
    expect(screen.getByTestId('tera-outfit').dataset.outfit).toBe('outfit_crown');
    expect(layers('front')).toHaveLength(3);
    expect(shown('front').map((img) => img.getAttribute('src'))).toEqual(['/mascot/outfits/outfit_crown-front.webp']);
    rerender(<TeraOutfit mood="happy" outfit="outfit_crown" />);
    expect(shown('front').map((img) => img.getAttribute('src'))).toEqual(['/mascot/outfits/outfit_crown-front-happy.webp']);
    rerender(<TeraOutfit mood="oops" outfit="outfit_crown" />);
    expect(shown('front').map((img) => img.getAttribute('src'))).toEqual(['/mascot/outfits/outfit_crown-front-oops.webp']);
  });

  it('puts the back layer under the face and the front over it', () => {
    stubReducedMotion(true);
    render(<TeraOutfit mood="neutral" outfit="outfit_laurel" />);
    const root = screen.getByTestId('tera-outfit');
    const order = Array.from(root.children).map((node) => (node as HTMLElement).dataset.outfitLayer ?? (node as HTMLElement).dataset.tera);
    expect(order).toEqual(['back', 'neutral', 'front']);
  });

  it('keeps every layer decorative, sized and out of the layout', () => {
    stubReducedMotion(true);
    render(<TeraOutfit mood="neutral" outfit="outfit_laurel" size="xs" />);
    for (const img of [...layers('back'), ...layers('front')]) {
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('width')).toBe('288');
      expect(img.getAttribute('height')).toBe('416');
      expect(img.className).toContain('absolute');
      expect(img.style.width).toBe('120%');
      expect(img.style.left).toBe('-10%');
      expect(img.style.bottom).toBe('-10%');
    }
  });

  it('lets a preview win over the equipped outfit, including previewing nothing', () => {
    stubReducedMotion(true);
    const { rerender } = render(<TeraOutfit mood="neutral" outfit="outfit_crown" preview="outfit_glasses" />);
    expect(screen.getByTestId('tera-outfit').dataset.outfit).toBe('outfit_glasses');
    rerender(<TeraOutfit mood="neutral" outfit="outfit_crown" preview={null} />);
    expect(screen.getByTestId('tera-outfit').dataset.outfit).toBe('none');
  });
});
