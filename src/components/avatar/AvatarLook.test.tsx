import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarLook, outfitFits, placementOf } from '@/components/avatar/AvatarLook';
import { DEFAULT_AVATAR, type LearnerAvatar } from '@/types/avatar';

const painted: LearnerAvatar = { ...DEFAULT_AVATAR, key: 'special_dourado', allowsOutfit: false };

describe('AvatarLook', () => {
  it('draws the learner\'s own art with the outfit layers on a free expression', () => {
    const { container } = render(<AvatarLook avatar={{ ...DEFAULT_AVATAR, key: 'tera_feliz' }} outfit="outfit_crown" size={200} />);
    expect(container.querySelector('[data-testid="avatar-look"]')?.getAttribute('data-outfit')).toBe('outfit_crown');
    expect(container.querySelector('img[data-outfit-layer="front"]')?.getAttribute('src')).toContain('outfit_crown-front-happy');
    expect(container.querySelector('img:not([data-outfit-layer])')?.getAttribute('src')).toContain('tera_normal');
  });

  it('puts the laurel behind and in front', () => {
    const { container } = render(<AvatarLook avatar={DEFAULT_AVATAR} outfit="outfit_laurel" size={200} />);
    expect(container.querySelector('img[data-outfit-layer="back"]')).not.toBeNull();
  });

  it('shows a painted avatar alone', () => {
    const { container } = render(<AvatarLook avatar={painted} outfit="outfit_crown" size={200} />);
    expect(container.querySelector('[data-outfit-layer]')).toBeNull();
    expect(container.querySelector('[data-testid="avatar-look"]')?.getAttribute('data-outfit')).toBe('none');
  });

  it('knows which outfits fit', () => {
    expect(outfitFits('outfit_glasses', DEFAULT_AVATAR)).toBe(true);
    expect(outfitFits('outfit_glasses', painted)).toBe(false);
    expect(outfitFits(null, DEFAULT_AVATAR)).toBe(false);
    expect(outfitFits('outfit_unknown', DEFAULT_AVATAR)).toBe(false);
  });

  it('uses the glasses transform for glasses and the default for the rest', () => {
    expect(placementOf('outfit_glasses', 'tera_normal').scale).toBe(1.3824);
    expect(placementOf('outfit_crown', 'tera_normal').scale).toBeCloseTo(1.536, 3);
  });
});
