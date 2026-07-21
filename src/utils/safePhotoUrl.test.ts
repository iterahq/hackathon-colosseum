import { describe, it, expect } from 'vitest';
import { isSafePhotoUrl } from './safePhotoUrl';

describe('isSafePhotoUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafePhotoUrl('https://example.com/me.png')).toBe(true);
    expect(isSafePhotoUrl('  https://cdn.app/x.jpg  ')).toBe(true);
    expect(isSafePhotoUrl('HTTPS://cdn.app/x.jpg')).toBe(true);
  });

  it('rejects non-https schemes and junk', () => {
    expect(isSafePhotoUrl('http://example.com/me.png')).toBe(false);
    expect(isSafePhotoUrl('javascript:alert(1)')).toBe(false);
    expect(isSafePhotoUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isSafePhotoUrl('')).toBe(false);
    expect(isSafePhotoUrl('https://')).toBe(false);
  });
});
